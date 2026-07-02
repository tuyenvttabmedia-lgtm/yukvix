/**
 * Crawl Worker — processes crawl jobs
 * Crawls all pages, extracts images, enqueues download job
 */
import type { CrawlJobData, DownloadJobData } from "../queues.js";
import { enqueueDownloadJob, isCancelled, markCancelled } from "../queues.js";
import { crawlAll } from "../crawler-detector.js";
import { isUrlAlreadyImported } from "../dedup.js";
import { logImport, updateJobStatus } from "../logger.js";
import type { CrawlConfig } from "../types.js";
import slugify from "slugify";

export async function processCrawlJob(data: CrawlJobData): Promise<void> {
  const { jobId, sourceUrl, config } = data;

  try {
    await logImport(jobId, "info", `Starting crawl: ${sourceUrl}`);
    await updateJobStatus(jobId, "crawling", { startedAt: new Date() });

    // Check duplicate
    const dupCheck = await isUrlAlreadyImported(sourceUrl);
    if (dupCheck.isDuplicate) {
      await logImport(jobId, "warn", `Duplicate URL detected — already imported as job ${dupCheck.jobId}`);
      await updateJobStatus(jobId, "done", {
        errorMessage: `Duplicate: already imported as job ${dupCheck.jobId}`,
        completedAt: new Date(),
      });
      return;
    }

    // Build crawl config
    const crawlConfig: CrawlConfig = {
      jobId,
      sourceUrl,
      sourceId: data.sourceId,
      titleSelector: config.titleSelector,
      contentSelector: config.contentSelector,
      imageSelector: config.imageSelector,
      nextPageSelector: config.nextPageSelector,
      tagSelector: config.tagSelector,
      creatorSelector: config.creatorSelector,
      publishDateSelector: config.publishDateSelector,
      paginationType: config.paginationType,
      pageUrlPattern: config.pageUrlPattern,
      contentAreaSelector: config.contentAreaSelector,
      maxPages: config.maxPages,
      crawlDelayMs: config.crawlDelayMs,
      requiresBrowser: config.requiresBrowser,
      userAgent: config.userAgent,
      cookieString: config.cookieString,
      crawlStartDate: config.crawlStartDate ? new Date(config.crawlStartDate) : undefined,
      crawlEndDate: config.crawlEndDate ? new Date(config.crawlEndDate) : undefined,
      keywordFilter: config.keywordFilter,
      creatorFilter: config.creatorFilter,
    };

    // Crawl with progress updates
    let crawledPages = 0;
    const result = await crawlAll(crawlConfig, async (page, pageNum) => {
      // Check if job was cancelled between pages
      if (isCancelled(jobId)) {
        throw new Error("CANCELLED");
      }
      crawledPages = pageNum;
      await updateJobStatus(jobId, "crawling", {
        crawledPages,
        totalImages: 0,
      });
      await logImport(jobId, "info", `Crawled page ${pageNum}: ${page.url} (${page.images.length} images)`);
    });

    await logImport(jobId, "info", `Crawl complete: ${result.totalPages} pages, ${result.allImages.length} images`, {
      stoppedReason: result.stoppedReason,
    });

    await updateJobStatus(jobId, "downloading", {
      totalPages: result.totalPages,
      crawledPages: result.totalPages,
      totalImages: result.allImages.length,
      extractedTitle: result.title,
      extractedCreator: result.creator,
      extractedTags: result.tags,
    });

    // Enqueue download job
    if (result.allImages.length > 0) {
      // Build preliminary slug hint from raw title for SEO file naming (yukvix-[slug]-[n].webp)
      const rawTitleForSlug = result.title || "cosplay";
      const albumSlugHint = slugify(rawTitleForSlug, { lower: true, strict: true, trim: true }).slice(0, 50);

      const downloadData: DownloadJobData = {
        jobId,
        images: result.allImages.map((img) => ({ url: img.url, alt: img.alt })),
        referer: sourceUrl,
        userAgent: config.userAgent,
        albumSlugHint,
      };

      await enqueueDownloadJob(downloadData);
      await logImport(jobId, "info", `Enqueued download job for ${result.allImages.length} images (slug hint: ${albumSlugHint})`);
    } else {
      await logImport(jobId, "warn", "No images found — marking job as failed");
      await updateJobStatus(jobId, "failed", {
        errorMessage: "No images found on the page",
        completedAt: new Date(),
      });
    }
  } catch (err: any) {
    if (err.message === "CANCELLED") {
      await logImport(jobId, "warn", "Job cancelled by user");
      await updateJobStatus(jobId, "cancelled", { completedAt: new Date() });
    } else {
      await logImport(jobId, "error", `Crawl failed: ${err.message}`);
      await updateJobStatus(jobId, "failed", {
        errorMessage: err.message,
        completedAt: new Date(),
      });
    }
  }
}
