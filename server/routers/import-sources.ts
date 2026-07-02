/**
 * Import Sources Router — CRUD for crawler source configurations
 */
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, adminProcedure } from "../_core/trpc.js";
import { getDb } from "../db.js";
import { importSources, importJobs } from "../../drizzle/schema.js";
import { eq, desc } from "drizzle-orm";
import { crawlPageHtml } from "../import/crawler-html.js";
import { crawlPageBrowser } from "../import/crawler-browser.js";
import { enqueueCrawlJob } from "../import/queues.js";
import type { CrawlConfig } from "../import/types.js";

const SourceInput = z.object({
  siteName: z.string().min(1).max(128),
  baseUrl: z.string().url().max(512),
  titleSelector: z.string().max(256).optional(),
  contentSelector: z.string().max(256).optional(),
  imageSelector: z.string().max(256).optional(),
  nextPageSelector: z.string().max(256).optional(),
  tagSelector: z.string().max(256).optional(),
  creatorSelector: z.string().max(256).optional(),
  publishDateSelector: z.string().max(256).optional(),
  paginationType: z.enum(["next_page", "numbered", "infinite_scroll", "none"]).default("next_page"),
  pageUrlPattern: z.string().max(256).optional(), // e.g. "[url]/[page]/" or "[url]/page/[page]/"
  contentAreaSelector: z.string().max(256).optional(), // limit images to this container
  requiresBrowser: z.boolean().default(false),
  userAgent: z.string().max(512).optional(),
  cookieString: z.string().optional(),
  crawlDelayMs: z.number().int().min(0).max(30000).default(1500),
  maxPages: z.number().int().min(1).max(500).default(50),
  crawlStartDate: z.string().datetime().optional(),
  crawlEndDate: z.string().datetime().optional(),
  keywordFilter: z.string().max(256).optional(),
  creatorFilter: z.string().max(256).optional(),
  enabled: z.boolean().default(true),
  publishMode: z.enum(["draft", "published"]).default("draft"),
  defaultVip: z.boolean().default(false),
  // null = use Album Defaults (default_free_preview_count CMS setting); number = override for this source
  freePreviewCount: z.number().int().min(0).max(50).nullable().optional(),
  autoSchedule: z.boolean().default(false),
  scheduleIntervalHours: z.number().int().min(1).max(168).default(6),
  // categoryUrls: JSON array of {url, categoryId?} OR plain newline-separated URLs (legacy)
  // [{"url":"https://everia.club/category/korea/","categoryId":1},{"url":"https://everia.club/category/japan/"}]
  categoryUrls: z.string().optional(),
  // titleCleanupRules: JSON array of {find, replace} applied to raw title
  // [{"find":" – EVERIA.CLUB","replace":""},{"find":" – everia.club","replace":""}]
  titleCleanupRules: z.string().optional(),
});

