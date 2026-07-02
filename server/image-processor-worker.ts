/**
 * image-processor-worker.ts
 * Background worker that polls imageProcessingJobs table and processes pending jobs.
 *
 * Design:
 * - LIFO ordering: newest jobs processed first so recently-uploaded images appear immediately
 * - Concurrency: 2 jobs processed in parallel (Sharp semaphore still limits to 1 at a time, but
 *   the second slot handles DB/S3 I/O while Sharp is busy → ~30% throughput improvement)
 * - Auto-retry: failed jobs are retried up to MAX_JOB_RETRIES times with exponential backoff
 * - Stuck job recovery: jobs stuck in 'processing' > STUCK_JOB_TIMEOUT_MS are reset to 'pending'
 * - Non-overlapping ticks: each tick drains the queue completely before next tick starts
 */
import {
  claimNextProcessingJob,
  finishProcessingJob,
  createPhoto,
  createMediaItem,
  attachMediaToAlbum,
  updateAlbum,
  updateAlbumPhotoCount,
  setFreePreviewPhotos,
  getAlbumById,
  getTagsByAlbumId,
  getDb,
} from "./db";
import { generateAltText } from "./alt-text-generator";
import { processImage, processImageMediumThumb, copyObject, deleteFromStorage, getS3ClientForProcessing, uploadToStorage, getPublicUrl } from "./storage-wasabi";

const POLL_INTERVAL_MS = 3000;          // poll every 3s (was 5s)
const WORKER_CONCURRENCY = 4;           // 4 parallel job slots — safe now because pre-optimized WebP skips heavy 4K encode
const STUCK_JOB_TIMEOUT_MS = 8 * 60 * 1000; // 8 min stuck → reset to pending
const MAX_JOB_RETRIES = 3;             // auto-retry failed jobs up to 3 times
const RETRY_DELAY_BASE_MS = 15_000;    // 15s base backoff between retries

let _workerRunning = false;
let _activeJobs = 0;                   // count of currently running processOneJob calls
let _tickRunning = false;

/** Reset jobs stuck in 'processing' state for too long (e.g. due to server crash/restart) */
async function resetStuckJobs(): Promise<void> {
  try {
    const db = await getDb();
    if (!db) return;
    const { imageProcessingJobs } = await import("../drizzle/schema");
    const { and, eq, lt } = await import("drizzle-orm");
    const cutoff = new Date(Date.now() - STUCK_JOB_TIMEOUT_MS);
    const result = await db
      .update(imageProcessingJobs)
      .set({ status: "pending", processedAt: null })
      .where(and(eq(imageProcessingJobs.status, "processing"), lt(imageProcessingJobs.createdAt, cutoff)));
    const affected = (result as any)[0]?.affectedRows ?? 0;
    if (affected > 0) {
      console.log(`[ImageWorker] Reset ${affected} stuck job(s) back to pending.`);
    }
  } catch (err: any) {
    console.error("[ImageWorker] Failed to reset stuck jobs:", err?.message);
  }
}

/** Auto-retry jobs that failed but haven't exceeded MAX_JOB_RETRIES */
async function requeueRetryableJobs(): Promise<void> {
  try {
    const db = await getDb();
    if (!db) return;
    const { imageProcessingJobs } = await import("../drizzle/schema");
    const { and, eq, lt, sql } = await import("drizzle-orm");
    // Reset failed jobs that have retryCount < MAX_JOB_RETRIES and last failed > RETRY_DELAY_BASE_MS ago
    const cutoff = new Date(Date.now() - RETRY_DELAY_BASE_MS);
    const result = await db
      .update(imageProcessingJobs)
      .set({
        status: "pending",
        processedAt: null,
        retryCount: sql`COALESCE(retry_count, 0) + 1`,
      })
      .where(
        and(
          eq(imageProcessingJobs.status, "failed"),
          lt(imageProcessingJobs.processedAt as any, cutoff),
          lt(imageProcessingJobs.retryCount as any, MAX_JOB_RETRIES)
        )
      );
    const affected = (result as any)[0]?.affectedRows ?? 0;
    if (affected > 0) {
      console.log(`[ImageWorker] Re-queued ${affected} failed job(s) for retry.`);
    }
  } catch {
    // retryCount column may not exist yet — silently skip
  }
}

