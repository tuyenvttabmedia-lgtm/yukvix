/**
 * Server-side full meta tag injection (SEO Foundation Phase A).
 * Mirrors client SeoHead output in the first HTML byte.
 */

export const SITE_NAME = "Yukvix";
export const DEFAULT_DESCRIPTION =
  "Discover thousands of stunning cosplay photos from talented cosplayers worldwide. Join VIP for exclusive high-resolution galleries.";
export const DEFAULT_OG_IMAGE = "/og-default.jpg";

export interface FullMetaOptions {
  title: string;
  description?: string | null;
  canonical: string;
  ogType?: string;
  ogImage?: string | null;
  robots?: "index, follow" | "noindex, nofollow";
  twitterCard?: "summary" | "summary_large_image";
  /** If true, title is used as-is (homepage). Otherwise append " | Yukvix" when missing. */
  isHome?: boolean;
}

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function setTitle(html: string, title: string): string {
  const tag = `<title>${esc(title)}</title>`;
  if (/<title>[^<]*<\/title>/i.test(html)) return html.replace(/<title>[^<]*<\/title>/i, tag);
  return html.replace(/<head>/i, `<head>\n    ${tag}`);
}

function setMeta(html: string, attr: string, key: string, value: string): string {
  const tag = `<meta ${attr}="${key}" content="${esc(value)}" />`;
  const re = new RegExp(`<meta ${attr}="${key}" content="[^"]*"\\s*/>`, "i");
  if (re.test(html)) return html.replace(re, tag);
  return html.replace(/<head>/i, `<head>\n    ${tag}`);
}

function setLink(html: string, rel: string, href: string): string {
  const tag = `<link rel="${rel}" href="${esc(href)}" />`;
  const re = new RegExp(`<link rel="${rel}" href="[^"]*"\\s*/>`, "i");
  if (re.test(html)) return html.replace(re, tag);
  return html.replace(/<head>/i, `<head>\n    ${tag}`);
}

function absImage(base: string, image?: string | null): string | null {
  if (!image) return null;
  if (image.startsWith("http://") || image.startsWith("https://")) return image;
  return `${base}${image.startsWith("/") ? image : `/${image}`}`;
}

function formatTitle(title: string, isHome?: boolean): string {
  if (isHome) return title;
  if (title.includes(SITE_NAME)) return title;
  return `${title} | ${SITE_NAME}`;
}

export function applyFullMeta(html: string, base: string, opts: FullMetaOptions): string {
  const fullTitle = formatTitle(opts.title, opts.isHome);
  const desc = (opts.description || DEFAULT_DESCRIPTION).substring(0, 160);
  const robots = opts.robots ?? "index, follow";
  const ogType = opts.ogType ?? "website";
  const twitterCard = opts.twitterCard ?? "summary_large_image";
  const ogImage = absImage(base, opts.ogImage ?? DEFAULT_OG_IMAGE);

  let out = setTitle(html, fullTitle);
  out = setMeta(out, "name", "description", desc);
  out = setMeta(out, "name", "robots", robots);
  out = setLink(out, "canonical", opts.canonical);

  out = setMeta(out, "property", "og:site_name", SITE_NAME);
  out = setMeta(out, "property", "og:type", ogType);
  out = setMeta(out, "property", "og:title", fullTitle);
  out = setMeta(out, "property", "og:description", desc);
  out = setMeta(out, "property", "og:url", opts.canonical);
  if (ogImage) {
    out = setMeta(out, "property", "og:image", ogImage);
    out = setMeta(out, "property", "og:image:alt", fullTitle);
  }

  out = setMeta(out, "name", "twitter:card", twitterCard);
  out = setMeta(out, "name", "twitter:title", fullTitle);
  out = setMeta(out, "name", "twitter:description", desc);
  if (ogImage) {
    out = setMeta(out, "name", "twitter:image", ogImage);
    out = setMeta(out, "name", "twitter:image:alt", fullTitle);
  }

  return out;
}

/** Fixed meta for hardcoded static/listing routes (no CMS). */
export const STATIC_ROUTE_META: Record<
  string,
  Omit<FullMetaOptions, "canonical"> & { path: string }
> = {
  "/": {
    path: "/",
    title: `${SITE_NAME} — Premium Cosplay Gallery`,
    description: DEFAULT_DESCRIPTION,
    isHome: true,
    ogType: "website",
  },
  "/gallery": {
    path: "/gallery",
    title: "Cosplay Gallery",
    description:
      "Browse thousands of stunning cosplay photos. Filter by category, VIP status, and more. New albums added daily.",
    ogType: "website",
  },
  "/creators": {
    path: "/creators",
    title: "Creators — Yukvix",
    description: "Discover talented cosplayers and browse their cosplay galleries on Yukvix.",
    ogType: "website",
  },
  "/tags": {
    path: "/tags",
    title: "Cosplay Tags & Categories | Yukvix",
    description: "Browse cosplay tags, characters, series, and categories on Yukvix.",
    ogType: "website",
  },
  "/about": {
    path: "/about",
    title: "About — Yukvix",
    description: "Learn about Yukvix — premium cosplay gallery platform for creators and fans worldwide.",
    ogType: "website",
  },
  "/contact": {
    path: "/contact",
    title: "Contact — Yukvix",
    description: "Contact the Yukvix team for support, partnerships, or general inquiries.",
    ogType: "website",
  },
  "/dmca": {
    path: "/dmca",
    title: "DMCA — Yukvix",
    description: "DMCA takedown policy and copyright information for Yukvix.",
    ogType: "website",
  },
  "/info": {
    path: "/info",
    title: "Info — Yukvix",
    description: "Information and guides about using Yukvix cosplay gallery platform.",
    ogType: "website",
  },
  "/vip": {
    path: "/vip",
    title: "VIP Membership — Yukvix",
    description: "Unlock exclusive high-resolution cosplay galleries with Yukvix VIP membership.",
    ogType: "website",
  },
  "/search": {
    path: "/search",
    title: "Search Cosplay Albums",
    description:
      "Search and filter thousands of cosplay albums by character, series, cosplayer name, and more.",
    ogType: "website",
  },
};
