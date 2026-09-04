/**
 * Server-side SPA HTML meta + JSON-LD injection (Sprint 1 P0 + SEO Foundation).
 */

import { applyFullMeta, STATIC_ROUTE_META } from "./seo-meta.js";
import { rewritePublicMediaUrl } from "../public-media-url.js";
import {
  buildBreadcrumbSchema,
  buildCollectionPageSchema,
  buildImageGallerySchema,
  buildOrganizationSchema,
  buildPersonSchema,
  buildWebSiteSchema,
  injectJsonLd,
} from "./json-ld.js";

function injectNoIndex(html: string, base: string): string {
  return applyFullMeta(html, base, {
    title: "Yukvix",
    canonical: `${base}/`,
    robots: "noindex, nofollow",
  });
}

/** Paths that must ship noindex in the first HTML byte (before React). */
export function isNoIndexPath(urlPath: string): boolean {
  const path = urlPath.split("?")[0] || "/";
  if (path === "/login" || path === "/register") return true;
  if (path === "/account" || path.startsWith("/account/")) return true;
  if (path === "/admin" || path.startsWith("/admin/")) return true;
  return false;
}

const CMS_STATIC_SLUGS: Record<string, string> = {
  "/privacy": "privacy",
  "/terms": "terms",
};

const PAYMENT_PREFIX = "/payment/";

const KNOWN_EXACT = new Set([
  "/",
  "/gallery",
  "/search",
  "/vip",
  "/creators",
  "/tags",
  "/about",
  "/info",
  "/contact",
  "/dmca",
  "/privacy",
  "/terms",
  "/bookmarks",
  "/404",
]);

function isKnownAppRoute(urlPath: string): boolean {
  const path = urlPath.split("?")[0] || "/";
  if (KNOWN_EXACT.has(path)) return true;
  if (path.startsWith(PAYMENT_PREFIX)) return true;
  if (/^\/album\/[^/]+$/.test(path)) return true;
  if (/^\/creator\/[^/]+$/.test(path)) return true;
  if (/^\/tag\/[^/]+$/.test(path)) return true;
  if (isNoIndexPath(path)) return true;
  if (path === "/forgot-password" || path === "/reset-password" || path === "/verify-email") return true;
  if (path === "/checkout" || path.startsWith("/checkout/")) return true;
  return false;
}

function parseSearchParams(originalUrl: string): URLSearchParams {
  const q = originalUrl.includes("?") ? originalUrl.slice(originalUrl.indexOf("?")) : "";
  return new URLSearchParams(q);
}

