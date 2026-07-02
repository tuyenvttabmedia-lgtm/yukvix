/**
 * ZIP Import Router (V4.17)
 * tRPC procedures for admin ZIP/RAR album import.
 *
 * V4.17 Key fixes:
 * 1. archivePasswordIndex stored (not plaintext password)
 * 2. createAlbumAndImport excludes current jobId from queue count (no self-blocking)
 * 3. Slug/title uniqueness checked against albums AND static_pages
 *
 * Flow:
 * 1. presignArchiveUpload → get presigned URL + create job (status=uploaded)
 * 2. generateSeoFromFilename → AI-generated SEO preview
 * 3. createAlbumAndImport → create album + update job (status=waiting)
 * 4. getStatus → poll job progress
 * 5. cancel → cancel job
 * 6. listJobs → admin dashboard
 * 7. downloadVipZip → get presigned download URL
 * 8. updateAiConfig / getAiConfig → AI provider settings
 */

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "../_core/trpc";
import { getDb } from "../db";
import {
  zipImportJobs,
  albums,
  staticPages,
  adminSettings,
  seoGenerationHistory,
  seoCache,
} from "../../drizzle/schema";
import { checkSeoQuality } from "../services/seo-quality-check";
import { eq, and, inArray, ne, desc, sql } from "drizzle-orm";
import path from "path";
import { generateSeoData } from "../services/seo-generator";
import { findOrCreateCreator, KNOWN_COLLECTIONS } from "../services/creator-service";
import { getPresignedPutUrl, getSignedMediaUrl } from "../storage-wasabi";

// ─── Admin guard ─────────────────────────────────────────────────────────────

const adminProcedure = protectedProcedure.use(({ ctx, next }) => {
  if (ctx.user?.role !== "admin" && ctx.user?.role !== "super_admin") {
    throw new TRPCError({ code: "FORBIDDEN", message: "Admin access required" });
  }
  return next({ ctx });
});

// ─── Constants ────────────────────────────────────────────────────────────────

const ALLOWED_ARCHIVE_EXTENSIONS = [".zip", ".rar", ".7z"];
const ACTIVE_STATUSES = [
  "uploaded",
  "waiting",
  "scheduled",
  "processing",
  "waiting_disk_space",
] as const;

// ─── Router ───────────────────────────────────────────────────────────────────

