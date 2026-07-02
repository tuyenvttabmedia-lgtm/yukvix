import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { protectedProcedure, publicProcedure, router } from "../_core/trpc";
import {
  bulkDeletePhotos,
  createPhoto,
  createUploadJob,
  deletePhoto,
  enqueueImageProcessingJob,
  getAlbumById,
  getCachedSignedUrl,
  getPhotoById,
  getPhotosByAlbumId,
  getPhotosByAlbumIdPaginated,
  getProcessingJobStatus,
  setCachedSignedUrl,
  setFreePreviewPhotos,
  updateAlbum,
  updateUploadJob,
} from "../db";
import {
  deleteFromStorage,
  getPresignedPutUrl,
  getPublicUrl,
  getS3ClientForProcessing,
  getSignedMediaUrl,
  isImageMimeType,
  isWasabiConfigured,
  processImage,
  uploadPhoto,
  uploadToStorage,
} from "../storage-wasabi";
import { isAdmin, isVipOrAdmin } from '@shared/const';

export const photosRouter = router({
  // --- Paginated photos for an album (cursor-based, limit 24) -----------------
  byAlbumPaginated: publicProcedure
    .input(z.object({
      albumId: z.number(),
      cursor: z.number().nullable().default(null),
      limit: z.number().min(1).max(50).default(24),
    }))
    .query(async ({ input, ctx }) => {
      const album = await getAlbumById(input.albumId);
      if (!album) throw new TRPCError({ code: "NOT_FOUND" });

      const userIsVip = ctx.user && (isVipOrAdmin(ctx.user.role));
      const { items, nextCursor } = await getPhotosByAlbumIdPaginated(
        input.albumId,
        input.cursor,
        input.limit
      );

      // Apply VIP access control
      const visibleItems = (album.isVip && !userIsVip)
        ? items.filter((p) => p.isFreePreview)
        : items;

      // Generate signed URLs for VIP content (with DB cache to avoid per-request signing)
      const photosWithUrls = await Promise.all(
        visibleItems.map(async (photo) => {
          if (album.isVip && userIsVip && photo.webpKey) {
            // Try cache first
            let signedUrl = await getCachedSignedUrl(photo.id);
            if (!signedUrl) {
              signedUrl = await getSignedMediaUrl(photo.webpKey, 3600);
              // Cache for 1 hour
              await setCachedSignedUrl(photo.id, signedUrl, 3600).catch(() => {});
            }
            return { ...photo, displayUrl: signedUrl, isLocked: false };
          }
          // Build URL from key as fallback when URL columns are NULL (e.g., ZIP import legacy data)
          const resolveUrl = (url: string | null | undefined, key: string | null | undefined) =>
            url || (key ? getPublicUrl(key) : null);
          return {
            ...photo,
            displayUrl:
              resolveUrl(photo.mediumUrl, photo.mediumKey) ||
              resolveUrl(photo.webpUrl, photo.webpKey) ||
              resolveUrl(photo.originalUrl, photo.originalKey) ||
              resolveUrl(photo.thumbUrl, photo.thumbKey),
            isLocked: false,
          };
        })
      );

      // Stop pagination for non-VIP users on VIP albums
      const effectiveNextCursor = (album.isVip && !userIsVip) ? null : nextCursor;
      return { items: photosWithUrls, nextCursor: effectiveNextCursor };
    }),

  // --- Get photos for an album (with access control) --------------------------
  byAlbum: publicProcedure
    .input(z.object({ albumId: z.number() }))
    .query(async ({ input, ctx }) => {
      const album = await getAlbumById(input.albumId);
      if (!album) throw new TRPCError({ code: "NOT_FOUND" });

      const allPhotos = await getPhotosByAlbumId(input.albumId);
      const userIsVip = ctx.user && (isVipOrAdmin(ctx.user.role));

      if (album.isVip && !userIsVip) {
        return allPhotos.filter((p) => p.isFreePreview);
      }
      return allPhotos;
    }),

  // --- Get signed URL for a premium photo ------------------------------------
  getSignedUrl: protectedProcedure
    .input(z.object({ photoId: z.number() }))
    .query(async ({ input, ctx }) => {
      const photo = await getPhotoById(input.photoId);
      if (!photo) throw new TRPCError({ code: "NOT_FOUND" });

      const album = await getAlbumById(photo.albumId);
      if (!album) throw new TRPCError({ code: "NOT_FOUND" });

      const userIsVip = isVipOrAdmin(ctx.user.role);
      if (album.isVip && !userIsVip) {
        throw new TRPCError({ code: "FORBIDDEN", message: "VIP membership required" });
      }

      const key = photo.webpKey || photo.originalKey;
      const signedUrl = await getSignedMediaUrl(key, 3600);
      return { url: signedUrl, expiresIn: 3600 };
    }),

  // --- Admin: Upload single photo ---------------------------------------------
  uploadSingle: protectedProcedure
    .input(
      z.object({
        albumId: z.number(),
        fileName: z.string(),
        mimeType: z.string(),
        base64Data: z.string(), // base64 encoded image data
        sortOrder: z.number().default(0),
      })
    )
    .mutation(async ({ input, ctx }) => {
      if (!isAdmin(ctx.user.role)) {
        throw new TRPCError({ code: "FORBIDDEN" });
      }

      if (!isImageMimeType(input.mimeType)) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Invalid image type" });
      }

      const album = await getAlbumById(input.albumId);
      if (!album) throw new TRPCError({ code: "NOT_FOUND", message: "Album not found" });

      // Decode base64
      const buffer = Buffer.from(input.base64Data, "base64");

      // Upload with processing
      const result = await uploadPhoto(input.albumId, buffer, input.fileName, input.mimeType);

      // Save to DB
      await createPhoto({
        albumId: input.albumId,
        originalKey: result.originalKey,
        originalUrl: result.originalUrl,
        webpKey: result.webpKey,
        webpUrl: result.webpUrl,
        mediumKey: result.mediumKey,
        mediumUrl: result.mediumUrl,
        thumbKey: result.thumbKey,
        thumbUrl: result.thumbUrl,
        width: result.width,
        height: result.height,
        fileSize: result.fileSize,
        mimeType: "image/webp",
        sortOrder: input.sortOrder,
        isFreePreview: false,
      });

      // Update album cover if first photo
      if (album.photoCount === 0) {
        await updateAlbum(input.albumId, {
          coverKey: result.thumbKey,
          coverUrl: result.thumbUrl,
        });
      }

      // Update photo count and free preview
      const { updateAlbumPhotoCount } = await import("../db");
      await updateAlbumPhotoCount(input.albumId);
      await setFreePreviewPhotos(input.albumId, album.freePreviewCount);

      return { success: true, thumbUrl: result.thumbUrl };
    }),

  // --- Admin: Delete photo ----------------------------------------------------
  delete: protectedProcedure
    .input(z.object({ photoId: z.number() }))
    .mutation(async ({ input, ctx }) => {
      if (!isAdmin(ctx.user.role)) {
        throw new TRPCError({ code: "FORBIDDEN" });
      }

      const photo = await getPhotoById(input.photoId);
      if (!photo) throw new TRPCError({ code: "NOT_FOUND" });

      // Delete from storage
      const keysToDelete = [photo.originalKey, photo.webpKey, photo.mediumKey, photo.thumbKey].filter(Boolean) as string[];
      await Promise.allSettled(keysToDelete.map((k) => deleteFromStorage(k)));

      // Delete from DB
      await deletePhoto(input.photoId);

      // Update photo count
      const { updateAlbumPhotoCount } = await import("../db");
      await updateAlbumPhotoCount(photo.albumId);

      const album = await getAlbumById(photo.albumId);
      if (album) await setFreePreviewPhotos(photo.albumId, album.freePreviewCount);

      return { success: true };
    }),

  // --- Admin: Reorder photos --------------------------------------------------
  reorder: protectedProcedure
    .input(
      z.object({
        albumId: z.number(),
        photoIds: z.array(z.number()), // ordered list
      })
    )
    .mutation(async ({ input, ctx }) => {
      if (!isAdmin(ctx.user.role)) {
        throw new TRPCError({ code: "FORBIDDEN" });
      }

      const { getDb } = await import("../db");
      const { photos } = await import("../../drizzle/schema");
      const { eq } = await import("drizzle-orm");
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      await Promise.all(
        input.photoIds.map((id, index) =>
          db.update(photos).set({ sortOrder: index }).where(eq(photos.id, id))
        )
      );

      const album = await getAlbumById(input.albumId);
      if (album) await setFreePreviewPhotos(input.albumId, album.freePreviewCount);

      return { success: true };
    }),

  // --- Admin: Request presigned PUT URL for direct browser-to-Wasabi upload ---------
  requestPresignedUrl: protectedProcedure
    .input(
      z.object({
        albumId: z.number(),
        fileName: z.string(),
        mimeType: z.string(),
        fileSize: z.number(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      if (!isAdmin(ctx.user.role)) throw new TRPCError({ code: "FORBIDDEN" });
      if (!isImageMimeType(input.mimeType)) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Invalid image type" });
      }
      if (input.fileSize > 50 * 1024 * 1024) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "File too large (max 50MB per image)" });
      }
      const album = await getAlbumById(input.albumId);
      if (!album) throw new TRPCError({ code: "NOT_FOUND", message: "Album not found" });

      const timestamp = Date.now();
      const ext = input.fileName.split(".").pop()?.toLowerCase() || "jpg";
      const baseName = input.fileName.replace(/\.[^.]+$/, "").replace(/[^a-zA-Z0-9-_]/g, "_");
      const originalKey = `albums/${input.albumId}/original/${timestamp}_${baseName}.${ext}`;

      if (isWasabiConfigured()) {
        // Direct browser-to-Wasabi upload path
        const presignedUrl = await getPresignedPutUrl(originalKey, input.mimeType, 300);
        return {
          mode: "presigned" as const,
          presignedUrl: presignedUrl!,
          originalKey,
        };
      } else {
        // Fallback: server-side upload via multipart form
        return {
          mode: "server" as const,
          presignedUrl: null,
          originalKey,
        };
      }
    }),

  // --- Admin: Process image after direct upload to Wasabi ------------------------
  // Enqueues a background job instead of processing inline — returns jobId immediately.
  processAfterUpload: protectedProcedure
    .input(
      z.object({
        albumId: z.number(),
        originalKey: z.string(),
        fileName: z.string(),
        mimeType: z.string(),
        fileSize: z.number(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      if (!isAdmin(ctx.user.role)) throw new TRPCError({ code: "FORBIDDEN" });
      const album = await getAlbumById(input.albumId);
      if (!album) throw new TRPCError({ code: "NOT_FOUND", message: "Album not found" });
      // Enqueue background job — returns immediately
      const jobId = await enqueueImageProcessingJob({
        albumId: input.albumId,
        originalKey: input.originalKey,
        fileName: input.fileName,
        mimeType: input.mimeType,
        fileSize: input.fileSize,
      });
      console.log(`[processAfterUpload] Enqueued job #${jobId} for key=${input.originalKey}`);
      return { success: true, jobId, queued: true };
    }),

  // --- Admin: Batch enqueue multiple images after direct upload to Wasabi ----------
  // Accepts up to 50 files at once — reduces round-trips for large batch uploads.
  batchProcessAfterUpload: protectedProcedure
    .input(
      z.object({
        albumId: z.number(),
        files: z.array(z.object({
          originalKey: z.string(),
          fileName: z.string(),
          mimeType: z.string(),
          fileSize: z.number(),
        })).min(1).max(50),
      })
    )
    .mutation(async ({ input, ctx }) => {
      if (!isAdmin(ctx.user.role)) throw new TRPCError({ code: "FORBIDDEN" });
      const album = await getAlbumById(input.albumId);
      if (!album) throw new TRPCError({ code: "NOT_FOUND", message: "Album not found" });
      const results: { originalKey: string; jobId: number }[] = [];
      // Enqueue all jobs — each enqueue is fast (single INSERT)
      await Promise.all(input.files.map(async (file) => {
        const jobId = await enqueueImageProcessingJob({
          albumId: input.albumId,
          originalKey: file.originalKey,
          fileName: file.fileName,
          mimeType: file.mimeType,
          fileSize: file.fileSize,
        });
        results.push({ originalKey: file.originalKey, jobId });
      }));
      console.log(`[batchProcessAfterUpload] Enqueued ${results.length} jobs for album ${input.albumId}`);
      return { success: true, jobs: results };
    }),

  // --- Admin: Poll processing job status -----------------------------------------
  processingJobStatus: protectedProcedure
    .input(z.object({ jobId: z.number() }))
    .query(async ({ input, ctx }) => {
      if (!isAdmin(ctx.user.role)) throw new TRPCError({ code: "FORBIDDEN" });
      const job = await getProcessingJobStatus(input.jobId);
      if (!job) throw new TRPCError({ code: "NOT_FOUND" });
      return job;
    }),

  // --- Admin: Bulk delete photos -------------------------------------------------
  bulkDelete: protectedProcedure
    .input(z.object({ photoIds: z.array(z.number()).min(1).max(200) }))
    .mutation(async ({ input, ctx }) => {
      if (!isAdmin(ctx.user.role)) throw new TRPCError({ code: "FORBIDDEN" });
      // Fetch photos to get their storage keys for cleanup
      const { getDb } = await import("../db");
      const { photos: photosTable } = await import("../../drizzle/schema");
      const { inArray } = await import("drizzle-orm");
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const rows = await db.select().from(photosTable).where(inArray(photosTable.id, input.photoIds));
      // Delete from storage (best-effort)
      await Promise.allSettled(
        rows.flatMap((p) => [
          p.webpKey ? deleteFromStorage(p.webpKey) : null,
          p.thumbKey ? deleteFromStorage(p.thumbKey) : null,
        ].filter(Boolean) as Promise<void>[])
      );
      // Delete from DB
      const deleted = await bulkDeletePhotos(input.photoIds);
      // Recalculate photo counts per album
      const albumIds = Array.from(new Set(rows.map((p) => p.albumId)));
      const { updateAlbumPhotoCount } = await import("../db");
      await Promise.all(albumIds.map((id) => updateAlbumPhotoCount(id)));
      return { success: true, deleted };
    }),

  // --- Admin: Set cover photo for album ------------------------------------------
  setCover: protectedProcedure
    .input(z.object({ albumId: z.number(), photoId: z.number() }))
    .mutation(async ({ input, ctx }) => {
      if (!isAdmin(ctx.user.role)) throw new TRPCError({ code: "FORBIDDEN" });
      const photo = await getPhotoById(input.photoId);
      if (!photo || photo.albumId !== input.albumId) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Photo not found in this album" });
      }
      await updateAlbum(input.albumId, {
        coverKey: photo.thumbKey || photo.webpKey || photo.originalKey,
        coverUrl: photo.thumbUrl || photo.webpUrl || photo.originalUrl,
      });
      return { success: true };
    }),

  // --- Admin: Toggle free preview for a specific photo --------------------------
  toggleFreePreview: protectedProcedure
    .input(z.object({ photoId: z.number(), isFreePreview: z.boolean() }))
    .mutation(async ({ input, ctx }) => {
      if (!isAdmin(ctx.user.role)) throw new TRPCError({ code: "FORBIDDEN" });
      const { getDb } = await import("../db");
      const { photos: photosTable } = await import("../../drizzle/schema");
      const { eq } = await import("drizzle-orm");
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      await db.update(photosTable)
        .set({ isFreePreview: input.isFreePreview })
        .where(eq(photosTable.id, input.photoId));
      return { success: true };
    }),

  // --- Admin: Update album SEO fields + slug ---------------------------------------
  updateSeo: protectedProcedure
    .input(
      z.object({
        albumId: z.number(),
        slug: z.string().min(1).max(256).regex(/^[a-z0-9-]+$/, "Slug must be lowercase letters, numbers, and hyphens only"),
        seoTitle: z.string().max(256).optional(),
        seoDescription: z.string().max(500).optional(),
        seoKeywords: z.string().max(500).optional(),
        focusKeyword: z.string().max(200).optional(),
        canonicalUrl: z.string().max(500).optional(),
        ogImage: z.string().max(500).optional(),
        robotsIndex: z.boolean().optional(),
        seoLanguage: z.string().max(10).optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      if (!isAdmin(ctx.user.role)) throw new TRPCError({ code: "FORBIDDEN" });
      // Check slug uniqueness
      const { getDb } = await import("../db");
      const { albums: albumsTable } = await import("../../drizzle/schema");
      const { eq, and, ne } = await import("drizzle-orm");
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const existing = await db.select({ id: albumsTable.id })
        .from(albumsTable)
        .where(and(eq(albumsTable.slug, input.slug), ne(albumsTable.id, input.albumId)))
        .limit(1);
      if (existing.length > 0) {
        throw new TRPCError({ code: "CONFLICT", message: "This slug is already in use by another album" });
      }
      await updateAlbum(input.albumId, {
        slug: input.slug,
        seoTitle: input.seoTitle || null,
        seoDescription: input.seoDescription || null,
        seoKeywords: input.seoKeywords || null,
        focusKeyword: input.focusKeyword || null,
        canonicalUrl: input.canonicalUrl || null,
        ogImage: input.ogImage || null,
        robotsIndex: input.robotsIndex ?? true,
        seoLanguage: input.seoLanguage || null,
      });
      return { success: true };
    }),

  // --- Admin: Get upload job status (ZIP jobs from upload_jobs table) ------------------
  uploadJobStatus: protectedProcedure
    .input(z.object({ jobId: z.number() }))
    .query(async ({ input, ctx }) => {
      if (!isAdmin(ctx.user.role)) {
        throw new TRPCError({ code: "FORBIDDEN" });
      }
      const { getDb } = await import("../db");
      const { uploadJobs } = await import("../../drizzle/schema");
      const { eq } = await import("drizzle-orm");
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const result = await db.select().from(uploadJobs).where(eq(uploadJobs.id, input.jobId)).limit(1);
      return result[0] || null;
    }),

  // --- Admin: Get image processing job status (single-image jobs from image_processing_jobs) ------
  imageJobStatus: protectedProcedure
    .input(z.object({ jobId: z.number() }))
    .query(async ({ input, ctx }) => {
      if (!isAdmin(ctx.user.role)) {
        throw new TRPCError({ code: "FORBIDDEN" });
      }
      const job = await getProcessingJobStatus(input.jobId);
      if (!job) throw new TRPCError({ code: "NOT_FOUND" });
      return job;
    }),

  // --- Admin: Update alt text for a single photo ----------------------------
  updateAlt: protectedProcedure
    .input(z.object({ photoId: z.number(), altText: z.string().max(512) }))
    .mutation(async ({ input, ctx }) => {
      if (!isAdmin(ctx.user.role)) throw new TRPCError({ code: "FORBIDDEN" });
      const { getDb } = await import("../db");
      const { photos: photosTable } = await import("../../drizzle/schema");
      const { eq } = await import("drizzle-orm");
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      await db.update(photosTable).set({ altText: input.altText }).where(eq(photosTable.id, input.photoId));
      return { success: true };
    }),

  // --- Admin: Bulk-generate SEO alt texts for all photos in an album --------
  // Uses album metadata (title, cosplayer, character, series) + tags.
  // Only overwrites photos that have NULL/empty altText (safe by default).
  // Pass overwrite=true to regenerate all, including photos that already have alt text.
  generateAltTexts: protectedProcedure
    .input(
      z.object({
        albumId: z.number(),
        overwrite: z.boolean().default(false),
      })
    )
    .mutation(async ({ input, ctx }) => {
      if (!isAdmin(ctx.user.role)) throw new TRPCError({ code: "FORBIDDEN" });

      const { getDb, getAlbumById: getAlbum, getTagsByAlbumId } = await import("../db");
      const { photos: photosTable } = await import("../../drizzle/schema");
      const { eq } = await import("drizzle-orm");
      const { generateAltText } = await import("../alt-text-generator");

      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const album = await getAlbum(input.albumId);
      if (!album) throw new TRPCError({ code: "NOT_FOUND", message: "Album not found" });

      // Fetch tags for this album
      const tagRows = await getTagsByAlbumId(input.albumId);
      const tagNames = tagRows.map((t: { name: string }) => t.name);

      // Fetch all photos ordered by sortOrder
      const photoRows = await db
        .select({ id: photosTable.id, sortOrder: photosTable.sortOrder, altText: photosTable.altText })
        .from(photosTable)
        .where(eq(photosTable.albumId, input.albumId))
        .orderBy(photosTable.sortOrder, photosTable.createdAt);

      let updated = 0;
      let skipped = 0;

      for (let i = 0; i < photoRows.length; i++) {
        const photo = photoRows[i]!;
        // Skip if already has alt text and overwrite is false
        if (!input.overwrite && photo.altText && photo.altText.trim().length > 0) {
          skipped++;
          continue;
        }
        const altText = generateAltText(album, tagNames, i);
        await db.update(photosTable).set({ altText }).where(eq(photosTable.id, photo.id));
        updated++;
      }

      return { success: true, updated, skipped, total: photoRows.length };
    }),
});
