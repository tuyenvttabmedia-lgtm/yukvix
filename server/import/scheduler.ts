/**
 * Import Auto-Scheduler
 * Polls DB every minute to check if any source needs to be crawled.
 * For each source with autoSchedule=true, checks if lastCrawledAt + scheduleIntervalHours <= now.
 * If so, creates import jobs for all categoryUrls (or baseUrl if no categories).
 */
import { getDb } from "../db.js";
import { importSources, importJobs } from "../../drizzle/schema.js";
import { eq, and, or, isNull, lte } from "drizzle-orm";
import { enqueueCrawlJob } from "./queues.js";
import { logImport } from "./logger.js";

let schedulerTimer: ReturnType<typeof setInterval> | null = null;
let isRunning = false;

export function startScheduler() {
  if (schedulerTimer) return;
  console.log("[Scheduler] Auto-import scheduler started — polling every 60s");
  schedulerTimer = setInterval(runSchedulerTick, 60_000);
  // Run once immediately on start
  setTimeout(runSchedulerTick, 5_000);
}

export function stopScheduler() {
  if (schedulerTimer) {
    clearInterval(schedulerTimer);
    schedulerTimer = null;
    console.log("[Scheduler] Stopped");
  }
}

async function runSchedulerTick() {
  if (isRunning) return;
  isRunning = true;
  try {
    const db = await getDb();
    if (!db) return;

    const now = new Date();

    // Find sources with autoSchedule=true and enabled=true
    const sources = await db
      .select()
      .from(importSources)
      .where(and(eq(importSources.autoSchedule, true), eq(importSources.enabled, true)));

    for (const source of sources) {
      const intervalMs = (source.scheduleIntervalHours || 6) * 60 * 60 * 1000;
      const lastCrawled = source.lastCrawledAt ? new Date(source.lastCrawledAt).getTime() : 0;
      const nextCrawlAt = lastCrawled + intervalMs;

      if (now.getTime() < nextCrawlAt) continue; // Not time yet

      // Determine URLs to crawl — support JSON [{url, categoryId}] and legacy plain-text
      const urlsToCrawl: Array<{ url: string; categoryId?: number }> = [];
      if (source.categoryUrls) {
        const raw = source.categoryUrls.trim();
        if (raw.startsWith("[")) {
          try {
            const parsed = JSON.parse(raw) as Array<{ url: string; categoryId?: number }>;
            urlsToCrawl.push(...parsed.filter((e) => e.url));
          } catch {
            source.categoryUrls.split(/[\n,]+/).map((u) => u.trim()).filter(Boolean).forEach((u) => urlsToCrawl.push({ url: u }));
          }
        } else {
          source.categoryUrls.split(/[\n,]+/).map((u) => u.trim()).filter(Boolean).forEach((u) => urlsToCrawl.push({ url: u }));
        }
      } else {
        urlsToCrawl.push({ url: source.baseUrl });
      }

      // Parse titleCleanupRules once per source
      let titleCleanupRules: Array<{ find: string; replace: string }> | undefined;
      if (source.titleCleanupRules) {
        try { titleCleanupRules = JSON.parse(source.titleCleanupRules); } catch {}
      }

      console.log(`[Scheduler] Source "${source.siteName}" due for crawl — ${urlsToCrawl.length} URL(s)`);

      for (const { url, categoryId: urlCategoryId } of urlsToCrawl) {
        try {
          // Check if there's already a running/queued job for this URL
          const existing = await db
            .select({ id: importJobs.id })
            .from(importJobs)
            .where(
              and(
                eq(importJobs.sourceUrl, url),
                or(eq(importJobs.status, "queued"), eq(importJobs.status, "crawling"))
              )
            )
            .limit(1);

          if (existing.length > 0) {
            console.log(`[Scheduler] Skipping ${url} — already queued/running`);
            continue;
          }

          // Create job
          const [result] = await db.insert(importJobs).values({
            sourceId: source.id,
            sourceUrl: url,
            status: "queued",
          });
          const jobId = (result as any).insertId as number;

          await logImport(jobId, "info", `[Scheduler] Auto-triggered crawl for ${url}`);

          // Enqueue
          await enqueueCrawlJob({
            jobId,
            sourceUrl: url,
            sourceId: source.id,
            categoryId: urlCategoryId,
            titleCleanupRules,
            config: {
              titleSelector: source.titleSelector || undefined,
              imageSelector: source.imageSelector || undefined,
              nextPageSelector: source.nextPageSelector || undefined,
              tagSelector: source.tagSelector || undefined,
              creatorSelector: source.creatorSelector || undefined,
              publishDateSelector: source.publishDateSelector || undefined,
              paginationType: source.paginationType,
              pageUrlPattern: source.pageUrlPattern || undefined,
              contentAreaSelector: source.contentAreaSelector || undefined,
              maxPages: source.maxPages,
              crawlDelayMs: source.crawlDelayMs,
              requiresBrowser: source.requiresBrowser,
              userAgent: source.userAgent || undefined,
              cookieString: source.cookieString || undefined,
              keywordFilter: source.keywordFilter || undefined,
              creatorFilter: source.creatorFilter || undefined,
            },
          });

          console.log(`[Scheduler] Enqueued job #${jobId} for ${url}`);
        } catch (err: any) {
          console.error(`[Scheduler] Failed to enqueue job for ${url}:`, err.message);
        }
      }

      // Update lastCrawledAt
      await db
        .update(importSources)
        .set({ lastCrawledAt: now })
        .where(eq(importSources.id, source.id));
    }
  } catch (err: any) {
    console.error("[Scheduler] Tick error:", err.message);
  } finally {
    isRunning = false;
  }
}