export const importSourcesRouter = router({
  // List all sources
  list: adminProcedure.query(async () => {
    const db = await getDb();
    if (!db) throw new Error("Database not available");
    return db.select().from(importSources).orderBy(desc(importSources.createdAt));
  }),

  // Get single source
  get: adminProcedure
    .input(z.object({ id: z.number().int() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");
      const rows = await db.select().from(importSources).where(eq(importSources.id, input.id)).limit(1);
      if (!rows.length) throw new Error("Source not found");
      return rows[0];
    }),

  // Create source
  create: adminProcedure
    .input(SourceInput)
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");
      const [result] = await db.insert(importSources).values({
        ...input,
        crawlStartDate: input.crawlStartDate ? new Date(input.crawlStartDate) : null,
        crawlEndDate: input.crawlEndDate ? new Date(input.crawlEndDate) : null,
      });
      return { id: (result as any).insertId };
    }),

  // Update source
  update: adminProcedure
    .input(z.object({ id: z.number().int(), data: SourceInput.partial() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");
      const updateData: any = { ...input.data };
      if (input.data.crawlStartDate) updateData.crawlStartDate = new Date(input.data.crawlStartDate);
      if (input.data.crawlEndDate) updateData.crawlEndDate = new Date(input.data.crawlEndDate);
      await db.update(importSources).set(updateData).where(eq(importSources.id, input.id));
      return { success: true };
    }),

  // Toggle enabled
  toggleEnabled: adminProcedure
    .input(z.object({ id: z.number().int(), enabled: z.boolean() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");
      await db.update(importSources).set({ enabled: input.enabled }).where(eq(importSources.id, input.id));
      return { success: true };
    }),

  // Delete source
  delete: adminProcedure
    .input(z.object({ id: z.number().int() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");
      await db.delete(importSources).where(eq(importSources.id, input.id));
      return { success: true };
    }),

  // Test selectors — crawl one page and return extracted data
  testSelectors: adminProcedure
    .input(z.object({
      url: z.string().url(),
      sourceId: z.number().int().optional(), // if set, load config from source
      titleSelector: z.string().optional(),
      imageSelector: z.string().optional(),
      nextPageSelector: z.string().optional(),
      tagSelector: z.string().optional(),
      creatorSelector: z.string().optional(),
      publishDateSelector: z.string().optional(),
      // No .default() here — source config takes priority when sourceId is set
      paginationType: z.enum(["next_page", "numbered", "infinite_scroll", "none"]).optional(),
      pageUrlPattern: z.string().optional(),
      contentAreaSelector: z.string().optional(),
      requiresBrowser: z.boolean().optional(),
      userAgent: z.string().optional(),
      cookieString: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      // If sourceId provided, merge source config with input overrides
      let srcConfig: any = {};
      if (input.sourceId && db) {
        const [src] = await db.select().from(importSources).where(eq(importSources.id, input.sourceId)).limit(1);
        if (src) srcConfig = src;
      }

      const config: CrawlConfig = {
        jobId: 0,
        sourceUrl: input.url,
        titleSelector: input.titleSelector ?? srcConfig.titleSelector,
        imageSelector: input.imageSelector ?? srcConfig.imageSelector,
        nextPageSelector: input.nextPageSelector ?? srcConfig.nextPageSelector,
        tagSelector: input.tagSelector ?? srcConfig.tagSelector,
        creatorSelector: input.creatorSelector ?? srcConfig.creatorSelector,
        publishDateSelector: input.publishDateSelector ?? srcConfig.publishDateSelector,
        paginationType: input.paginationType ?? srcConfig.paginationType ?? "next_page",
        pageUrlPattern: input.pageUrlPattern ?? srcConfig.pageUrlPattern,
        contentAreaSelector: input.contentAreaSelector ?? srcConfig.contentAreaSelector,
        maxPages: 1,
        crawlDelayMs: 0,
        requiresBrowser: input.requiresBrowser ?? srcConfig.requiresBrowser ?? false,
        userAgent: input.userAgent ?? srcConfig.userAgent,
        cookieString: input.cookieString ?? srcConfig.cookieString,
      };

      try {
        let page;
        if (config.requiresBrowser) {
          page = await crawlPageBrowser(input.url, config);
        } else {
          try {
            page = await crawlPageHtml(input.url, config);
          } catch (err: any) {
            if (err?.message === "BROWSER_REQUIRED") {
              page = await crawlPageBrowser(input.url, config);
            } else {
              throw err;
            }
          }
        }

        return {
          success: true,
          title: page?.title,
          creator: page?.creator,
          tags: page?.tags,
          publishDate: page?.publishDate,
          imageCount: page?.images.length || 0,
          images: page?.images.slice(0, 5) || [], // Preview first 5 images
          nextPageUrl: page?.nextPageUrl,
        };
      } catch (err: any) {
        return {
          success: false,
          error: err.message,
          title: undefined,
          creator: undefined,
          tags: [],
          imageCount: 0,
          images: [],
          nextPageUrl: undefined,
        };
      }
    }),

  // Crawl a category page to list article URLs
  crawlCategory: adminProcedure
    .input(z.object({
      categoryUrl: z.string().url().optional(),
      sourceId: z.number().int().optional(),
      maxPages: z.number().int().min(1).max(200).default(10),
      requiresBrowser: z.boolean().default(false),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });

      // If sourceId provided, use source's categoryUrls; otherwise use single categoryUrl
      let categoryUrlList: string[] = [];
      let sourceConfig: any = null;
      if (input.sourceId) {
        const [src] = await db.select().from(importSources).where(eq(importSources.id, input.sourceId)).limit(1);
        if (!src) throw new TRPCError({ code: "NOT_FOUND", message: "Source not found" });
        sourceConfig = src;
        if (src.categoryUrls) {
          // Support both JSON [{url, categoryId}] and legacy plain-text URLs
          const raw = src.categoryUrls.trim();
          if (raw.startsWith("[")) {
            try {
              const parsed = JSON.parse(raw) as Array<{ url: string; categoryId?: number }>;
              categoryUrlList = parsed.map((e) => e.url).filter(Boolean);
              // Store mapping for later use
              (sourceConfig as any)._categoryMapping = Object.fromEntries(
                parsed.filter((e) => e.categoryId).map((e) => [e.url, e.categoryId])
              );
            } catch {
              categoryUrlList = raw.split(/[\n,]+/).map((u: string) => u.trim()).filter(Boolean);
            }
          } else {
            categoryUrlList = raw.split(/[\n,]+/).map((u: string) => u.trim()).filter(Boolean);
          }
        }
      } else if (input.categoryUrl) {
        categoryUrlList = [input.categoryUrl];
      }

      if (categoryUrlList.length === 0) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "No category URLs configured. Add category URLs in source settings." });
      }

      // Collect all article URLs from all category URLs, tracking which catUrl each article came from
      const allArticleUrls: Array<{ url: string; catUrl: string }> = [];

      for (const catUrl of categoryUrlList) {
      const config: CrawlConfig = {
        jobId: 0,
        sourceUrl: catUrl,
        paginationType: sourceConfig?.paginationType || "numbered",
        maxPages: sourceConfig?.maxPages || input.maxPages,
        crawlDelayMs: sourceConfig?.crawlDelayMs || 1000,
        requiresBrowser: sourceConfig?.requiresBrowser || input.requiresBrowser,
        // Extract all links as "images" — we'll filter for article links
        imageSelector: "a[href]",
      };

      const articleUrls: string[] = [];
      let pageNum = 1;
      let currentUrl = catUrl;

      while (pageNum <= input.maxPages) {
        try {
          let page;
          if (input.requiresBrowser) {
            page = await crawlPageBrowser(currentUrl, config);
          } else {
            try {
              page = await crawlPageHtml(currentUrl, config);
            } catch (err: any) {
              if (err?.message === "BROWSER_REQUIRED") {
                page = await crawlPageBrowser(currentUrl, config);
              } else break;
            }
          }

          if (!page) break;
          // Extract article links from the page
          const baseOrigin = new URL(catUrl).origin;
          const links = (page.images || [])
            .map((img: any) => img.url || img)
            .filter((url: string) => {
              try {
                const u = new URL(url, baseOrigin);
                // Must be same domain, not category/tag/author pages, not media files
                return u.hostname === new URL(catUrl).hostname
                  && !url.includes("/category/")
                  && !url.includes("/tag/")
                  && !url.includes("/author/")
                  && !url.includes("/page/")
                  && !url.match(/\.(jpg|jpeg|png|gif|webp|svg|mp4|pdf)$/i)
                  && u.pathname !== "/"
                  && u.pathname.length > 1;
              } catch { return false; }
            });

          for (const link of links) {
            const normalized = new URL(link, baseOrigin).href;
            if (!articleUrls.includes(normalized)) {
              articleUrls.push(normalized);
            }
          }

          if (!page.nextPageUrl || page.nextPageUrl === currentUrl) break;
          currentUrl = page.nextPageUrl;
          pageNum++;
          await new Promise(r => setTimeout(r, 1000));
        } catch { break; }
      }

      // Add unique article URLs to allArticleUrls (track source catUrl for category mapping)
      for (const u of articleUrls) {
        if (!allArticleUrls.some((e) => e.url === u)) allArticleUrls.push({ url: u, catUrl });
      }
      } // end for catUrl

      // Create import jobs for each article URL
      let jobsCreated = 0;
      for (const { url: articleUrl, catUrl: articleCatUrl } of allArticleUrls) {
        try {
          const [result] = await db.insert(importJobs).values({
            sourceId: input.sourceId,
            sourceUrl: articleUrl,
            status: "queued",
          });
          const jobId = (result as any).insertId as number;
          // Determine categoryId from the category URL this article was found in
          const catMapping = (sourceConfig as any)?._categoryMapping || {};
          const resolvedCategoryId: number | undefined = catMapping[articleCatUrl] || undefined;

          // Parse titleCleanupRules from source
          let titleCleanupRules: Array<{ find: string; replace: string }> | undefined;
          if (sourceConfig?.titleCleanupRules) {
            try { titleCleanupRules = JSON.parse(sourceConfig.titleCleanupRules); } catch {}
          }

          await enqueueCrawlJob({
            jobId,
            sourceUrl: articleUrl,
            sourceId: input.sourceId,
            categoryId: resolvedCategoryId,
            titleCleanupRules,
            config: {
              titleSelector: sourceConfig?.titleSelector || undefined,
              imageSelector: sourceConfig?.imageSelector || undefined,
              nextPageSelector: sourceConfig?.nextPageSelector || undefined,
              tagSelector: sourceConfig?.tagSelector || undefined,
              creatorSelector: sourceConfig?.creatorSelector || undefined,
              publishDateSelector: sourceConfig?.publishDateSelector || undefined,
              paginationType: sourceConfig?.paginationType || "none",
              pageUrlPattern: sourceConfig?.pageUrlPattern || undefined,
              contentAreaSelector: sourceConfig?.contentAreaSelector || undefined,
              maxPages: sourceConfig?.maxPages || 10,
              crawlDelayMs: sourceConfig?.crawlDelayMs || 1500,
              requiresBrowser: sourceConfig?.requiresBrowser || false,
              userAgent: sourceConfig?.userAgent || undefined,
              cookieString: sourceConfig?.cookieString || undefined,
              keywordFilter: sourceConfig?.keywordFilter || undefined,
              creatorFilter: sourceConfig?.creatorFilter || undefined,
            },
          });
          jobsCreated++;
        } catch { /* skip duplicates */ }
      }

      return { success: true, articleUrls: allArticleUrls, count: allArticleUrls.length, jobsCreated };
    }),
});