export const zipImportRouter = router({
  /**
   * Step 1: Request presigned upload URL + create import_job immediately.
   * V4.17: Queue check happens HERE (before upload), not in createAlbumAndImport.
   * Staging path: imports/staging/{jobId}/{originalName}
   */
  presignArchiveUpload: adminProcedure
    .input(
      z.object({
        filename: z.string().min(1).max(500),
        size: z.number().positive(),
      })
    )
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB not available" });

      const MAX_UPLOAD_SIZE = parseInt(
        process.env.IMPORT_MAX_UPLOAD_SIZE_BYTES || String(4 * 1024 * 1024 * 1024)
      );
      const MAX_PENDING = parseInt(process.env.IMPORT_MAX_PENDING_JOBS || "5");

      if (input.size > MAX_UPLOAD_SIZE) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `File too large: ${(input.size / 1024 / 1024 / 1024).toFixed(2)}GB (max ${(MAX_UPLOAD_SIZE / 1024 / 1024 / 1024).toFixed(2)}GB)`,
        });
      }
      const ext = path.extname(input.filename).toLowerCase();
      if (!ALLOWED_ARCHIVE_EXTENSIONS.includes(ext)) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Invalid file type: ${ext}. Allowed: ${ALLOWED_ARCHIVE_EXTENSIONS.join(", ")}`,
        });
      }

      // V4.17: Check queue BEFORE creating job to prevent staging spam
      const pendingJobs = await db
        .select({ id: zipImportJobs.id })
        .from(zipImportJobs)
        .where(inArray(zipImportJobs.status, [...ACTIVE_STATUSES]));

      if (pendingJobs.length >= MAX_PENDING) {
        throw new TRPCError({
          code: "TOO_MANY_REQUESTS",
          message: `Import queue is full (${pendingJobs.length}/${MAX_PENDING} active). Please wait for current jobs to complete.`,
        });
      }

      // Create import_job FIRST so we have a real jobId for staging path
      const [result] = await db.insert(zipImportJobs).values({
        status: "uploaded",
        sourceArchiveOriginalName: input.filename,
        sourceArchiveSize: input.size,
        archivePasswordIndex: 0,
      });

      const jobId = (result as { insertId: number }).insertId;
      const stagingKey = `imports/staging/${jobId}/${input.filename}`;
      const presignedUrl = await getPresignedPutUrl(stagingKey, input.size);

      // Update job with staging key
      await db
        .update(zipImportJobs)
        .set({ sourceArchiveKey: stagingKey, updatedAt: new Date() })
        .where(eq(zipImportJobs.id, jobId));

      return { jobId, presignedUrl, stagingKey };
    }),

  /**
   * Step 2: After upload completes, auto-generate SEO from filename.
   */
  generateSeoFromFilename: adminProcedure
    .input(
      z.object({
        originalFileName: z.string().min(1),
        adminTitle: z.string().optional(),
        creator: z.string().optional(),
        category: z.string().optional(),
        existingTags: z.array(z.string()).optional(),
      })
    )
    .mutation(async ({ input }) => {
      return generateSeoData({
        ...input,
        siteName: process.env.SITE_NAME || "Yukvix",
      });
    }),

  /**
   * Step 3: Admin submits SEO form → create album + queue job.
   * V4.17 Fixes:
   * - Exclude current jobId from queue count (no self-blocking)
   * - Check slug/title uniqueness against albums AND static_pages
   */
  createAlbumAndImport: adminProcedure
    .input(
      z.object({
        jobId: z.number().int().positive(),
        title: z.string().min(1).max(500),
        creator: z.string().optional(),
        collectionName: z.string().optional(),
        description: z.string().optional(),
        category: z.enum(["Japan", "China", "Korea", "Euro", "Cosplay", "Gravure"]),
        tags: z.array(z.string()).optional(),
        metaTitle: z.string().max(100).optional(),
        metaDescription: z.string().max(300).optional(),
        focusKeyword: z.string().max(100).optional(),
        relatedKeywords: z.array(z.string()).optional(),
        altTextTemplate: z.string().max(500).optional(),
        shortDescription: z.string().optional(),
        originalFileName: z.string().min(1),
        archivePasswordIndex: z.number().int().min(0).optional(),
      })
    )
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB not available" });

      const MAX_PENDING = parseInt(process.env.IMPORT_MAX_PENDING_JOBS || "5");

      // V4.17 Fix 2: Check queue EXCLUDING current jobId to avoid self-blocking.
      const pendingJobs = await db
        .select({ id: zipImportJobs.id })
        .from(zipImportJobs)
        .where(
          and(
            inArray(zipImportJobs.status, [...ACTIVE_STATUSES]),
            ne(zipImportJobs.id, input.jobId) // V4.17: exclude current job
          )
        );

      if (pendingJobs.length >= MAX_PENDING) {
        throw new TRPCError({
          code: "TOO_MANY_REQUESTS",
          message: `Import queue is full (${pendingJobs.length}/${MAX_PENDING}). Please wait for current jobs to complete.`,
        });
      }

      // Verify the import_job exists and has a valid staging archive
      const existingJob = await db
        .select()
        .from(zipImportJobs)
        .where(eq(zipImportJobs.id, input.jobId))
        .limit(1);

      if (!existingJob[0]?.sourceArchiveKey) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Import job not found or archive missing. Please re-upload the archive.",
        });
      }

      if (existingJob[0].status !== "uploaded") {
        throw new TRPCError({
          code: "CONFLICT",
          message: `Job is already in status: ${existingJob[0].status}. Cannot re-submit.`,
        });
      }

      // Generate slug from title
      const { generateSlug } = await import("../services/seo-generator");
      const albumSlug = generateSlug(input.title) || input.title.toLowerCase().replace(/\s+/g, "-");

      // V4.17 Fix 3: Check slug + title uniqueness across albums AND static_pages
      const [existingAlbum, existingPage] = await Promise.all([
        db
          .select({ id: albums.id, title: albums.title })
          .from(albums)
          .where(eq(albums.slug, albumSlug))
          .limit(1),
        db
          .select({ id: staticPages.id, title: staticPages.title })
          .from(staticPages)
          .where(eq(staticPages.slug, albumSlug))
          .limit(1)
          .catch(() => [] as Array<{ id: number; title: string | null }>),
      ]);

      if (existingAlbum.length > 0) {
        throw new TRPCError({
          code: "CONFLICT",
          message: `Album slug already exists: "${albumSlug}" (album: "${existingAlbum[0].title}"). Please change the title.`,
        });
      }
      if (existingPage.length > 0) {
        throw new TRPCError({
          code: "CONFLICT",
          message: `Slug conflicts with existing static page: "${albumSlug}". Please change the title.`,
        });
      }

      // Also check title uniqueness (case-insensitive)
      const existingTitle = await db
        .select({ id: albums.id })
        .from(albums)
        .where(sql`LOWER(${albums.title}) = ${input.title.toLowerCase()}`)
        .limit(1);
      if (existingTitle.length > 0) {
        throw new TRPCError({
          code: "CONFLICT",
          message: `Album title already exists: "${input.title}". Please use a different title.`,
        });
      }

      // Find or create creator (skip if collection name)
      let creatorId: number | null = null;
      if (input.creator && !KNOWN_COLLECTIONS.has(input.creator)) {
        try {
          const result = await findOrCreateCreator({
            name: input.creator,
            category: input.category,
          });
          creatorId = result.creatorId;
        } catch (err) {
          console.warn(`[ZipImport] Creator lookup failed: ${(err as Error).message}`);
        }
      }

      // Create album
      const [albumResult] = await db.insert(albums).values({
        slug: albumSlug,
        title: input.title,
        creator: input.creator,
        creatorId,
        collectionName: input.collectionName,
        description: input.description,
        shortDescription: input.shortDescription,
        category: input.category,
        tags: input.tags ? JSON.stringify(input.tags) : null,
        metaTitle: input.metaTitle,
        metaDescription: input.metaDescription,
        focusKeyword: input.focusKeyword,
        relatedKeywords: input.relatedKeywords ? JSON.stringify(input.relatedKeywords) : null,
        altTextTemplate: input.altTextTemplate,
        originalFileName: input.originalFileName,
        aiGenerated: true,
        publishStatus: "processing",
        status: "draft",
      });

      const albumId = (albumResult as { insertId: number }).insertId;

      // Update existing import_job with albumId + status='waiting'
      await db
        .update(zipImportJobs)
        .set({
          albumId,
          status: "waiting",
          archivePasswordIndex: input.archivePasswordIndex ?? existingJob[0].archivePasswordIndex,
          updatedAt: new Date(),
        })
        .where(eq(zipImportJobs.id, input.jobId));

      // Start processing immediately (don't wait for nightly cron)
      try {
        const { runSchedulerNow } = await import("../services/import-cron");
        await runSchedulerNow();
      } catch (err) {
        console.error(`[ZipImport] Failed to start scheduler for job ${input.jobId}:`, err);
      }

      return { jobId: input.jobId, albumId, albumSlug };
    }),

  /**
   * Get job status + progress (for polling).
   */
  getStatus: adminProcedure
    .input(z.object({ jobId: z.number().int().positive() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB not available" });

      const job = await db
        .select()
        .from(zipImportJobs)
        .where(eq(zipImportJobs.id, input.jobId))
        .limit(1);

      if (!job[0]) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Job not found" });
      }

      const j = job[0];
      return {
        ...j,
        importLogs: j.importLogs ? (JSON.parse(j.importLogs) as string[]) : [],
        failedImageList: j.failedImageList
          ? (JSON.parse(j.failedImageList) as Array<{ file: string; reason: string }>)
          : [],
      };
    }),

  /**
   * Cancel a running or waiting job.
   */
  cancel: adminProcedure
    .input(z.object({ jobId: z.number().int().positive() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB not available" });

      const job = await db
        .select({ status: zipImportJobs.status })
        .from(zipImportJobs)
        .where(eq(zipImportJobs.id, input.jobId))
        .limit(1);

      if (!job[0]) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Job not found" });
      }

      const cancellableStatuses = ["uploaded", "waiting", "scheduled", "processing"];
      if (!cancellableStatuses.includes(job[0].status)) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Cannot cancel job in status: ${job[0].status}`,
        });
      }

      await db
        .update(zipImportJobs)
        .set({ cancelRequested: true, updatedAt: new Date() })
        .where(eq(zipImportJobs.id, input.jobId));

      return { success: true };
    }),

  /**
   * List all import jobs for admin dashboard.
   */
  listJobs: adminProcedure
    .input(
      z.object({
        limit: z.number().int().min(1).max(100).default(20),
        offset: z.number().int().min(0).default(0),
        status: z.string().optional(),
      })
    )
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB not available" });

      type JobStatus = "uploaded" | "waiting" | "scheduled" | "processing" | "waiting_disk_space" | "completed" | "failed" | "cancelled" | "expired";
      const conditions = [];
      if (input.status) {
        conditions.push(eq(zipImportJobs.status, input.status as JobStatus));
      }

      const jobs = await db
        .select({
          id: zipImportJobs.id,
          albumId: zipImportJobs.albumId,
          status: zipImportJobs.status,
          progress: zipImportJobs.progress,
          totalImages: zipImportJobs.totalImages,
          processedImages: zipImportJobs.processedImages,
          failedImages: zipImportJobs.failedImages,
          sourceArchiveOriginalName: zipImportJobs.sourceArchiveOriginalName,
          sourceArchiveSize: zipImportJobs.sourceArchiveSize,
          vipZipStatus: zipImportJobs.vipZipStatus,
          vipZipSize: zipImportJobs.vipZipSize,
          cancelRequested: zipImportJobs.cancelRequested,
          scheduledAt: zipImportJobs.scheduledAt,
          startedAt: zipImportJobs.startedAt,
          completedAt: zipImportJobs.completedAt,
          createdAt: zipImportJobs.createdAt,
          updatedAt: zipImportJobs.updatedAt,
          albumTitle: albums.title,
          albumSlug: albums.slug,
        })
        .from(zipImportJobs)
        .leftJoin(albums, eq(zipImportJobs.albumId, albums.id))
        .orderBy(desc(zipImportJobs.createdAt))
        .limit(input.limit)
        .offset(input.offset);

      const totalResult = await db
        .select({ count: sql<number>`COUNT(*)` })
        .from(zipImportJobs);

      return {
        jobs,
        total: totalResult[0]?.count ?? 0,
      };
    }),

  /**
   * Download VIP ZIP (admin or VIP user).
   */
  downloadVipZip: protectedProcedure
    .input(z.object({ jobId: z.number().int().positive() }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB not available" });

      const isAdmin = ctx.user?.role === "admin" || ctx.user?.role === "super_admin";
      const isVip = ctx.user?.role === "vip";
      if (!isAdmin && !isVip) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "VIP or admin access required to download ZIP",
        });
      }

      const job = await db
        .select()
        .from(zipImportJobs)
        .where(eq(zipImportJobs.id, input.jobId))
        .limit(1);

      if (!job[0]) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Job not found" });
      }
      if (!job[0].vipZipKey || job[0].vipZipStatus !== "ready") {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "VIP ZIP not available for this job",
        });
      }

      const expiryHours = parseInt(process.env.VIP_ZIP_EXPIRY_HOURS || "24");
      const presignedUrl = await getSignedMediaUrl(job[0].vipZipKey, expiryHours * 3600);

      const albumRows = job[0].albumId
        ? await db
            .select({ slug: albums.slug })
            .from(albums)
            .where(eq(albums.id, job[0].albumId))
            .limit(1)
        : [];

      return {
        url: presignedUrl,
        filename: `VIP_${albumRows[0]?.slug || `job-${input.jobId}`}.zip`,
        size: job[0].vipZipSize,
        generatedAt: job[0].vipZipGeneratedAt,
      };
    }),

  /**
   * Update AI provider config.
   */
  updateAiConfig: adminProcedure
    .input(
      z.object({
        provider: z.enum(["openrouter", "openai", "gemini"]),
        apiKey: z.string().min(1),
        model: z.string().min(1),
        promptVersion: z.string().optional(),
      })
    )
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB not available" });

      // Save provider config (without promptVersion in the same key)
      const providerValue = JSON.stringify({
        provider: input.provider,
        apiKey: input.apiKey,
        model: input.model,
      });

      const existing = await db
        .select({ id: adminSettings.id })
        .from(adminSettings)
        .where(eq(adminSettings.key, "ai_provider_config"))
        .limit(1);

      if (existing.length > 0) {
        await db
          .update(adminSettings)
          .set({ value: providerValue, updatedAt: new Date() })
          .where(eq(adminSettings.key, "ai_provider_config"));
      } else {
        await db.insert(adminSettings).values({
          key: "ai_provider_config",
          value: providerValue,
        });
      }

      // Save promptVersion separately if provided
      if (input.promptVersion) {
        const pvExisting = await db
          .select({ id: adminSettings.id })
          .from(adminSettings)
          .where(eq(adminSettings.key, "ai_prompt_version"))
          .limit(1);
        if (pvExisting.length > 0) {
          await db
            .update(adminSettings)
            .set({ value: input.promptVersion, updatedAt: new Date() })
            .where(eq(adminSettings.key, "ai_prompt_version"));
        } else {
          await db.insert(adminSettings).values({ key: "ai_prompt_version", value: input.promptVersion });
        }
      }

      const { invalidateAiConfigCache } = await import("../services/ai-provider");
      invalidateAiConfigCache();

      return { success: true };
    }),

  /**
   * Validate API key by calling the provider's models endpoint.
   */
  validateApiKey: adminProcedure
    .input(
      z.object({
        provider: z.enum(["openrouter", "openai", "gemini"]),
        apiKey: z.string().min(1),
      })
    )
    .mutation(async ({ input }) => {
      const PROVIDER_ENDPOINTS: Record<string, string> = {
        openrouter: "https://openrouter.ai/api/v1",
        openai: "https://api.openai.com/v1",
        gemini: "https://generativelanguage.googleapis.com/v1beta/openai",
      };
      const baseUrl = PROVIDER_ENDPOINTS[input.provider];
      try {
        const res = await fetch(`${baseUrl}/models`, {
          headers: { Authorization: `Bearer ${input.apiKey}` },
          signal: AbortSignal.timeout(10_000),
        });
        if (!res.ok) {
          const errText = await res.text().catch(() => "");
          return { valid: false, error: `HTTP ${res.status}: ${errText.slice(0, 200)}`, models: [] as string[] };
        }
        const data = await res.json() as
          | { data?: Array<{ id: string }> }                   // OpenAI / OpenRouter format
          | Array<{ name: string; displayName?: string }>;     // Gemini format
        let models: string[];
        if (Array.isArray(data)) {
          // Gemini /models returns [{name: "models/gemini-2.5-flash", ...}]
          models = data.map((m) => m.name.replace(/^models\//, "")).slice(0, 50);
        } else {
          models = ((data as { data?: Array<{ id: string }> }).data || []).map((m) => m.id).slice(0, 50);
        }
        return { valid: true, models, error: null };
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        return { valid: false, error: msg, models: [] as string[] };
      }
    }),

  /**
   * Test SEO generation with a sample filename.
   * Uses skipCache=true so it always calls the AI fresh.
   */
  testSeoGeneration: adminProcedure
    .input(z.object({ filename: z.string().min(1).max(500) }))
    .mutation(async ({ input }) => {
      try {
        const seo = await generateSeoData({
          originalFileName: input.filename,
          siteName: process.env.VITE_APP_TITLE || "CosplayVault",
          skipCache: true,
        });
        return { success: true, seo, error: null };
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        return { success: false, seo: null, error: msg };
      }
    }),

  /**
   * Clear AI SEO cache (seo_cache table + in-memory config cache).
   */
  clearAiCache: adminProcedure.mutation(async () => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB not available" });
    await db.delete(seoCache);
    const { invalidateAiConfigCache } = await import("../services/ai-provider");
    invalidateAiConfigCache();
    return { success: true };
  }),

  /**
   * Check SEO quality before publishing (V4.9 Final).
   * Checks: uniqueness, keyword spam, tag count, sentence patterns.
   */
  checkSeoQuality: adminProcedure
    .input(z.object({ albumId: z.number().int().positive() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB not available" });

      const albumRow = await db
        .select()
        .from(albums)
        .where(eq(albums.id, input.albumId))
        .limit(1);
      if (!albumRow[0]) throw new TRPCError({ code: "NOT_FOUND", message: "Album not found" });

      const recentAlbums = await db
        .select({
          id: albums.id,
          slug: albums.slug,
          seoTitle: albums.metaTitle,
          metaDescription: albums.metaDescription,
          shortDescription: albums.shortDescription,
          focusKeyword: albums.focusKeyword,
          tags: albums.tags,
        })
        .from(albums)
        .where(eq(albums.publishStatus, "published"))
        .orderBy(desc(albums.createdAt))
        .limit(100);

      const album = albumRow[0];
      return checkSeoQuality(
        input.albumId,
        {
          seoTitle: album.metaTitle,
          metaDescription: album.metaDescription,
          shortDescription: album.shortDescription,
          focusKeyword: album.focusKeyword,
          tags: album.tags,
        },
        recentAlbums
      );
    }),

  /**
   * Approve SEO + publish album (V4.9 Final).
   * Runs quality check first, then publishes if passed.
   */
  approveSeoAndPublish: adminProcedure
    .input(
      z.object({
        albumId: z.number().int().positive(),
        seoData: z.object({
          title: z.string().optional(),
          metaTitle: z.string().optional(),
          metaDescription: z.string().optional(),
          shortDescription: z.string().optional(),
          focusKeyword: z.string().optional(),
          relatedKeywords: z.array(z.string()).optional(),
          tags: z.array(z.string()).optional(),
          altTextTemplate: z.string().optional(),
        }),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB not available" });

      const recentAlbums = await db
        .select({
          id: albums.id,
          slug: albums.slug,
          seoTitle: albums.metaTitle,
          metaDescription: albums.metaDescription,
          shortDescription: albums.shortDescription,
          focusKeyword: albums.focusKeyword,
          tags: albums.tags,
        })
        .from(albums)
        .where(eq(albums.publishStatus, "published"))
        .orderBy(desc(albums.createdAt))
        .limit(100);

      const seoInput = {
        seoTitle: input.seoData.metaTitle,
        metaDescription: input.seoData.metaDescription,  // SeoQualityInput uses metaDescription
        shortDescription: input.seoData.shortDescription,
        focusKeyword: input.seoData.focusKeyword,
        tags: input.seoData.tags ? JSON.stringify(input.seoData.tags) : undefined,
      };

      const quality = checkSeoQuality(input.albumId, seoInput, recentAlbums);
      if (!quality.passed) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: quality.errors.join("; "),
        });
      }

      // Save history
      const existingHistory = await db
        .select({ id: seoGenerationHistory.id })
        .from(seoGenerationHistory)
        .where(eq(seoGenerationHistory.albumId, input.albumId))
        .orderBy(desc(seoGenerationHistory.createdAt))
        .limit(1);

      if (existingHistory[0]) {
        await db
          .update(seoGenerationHistory)
          .set({
            editedByAdmin: true,
            qualityPassed: true,
            qualityWarnings: JSON.stringify(quality.warnings),
            approvedAt: new Date(),
            approvedBy: ctx.user.id,
          })
          .where(eq(seoGenerationHistory.id, existingHistory[0].id));
      }

      // Update album SEO fields + publish
      // albums schema uses: seoTitle, seoDescription, focusKeyword, shortDescription, relatedKeywords, altTextTemplate
      // V4.17: update BOTH publishStatus AND legacy status so album.bySlug works (it checks status='published')
      const updateFields: Partial<typeof albums.$inferInsert> = {
        publishStatus: "published",
        status: "published",   // legacy status used by public gallery queries
        updatedAt: new Date(),
      };
      if (input.seoData.title) updateFields.title = input.seoData.title;
      if (input.seoData.metaTitle) updateFields.seoTitle = input.seoData.metaTitle;
      if (input.seoData.metaDescription) updateFields.seoDescription = input.seoData.metaDescription;
      if (input.seoData.shortDescription) updateFields.shortDescription = input.seoData.shortDescription;
      if (input.seoData.focusKeyword) updateFields.focusKeyword = input.seoData.focusKeyword;
      if (input.seoData.relatedKeywords) updateFields.relatedKeywords = JSON.stringify(input.seoData.relatedKeywords);
      if (input.seoData.altTextTemplate) updateFields.altTextTemplate = input.seoData.altTextTemplate;

      await db
        .update(albums)
        .set(updateFields)
        .where(eq(albums.id, input.albumId));

      return { success: true, warnings: quality.warnings };
    }),

  /**
   * Regenerate SEO for an existing album (V4.9 Final).
   * Saves generation history.
   */
  regenerateSeo: adminProcedure
    .input(z.object({ albumId: z.number().int().positive() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB not available" });

      const albumRow = await db
        .select()
        .from(albums)
        .where(eq(albums.id, input.albumId))
        .limit(1);
      if (!albumRow[0]) throw new TRPCError({ code: "NOT_FOUND", message: "Album not found" });

      const album = albumRow[0];
      const seo = await generateSeoData({
        originalFileName: album.originalFileName || album.title || "",
        adminTitle: album.title,
        creator: album.cosplayer || undefined,
        category: album.collectionName || undefined,
        siteName: "Yukvix",
      });

      // Get current AI config for history
      const configRow = await db
        .select({ value: adminSettings.value })
        .from(adminSettings)
        .where(eq(adminSettings.key, "ai_provider_config"))
        .limit(1);
      const config = configRow[0] ? JSON.parse(configRow[0].value) : {};

      // Save generation history
      await db.insert(seoGenerationHistory).values({
        albumId: input.albumId,
        promptVersion: "v4.17",
        model: config.model || process.env.AI_MODEL || "google/gemini-2.0-flash-exp:free",
        generatedJson: JSON.stringify(seo),
        editedByAdmin: false,
        qualityPassed: false,
      });

      return seo;
    }),

  /**
   * Batch presign: request presigned URLs for multiple archives at once.
   * Each file gets its own job (status=uploaded) and presigned PUT URL.
   * After all uploads complete, the frontend calls batchAutoImport.
   */
  batchPresignUploads: adminProcedure
    .input(
      z.object({
        files: z.array(
          z.object({
            filename: z.string().min(1).max(500),
            size: z.number().positive(),
          })
        ).min(1).max(20),
      })
    )
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB not available" });

      const MAX_UPLOAD_SIZE = parseInt(
        process.env.IMPORT_MAX_UPLOAD_SIZE_BYTES || String(4 * 1024 * 1024 * 1024)
      );
      const MAX_PENDING = parseInt(process.env.IMPORT_MAX_PENDING_JOBS || "20");

      const pendingJobs = await db
        .select({ id: zipImportJobs.id })
        .from(zipImportJobs)
        .where(inArray(zipImportJobs.status, [...ACTIVE_STATUSES]));

      if (pendingJobs.length + input.files.length > MAX_PENDING) {
        throw new TRPCError({
          code: "TOO_MANY_REQUESTS",
          message: `Queue would exceed limit (${pendingJobs.length} active + ${input.files.length} new > ${MAX_PENDING} max).`,
        });
      }

      const results: Array<{ jobId: number; filename: string; presignedUrl: string; error?: string }> = [];

      for (const file of input.files) {
        try {
          const ext = path.extname(file.filename).toLowerCase();
          if (!ALLOWED_ARCHIVE_EXTENSIONS.includes(ext)) {
            results.push({ jobId: -1, filename: file.filename, presignedUrl: "", error: `Invalid type: ${ext}` });
            continue;
          }
          if (file.size > MAX_UPLOAD_SIZE) {
            results.push({ jobId: -1, filename: file.filename, presignedUrl: "", error: `File too large` });
            continue;
          }

          const [result] = await db.insert(zipImportJobs).values({
            status: "uploaded",
            sourceArchiveOriginalName: file.filename,
            sourceArchiveSize: file.size,
            archivePasswordIndex: 0,
          });
          const jobId = (result as { insertId: number }).insertId;
          const stagingKey = `imports/staging/${jobId}/${file.filename}`;
          const presignedUrl = await getPresignedPutUrl(stagingKey, file.size);

          await db
            .update(zipImportJobs)
            .set({ sourceArchiveKey: stagingKey, updatedAt: new Date() })
            .where(eq(zipImportJobs.id, jobId));

          results.push({ jobId, filename: file.filename, presignedUrl });
        } catch (err) {
          results.push({ jobId: -1, filename: file.filename, presignedUrl: "", error: (err as Error).message });
        }
      }

      return { results };
    }),

  /**
   * Auto-import: generate SEO from filename and create album + queue job.
   * Used after batch upload completes — no manual SEO review required.
   */
  batchAutoImport: adminProcedure
    .input(
      z.object({
        jobs: z.array(
          z.object({
            jobId: z.number().int().positive(),
            filename: z.string().min(1),
          })
        ).min(1).max(20),
        publishMode: z.enum(["draft", "published"]).default("draft"),
        defaultVip: z.boolean().default(false),
        freePreviewCount: z.number().int().min(0).max(50).nullable().default(null),
      })
    )
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB not available" });

      const { generateSlug } = await import("../services/seo-generator");
      const results: Array<{ jobId: number; albumId?: number; albumSlug?: string; error?: string }> = [];

      for (const item of input.jobs) {
        try {
          // Verify job exists
          const existingJob = await db
            .select()
            .from(zipImportJobs)
            .where(eq(zipImportJobs.id, item.jobId))
            .limit(1);

          if (!existingJob[0]?.sourceArchiveKey) {
            results.push({ jobId: item.jobId, error: "Job not found or archive missing" });
            continue;
          }
          if (existingJob[0].status !== "uploaded") {
            results.push({ jobId: item.jobId, error: `Job status is ${existingJob[0].status}, expected uploaded` });
            continue;
          }

          // Generate SEO from filename
          const seo = await generateSeoData({
            originalFileName: item.filename,
            siteName: process.env.VITE_APP_TITLE || "CosplayVault",
          });

          // Ensure unique slug
          let albumSlug = generateSlug(seo.albumTitle) || seo.albumTitle.toLowerCase().replace(/\s+/g, "-");
          // Append jobId suffix if slug conflicts
          const existingSlug = await db
            .select({ id: albums.id })
            .from(albums)
            .where(eq(albums.slug, albumSlug))
            .limit(1);
          if (existingSlug.length > 0) {
            albumSlug = `${albumSlug}-${item.jobId}`;
          }

          // Find or create creator
          let creatorId: number | null = null;
          if (seo.creator && !KNOWN_COLLECTIONS.has(seo.creator)) {
            try {
              const creatorResult = await findOrCreateCreator({
                name: seo.creator,
                category: seo.category,
              });
              creatorId = creatorResult.creatorId;
            } catch (err) {
              console.warn(`[BatchImport] Creator lookup failed: ${(err as Error).message}`);
            }
          }

          // Create album
          const [albumResult] = await db.insert(albums).values({
            slug: albumSlug,
            title: seo.albumTitle,
            creator: seo.creator,
            creatorId,
            collectionName: seo.collectionName,
            description: seo.shortDescription,
            shortDescription: seo.shortDescription,
            category: (seo.category as "Japan" | "China" | "Korea" | "Euro" | "Cosplay" | "Gravure") || "China",
            tags: seo.tags ? JSON.stringify(seo.tags) : null,
            metaTitle: seo.seoTitle,
            metaDescription: seo.metaDescription,
            focusKeyword: seo.focusKeyword,
            relatedKeywords: seo.relatedKeywords ? JSON.stringify(seo.relatedKeywords) : null,
            altTextTemplate: seo.altTextTemplate,
            originalFileName: item.filename,
            aiGenerated: true,
            publishStatus: input.publishMode === "published" ? "ready_for_review" : "processing",
            status: input.publishMode === "published" ? "published" : "draft",
            isVip: input.defaultVip,
            freePreviewCount: input.freePreviewCount,
          });

          const albumId = (albumResult as { insertId: number }).insertId;

          // Queue the job
          await db
            .update(zipImportJobs)
            .set({
              albumId,
              status: "waiting",
              archivePasswordIndex: 0,
              updatedAt: new Date(),
            })
            .where(eq(zipImportJobs.id, item.jobId));

          results.push({ jobId: item.jobId, albumId, albumSlug });
        } catch (err) {
          results.push({ jobId: item.jobId, error: (err as Error).message });
        }
      }

      return { results };
    }),

  /**
   * Trigger queue processing immediately (bypass 2h interval).
   * Useful after batch upload to start processing right away.
   */
  triggerQueueNow: adminProcedure.mutation(async () => {
    const { runSchedulerNow } = await import("../services/import-cron");
    if (typeof runSchedulerNow === "function") {
      runSchedulerNow().catch(console.error);
      return { triggered: true };
    }
    return { triggered: false, note: "runSchedulerNow not exported" };
  }),

  /**
   * Get Import Schedule Config.
   */
  getImportScheduleConfig: adminProcedure.query(async () => {
    const db = await getDb();
    if (!db) return { enabled: false, cronHour: 3, batchSize: 10 };
    const row = await db
      .select({ value: adminSettings.value })
      .from(adminSettings)
      .where(eq(adminSettings.key, "import_schedule_config"))
      .limit(1);
    if (!row[0]?.value) return { enabled: false, cronHour: 3, batchSize: 10 };
    const cfg = JSON.parse(row[0].value);
    return {
      enabled: cfg.enabled ?? false,
      cronHour: cfg.cronHour ?? 3,
      batchSize: cfg.batchSize ?? 10,
    };
  }),

  /**
   * Save Import Schedule Config.
   */
  saveImportScheduleConfig: adminProcedure
    .input(
      z.object({
        enabled: z.boolean(),
        cronHour: z.number().int().min(0).max(23),
        batchSize: z.number().int().min(1).max(50),
      })
    )
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB not available" });
      const value = JSON.stringify(input);
      const existing = await db
        .select({ id: adminSettings.id })
        .from(adminSettings)
        .where(eq(adminSettings.key, "import_schedule_config"))
        .limit(1);
      if (existing.length > 0) {
        await db
          .update(adminSettings)
          .set({ value, updatedAt: new Date() })
          .where(eq(adminSettings.key, "import_schedule_config"));
      } else {
        await db.insert(adminSettings).values({ key: "import_schedule_config", value });
      }
      return { success: true };
    }),

  /**
   * Count jobs waiting for scheduled processing.
   */
  countWaitingJobs: adminProcedure.query(async () => {
    const db = await getDb();
    if (!db) return { count: 0 };
    const rows = await db
      .select({ id: zipImportJobs.id })
      .from(zipImportJobs)
      .where(eq(zipImportJobs.status, "waiting"));
    return { count: rows.length };
  }),

  /**
   * Run import queue processing immediately (manual trigger from admin UI).
   */
  runImportQueueNow: adminProcedure.mutation(async () => {
    const cronSecret = process.env.CRON_SECRET;
    if (!cronSecret) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "CRON_SECRET not configured" });
    try {
      const port = process.env.PORT || "3000";
      const response = await fetch(`http://localhost:${port}/api/scheduled/process-import-queue`, {
        method: "POST",
        headers: {
          "X-Cron-Secret": cronSecret,
          "X-Manual-Run": "1",
          "Content-Type": "application/json",
        },
      });
      const data = await response.json() as Record<string, unknown>;
      return { success: true, result: data };
    } catch (err) {
      throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: `Failed to trigger queue: ${(err as Error).message}` });
    }
  }),

  /**
   * Get Batch Import default config (defaultVip, freePreviewCount, publishMode).
   */
  getBatchImportConfig: adminProcedure.query(async () => {
    const db = await getDb();
    if (!db) return { defaultVip: true, freePreviewCount: 5, publishMode: "draft" };
    const row = await db
      .select({ value: adminSettings.value })
      .from(adminSettings)
      .where(eq(adminSettings.key, "batch_import_config"))
      .limit(1);
    if (!row[0]?.value) return { defaultVip: true, freePreviewCount: 5, publishMode: "draft" };
    const cfg = JSON.parse(row[0].value);
    return {
      defaultVip: cfg.defaultVip ?? true,
      freePreviewCount: cfg.freePreviewCount ?? 5,
      publishMode: cfg.publishMode ?? "draft",
    };
  }),

  /**
   * Save Batch Import default config.
   */
  saveBatchImportConfig: adminProcedure
    .input(
      z.object({
        defaultVip: z.boolean(),
        freePreviewCount: z.number().int().min(0).max(50),
        publishMode: z.enum(["draft", "published"]),
      })
    )
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB not available" });
      const value = JSON.stringify(input);
      const existing = await db
        .select({ id: adminSettings.id })
        .from(adminSettings)
        .where(eq(adminSettings.key, "batch_import_config"))
        .limit(1);
      if (existing.length > 0) {
        await db
          .update(adminSettings)
          .set({ value, updatedAt: new Date() })
          .where(eq(adminSettings.key, "batch_import_config"));
      } else {
        await db.insert(adminSettings).values({ key: "batch_import_config", value });
      }
      return { success: true };
    }),

  /**
   * Get AI provider config.
   */
  getAiConfig: adminProcedure.query(async () => {
    const db = await getDb();
    if (!db) {
      return {
        provider: process.env.AI_PROVIDER || "openrouter",
        model: process.env.AI_MODEL || "google/gemini-2.0-flash-exp:free",
        apiKeyConfigured: !!process.env.AI_API_KEY,
      };
    }

    const row = await db
      .select({ value: adminSettings.value })
      .from(adminSettings)
      .where(eq(adminSettings.key, "ai_provider_config"))
      .limit(1);

    if (!row[0]) {
      return {
        provider: process.env.AI_PROVIDER || "openrouter",
        model: process.env.AI_MODEL || "google/gemini-2.0-flash-exp:free",
        apiKeyConfigured: !!process.env.AI_API_KEY,
      };
    }

    const cfg = JSON.parse(row[0].value);
    return {
      provider: cfg.provider,
      model: cfg.model,
      apiKeyConfigured: !!cfg.apiKey,
    };
  }),
});

export type ZipImportRouter = typeof zipImportRouter;
