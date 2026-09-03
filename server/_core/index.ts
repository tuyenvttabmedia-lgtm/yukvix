import "dotenv/config";
import express from "express";
import { createServer } from "http";
import net from "net";
import compression from "compression";
import helmet from "helmet";
import { rateLimit } from "express-rate-limit";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerOAuthRoutes } from "./oauth";
import { registerStorageProxy } from "./storageProxy";
import { registerCmsMediaRoutes } from "../cms-media";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { serveStatic, setupVite } from "./vite";
import { registerUploadRoutes } from "../upload-handler";
import { registerStripeWebhook } from "../stripe-webhook";
import { registerSeoRoutes } from "../seo-routes";
import { startImageProcessorWorker } from "../image-processor-worker";
import { refreshWasabiConfig } from "../storage-wasabi";
import { startScheduler } from "../import/scheduler";
import { startEmailQueueWorker } from "../email-queue-worker";
import { startImportScheduler as startZipImportScheduler } from "../services/import-cron";
import { expirePendingPaymentsHandler } from "../scheduled/expire-pending-payments";
import { notifyVipExpiryHandler } from "../scheduled/notify-vip-expiry";
import { autoBulkSeoHandler } from "../scheduled/auto-bulk-seo";
import { importMetricsSnapshotHandler } from "../scheduled/import-metrics-snapshot";
import { cleanupImportArtifactsHandler } from "../scheduled/cleanup-import-artifacts";
import { processImportQueueHandler } from "../scheduled/process-import-queue";
import { registerHealthRoutes } from "./health.js";
import { paymentReconciliationHandler } from "../scheduled/payment-reconciliation.js";
import { cleanupSkippedImportsHandler } from "../scheduled/cleanup-skipped-imports.js";
import { getWorkerMode } from "./worker-mode";

function isPortAvailable(port: number): Promise<boolean> {
  return new Promise(resolve => {
    const server = net.createServer();
    server.listen(port, () => {
      server.close(() => resolve(true));
    });
    server.on("error", () => resolve(false));
  });
}

async function findAvailablePort(startPort: number = 3010): Promise<number> {
  for (let port = startPort; port < startPort + 20; port++) {
    if (await isPortAvailable(port)) {
      return port;
    }
  }
  throw new Error(`No available port found starting from ${startPort}`);
}

/** Nginx proxies public traffic; production binds loopback only. */
function listenHost(): string | undefined {
  const host = process.env.HOST?.trim();
  if (host) return host;
  if (process.env.NODE_ENV === "production") return "127.0.0.1";
  return undefined;
}

// --- Rate limiters -------------------------------------------------------
// Strict limiter for auth endpoints (login, register, forgot password)
const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20,                   // max 20 attempts per IP per window
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { error: "Quá nhiều yêu cầu. Vui lòng thử lại sau 15 phút." },
  skip: () => process.env.NODE_ENV === "test",
});

// General API limiter (tRPC endpoints)
const apiRateLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 300,            // 300 requests per IP per minute
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { error: "Quá nhiều yêu cầu. Vui lòng thử lại sau." },
  skip: () => process.env.NODE_ENV === "test",
});

