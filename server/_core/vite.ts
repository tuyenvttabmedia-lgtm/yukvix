import express, { type Express } from "express";
import fs from "fs";
import { type Server } from "http";
import { nanoid } from "nanoid";
import path from "path";
import { createServer as createViteServer } from "vite";
import viteConfig from "../../vite.config";

// Cache SEO settings for 5 minutes to avoid DB hit on every page load
let seoSettingsCache: { gtmContainerId?: string | null; gscVerificationMeta?: string | null } | null = null;
let seoSettingsCacheTime = 0;
const SEO_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

async function getSeoSettings() {
  const now = Date.now();
  if (seoSettingsCache && now - seoSettingsCacheTime < SEO_CACHE_TTL) {
    return seoSettingsCache;
  }
  try {
    const { getDb } = await import("../db.js");
    const { seoSettings } = await import("../../drizzle/schema.js");
    const db = await getDb();
    if (!db) return null;
    const rows = await db.select().from(seoSettings).limit(1);
    seoSettingsCache = rows[0] ?? {};
    seoSettingsCacheTime = now;
    return seoSettingsCache;
  } catch {
    return null;
  }
}

import { injectPageMeta } from "./meta-injection.js";

export function invalidateSeoSettingsCache() {
  seoSettingsCache = null;
  seoSettingsCacheTime = 0;
}

function injectSeoIntoHtml(html: string, settings: { gtmContainerId?: string | null; gscVerificationMeta?: string | null } | null): string {
  if (!settings) return html;
  let injected = html;

  // Inject GSC verification meta tag right after <head>
  if (settings.gscVerificationMeta) {
    const gscMeta = `<meta name="google-site-verification" content="${settings.gscVerificationMeta}" />`;
    injected = injected.replace(/<head>/, `<head>\n    ${gscMeta}`);
  }

  // Inject GTM script right after <head>
  if (settings.gtmContainerId) {
    const gtmScript = `<script>(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src='https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);})(window,document,'script','dataLayer','${settings.gtmContainerId}');</script>`;
    injected = injected.replace(/<\/head>/, `  ${gtmScript}\n  </head>`);
  }

  return injected;
}

export async function setupVite(app: Express, server: Server) {
  const serverOptions = {
    middlewareMode: true,
    hmr: { server },
    allowedHosts: true as const,
  };

  const vite = await createViteServer({
    ...viteConfig,
    configFile: false,
    server: serverOptions,
    appType: "custom",
  });

  app.use(vite.middlewares);
  app.use("*", async (req, res, next) => {
    const url = req.originalUrl;

    try {
      const clientTemplate = path.resolve(
        import.meta.dirname,
        "../..",
        "client",
        "index.html"
      );

      // always reload the index.html file from disk incase it changes
      let template = await fs.promises.readFile(clientTemplate, "utf-8");
      template = template.replace(
        `src="/src/main.tsx"`,
        `src="/src/main.tsx?v=${nanoid()}"`
      );
      let page = await vite.transformIndexHtml(url, template);
      // Inject GSC/GTM from DB into HTML (server-side so crawlers can see it)
      const seoSettings = await getSeoSettings();
      page = injectSeoIntoHtml(page, seoSettings);
      res.status(200).set({ "Content-Type": "text/html" }).end(page);
    } catch (e) {
      vite.ssrFixStacktrace(e as Error);
      next(e);
    }
  });
}

export function serveStatic(app: Express) {
  const distPath =
    process.env.NODE_ENV === "development"
      ? path.resolve(import.meta.dirname, "../..", "dist", "public")
      : path.resolve(import.meta.dirname, "public");
  if (!fs.existsSync(distPath)) {
    console.error(
      `Could not find the build directory: ${distPath}, make sure to build the client first`
    );
  }

  // Serve all static assets EXCEPT index.html (index.html must go through
  // the async handler below so we can inject GSC/GTM meta tags server-side)
  app.use(express.static(distPath, { index: false }));

  // Serve index.html for all routes (SPA fallback) with server-side meta injection
  app.use("*", async (req, res) => {
    try {
      const indexPath = path.resolve(distPath, "index.html");
      let html = await fs.promises.readFile(indexPath, "utf-8");
      // Inject GSC/GTM from DB into HTML (server-side so crawlers can see it)
      const seoSettings = await getSeoSettings();
      html = injectSeoIntoHtml(html, seoSettings);
      const siteUrl = process.env.SITE_URL || `${req.protocol}://${req.get("host")}`;
      html = await injectPageMeta(html, req.path, siteUrl);
      res.status(200).set({ "Content-Type": "text/html" }).end(html);
    } catch {
      res.sendFile(path.resolve(distPath, "index.html"));
    }
  });
}
