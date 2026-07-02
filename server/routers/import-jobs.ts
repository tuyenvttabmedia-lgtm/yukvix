/**
 * Import Jobs Router — create, list, retry, cancel import jobs
 */
import { z } from "zod";
import { router, adminProcedure } from "../_core/trpc.js";
import { getDb } from "../db.js";
import { importJobs, importLogs, importSources } from "../../drizzle/schema.js";
import { eq, desc, and, or, like, inArray } from "drizzle-orm";
import { enqueueCrawlJob, markCancelled } from "../import/queues.js";
import { isUrlAlreadyImported } from "../import/dedup.js";

const DEFAULT_CONFIG = {
  paginationType: "next_page" as const,
  maxPages: 50,
  crawlDelayMs: 1500,
  requiresBrowser: false,
};

export const importJobsRouter = router({
  // Create a new import job from a URL
  create: adminProcedure
    .input(z.object({
      sourceUrl: z.string().url(),
      sourceId: z.number().int().optional(),
      // Optional overrides
      titleSelector: z.string().optional(),
      imageSelector: z.string().optional(),
      nextPageSelector: z.string().optional(),
      tagSelector: z.string().optional(),
      creatorSelector: z.string().optional(),
      publishDateSelector: z.string().optional(),
      paginationType: z.enum(["next_page", "numbered", "infinite_scroll", "none"]).optional(),
      maxPages: z.number().int().min(1).max(500).optional(),
      crawlDelayMs: z.number().int().min(0).max(30000).optional(),
      requiresBrowser: z.boolean().optional(),
      userAgent: z.string().optional(),
      cookieString: z.string().optional(),
      crawlStartDate: z.string().datetime().optional(),
      crawlEndDate: z.string().datetime().optional(),
      keywordFilter: z.string().optional(),
      creatorFilter: z.string().optional(),
      scheduledPublishAt: z.string().datetime().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      // Check duplicate
      const dupCheck = await isUrlAlreadyImported(input.sourceUrl);
      if (dupCheck.isDuplicate) {
        return {
          jobId: null,
          isDuplicate: true,
          duplicateJobId: dupCheck.jobId,
          message: `This URL was already imported (job #${dupCheck.jobId})`,
        };
      }

      // Get source config if sourceId provided
      let sourceConfig: any = null;
      if (input.sourceId) {
        const sources = await db.select().from(importSources).where(eq(importSources.id, input.sourceId)).limit(1);
        if (sources.length > 0) sourceConfig = sources[0];
      }

      // Merge source config with input overrides
      const config = {
        titleSelector: input.titleSelector || sourceConfig?.titleSelector,
        contentSelector: sourceConfig?.contentSelector,
        imageSelector: input.imageSelector || sourceConfig?.imageSelector,
        nextPageSelector: input.nextPageSelector || sourceConfig?.nextPageSelector,
        tagSelector: input.tagSelector || sourceConfig?.tagSelector,
        creatorSelector: input.creatorSelector || sourceConfig?.creatorSelector,
        publishDateSelector: input.publishDateSelector || sourceConfig?.publishDateSelector,
        paginationType: input.paginationType || sourceConfig?.paginationType || DEFAULT_CONFIG.paginationType,
        pageUrlPattern: sourceConfig?.pageUrlPattern,
        contentAreaSelector: sourceConfig?.contentAreaSelector,
        maxPages: input.maxPages || sourceConfig?.maxPages || DEFAULT_CONFIG.maxPages,
        crawlDelayMs: input.crawlDelayMs ?? sourceConfig?.crawlDelayMs ?? DEFAULT_CONFIG.crawlDelayMs,
        requiresBrowser: input.requiresBrowser ?? sourceConfig?.requiresBrowser ?? DEFAULT_CONFIG.requiresBrowser,
        userAgent: input.userAgent || sourceConfig?.userAgent,
        cookieString: input.cookieString || sourceConfig?.cookieString,
        crawlStartDate: input.crawlStartDate || (sourceConfig?.crawlStartDate ? sourceConfig.crawlStartDate.toISOString() : undefined),
        crawlEndDate: input.crawlEndDate || (sourceConfig?.crawlEndDate ? sourceConfig.crawlEndDate.toISOString() : undefined),
        keywordFilter: input.keywordFilter || sourceConfig?.keywordFilter,
        creatorFilter: input.creatorFilter || sourceConfig?.creatorFilter,
      };

      // Create job record
      const [result] = await db.insert(importJobs).values({
        sourceUrl: input.sourceUrl,
        sourceId: input.sourceId || null,
        status: "queued",
        scheduledPublishAt: input.scheduledPublishAt ? new Date(input.scheduledPublishAt) : null,
      });

      const jobId = (result as any).insertId;
      if (!jobId) throw new Error("Failed to create import job");

      // Enqueue crawl job
      await enqueueCrawlJob({
        jobId,
        sourceUrl: input.sourceUrl,
        sourceId: input.sourceId,
        config,
      });

      return {
        jobId,
        isDuplicate: false,
        message: `Import job #${jobId} queued`,
      };
    }),

  // List jobs with pagination
  list: adminProcedure
    .input(z.object({
      page: z.number().int().min(1).default(1),
      limit: z.number().int().min(1).max(100).default(20),
      status: z.enum(["queued", "crawling", "downloading", "processing", "seo", "done", "failed", "cancelled"]).optional(),
      search: z.string().optional(),
    }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      const offset = (input.page - 1) * input.limit;

      const conditions = [];
      if (input.status) conditions.push(eq(importJobs.status, input.status));
      if (input.search) conditions.push(like(importJobs.sourceUrl, `%${input.search}%`));

      const rows = await db
        .select()
        .from(importJobs)
        .where(conditions.length > 0 ? and(...conditions) : undefined)
        .orderBy(desc(importJobs.createdAt))
        .limit(input.limit)
        .offset(offset);

      return { jobs: rows, page: input.page, limit: input.limit };
    }),

  // Get single job with logs
  get: adminProcedure
    .input(z.object({ id: z.number().int() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      const [job] = await db.select().from(importJobs).where(eq(importJobs.id, input.id)).limit(1);
      if (!job) throw new Error("Job not found");

      const logs = await db
        .select()
        .from(importLogs)
        .where(eq(importLogs.jobId, input.id))
        .orderBy(desc(importLogs.createdAt))
        .limit(200);

      return { job, logs: logs.reverse() };
    }),

  // Get logs for a job (polling endpoint)
  getLogs: adminProcedure
    .input(z.object({
      jobId: z.number().int(),
      afterId: z.number().int().optional(),
      limit: z.number().int().min(1).max(500).default(100),
    }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return { logs: [] };

      const conditions = [eq(importLogs.jobId, input.jobId)];
      if (input.afterId) {
        const { gt } = await import("drizzle-orm");
        conditions.push(gt(importLogs.id, input.afterId));
      }

      const logs = await db
        .select()
        .from(importLogs)
        .where(and(...conditions))
        .orderBy(importLogs.id)
        .limit(input.limit);

      return { logs };
    }),

  // Retry a failed job
  retry: adminProcedure
    .input(z.object({ id: z.number().int() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      const [job] = await db.select().from(importJobs).where(eq(importJobs.id, input.id)).limit(1);
      if (!job) throw new Error("Job not found");
      if (job.status !== "failed" && job.status !== "cancelled") {
        throw new Error("Only failed or cancelled jobs can be retried");
      }

      // Reset job status
      await db.update(importJobs).set({
        status: "queued",
        errorMessage: null,
        startedAt: null,
        completedAt: null,
        crawledPages: 0,
        downloadedImages: 0,
        processedImages: 0,
      }).where(eq(importJobs.id, input.id));

      // Get source config
      let sourceConfig: any = null;
      if (job.sourceId) {
        const sources = await db.select().from(importSources).where(eq(importSources.id, job.sourceId)).limit(1);
        if (sources.length > 0) sourceConfig = sources[0];
      }

      // Re-enqueue
      await enqueueCrawlJob({
        jobId: input.id,
        sourceUrl: job.sourceUrl,
        sourceId: job.sourceId || undefined,
        config: {
          titleSelector: sourceConfig?.titleSelector,
          contentSelector: sourceConfig?.contentSelector,
          imageSelector: sourceConfig?.imageSelector,
          nextPageSelector: sourceConfig?.nextPageSelector,
          tagSelector: sourceConfig?.tagSelector,
          creatorSelector: sourceConfig?.creatorSelector,
          publishDateSelector: sourceConfig?.publishDateSelector,
          paginationType: sourceConfig?.paginationType || DEFAULT_CONFIG.paginationType,
          pageUrlPattern: sourceConfig?.pageUrlPattern,
          contentAreaSelector: sourceConfig?.contentAreaSelector,
          maxPages: sourceConfig?.maxPages || DEFAULT_CONFIG.maxPages,
          crawlDelayMs: sourceConfig?.crawlDelayMs ?? DEFAULT_CONFIG.crawlDelayMs,
          requiresBrowser: sourceConfig?.requiresBrowser ?? DEFAULT_CONFIG.requiresBrowser,
          userAgent: sourceConfig?.userAgent,
          cookieString: sourceConfig?.cookieString,
        },
      });

      return { success: true, message: `Job #${input.id} re-queued` };
    }),

  // Cancel a job
  cancel: adminProcedure
    .input(z.object({ id: z.number().int() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      // Mark in cancellation registry so running workers stop at next checkpoint
      markCancelled(input.id);

      await db.update(importJobs).set({
        status: "cancelled",
        completedAt: new Date(),
      }).where(eq(importJobs.id, input.id));

      return { success: true };
    }),

  // Delete a single import job (removes job + its logs)
  delete: adminProcedure
    .input(z.object({ id: z.number().int() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) return { success: false };
      // Delete logs first (FK), then job
      await db.delete(importLogs).where(eq(importLogs.jobId, input.id));
      await db.delete(importJobs).where(eq(importJobs.id, input.id));
      return { success: true };
    }),

  // Bulk delete multiple import jobs
  bulkDelete: adminProcedure
    .input(z.object({ ids: z.array(z.number().int()).min(1).max(200) }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) return { deleted: 0 };
      await db.delete(importLogs).where(inArray(importLogs.jobId, input.ids));
      await db.delete(importJobs).where(inArray(importJobs.id, input.ids));
      return { deleted: input.ids.length };
    }),

  // Get job stats summary
  stats: adminProcedure.query(async () => {
    const db = await getDb();
    if (!db) return { total: 0, queued: 0, running: 0, done: 0, failed: 0 };

    const all = await db.select({ status: importJobs.status }).from(importJobs);
    const counts = { total: all.length, queued: 0, running: 0, done: 0, failed: 0 };

    for (const row of all) {
      if (row.status === "queued") counts.queued++;
      else if (["crawling", "downloading", "processing", "seo"].includes(row.status)) counts.running++;
      else if (row.status === "done") counts.done++;
      else if (row.status === "failed") counts.failed++;
    }

    return counts;
  }),
});