async function startServer() {
  const app = express();
  const server = createServer(app);

  // Trust reverse proxy (Nginx/Caddy/Cloud Run) — required for:
  // - express-rate-limit to read real client IP from X-Forwarded-For
  // - helmet to set correct HTTPS headers
  // - req.ip to return real client IP (not proxy IP)
  app.set("trust proxy", 1);

  // --- Security headers (Helmet) -----------------------------------------
  // Applied before everything so all responses get headers
  app.use(helmet({
    // Allow inline scripts/styles needed by Vite HMR in dev
    contentSecurityPolicy: process.env.NODE_ENV === "production" ? {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'"], // shadcn radix needs inline
        styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
        fontSrc: ["'self'", "https://fonts.gstatic.com"],
        imgSrc: ["'self'", "data:", "blob:", "https:"],
        connectSrc: ["'self'", "https:", "wss:"],
        frameSrc: ["'none'"],
        objectSrc: ["'none'"],
        upgradeInsecureRequests: [],
      },
    } : false,
    crossOriginEmbedderPolicy: false, // needed for Wasabi presigned URLs
  }));

  // --- Gzip/Brotli compression -------------------------------------------
  // Compresses all responses > 1KB (JSON, HTML, CSS, JS)
  app.use(compression({
    level: 6,        // balanced speed/ratio (1=fastest, 9=best)
    threshold: 1024, // only compress responses > 1KB
    filter: (req, res) => {
      // Don't compress already-compressed media (images, video, zip)
      const contentType = res.getHeader("Content-Type") as string || "";
      if (/image|video|audio|zip|wasm/.test(contentType)) return false;
      return compression.filter(req, res);
    },
  }));

  // Stripe webhook MUST be registered BEFORE express.json() for raw body signature verification
  registerStripeWebhook(app);
  // Configure body parser with larger size limit for file uploads
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));
  registerStorageProxy(app);
  registerCmsMediaRoutes(app);
  registerOAuthRoutes(app);
  registerUploadRoutes(app);
  registerSeoRoutes(app);
  registerHealthRoutes(app);
  // Keep-alive endpoint for Cloud Run CPU warm-up during background jobs
  app.get("/api/import/keepalive", (_req, res) => {
    res.json({ ok: true, ts: Date.now() });
  });

  // Scheduled handlers — must be registered BEFORE tRPC and Vite fallthrough
  app.post("/api/scheduled/expire-pending-payments", expirePendingPaymentsHandler);
  app.post("/api/scheduled/notify-vip-expiry", notifyVipExpiryHandler);
  app.post("/api/scheduled/auto-bulk-seo", autoBulkSeoHandler);
  app.post("/api/scheduled/import-metrics-snapshot", importMetricsSnapshotHandler);
  app.post("/api/scheduled/cleanup-import-artifacts", cleanupImportArtifactsHandler);
  app.post("/api/scheduled/process-import-queue", processImportQueueHandler);
  app.post("/api/scheduled/payment-reconciliation", paymentReconciliationHandler);
  app.post("/api/scheduled/cleanup-skipped-imports", cleanupSkippedImportsHandler);

  // --- Auth rate limiting (applied before tRPC) -------------------------
  // Target specific auth mutation paths to prevent brute force
  app.use("/api/trpc/auth.login", authRateLimiter);
  app.use("/api/trpc/auth.register", authRateLimiter);
  app.use("/api/trpc/auth.forgotPassword", authRateLimiter);
  app.use("/api/trpc/auth.resetPassword", authRateLimiter);
  app.use("/api/trpc/auth-email.sendVerification", authRateLimiter);

  // General API rate limit
  app.use("/api/trpc", apiRateLimiter);

  // tRPC API
  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
    })
  );
  // development mode uses Vite, production mode uses static files
  if (process.env.NODE_ENV === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  const preferredPort = parseInt(process.env.PORT || "3010");
  const port = await findAvailablePort(preferredPort);

  if (port !== preferredPort) {
    console.log(`Port ${preferredPort} is busy, using port ${port} instead`);
  }

  const host = listenHost();
  const onListen = async () => {
    const addr = host ?? "0.0.0.0";
    console.log(`Server running on http://${addr}:${port}/`);
    // Load Wasabi + CDN config from DB (overrides env defaults)
    try {
      await refreshWasabiConfig();
      console.log("[Wasabi] Config loaded from DB");
    } catch {
      console.log("[Wasabi] Using env config (DB not ready)");
    }
    // Reset orphan jobs: any job stuck in running states from previous server session
    // (queue is in-memory, so they can never complete after restart)
    try {
      const { getDb } = await import("../db.js");
      const { importJobs } = await import("../../drizzle/schema.js");
      const { inArray } = await import("drizzle-orm");
      const db = await getDb();
      if (db) {
        const result = await db.update(importJobs)
          .set({ status: "failed", errorMessage: "Server restarted — job lost", completedAt: new Date() })
          .where(inArray(importJobs.status, ["crawling", "downloading", "processing", "seo"] as any[]));
        const affected = (result[0] as any)?.affectedRows ?? 0;
        if (affected > 0) console.log(`[Startup] Reset ${affected} orphan jobs to failed`);
      }
    } catch (e) {
      console.warn("[Startup] Could not reset orphan jobs:", e);
    }
    // Start background image processing worker
    startImageProcessorWorker();
    startScheduler();
    startEmailQueueWorker();
    if (getWorkerMode() === "http") {
      console.log("[HTTP] ZIP import runs in WORKER_MODE=import process");
    } else {
      startZipImportScheduler();
    }
  };
  if (host) server.listen(port, host, onListen);
  else server.listen(port, onListen);
}

async function startImportWorker(): Promise<void> {
  const app = express();
  app.set("trust proxy", 1);
  registerHealthRoutes(app);
  app.get("/api/import/keepalive", (_req, res) => {
    res.json({ ok: true, worker: "import", ts: Date.now() });
  });

  const port = parseInt(process.env.IMPORT_WORKER_PORT || "3001", 10);
  const host = listenHost();
  const onListen = async () => {
    const addr = host ?? "127.0.0.1";
    console.log(`[ImportWorker] health http://${addr}:${port}/api/health`);
    try {
      await refreshWasabiConfig();
      console.log("[Wasabi] Config loaded from DB");
    } catch {
      console.log("[Wasabi] Using env config (DB not ready)");
    }
    startZipImportScheduler();
  };
  if (host) app.listen(port, host, onListen);
  else app.listen(port, onListen);
}

const workerMode = getWorkerMode();
if (workerMode === "import") {
  startImportWorker().catch(console.error);
} else {
  startServer().catch(console.error);
}
