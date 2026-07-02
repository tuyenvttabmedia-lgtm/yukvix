/**
 * Lightweight HTML Crawler — uses got + cheerio
 * Fast for static/SSR pages. Falls back to browser crawler for JS-heavy sites.
 */
import * as cheerio from "cheerio";
import type { CrawlConfig, ExtractedPage, ExtractedImage } from "./types.js";

const DEFAULT_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

async function fetchHtml(url: string, config: CrawlConfig): Promise<string> {
  const gotModule = await import("got");
  const got = gotModule.default;

  const headers: Record<string, string> = {
    "User-Agent": config.userAgent || DEFAULT_UA,
    Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
    "Accept-Encoding": "gzip, deflate, br",
    "Cache-Control": "no-cache",
    Pragma: "no-cache",
    Referer: config.sourceUrl,
  };

  if (config.cookieString) {
    headers["Cookie"] = config.cookieString;
  }

  const response = await (got as any)(url, {
    headers,
    timeout: { request: 30000 },
    retry: { limit: 3, methods: ["GET"], statusCodes: [429, 500, 502, 503, 504] },
    followRedirect: true,
    throwHttpErrors: true,
  });

  return response.body;
}

function extractImages(
  $: cheerio.CheerioAPI,
  imageSelector: string,
  contentAreaSelector: string | undefined,
  baseUrl: string
): ExtractedImage[] {
  const images: ExtractedImage[] = [];
  const seen = new Set<string>();

  // Resolve the effective scope selector string.
  // If contentAreaSelector is set but doesn't match (e.g. WordPress gallery-N suffix changes per page),
  // fall back to the full document to avoid returning 0 images on subsequent pages.
  let effectiveScope: string | null = null;
  if (contentAreaSelector) {
    // Try exact match first
    if ($(contentAreaSelector).length > 0) {
      effectiveScope = contentAreaSelector;
    } else {
      // Try each comma-separated part (e.g. ".entry-content, .post-content")
      const parts = contentAreaSelector.split(",").map((s) => s.trim());
      for (const part of parts) {
        if ($(part).length > 0) {
          effectiveScope = part;
          break;
        }
      }
      if (!effectiveScope) {
        console.warn(`[Crawler] contentAreaSelector "${contentAreaSelector}" did not match — using full document`);
      }
    }
  }

  // Build the full selector: if we have a scope, prefix imageSelector with it
  const fullSelector = effectiveScope
    ? `${effectiveScope} ${imageSelector}`
    : imageSelector;

  $(fullSelector).each((_, el) => {
    const $el = $(el);
    let src =
      $el.attr("src") ||
      $el.attr("data-src") ||
      $el.attr("data-lazy-src") ||
      $el.attr("data-original") ||
      $el.attr("data-url") ||
      $el.attr("data-full") ||
      $el.attr("data-hi-res") ||
      $el.attr("content") ||
      "";

    // Handle srcset — pick highest resolution
    const srcset = $el.attr("srcset") || $el.attr("data-srcset");
    if (srcset && !src) {
      const parts = srcset.split(",").map((s) => s.trim().split(/\s+/));
      const sorted = parts.sort((a, b) => {
        const wa = parseFloat(a[1] || "0");
        const wb = parseFloat(b[1] || "0");
        return wb - wa;
      });
      if (sorted[0]?.[0]) src = sorted[0][0];
    }

    if (!src) return;

    // Resolve relative URLs
    try {
      src = new URL(src, baseUrl).href;
    } catch {
      return;
    }

    // Skip small icons, tracking pixels, SVGs, data URIs
    if (src.includes(".svg") || src.startsWith("data:") || seen.has(src)) return;

    // Skip very small images (likely icons/avatars) based on declared dimensions
    const w = parseInt($el.attr("width") || "0");
    const h = parseInt($el.attr("height") || "0");
    if ((w > 0 && w < 100) || (h > 0 && h < 100)) return;

    seen.add(src);

    images.push({
      url: src,
      alt: $el.attr("alt") || undefined,
      width: w || undefined,
      height: h || undefined,
    });
  });

  return images;
}

/**
 * Build next page URL using URL pattern.
 * Pattern examples:
 *   "[url]/[page]/"  → https://example.com/post/2/
 *   "[url]/page/[page]/" → https://example.com/post/page/2/
 * Default (no pattern): "[url]/[page]/"
 */
function buildPageUrl(basePostUrl: string, pageNum: number, pattern?: string): string {
  // Normalize: strip trailing slash from base URL
  const base = basePostUrl.replace(/\/+$/, "");

  if (!pattern || pattern.trim() === "") {
    // Default: append /2/, /3/... to the post URL
    return `${base}/${pageNum}/`;
  }

  // Replace [url] with base, [page] with page number
  return pattern
    .replace("[url]", base)
    .replace("[page]", String(pageNum));
}

/**
 * Detect next page URL using CSS selector (for "next page" link style).
 * Used when paginationType = "next_page".
 */
