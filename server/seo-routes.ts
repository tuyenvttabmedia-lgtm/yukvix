/**
 * SEO Routes: dynamic sitemaps, robots.txt
 * Registered in server/_core/index.ts BEFORE tRPC middleware
 *
 * Endpoints:
 *   GET /robots.txt             — dynamic robots.txt with correct base URL
 *   GET /sitemap.xml            — sitemap index (links to all sub-sitemaps)
 *   GET /sitemap-pages.xml      — static pages
 *   GET /sitemap-albums.xml     — all published albums
 *   GET /sitemap-creators.xml   — all creators
 *   GET /sitemap-tags.xml       — all tags
 *   GET /sitemap-images.xml     — image sitemap (free-preview photos)
 */
import type { Express, Request, Response } from "express";
import path from "path";
import { getDb, getTagBySlug } from "./db";
import { albums, creators, tags, photos, categories } from "../drizzle/schema";
import { eq, and, desc, max, sql } from "drizzle-orm";
import { ENV } from "./_core/env";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function xmlEscape(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function getBaseUrl(req: Request): string {
  // Priority 1: SITE_URL env var (canonical domain, set explicitly for production)
  if (ENV.siteUrl) {
    return ENV.siteUrl.replace(/\/$/, ""); // strip trailing slash
  }
  // Priority 2: x-forwarded-host (set by reverse proxies that pass it)
  const forwardedHost = req.headers["x-forwarded-host"] as string | undefined;
  if (forwardedHost) {
    const proto = (req.headers["x-forwarded-proto"] as string) || "https";
    return `${proto}://${forwardedHost.split(",")[0]!.trim()}`;
  }
  // Fallback: use request host (dev environment)
  const proto = req.protocol || "http";
  const host = req.headers.host || "localhost:3000";
  return `${proto}://${host}`;
}

/** Format date as W3C date (YYYY-MM-DD) for sitemap lastmod */
function w3cDate(date: Date): string {
  return date.toISOString().split("T")[0]!;
}

/**
 * Determine changefreq based on how recently content was updated.
 * - Updated within 7 days  → "daily"
 * - Updated within 30 days → "weekly"
 * - Updated within 90 days → "monthly"
 * - Older                  → "yearly"
 */
function smartChangefreq(updatedAt: Date): string {
  const now = Date.now();
  const ageMs = now - updatedAt.getTime();
  const days = ageMs / (1000 * 60 * 60 * 24);
  if (days <= 7) return "daily";
  if (days <= 30) return "weekly";
  if (days <= 90) return "monthly";
  return "yearly";
}

/**
 * Compute album priority based on viewCount and isVip.
 * Scale: 0.5 – 0.9 (non-VIP), 0.4 – 0.8 (VIP, slightly lower to favour free content).
 * Thresholds: 0 views → base, 100+ → +0.1, 500+ → +0.2, 2000+ → +0.3, 10000+ → +0.4
 */
function albumPriority(viewCount: number, isVip: boolean): string {
  const base = isVip ? 0.5 : 0.6;
  let boost = 0;
  if (viewCount >= 10000) boost = 0.3;
  else if (viewCount >= 2000) boost = 0.2;
  else if (viewCount >= 500) boost = 0.15;
  else if (viewCount >= 100) boost = 0.1;
  else if (viewCount >= 20) boost = 0.05;
  const priority = Math.min(base + boost, isVip ? 0.8 : 0.9);
  return priority.toFixed(1);
}

/**
 * Compute creator priority based on albumCount.
 * More albums → higher priority.
 */
function creatorPriority(albumCount: number): string {
  if (albumCount >= 20) return "0.9";
  if (albumCount >= 10) return "0.8";
  if (albumCount >= 5) return "0.7";
  if (albumCount >= 2) return "0.6";
  return "0.5";
}

function urlsetOpen(extra = ""): string {
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"${extra}>`;
}

function urlsetClose(): string {
  return `</urlset>`;
}

function urlEntry(loc: string, lastmod: string, changefreq: string, priority: string): string {
  return `  <url>\n    <loc>${loc}</loc>\n    <lastmod>${lastmod}</lastmod>\n    <changefreq>${changefreq}</changefreq>\n    <priority>${priority}</priority>\n  </url>`;
}

// ─── Register Routes ──────────────────────────────────────────────────────────

export function registerSeoRoutes(app: Express): void {
  // SEO Foundation Phase D — favicon (avoid 404)
  app.get("/favicon.ico", async (_req: Request, res: Response) => {
    try {
      const { getDb } = await import("./db.js");
      const { siteSettings } = await import("../drizzle/schema.js");
      const { eq } = await import("drizzle-orm");
      const db = await getDb();
      if (db) {
        const rows = await db.select().from(siteSettings).where(eq(siteSettings.key, "favicon_url")).limit(1);
        const faviconUrl = rows[0]?.value;
        if (faviconUrl) {
          const { rewriteCmsAssetUrl } = await import("./cms-media.js");
          const resolved = rewriteCmsAssetUrl(faviconUrl);
          if (resolved.startsWith("http") || resolved.startsWith("/")) {
            res.redirect(302, resolved);
            return;
          }
        }
      }
    } catch {
      /* static fallback */
    }
    res.redirect(302, "/favicon.svg");
  });

  app.get("/favicon.svg", (_req: Request, res: Response) => {
    const publicDir = path.resolve(import.meta.dirname, "public");
    res.sendFile(path.join(publicDir, "favicon.svg"), (err) => {
      if (err) res.status(404).end();
    });
  });



  // Sprint 1 P0: /browse has no SPA route — 301 to /gallery
  app.get("/browse", (_req: Request, res: Response) => {
    res.redirect(301, "/gallery");
  });

  // ── Dynamic robots.txt ──────────────────────────────────────────────────────
  app.get("/robots.txt", (req: Request, res: Response) => {
    const base = getBaseUrl(req);
    // NOTE: Do NOT block /gallery? or /search? in robots.txt.
    // Google must crawl these URLs to see the meta robots noindex tag.
    // Blocking in robots.txt causes "Discovered - currently not indexed" issues in GSC.
    const content = `User-agent: *
Allow: /

# Block admin and private areas
Disallow: /admin/
Disallow: /admin
Disallow: /account/
Disallow: /account
Disallow: /checkout/
Disallow: /checkout
Disallow: /payment/
Disallow: /payment
Disallow: /api/
Disallow: /api

# Block auth pages
Disallow: /login
Disallow: /register
Disallow: /forgot-password
Disallow: /reset-password

# Allow important public pages
Allow: /gallery
Allow: /album/
Allow: /tag/
Allow: /tags
Allow: /creator/
Allow: /creators
Allow: /vip
Allow: /search

# Sitemaps
Sitemap: ${base}/sitemap-index.xml
Sitemap: ${base}/sitemap.xml
Sitemap: ${base}/sitemap-albums.xml
Sitemap: ${base}/sitemap-creators.xml
Sitemap: ${base}/sitemap-tags.xml
Sitemap: ${base}/sitemap-images.xml
Sitemap: ${base}/sitemap-pages.xml
Sitemap: ${base}/sitemap-categories.xml
`;
    res.set("Content-Type", "text/plain; charset=utf-8");
    res.set("Cache-Control", "public, max-age=86400");
    res.send(content);
  });

  // ── 301 Redirect: /gallery?tag=[slug] → /tag/[slug] ────────────────────────
  // Must be registered BEFORE tRPC and SPA fallback so Googlebot gets 301 immediately.
  app.get("/gallery", async (req: Request, res: Response, next) => {
    const tagSlug = req.query.tag as string | undefined;
    if (!tagSlug) return next(); // no tag param — pass through to SPA
    try {
      const tag = await getTagBySlug(tagSlug);
      if (tag) {
        // Tag exists → 301 redirect to canonical tag page
        return res.redirect(301, `/tag/${encodeURIComponent(tag.slug)}`);
      }
    } catch (_err) {
      // DB error — fall through to SPA which will render noindex
    }
    // Tag not found → let SPA handle it (Gallery.tsx will render noindex,follow)
    return next();
  });

  // ── Sitemap Index ────────────────────────────────────────────────────────────
  async function serveSitemapIndex(req: Request, res: Response) {
    const base = getBaseUrl(req);
    const now = w3cDate(new Date());

    // Try to get the actual last-modified dates from DB for each sub-sitemap
    let albumsLastmod = now;
    let creatorsLastmod = now;
    let tagsLastmod = now;
    let categoriesLastmod = now;
    try {
      const db = await getDb();
      if (db) {
        const [albumRow] = await db
          .select({ maxUpdated: max(albums.updatedAt) })
          .from(albums)
          .where(eq(albums.status, "published"));
        if (albumRow?.maxUpdated) albumsLastmod = w3cDate(albumRow.maxUpdated);

        const [creatorRow] = await db
          .select({ maxUpdated: max(creators.updatedAt) })
          .from(creators);
        if (creatorRow?.maxUpdated) creatorsLastmod = w3cDate(creatorRow.maxUpdated);

        const [tagRow] = await db
          .select({ maxCreated: max(tags.createdAt) })
          .from(tags);
        if (tagRow?.maxCreated) tagsLastmod = w3cDate(tagRow.maxCreated);

        const [catRow] = await db
          .select({ maxUpdated: max(categories.updatedAt) })
          .from(categories);
        if (catRow?.maxUpdated) categoriesLastmod = w3cDate(catRow.maxUpdated);
      }
    } catch (_err) {
      // fallback to now
    }

    const sitemapEntries = [
      { loc: `${base}/sitemap-pages.xml`, lastmod: now },
      { loc: `${base}/sitemap-albums.xml`, lastmod: albumsLastmod },
      { loc: `${base}/sitemap-creators.xml`, lastmod: creatorsLastmod },
      { loc: `${base}/sitemap-tags.xml`, lastmod: tagsLastmod },
      { loc: `${base}/sitemap-categories.xml`, lastmod: categoriesLastmod },
      { loc: `${base}/sitemap-images.xml`, lastmod: albumsLastmod },
    ];

    const entries = sitemapEntries
      .map((s) => `  <sitemap>\n    <loc>${s.loc}</loc>\n    <lastmod>${s.lastmod}</lastmod>\n  </sitemap>`)
      .join("\n");
    const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${entries}\n</sitemapindex>`;
    res.set("Content-Type", "application/xml; charset=utf-8");
    res.set("Cache-Control", "public, max-age=3600");
    res.send(xml);
  }
  app.get("/sitemap-index.xml", serveSitemapIndex);
  // sitemap.xml also serves as the index for backward compatibility
  app.get("/sitemap.xml", serveSitemapIndex);

  // ── Static Pages Sitemap ────────────────────────────────────────────────────
  app.get("/sitemap-pages.xml", (_req: Request, res: Response) => {
    const base = getBaseUrl(_req);
    const now = w3cDate(new Date());
    // Static pages: lastmod = today, changefreq based on update cadence
    const pages = [
      { url: "/",         priority: "1.0", changefreq: "daily",   lastmod: now },
      { url: "/gallery",  priority: "0.9", changefreq: "hourly",  lastmod: now },
      { url: "/creators", priority: "0.8", changefreq: "daily",   lastmod: now },
      { url: "/tags",     priority: "0.7", changefreq: "weekly",  lastmod: now },
      // /search intentionally excluded — dynamic search results have no standalone SEO value
      { url: "/vip",      priority: "0.8", changefreq: "monthly", lastmod: now },
      { url: "/about",    priority: "0.5", changefreq: "monthly", lastmod: now },
      { url: "/privacy",  priority: "0.3", changefreq: "yearly",  lastmod: now },
      { url: "/terms",    priority: "0.3", changefreq: "yearly",  lastmod: now },
      { url: "/contact",  priority: "0.4", changefreq: "monthly", lastmod: now },
      { url: "/dmca",     priority: "0.3", changefreq: "yearly",  lastmod: now },
    ];
    const entries = pages
      .map((p) => urlEntry(`${base}${p.url}`, p.lastmod, p.changefreq, p.priority))
      .join("\n");
    const xml = `${urlsetOpen()}\n${entries}\n${urlsetClose()}`;
    res.set("Content-Type", "application/xml; charset=utf-8");
    res.set("Cache-Control", "public, max-age=3600");
    res.send(xml);
  });

  // ── Albums Sitemap ──────────────────────────────────────────────────────────
  app.get("/sitemap-albums.xml", async (req: Request, res: Response) => {
    const base = getBaseUrl(req);
    let entries = "";
    try {
      const db = await getDb();
      if (db) {
        const rows = await db
          .select({
            slug: albums.slug,
            updatedAt: albums.updatedAt,
            createdAt: albums.createdAt,
            isVip: albums.isVip,
            robotsIndex: albums.robotsIndex,
            viewCount: albums.viewCount,
            photoCount: albums.photoCount,
          })
          .from(albums)
          .where(eq(albums.status, "published"))
          .orderBy(desc(albums.updatedAt));

        for (const row of rows) {
          if (row.robotsIndex === false) continue;
          const lastmod = w3cDate(row.updatedAt);
          const changefreq = smartChangefreq(row.updatedAt);
          const priority = albumPriority(row.viewCount, row.isVip);
          entries += urlEntry(`${base}/album/${xmlEscape(row.slug)}`, lastmod, changefreq, priority) + "\n";
        }
      }
    } catch (err) {
      console.error("[SEO] sitemap-albums.xml error:", err);
    }
    const xml = `${urlsetOpen()}\n${entries}${urlsetClose()}`;
    res.set("Content-Type", "application/xml; charset=utf-8");
    res.set("Cache-Control", "public, max-age=3600");
    res.send(xml);
  });

  // ── Creators Sitemap ────────────────────────────────────────────────────────
  app.get("/sitemap-creators.xml", async (req: Request, res: Response) => {
    const base = getBaseUrl(req);
    let entries = "";
    try {
      const db = await getDb();
      if (db) {
        const rows = await db
          .select({
            slug: creators.slug,
            updatedAt: creators.updatedAt,
            albumCount: sql<number>`(
              SELECT COUNT(*) FROM albums
              WHERE albums.creatorId = ${creators.id} AND albums.status = 'published'
            )`.as("albumCount"),
            robotsIndex: creators.robotsIndex,
            avatarUrl: creators.avatarUrl,
          })
          .from(creators)
          .orderBy(desc(creators.updatedAt));

        for (const row of rows) {
          if (row.robotsIndex === false) continue;
          if (Number(row.albumCount) <= 0 || !row.avatarUrl) continue;
          const lastmod = w3cDate(row.updatedAt);
          const changefreq = smartChangefreq(row.updatedAt);
          const priority = creatorPriority(row.albumCount);
          entries += urlEntry(`${base}/creator/${xmlEscape(row.slug)}`, lastmod, changefreq, priority) + "\n";
        }
      }
    } catch (err) {
      console.error("[SEO] sitemap-creators.xml error:", err);
    }
    const xml = `${urlsetOpen()}\n${entries}${urlsetClose()}`;
    res.set("Content-Type", "application/xml; charset=utf-8");
    res.set("Cache-Control", "public, max-age=3600");
    res.send(xml);
  });

  // ── Tags Sitemap ─────────────────────────────────────────────────────────────
  app.get("/sitemap-tags.xml", async (req: Request, res: Response) => {
    const base = getBaseUrl(req);
    let entries = "";
    try {
      const db = await getDb();
      if (db) {
        const { albumTags } = await import("../drizzle/schema");
        const { sql, gte } = await import("drizzle-orm");
        const rows = await db
          .select({
            slug: tags.slug,
            createdAt: tags.createdAt,
            albumCount: sql<number>`count(${albumTags.albumId})`.as("albumCount"),
          })
          .from(tags)
          .innerJoin(albumTags, eq(albumTags.tagId, tags.id))
          .groupBy(tags.id, tags.slug, tags.createdAt)
          .having(gte(sql`count(${albumTags.albumId})`, 2))
          .orderBy(desc(tags.createdAt));

        for (const row of rows) {
          const lastmod = w3cDate(row.createdAt);
          // Tags are fairly static; new tags get "monthly", old ones "yearly"
          const ageMs = Date.now() - row.createdAt.getTime();
          const ageDays = ageMs / (1000 * 60 * 60 * 24);
          const changefreq = ageDays <= 30 ? "monthly" : "yearly";
          const priority = ageDays <= 30 ? "0.7" : "0.5";
          entries += urlEntry(`${base}/tag/${xmlEscape(row.slug)}`, lastmod, changefreq, priority) + "\n";
        }
      }
    } catch (err) {
      console.error("[SEO] sitemap-tags.xml error:", err);
    }
    const xml = `${urlsetOpen()}\n${entries}${urlsetClose()}`;
    res.set("Content-Type", "application/xml; charset=utf-8");
    res.set("Cache-Control", "public, max-age=3600");
    res.send(xml);
  });

  // ── Category landing pages ──────────────────────────────────────────────────
  app.get("/sitemap-categories.xml", async (req: Request, res: Response) => {
    const base = getBaseUrl(req);
    let entries = "";
    try {
      const db = await getDb();
      if (db) {
        const rows = await db
          .select({
            slug: categories.slug,
            updatedAt: categories.updatedAt,
          })
          .from(categories)
          .orderBy(categories.slug);

        for (const row of rows) {
          const lastmod = w3cDate(row.updatedAt ?? new Date());
          entries +=
            urlEntry(
              `${base}/search?category=${encodeURIComponent(row.slug)}`,
              lastmod,
              "weekly",
              "0.7"
            ) + "\n";
        }
      }
    } catch (err) {
      console.error("[SEO] sitemap-categories.xml error:", err);
    }
    const xml = `${urlsetOpen()}\n${entries}${urlsetClose()}`;
    res.set("Content-Type", "application/xml; charset=utf-8");
    res.set("Cache-Control", "public, max-age=3600");
    res.send(xml);
  });

  // ── Image Sitemap ────────────────────────────────────────────────────────────
  app.get("/sitemap-images.xml", async (req: Request, res: Response) => {
    const base = getBaseUrl(req);
    let urlEntries = "";
    try {
      const db = await getDb();
      if (db) {
        const publishedAlbums = await db
          .select({
            id: albums.id,
            slug: albums.slug,
            title: albums.title,
            cosplayer: albums.cosplayer,
            creator: albums.creator,
            creatorName: creators.name,
            character: albums.character,
            series: albums.series,
            robotsIndex: albums.robotsIndex,
            updatedAt: albums.updatedAt,
          })
          .from(albums)
          .leftJoin(creators, eq(albums.creatorId, creators.id))
          .where(eq(albums.status, "published"))
          .orderBy(desc(albums.updatedAt));

        for (const album of publishedAlbums) {
          if (album.robotsIndex === false) continue;

          const albumPhotos = await db
            .select({
              thumbUrl: photos.thumbUrl,
              webpUrl: photos.webpUrl,
              originalUrl: photos.originalUrl,
              altText: photos.altText,
            })
            .from(photos)
            .where(and(eq(photos.albumId, album.id), eq(photos.isFreePreview, true)))
            .limit(20);

          if (albumPhotos.length === 0) continue;

          const albumTitle = xmlEscape(album.title);
          const lastmod = w3cDate(album.updatedAt);
          const changefreq = smartChangefreq(album.updatedAt);
          let imageEntries = "";
          for (let i = 0; i < albumPhotos.length; i++) {
            const photo = albumPhotos[i];
            const imageUrl = photo.thumbUrl;
            if (!imageUrl) continue;

            const modelPart =
              album.creatorName ||
              album.cosplayer ||
              album.creator ||
              album.title.split(" ")[0] ||
              "Model";
            const seriesPart = album.series || album.character || "";
            const autoAlt = seriesPart
              ? `${modelPart} ${seriesPart} cosplay photo ${i + 1} - yukvix`
              : `${modelPart} cosplay photo ${i + 1} - yukvix`;
            const alt = photo.altText ? xmlEscape(photo.altText) : xmlEscape(autoAlt);

            imageEntries += `    <image:image>\n      <image:loc>${xmlEscape(imageUrl)}</image:loc>\n      <image:title>${xmlEscape(albumTitle)} #${i + 1}</image:title>\n      <image:caption>${alt}</image:caption>\n    </image:image>\n`;
          }

          if (imageEntries) {
            urlEntries += `  <url>\n    <loc>${base}/album/${xmlEscape(album.slug)}</loc>\n    <lastmod>${lastmod}</lastmod>\n    <changefreq>${changefreq}</changefreq>\n${imageEntries}  </url>\n`;
          }
        }
      }
    } catch (err) {
      console.error("[SEO] sitemap-images.xml error:", err);
    }

    const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"\n        xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">\n${urlEntries}</urlset>`;
    res.set("Content-Type", "application/xml; charset=utf-8");
    res.set("Cache-Control", "public, max-age=3600");
    res.send(xml);
  });
}
