/**
 * Browser Crawler — Puppeteer fallback for JS-rendered pages
 * Handles: Cloudflare, lazy-load, infinite scroll, cookie sessions
 */
import type { CrawlConfig, ExtractedPage, ExtractedImage } from "./types.js";

const DEFAULT_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

async function launchBrowser() {
  const puppeteer = await import("puppeteer");
  const browser = await puppeteer.default.launch({
    headless: true,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-gpu",
      "--no-first-run",
      "--no-zygote",
      "--single-process",
      "--disable-extensions",
    ],
  });
  return browser;
}

export async function crawlPageBrowser(url: string, config: CrawlConfig): Promise<ExtractedPage | null> {
  const browser = await launchBrowser();
  const page = await browser.newPage();

  try {
    // Set user agent
    await page.setUserAgent(config.userAgent || DEFAULT_UA);

    // Set cookies if provided
    if (config.cookieString) {
      const cookies = config.cookieString.split(";").map((c) => {
        const [name, ...rest] = c.trim().split("=");
        return { name: name.trim(), value: rest.join("=").trim(), url };
      });
      await page.setCookie(...cookies);
    }

    // Set extra headers
    await page.setExtraHTTPHeaders({
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
      "Accept-Language": "en-US,en;q=0.9",
      "Cache-Control": "no-cache",
    });

    // Navigate
    await page.goto(url, { waitUntil: "networkidle2", timeout: 60000 });

    // Handle infinite scroll — scroll down multiple times to trigger lazy loads
    if (config.paginationType === "infinite_scroll") {
      await autoScroll(page);
    } else {
      // Regular page — scroll once to trigger lazy images
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight / 2));
      await new Promise((r) => setTimeout(r, 1000));
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await new Promise((r) => setTimeout(r, 1500));
    }

    // Wait for images to load
    await page.waitForFunction(
      () => {
        const imgs = document.querySelectorAll("img");
        return Array.from(imgs).every((img) => img.complete);
      },
      { timeout: 10000 }
    ).catch(() => {}); // ignore timeout

    // Extract data via page.evaluate
    const extracted = await page.evaluate(
      (titleSel, imageSel, tagSel, creatorSel, dateSel, nextSel) => {
        const getText = (sel: string) => {
          if (!sel) return "";
          const el = document.querySelector(sel);
          return el?.textContent?.trim() || "";
        };

        const getAttr = (sel: string, attr: string) => {
          if (!sel) return "";
          const el = document.querySelector(sel);
          return (el as any)?.[attr] || (el as Element)?.getAttribute(attr) || "";
        };

        // Title
        const title =
          getText(titleSel) ||
          document.querySelector("h1")?.textContent?.trim() ||
          document.title;

        // Creator
        const creator = getText(creatorSel) || undefined;

        // Tags
        const tags: string[] = [];
        if (tagSel) {
          document.querySelectorAll(tagSel).forEach((el) => {
            const t = el.textContent?.trim();
            if (t) tags.push(t);
          });
        }

        // Publish date
        let publishDate: string | undefined;
        if (dateSel) {
          publishDate =
            getAttr(dateSel, "datetime") ||
            getAttr(dateSel, "content") ||
            getText(dateSel) ||
            undefined;
        }

        // Images — collect all visible images
        const imageData: Array<{ url: string; alt?: string; width?: number; height?: number }> = [];
        const seen = new Set<string>();
        const imgSelector = imageSel || "img";

        document.querySelectorAll(imgSelector).forEach((el: any) => {
          const src =
            el.src ||
            el.dataset?.src ||
            el.dataset?.lazySrc ||
            el.dataset?.original ||
            el.dataset?.url ||
            el.getAttribute("data-full") ||
            el.getAttribute("data-hi-res") ||
            "";

          if (!src || src.startsWith("data:") || src.includes(".svg") || seen.has(src)) return;
          seen.add(src);

          imageData.push({
            url: src,
            alt: el.alt || undefined,
            width: el.naturalWidth || el.width || undefined,
            height: el.naturalHeight || el.height || undefined,
          });
        });

        // Next page
        let nextPageUrl: string | undefined;
        if (nextSel) {
          const nextEl = document.querySelector(nextSel);
          nextPageUrl = (nextEl as HTMLAnchorElement)?.href || undefined;
        }

        return { title, creator, tags, publishDate, imageData, nextPageUrl };
      },
      config.titleSelector || "",
      config.imageSelector || "img",
      config.tagSelector || "",
      config.creatorSelector || "",
      config.publishDateSelector || "",
      config.nextPageSelector || ""
    );

    // Parse publish date
    let publishDate: Date | undefined;
    if (extracted.publishDate) {
      const parsed = new Date(extracted.publishDate);
      if (!isNaN(parsed.getTime())) publishDate = parsed;
    }

    const images: ExtractedImage[] = extracted.imageData.map((img) => ({
      url: img.url,
      alt: img.alt,
      width: img.width,
      height: img.height,
    }));

    return {
      url,
      title: extracted.title || undefined,
      creator: extracted.creator,
      tags: extracted.tags,
      publishDate,
      images,
      nextPageUrl: extracted.nextPageUrl,
    };
  } finally {
    await page.close();
    await browser.close();
  }
}

async function autoScroll(page: any): Promise<void> {
  await page.evaluate(async () => {
    await new Promise<void>((resolve) => {
      let totalHeight = 0;
      const distance = 500;
      const timer = setInterval(() => {
        const scrollHeight = document.body.scrollHeight;
        window.scrollBy(0, distance);
        totalHeight += distance;
        if (totalHeight >= scrollHeight) {
          clearInterval(timer);
          resolve();
        }
      }, 300);
      // Safety timeout: max 30s scroll
      setTimeout(() => { clearInterval(timer); resolve(); }, 30000);
    });
  });
  // Wait for lazy images to load after scroll
  await new Promise((r) => setTimeout(r, 2000));
}