function detectNextPageBySelector(
  $: cheerio.CheerioAPI,
  selector: string,
  baseUrl: string
): string | undefined {
  const $els = $(selector);
  if (!$els.length) return undefined;

  // Single element — use directly
  if ($els.length === 1) {
    const href = $els.first().attr("href") || $els.first().attr("data-href");
    if (!href) return undefined;
    try { return new URL(href, baseUrl).href; } catch { return undefined; }
  }

  // Multiple elements (numbered list): find .current then return next link
  const $current = $els.filter(".current, [aria-current='page'], .active").first();
  if ($current.length) {
    let found = false;
    let nextHref: string | undefined;
    $els.each((_, el) => {
      if (found && !nextHref) {
        const href = $(el).attr("href") || $(el).attr("data-href");
        if (href && !$(el).hasClass("current") && !$(el).hasClass("active")) {
          try { nextHref = new URL(href, baseUrl).href; } catch {}
        }
      }
      if (el === $current[0]) found = true;
    });
    if (nextHref) return nextHref;
  }

  // rel="next" link
  const $relNext = $els.filter('[rel="next"]').first();
  if ($relNext.length) {
    const href = $relNext.attr("href");
    if (href) { try { return new URL(href, baseUrl).href; } catch {} }
  }

  return undefined;
}

/**
 * Auto-detect next page link from common HTML patterns.
 */
function autoDetectNextPage($: cheerio.CheerioAPI, currentUrl: string): string | undefined {
  const nextPatterns = [
    'a[rel="next"]',
    'link[rel="next"]',
    'a.next',
    'a.page-next',
    'a[aria-label="Next"]',
    'a[aria-label="Next page"]',
    'a[title="Next"]',
    ".pagination a:last-child",
    ".pager-next a",
    ".nav-next a",
  ];

  for (const pattern of nextPatterns) {
    const $el = $(pattern).first();
    if ($el.length) {
      const href = $el.attr("href");
      if (href) {
        try { return new URL(href, currentUrl).href; } catch { continue; }
      }
    }
  }

  return undefined;
}

export async function crawlPageHtml(
  url: string,
  config: CrawlConfig,
  pageNum?: number
): Promise<ExtractedPage | null> {
  try {
    const html = await fetchHtml(url, config);
    const $ = cheerio.load(html);

    // Extract title
    let title: string | undefined;
    if (config.titleSelector) {
      title = $(config.titleSelector).first().text().trim() || undefined;
    }
    if (!title) {
      title = $("h1").first().text().trim() || $("title").text().trim() || undefined;
    }

    // Extract creator
    let creator: string | undefined;
    if (config.creatorSelector) {
      creator = $(config.creatorSelector).first().text().trim() || undefined;
    }

    // Extract tags
    const tags: string[] = [];
    if (config.tagSelector) {
      $(config.tagSelector).each((_, el) => {
        const tag = $(el).text().trim();
        if (tag) tags.push(tag);
      });
    }

    // Extract publish date
    let publishDate: Date | undefined;
    if (config.publishDateSelector) {
      const dateText =
        $(config.publishDateSelector).first().attr("datetime") ||
        $(config.publishDateSelector).first().attr("content") ||
        $(config.publishDateSelector).first().text().trim();
      if (dateText) {
        const parsed = new Date(dateText);
        if (!isNaN(parsed.getTime())) publishDate = parsed;
      }
    }

    // Extract images — scoped to contentAreaSelector if set
    const imageSelector = config.imageSelector || "img";
    const images = extractImages($, imageSelector, config.contentAreaSelector, url);

    // Determine next page URL
    // For numbered pagination, we use URL pattern (not CSS selector)
    // nextPageUrl is only used by crawlAll to know if there's a next page
    // For URL pattern mode, crawlAll handles page numbering directly
    let nextPageUrl: string | undefined;
    if (config.paginationType === "next_page") {
      if (config.nextPageSelector) {
        nextPageUrl = detectNextPageBySelector($, config.nextPageSelector, url);
      }
      if (!nextPageUrl) {
        nextPageUrl = autoDetectNextPage($, url);
      }
    }
    // For "numbered" type, nextPageUrl is set by crawlAll using buildPageUrl

    return {
      url,
      title,
      creator,
      tags,
      publishDate,
      images,
      nextPageUrl,
      pageNumber: pageNum || 1,
    };
  } catch (err: any) {
    if (
      err?.response?.statusCode === 403 ||
      err?.response?.statusCode === 503 ||
      (err?.response?.body && (
        err.response.body.includes("cf-browser-verification") ||
        err.response.body.includes("Just a moment") ||
        err.response.body.includes("Enable JavaScript")
      ))
    ) {
      throw new Error("BROWSER_REQUIRED");
    }
    throw err;
  }
}

/**
 * Exported helper for building numbered page URLs (used by crawlAll and selector tester).
 */
export { buildPageUrl };