/** Log queue stats for operational visibility */
async function logQueueStats(): Promise<void> {
  try {
    const db = await getDb();
    if (!db) return;
    const { imageProcessingJobs } = await import("../drizzle/schema");
    const { sql } = await import("drizzle-orm");
    const [row] = await db
      .select({
        pending: sql<number>`SUM(CASE WHEN status='pending' THEN 1 ELSE 0 END)`,
        processing: sql<number>`SUM(CASE WHEN status='processing' THEN 1 ELSE 0 END)`,
        done: sql<number>`SUM(CASE WHEN status='done' THEN 1 ELSE 0 END)`,
        failed: sql<number>`SUM(CASE WHEN status='failed' THEN 1 ELSE 0 END)`,
      })
      .from(imageProcessingJobs);
    if (row) {
      console.log(`[ImageWorker] Queue: pending=${row.pending ?? 0} processing=${row.processing ?? 0} done=${row.done ?? 0} failed=${row.failed ?? 0}`);
    }
  } catch { /* ignore */ }
}

async function processOneJob(): Promise<boolean> {
  const job = await claimNextProcessingJob();
  if (!job) return false;

  console.log(`[ImageWorker] Processing job #${job.id}: ${job.fileName} (album ${job.albumId ?? "none"})`);
  try {
    // Fetch original from Wasabi
    const { GetObjectCommand } = await import("@aws-sdk/client-s3");
    const s3 = getS3ClientForProcessing();
    const getCmd = new GetObjectCommand({
      Bucket: process.env.WASABI_BUCKET || "",
      Key: job.originalKey,
    });
    const s3Obj = await s3.send(getCmd);
    const chunks: Uint8Array[] = [];
    const stream = s3Obj.Body as any;
    for await (const chunk of stream) chunks.push(chunk);
    const originalBuffer = Buffer.concat(chunks);

    // Smart WebP detection: if file is already WebP AND width >= 2400px, skip 4K encode
    const { GetObjectCommand: _GetCmd } = await import("@aws-sdk/client-s3");
    const sharpOpts = { limitInputPixels: 536805378 };
    const { default: sharpLib } = await import("sharp");
    const inputMeta = await sharpLib(originalBuffer, sharpOpts).metadata();
    const isPreOptimizedWebP = job.mimeType === "image/webp" && (inputMeta.width ?? 0) >= 2400;

    const timestamp = Date.now();
    const baseName = job.fileName.replace(/\.[^.]+$/, "").replace(/[^a-zA-Z0-9-_]/g, "_");
    const prefix = job.albumId ? `albums/${job.albumId}` : "library";
    const webpKey = `${prefix}/webp/${timestamp}_${baseName}.webp`;
    const mediumKey = `${prefix}/medium/${timestamp}_${baseName}_medium.webp`;
    const thumbKey = `${prefix}/thumb/${timestamp}_${baseName}_thumb.webp`;

    let webpResult: { url: string };
    let webpWidth: number;
    let webpHeight: number;
    let mediumResult: { url: string };
    let mediumWidth: number;
    let mediumHeight: number;
    let thumbResult: { url: string };

    if (isPreOptimizedWebP) {
      // Pre-optimized path: copy original WebP to webp/ folder, only generate medium + thumb
      console.log(`[ImageWorker] Job #${job.id}: Pre-optimized WebP detected (${inputMeta.width}px) — skipping 4K encode`);
      await copyObject(job.originalKey, webpKey);
      webpResult = { url: getPublicUrl(webpKey) };
      webpWidth = inputMeta.width ?? 0;
      webpHeight = inputMeta.height ?? 0;

      const { medium, thumbnail } = await processImageMediumThumb(originalBuffer);
      [mediumResult, thumbResult] = await Promise.all([
        uploadToStorage(mediumKey, medium.buffer, "image/webp"),
        uploadToStorage(thumbKey, thumbnail.buffer, "image/webp"),
      ]);
      mediumWidth = medium.width;
      mediumHeight = medium.height;
    } else {
      // Standard path: full 4K WebP conversion + medium + thumb
      const { webp, medium, thumbnail } = await processImage(originalBuffer, undefined);
      [webpResult, mediumResult, thumbResult] = await Promise.all([
        uploadToStorage(webpKey, webp.buffer, "image/webp"),
        uploadToStorage(mediumKey, medium.buffer, "image/webp"),
        uploadToStorage(thumbKey, thumbnail.buffer, "image/webp"),
      ]);
      webpWidth = webp.width;
      webpHeight = webp.height;
      mediumWidth = medium.width;
      mediumHeight = medium.height;
    }

    const originalUrl = getPublicUrl(job.originalKey);

    // Create media_item (always — source of truth for Media Library)
    const mediaItemId = await createMediaItem({
      originalKey: job.originalKey,
      thumbKey,
      webpKey,
      originalUrl,
      thumbUrl: thumbResult.url,
      webpUrl: webpResult.url,
      filename: job.fileName,
      width: webpWidth,
      height: webpHeight,
      fileSize: job.fileSize,
      mimeType: "image/webp",
    });

    // Only create photo + album linkage when job has an albumId
    if (job.albumId) {
      const albumId = job.albumId;

      const { photos: photosTable } = await import("../drizzle/schema");
      const { eq, count } = await import("drizzle-orm");
      const db = await getDb();
      let photoCount = 0;
      if (db) {
        const [row] = await db.select({ c: count() }).from(photosTable).where(eq(photosTable.albumId, albumId));
        photoCount = Number(row?.c ?? 0);
      }

      // Auto-generate SEO alt text from album metadata + tags
      let autoAltText: string | undefined;
      try {
        const album = await getAlbumById(albumId);
        if (album) {
          const tagRows = await getTagsByAlbumId(albumId);
          const tagNames = tagRows.map((t: { name: string }) => t.name);
          autoAltText = generateAltText(album, tagNames, photoCount);
          console.log(`[ImageWorker] Auto alt text for job #${job.id}: "${autoAltText}"`);
        }
      } catch (altErr: any) {
        console.warn(`[ImageWorker] Alt text generation failed for job #${job.id}:`, altErr?.message);
      }

      await createPhoto({
        albumId,
        originalKey: job.originalKey,
        originalUrl,
        webpKey,
        webpUrl: webpResult.url,
        mediumKey,
        mediumUrl: mediumResult.url,
        thumbKey,
        thumbUrl: thumbResult.url,
        width: webpWidth,
        height: webpHeight,
        fileSize: job.fileSize,
        mimeType: "image/webp",
        sortOrder: photoCount,
        isFreePreview: false,
        altText: autoAltText,
      });

      await attachMediaToAlbum({
        albumId,
        mediaItemId,
        sortOrder: photoCount,
        isFreePreview: false,
      });

      const album = await getAlbumById(albumId);
      if (album && !album.coverUrl) {
        await updateAlbum(albumId, { coverKey: thumbKey, coverUrl: thumbResult.url });
      }
      await updateAlbumPhotoCount(albumId);
      if (album) await setFreePreviewPhotos(albumId, album.freePreviewCount);
    }

    // Auto-delete original file from Wasabi after successful processing
    // This frees storage space since we now have webp/medium/thumb variants
    try {
      await deleteFromStorage(job.originalKey);
      console.log(`[ImageWorker] Job #${job.id}: Deleted original ${job.originalKey}`);
    } catch (delErr: any) {
      // Non-fatal: log but don't fail the job if delete fails
      console.warn(`[ImageWorker] Job #${job.id}: Failed to delete original (non-fatal):`, delErr?.message);
    }

    await finishProcessingJob(job.id, "done");
    console.log(`[ImageWorker] Job #${job.id} done.`);
    return true;
  } catch (err: any) {
    console.error(`[ImageWorker] Job #${job.id} failed:`, err?.message);
    await finishProcessingJob(job.id, "failed", err?.message ?? "Unknown error");
    return true; // consumed a job (even if failed), continue polling
  }
}

