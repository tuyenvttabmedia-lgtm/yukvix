/**
 * media.ts — tRPC router for Media Library
 * Provides admin CRUD for media_items and album ↔ media junction operations.
 * Also provides upload procedures for direct-to-Wasabi bulk uploads (no albumId required).
 */
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, adminProcedure } from "../_core/trpc";
import {
  listMediaItems,
  getMediaItemById,
  deleteMediaItem,
  attachMediaToAlbum,
  detachMediaFromAlbum,
  getAlbumMediaItems,
  bulkAttachMediaToAlbum,
  enqueueImageProcessingJob,
  getProcessingJobStatus,
  updateAlbumPhotoCount,
  getAlbumById,
  setFreePreviewPhotos,
} from "../db";
import {
  getPresignedPutUrl,
  isImageMimeType,
  isWasabiConfigured,
} from "../storage-wasabi";

export const mediaRouter = router({
  // -- List media items (admin) ----------------------------------------------
  list: adminProcedure
    .input(
      z.object({
        search: z.string().optional(),
        limit: z.number().min(1).max(200).default(48),
        offset: z.number().min(0).default(0),
        dateFrom: z.string().optional(), // ISO date string YYYY-MM-DD
        dateTo: z.string().optional(),   // ISO date string YYYY-MM-DD
        filterAlbumId: z.number().optional(), // only items in this album
      })
    )
    .query(async ({ input }) => {
      const { items, total } = await listMediaItems({
        search: input.search,
        limit: input.limit,
        offset: input.offset,
        dateFrom: input.dateFrom ? new Date(input.dateFrom) : undefined,
        dateTo: input.dateTo ? new Date(input.dateTo) : undefined,
        albumId: input.filterAlbumId,
      });
      return { items, total, limit: input.limit, offset: input.offset };
    }),

  // -- Get single media item -------------------------------------------------
  getById: adminProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input }) => {
      const item = await getMediaItemById(input.id);
      if (!item) throw new TRPCError({ code: "NOT_FOUND", message: "Media item not found" });
      return item;
    }),

  // -- Delete media item (DB only — does NOT delete from Wasabi) -------------
  delete: adminProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const item = await getMediaItemById(input.id);
      if (!item) throw new TRPCError({ code: "NOT_FOUND", message: "Media item not found" });
      await deleteMediaItem(input.id);
      return { success: true };
    }),

  // -- Get media items for an album ------------------------------------------
  getByAlbum: adminProcedure
    .input(z.object({ albumId: z.number() }))
    .query(async ({ input }) => {
      const items = await getAlbumMediaItems(input.albumId);
      return items;
    }),

  // -- Attach single media item to album -------------------------------------
  attachToAlbum: adminProcedure
    .input(
      z.object({
        albumId: z.number(),
        mediaItemId: z.number(),
        sortOrder: z.number().optional(),
        isFreePreview: z.boolean().optional(),
      })
    )
    .mutation(async ({ input }) => {
      await attachMediaToAlbum({
        albumId: input.albumId,
        mediaItemId: input.mediaItemId,
        sortOrder: input.sortOrder,
        isFreePreview: input.isFreePreview,
      });
      return { success: true };
    }),

  // -- Bulk attach multiple media items to album -----------------------------
  bulkAttachToAlbum: adminProcedure
    .input(
      z.object({
        albumId: z.number(),
        mediaItemIds: z.array(z.number()).min(1).max(500),
      })
    )
    .mutation(async ({ input }) => {
      // 1. Update junction table (media library linkage)
      await bulkAttachMediaToAlbum(input.albumId, input.mediaItemIds);

      // 2. Create photos rows so album pages can render them
      //    (album pages read from `photos` table, not album_media_items)
      const { getDb } = await import("../db");
      const { mediaItems: mediaItemsTable, photos: photosTable } = await import("../../drizzle/schema");
      const { inArray, eq } = await import("drizzle-orm");
      const db = await getDb();
      if (!db) return { success: true, count: input.mediaItemIds.length };

      // Fetch media items
      const items = await db
        .select()
        .from(mediaItemsTable)
        .where(inArray(mediaItemsTable.id, input.mediaItemIds));

      // Get current max sortOrder for this album
      const existingPhotos = await db
        .select({ sortOrder: photosTable.sortOrder })
        .from(photosTable)
        .where(eq(photosTable.albumId, input.albumId))
        .orderBy(photosTable.sortOrder);
      let nextOrder =
        existingPhotos.length > 0
          ? Math.max(...existingPhotos.map((p) => p.sortOrder)) + 1
          : 0;

      const { deriveMediumObjectKey } = await import("../public-media-url");
      // Insert photos rows (skip duplicates via originalKey)
      for (const item of items) {
        const mediumKey = deriveMediumObjectKey(item.thumbKey || item.webpKey, item.thumbUrl);
        await db.insert(photosTable).ignore().values({
          albumId: input.albumId,
          originalKey: item.originalKey,
          originalUrl: item.originalUrl ?? undefined,
          webpKey: item.webpKey ?? undefined,
          webpUrl: item.webpUrl ?? undefined,
          mediumKey: mediumKey ?? undefined,
          thumbKey: item.thumbKey ?? undefined,
          thumbUrl: item.thumbUrl ?? undefined,
          width: item.width ?? undefined,
          height: item.height ?? undefined,
          fileSize: item.fileSize ?? undefined,
          mimeType: item.mimeType ?? undefined,
          sortOrder: nextOrder++,
          isFreePreview: false,
        });
      }

      // Update album photo count and free preview assignments
      await updateAlbumPhotoCount(input.albumId);
      const album = await getAlbumById(input.albumId);
      if (album) await setFreePreviewPhotos(input.albumId, album.freePreviewCount);

      return { success: true, count: input.mediaItemIds.length };
    }),

  // -- Detach media item from album ------------------------------------------
  detachFromAlbum: adminProcedure
    .input(
      z.object({
        albumId: z.number(),
        mediaItemId: z.number(),
      })
    )
    .mutation(async ({ input }) => {
      await detachMediaFromAlbum(input.albumId, input.mediaItemId);
      return { success: true };
    }),

  // -- Request presigned PUT URL for direct browser-to-Wasabi upload ---------
  // Does NOT require albumId — uploads go to library/ prefix.
  requestPresignedUrl: adminProcedure
    .input(
      z.object({
        fileName: z.string(),
        mimeType: z.string(),
        fileSize: z.number(),
      })
    )
    .mutation(async ({ input }) => {
      if (!isImageMimeType(input.mimeType)) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Invalid image type" });
      }
      if (input.fileSize > 50 * 1024 * 1024) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "File too large (max 50MB per image)" });
      }
      const timestamp = Date.now();
      const ext = input.fileName.split(".").pop()?.toLowerCase() || "jpg";
      const baseName = input.fileName.replace(/\.[^.]+$/, "").replace(/[^a-zA-Z0-9-_]/g, "_");
      const originalKey = `library/original/${timestamp}_${baseName}.${ext}`;

      if (isWasabiConfigured()) {
        const presignedUrl = await getPresignedPutUrl(originalKey, input.mimeType, 300);
        return { mode: "presigned" as const, presignedUrl: presignedUrl!, originalKey };
      } else {
        return { mode: "server" as const, presignedUrl: null, originalKey };
      }
    }),

  // -- Enqueue processing job after upload (no albumId) ---------------------
  processUpload: adminProcedure
    .input(
      z.object({
        originalKey: z.string(),
        fileName: z.string(),
        mimeType: z.string(),
        fileSize: z.number(),
      })
    )
    .mutation(async ({ input }) => {
      // albumId is intentionally omitted — worker will only create media_item
      const jobId = await enqueueImageProcessingJob({
        albumId: undefined as any,
        originalKey: input.originalKey,
        fileName: input.fileName,
        mimeType: input.mimeType,
        fileSize: input.fileSize,
      });
      return { success: true, jobId, queued: true };
    }),

  // -- Poll processing job status --------------------------------------------
  uploadJobStatus: adminProcedure
    .input(z.object({ jobId: z.number() }))
    .query(async ({ input }) => {
      const job = await getProcessingJobStatus(input.jobId);
      if (!job) throw new TRPCError({ code: "NOT_FOUND" });
      return job;
    }),

  // -- Retry all failed jobs: reset status back to pending
  retryFailedJobs: adminProcedure.mutation(async () => {
    const { getDb } = await import("../db");
    const { imageProcessingJobs } = await import("../../drizzle/schema");
    const { eq } = await import("drizzle-orm");
    const db = await getDb();
    if (!db) return { reset: 0 };
    const result = await db
      .update(imageProcessingJobs)
      .set({ status: "pending", retryCount: 0, error: null })
      .where(eq(imageProcessingJobs.status, "failed"));
    return { reset: (result as any)[0]?.affectedRows ?? 0 };
  }),

  // -- Queue stats: pending/processing/failed counts for operational visibility
  queueStats: adminProcedure.query(async () => {
    const { getDb } = await import("../db");
    const { imageProcessingJobs } = await import("../../drizzle/schema");
    const { sql } = await import("drizzle-orm");
    const db = await getDb();
    if (!db) return { pending: 0, processing: 0, done: 0, failed: 0 };
    const [row] = await db
      .select({
        pending: sql<number>`SUM(CASE WHEN status='pending' THEN 1 ELSE 0 END)`,
        processing: sql<number>`SUM(CASE WHEN status='processing' THEN 1 ELSE 0 END)`,
        done: sql<number>`SUM(CASE WHEN status='done' THEN 1 ELSE 0 END)`,
        failed: sql<number>`SUM(CASE WHEN status='failed' THEN 1 ELSE 0 END)`,
      })
      .from(imageProcessingJobs);
    return {
      pending: Number(row?.pending ?? 0),
      processing: Number(row?.processing ?? 0),
      done: Number(row?.done ?? 0),
      failed: Number(row?.failed ?? 0),
    };
  }),

  // -- Bulk cleanup: delete original/ files from Wasabi for photos/media that still have originalKey
  // Processes up to 100 records per call (batched). Returns count of cleaned items.
  cleanupOriginals: adminProcedure
    .input(z.object({ limit: z.number().min(1).max(200).default(100) }).optional())
    .mutation(async ({ input }) => {
      const { getDb } = await import("../db");
      const { photos, mediaItems } = await import("../../drizzle/schema");
      const { isNotNull, eq } = await import("drizzle-orm");
      const { deleteFromStorage } = await import("../storage-wasabi");
      const db = await getDb();
      if (!db) return { cleaned: 0, errors: 0 };

      const batchLimit = input?.limit ?? 100;
      let cleaned = 0;
      let errors = 0;

      // Clean photos table
      const photoRows = await db
        .select({ id: photos.id, originalKey: photos.originalKey })
        .from(photos)
        .where(isNotNull(photos.originalKey))
        .limit(batchLimit);

      for (const row of photoRows) {
        if (!row.originalKey) continue;
        try {
          await deleteFromStorage(row.originalKey);
          await db
            .update(photos)
            .set({ originalKey: null, originalUrl: null })
            .where(eq(photos.id, row.id));
          cleaned++;
        } catch (err: any) {
          console.warn(`[CleanupOriginals] Failed for photo #${row.id}:`, err?.message);
          errors++;
        }
      }

      // Clean mediaItems table
      const mediaRows = await db
        .select({ id: mediaItems.id, originalKey: mediaItems.originalKey })
        .from(mediaItems)
        .where(isNotNull(mediaItems.originalKey))
        .limit(batchLimit);

      for (const row of mediaRows) {
        if (!row.originalKey) continue;
        try {
          await deleteFromStorage(row.originalKey);
          await db
            .update(mediaItems)
            .set({ originalKey: null, originalUrl: null })
            .where(eq(mediaItems.id, row.id));
          cleaned++;
        } catch (err: any) {
          console.warn(`[CleanupOriginals] Failed for mediaItem #${row.id}:`, err?.message);
          errors++;
        }
      }

      console.log(`[CleanupOriginals] Done: cleaned=${cleaned} errors=${errors}`);
      return { cleaned, errors };
    }),

  // -- Count remaining originals to clean
  countOriginals: adminProcedure.query(async () => {
    const { getDb } = await import("../db");
    const { photos, mediaItems } = await import("../../drizzle/schema");
    const { isNotNull, count } = await import("drizzle-orm");
    const db = await getDb();
    if (!db) return { photoCount: 0, mediaCount: 0 };

    const [photoRow] = await db
      .select({ c: count() })
      .from(photos)
      .where(isNotNull(photos.originalKey));
    const [mediaRow] = await db
      .select({ c: count() })
      .from(mediaItems)
      .where(isNotNull(mediaItems.originalKey));

    return {
      photoCount: Number(photoRow?.c ?? 0),
      mediaCount: Number(mediaRow?.c ?? 0),
    };
  }),
});