function tagDisplayName(name: string): string {
  return name.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export interface SpaHtmlResult {
  html: string;
  status: number;
}

export async function resolveSpaHtml(
  html: string,
  originalUrl: string,
  siteUrl: string
): Promise<SpaHtmlResult> {
  let out = html;
  const base = siteUrl.replace(/\/$/, "");
  const path = originalUrl.split("?")[0] || "/";
  const params = parseSearchParams(originalUrl);

  if (isNoIndexPath(path)) {
    out = injectNoIndex(out, base);
    return { html: out, status: 200 };
  }

  const albumMatch = path.match(/^\/album\/([^/?#]+)/);
  if (albumMatch) {
    const slug = decodeURIComponent(albumMatch[1]);
    const { getDb } = await import("../db.js");
    const { albums, photos } = await import("../../drizzle/schema.js");
    const { eq, and, asc } = await import("drizzle-orm");
    const db = await getDb();
    if (!db) return { html: out, status: 404 };
    const rows = await db.select().from(albums).where(eq(albums.slug, slug)).limit(1);
    const album = rows[0];
    if (!album || album.status !== "published") return { html: out, status: 404 };

    const title = album.seoTitle || album.title || "Album";
    const desc = album.seoDescription || album.description || "";
    const og = rewritePublicMediaUrl(album.ogImage || album.coverUrl || "") || "";
    const canonical = album.canonicalUrl || `${base}/album/${slug}`;
    const robots = album.robotsIndex === false ? "noindex, nofollow" : "index, follow";

    out = applyFullMeta(out, base, {
      title,
      description: desc,
      canonical,
      ogType: "article",
      ogImage: og,
      robots,
    });

    const photoRows = await db
      .select({
        webpUrl: photos.webpUrl,
        originalUrl: photos.originalUrl,
        thumbUrl: photos.thumbUrl,
        altText: photos.altText,
        width: photos.width,
        height: photos.height,
      })
      .from(photos)
      .where(and(eq(photos.albumId, album.id), eq(photos.isFreePreview, true)))
      .orderBy(asc(photos.sortOrder))
      .limit(10);

    const galleryJsonLd = buildImageGallerySchema({
      name: album.title,
      description: desc,
      url: canonical,
      author: album.cosplayer || undefined,
      datePublished: album.createdAt ? new Date(album.createdAt).toISOString() : undefined,
      dateModified: album.updatedAt ? new Date(album.updatedAt).toISOString() : undefined,
      images: photoRows.map((p) => ({
        url: rewritePublicMediaUrl(p.thumbUrl) || "",
        caption: p.altText || `${album.title} cosplay photo`,
        width: p.width || undefined,
        height: p.height || undefined,
      })).filter((p) => p.url),
    });
    const breadcrumbJsonLd = buildBreadcrumbSchema([
      { name: "Home", url: `${base}/` },
      { name: "Gallery", url: `${base}/gallery` },
      { name: album.title, url: canonical },
    ]);
    out = injectJsonLd(out, [galleryJsonLd, breadcrumbJsonLd]);
    return { html: out, status: 200 };
  }

  const creatorMatch = path.match(/^\/creator\/([^/?#]+)/);
  if (creatorMatch) {
    const slug = decodeURIComponent(creatorMatch[1]);
    const { getDb } = await import("../db.js");
    const { creators } = await import("../../drizzle/schema.js");
    const { eq } = await import("drizzle-orm");
    const db = await getDb();
    if (!db) return { html: out, status: 404 };
    const rows = await db.select().from(creators).where(eq(creators.slug, slug)).limit(1);
    const creator = rows[0];
    if (!creator) return { html: out, status: 404 };
    if ((creator.albumCount ?? 0) <= 0 || !creator.avatarUrl) {
      return { html: injectNoIndex(out, base), status: 404 };
    }

    const title = creator.seoTitle || `${creator.name} — Yukvix`;
    const desc = creator.seoDescription || creator.bio || `Browse ${creator.name}'s cosplay gallery on Yukvix.`;
    const og = creator.ogImage || creator.bannerUrl || creator.avatarUrl || "";
    const canonical = creator.canonicalUrl || `${base}/creator/${slug}`;
    const robots = creator.robotsIndex === false ? "noindex, nofollow" : "index, follow";

    out = applyFullMeta(out, base, {
      title,
      description: desc,
      canonical,
      ogType: "profile",
      ogImage: og,
      robots,
    });

    const personJsonLd = buildPersonSchema({
      name: creator.name,
      url: canonical,
      image: og || undefined,
      description: desc,
    });
    const breadcrumbJsonLd = buildBreadcrumbSchema([
      { name: "Home", url: `${base}/` },
      { name: "Creators", url: `${base}/creators` },
      { name: creator.name, url: canonical },
    ]);
    out = injectJsonLd(out, [personJsonLd, breadcrumbJsonLd]);
    return { html: out, status: 200 };
  }

  const tagMatch = path.match(/^\/tag\/([^/?#]+)/);
  if (tagMatch) {
    const slug = decodeURIComponent(tagMatch[1]);
    const { getDb } = await import("../db.js");
    const { tags } = await import("../../drizzle/schema.js");
    const { eq } = await import("drizzle-orm");
    const db = await getDb();
    if (!db) return { html: out, status: 404 };
    const rows = await db.select().from(tags).where(eq(tags.slug, slug)).limit(1);
    const tag = rows[0];
    if (!tag) return { html: out, status: 404 };

    const display = tagDisplayName(tag.name);
    const title = tag.seoTitle || `${display} Cosplay Gallery & Photos | Yukvix`;
    const desc =
      tag.seoDescription ||
      `Browse ${display} cosplay galleries, creator collections, photo sets, and premium content on Yukvix.`;
    const canonical = `${base}/tag/${tag.slug}`;

    out = applyFullMeta(out, base, {
      title,
      description: desc,
      canonical,
      ogType: "website",
    });

    const collectionJsonLd = buildCollectionPageSchema({ name: title, description: desc, url: canonical });
    const breadcrumbJsonLd = buildBreadcrumbSchema([
      { name: "Home", url: `${base}/` },
      { name: "Tags", url: `${base}/tags` },
      { name: display, url: canonical },
    ]);
    out = injectJsonLd(out, [collectionJsonLd, breadcrumbJsonLd]);
    return { html: out, status: 200 };
  }

  const cmsSlug = CMS_STATIC_SLUGS[path];
  if (cmsSlug) {
    const { getDb } = await import("../db.js");
    const { staticPages } = await import("../../drizzle/schema.js");
    const { eq } = await import("drizzle-orm");
    const db = await getDb();
    if (!db) return { html: out, status: 404 };
    const rows = await db
      .select({
        status: staticPages.status,
        title: staticPages.title,
        seoTitle: staticPages.seoTitle,
        seoDescription: staticPages.seoDescription,
      })
      .from(staticPages)
      .where(eq(staticPages.slug, cmsSlug))
      .limit(1);
    const page = rows[0];
    if (!page || page.status !== "published") return { html: out, status: 404 };

    const title = page.seoTitle || page.title || cmsSlug;
    const desc = page.seoDescription || `${title} — Yukvix`;
    const canonical = `${base}${path}`;

    out = applyFullMeta(out, base, { title, description: desc, canonical, ogType: "website" });
    out = injectJsonLd(
      out,
      buildBreadcrumbSchema([
        { name: "Home", url: `${base}/` },
        { name: title, url: canonical },
      ])
    );
    return { html: out, status: 200 };
  }

  if (path === "/search") {
    const categorySlug = params.get("category");
    const q = params.get("q")?.trim();
    const hasFilter = !!(q || params.get("vip"));

    if (categorySlug) {
      const { getDb } = await import("../db.js");
      const { categories } = await import("../../drizzle/schema.js");
      const { eq } = await import("drizzle-orm");
      const db = await getDb();
      const catRows = db
        ? await db.select().from(categories).where(eq(categories.slug, categorySlug)).limit(1)
        : [];
      const cat = catRows[0];
      const title = cat?.seoTitle || (cat ? `${cat.name} Cosplay Gallery` : "Category");
      const desc =
        cat?.seoDescription ||
        cat?.description ||
        `Browse ${cat?.name || categorySlug} cosplay albums and photo sets on Yukvix.`;
      const canonical = `${base}/search?category=${encodeURIComponent(categorySlug)}`;

      out = applyFullMeta(out, base, {
        title,
        description: desc,
        canonical,
        ogImage: cat?.coverUrl,
        robots: hasFilter ? "noindex, nofollow" : "index, follow",
      });
      if (cat) {
        out = injectJsonLd(
          out,
          buildCollectionPageSchema({ name: cat.name, description: desc, url: canonical })
        );
      }
      return { html: out, status: 200 };
    }

    const meta = STATIC_ROUTE_META["/search"];
    out = applyFullMeta(out, base, {
      ...meta,
      canonical: `${base}/search`,
      robots: hasFilter ? "noindex, nofollow" : "index, follow",
    });
    return { html: out, status: 200 };
  }

  if (path === "/gallery") {
    const hasFilterParams = params.has("page") || params.has("sort") || params.has("vip") || params.has("category");
    const meta = STATIC_ROUTE_META["/gallery"];
    out = applyFullMeta(out, base, {
      ...meta,
      canonical: `${base}/gallery`,
      robots: hasFilterParams ? "noindex, nofollow" : "index, follow",
    });
    out = injectJsonLd(
      out,
      buildBreadcrumbSchema([
        { name: "Home", url: `${base}/` },
        { name: "Gallery", url: `${base}/gallery` },
      ])
    );
    return { html: out, status: 200 };
  }

  if (path === "/") {
    const meta = STATIC_ROUTE_META["/"];
    out = applyFullMeta(out, base, {
      ...meta,
      canonical: `${base}/`,
    });
    out = injectJsonLd(out, [buildWebSiteSchema(base), buildOrganizationSchema(base)]);
    return { html: out, status: 200 };
  }

  const staticMeta = STATIC_ROUTE_META[path];
  if (staticMeta) {
    out = applyFullMeta(out, base, {
      ...staticMeta,
      canonical: `${base}${staticMeta.path}`,
    });
    out = injectJsonLd(
      out,
      buildBreadcrumbSchema([
        { name: "Home", url: `${base}/` },
        { name: staticMeta.title.replace(/ \| Yukvix$/, "").replace(/ — Yukvix$/, ""), url: `${base}${staticMeta.path}` },
      ])
    );
    return { html: out, status: 200 };
  }

  if (!isKnownAppRoute(path)) {
    return { html: out, status: 404 };
  }

  return { html: out, status: 200 };
}

/** @deprecated Use resolveSpaHtml */
export async function injectPageMeta(html: string, urlPath: string, siteUrl: string): Promise<string> {
  const { html: result } = await resolveSpaHtml(html, urlPath, siteUrl);
  return result;
}