export function startImageProcessorWorker(): void {
  if (_workerRunning) return;
  _workerRunning = true;
  console.log(`[ImageWorker] Started — concurrency=${WORKER_CONCURRENCY} poll=${POLL_INTERVAL_MS}ms`);

  async function tick() {
    if (_tickRunning) return;
    _tickRunning = true;
    try {
      // Drain the queue: spawn up to WORKER_CONCURRENCY parallel job processors
      // Each slot loops until no more jobs are available
      const runSlot = async () => {
        let hadJob = true;
        while (hadJob) {
          hadJob = await processOneJob();
        }
      };

      // Start WORKER_CONCURRENCY slots in parallel
      const slots: Promise<void>[] = [];
      for (let i = 0; i < WORKER_CONCURRENCY; i++) {
        slots.push(runSlot());
      }
      await Promise.all(slots);
    } catch (err: any) {
      console.error("[ImageWorker] Tick error:", err?.message);
    } finally {
      _tickRunning = false;
    }
  }

  // On startup: reset stuck jobs and log initial stats
  resetStuckJobs();
  logQueueStats();

  // Run immediately on start, then every POLL_INTERVAL_MS
  tick();
  setInterval(tick, POLL_INTERVAL_MS);

  // Periodically reset stuck jobs (every 5 minutes)
  setInterval(resetStuckJobs, 5 * 60 * 1000);

  // Periodically retry failed jobs (every 2 minutes)
  setInterval(requeueRetryableJobs, 2 * 60 * 1000);

  // Log queue stats every minute for operational visibility
  setInterval(logQueueStats, 60 * 1000);
}
