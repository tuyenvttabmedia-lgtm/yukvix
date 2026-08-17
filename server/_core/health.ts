import type { Express } from "express";
import { sql } from "drizzle-orm";

export function registerHealthRoutes(app: Express) {
  app.get("/api/health", async (_req, res) => {
    const checks: Record<string, string> = {};
    let ok = true;
    try {
      const { getDb } = await import("../db.js");
      const db = await getDb();
      if (!db) throw new Error("db unavailable");
      await db.execute(sql`SELECT 1`);
      checks.database = "ok";
    } catch {
      checks.database = "fail";
      ok = false;
    }
    try {
      const Redis = (await import("ioredis")).default;
      const url = process.env.REDIS_URL || "redis://localhost:6379";
      const redis = new Redis(url, { connectTimeout: 2000, maxRetriesPerRequest: 1 });
      const pong = await redis.ping();
      checks.redis = pong === "PONG" ? "ok" : "fail";
      redis.disconnect();
    } catch {
      checks.redis = "warn";
    }
    let zipImport: Record<string, unknown> | undefined;
    try {
      const { getZipImportHealthBlock } = await import("../import/import-health.js");
      zipImport = await getZipImportHealthBlock();
    } catch {
      zipImport = undefined;
    }

    res.status(ok ? 200 : 503).json({
      status: ok ? "ok" : "degraded",
      checks,
      zipImport,
      uptime: process.uptime(),
      ts: new Date().toISOString(),
    });
  });
}
