/**
 * Crawler Detector — auto-detect if browser rendering is needed
 * Tries HTML first, falls back to Puppeteer on signals
 */
import { crawlPageHtml, buildPageUrl } from "./crawler-html.js";
import { crawlPageBrowser } from "./crawler-browser.js";
import type { CrawlConfig, CrawlResult, ExtractedImage, ExtractedPage } from "./types.js";

// Sites that are KNOWN to require JS rendering (Cloudflare JS challenge, SPA, etc.)
// Only add here if HTML crawler consistently fails with BROWSER_REQUIRED signal
const BROWSER_REQUIRED_DOMAINS: string[] = [
  // "example-spa-site.com",
];

function requiresBrowserByDomain(url: string): boolean {
  try {
    const hostname = new URL(url).hostname.toLowerCase();
    return BROWSER_REQUIRED_DOMAINS.some((d) => hostname.includes(d));
  } catch {
    return false;
  }
}

export async function crawlPage(
  url: string,
  config: CrawlConfig,
  pageNum?: number
): Promise<ExtractedPage | null> {
  const forceBrowser = config.requiresBrowser || requiresBrowserByDomain(url);

  if (forceBrowser) {
    return crawlPageBrowser(url, config);
  }

  try {
    return await crawlPageHtml(url, config, pageNum);
  } catch (err: any) {
    if (err?.message === "BROWSER_REQUIRED") {
      console.log(`[Crawler] HTML failed for ${url}, switching to browser`);
      return crawlPageBrowser(url, config);
    }
    throw err;
  }
}

export async function crawlAll(
  config: CrawlConfig,
  onProgress?: (page: ExtractedPage, pageNum: number) => Promise<void>
): Promise<CrawlResult> {
  const pages: ExtractedPage[] = [];
  const allImages: ExtractedImage[] = [];
  const seenImageUrls = new Set<string>();

  let stoppedReason: CrawlResult["stoppedReason"] = "no_more_pages";

  // --- Numbered URL pattern mode --------------------------------------------
  // When paginationType = "numbered", we iterate page numbers using URL pattern
  // instead of following CSS selector links.
  // Default pattern: [url]/[page]/ → everia.club/post/2/, /post/3/...
  if (config.paginationType === "numbered") {
    const basePostUrl = config.sourceUrl;
    const maxPages = Math.min(config.maxPages, 10); // cap at 10 pages per post

    // Page 1 is always the base URL
    for (let pageNum = 1; pageNum <= maxPages; pageNum++) {
      const pageUrl = pageNum === 1
        ? basePostUrl
        : buildPageUrl(basePostUrl, pageNum, config.pageUrlPattern);

      console.log(`[Crawler] Numbered page ${pageNum}/${maxPages}: ${pageUrl}`);

      let page: ExtractedPage | null = null;
      try {
        page = await crawlPage(pageUrl, config, pageNum);
      } catch (err: any) {
        // 404 = no more pages
        if (err?.response?.statusCode === 404 || err?.message?.includes("404")) {
          console.log(`[Crawler] Page ${pageNum} returned 404 — stopping`);
          stoppedReason = "no_more_pages";
          break;
        }
        // Other errors: stop pagination
        console.warn(`[Crawler] Page ${pageNum} error: ${err?.message}`);
        stoppedReason = "error";
        break;
      }

      if (!page || page.images.length === 0) {
        // Empty page = no more content
        console.log(`[Crawler] Page ${pageNum} has no images — stopping`);
        stoppedReason = "no_more_pages";
        break;
      }

      // Collect unique images
      for (const img of page.images) {
        if (!seenImageUrls.has(img.url)) {
          seenImageUrls.add(img.url);
          allImages.push(img);
        }
      }

      pages.push(page);

      if (onProgress) {
        await onProgress(page, pageNum);
      }

      if (pageNum >= maxPages) {
        stoppedReason = "max_pages";
        break;
      }

      // Polite crawl delay
      if (config.crawlDelayMs > 0) {
        await new Promise((r) => setTimeout(r, config.crawlDelayMs));
      }
    }
  } else {
    // --- next_page / none mode ---------------------------------------------
    let currentUrl: string | undefined = config.sourceUrl;
    let pageNum = 0;

    while (currentUrl && pageNum < config.maxPages) {
      pageNum++;
      console.log(`[Crawler] Page ${pageNum}/${config.maxPages}: ${currentUrl}`);

      const page = await crawlPage(currentUrl, config, pageNum);
      if (!page) break;

      // Apply date filter
      if (config.crawlStartDate && page.publishDate) {
        if (page.publishDate < config.crawlStartDate) {
          stoppedReason = "date_filter";
          break;
        }
      }

      // Apply keyword filter
      if (config.keywordFilter && page.title) {
        const kw = config.keywordFilter.toLowerCase();
        if (!page.title.toLowerCase().includes(kw)) {
          currentUrl = page.nextPageUrl;
          continue;
        }
      }

      // Apply creator filter
      if (config.creatorFilter && page.creator) {
        const cf = config.creatorFilter.toLowerCase();
        if (!page.creator.toLowerCase().includes(cf)) {
          currentUrl = page.nextPageUrl;
          continue;
        }
      }

      // Collect unique images
      for (const img of page.images) {
        if (!seenImageUrls.has(img.url)) {
          seenImageUrls.add(img.url);
          allImages.push(img);
        }
      }

      pages.push(page);

      if (onProgress) {
        await onProgress(page, pageNum);
      }

      // Stop after first page if pagination is disabled
      if (config.paginationType === "none") {
        stoppedReason = "no_more_pages";
        break;
      }

      if (!page.nextPageUrl || page.nextPageUrl === currentUrl) {
        stoppedReason = "no_more_pages";
        break;
      }

      currentUrl = page.nextPageUrl;

      if (config.crawlDelayMs > 0) {
        await new Promise((r) => setTimeout(r, config.crawlDelayMs));
      }
    }

    if (pageNum >= config.maxPages) {
      stoppedReason = "max_pages";
    }
  }

  const firstPage = pages[0];

  return {
    pages,
    allImages,
    title: firstPage?.title,
    creator: firstPage?.creator,
    tags: firstPage?.tags,
    publishDate: firstPage?.publishDate,
    totalPages: pages.length,
    stoppedReason,
  };
}
