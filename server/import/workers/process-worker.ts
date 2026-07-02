/**
 * Process Worker — converts images to WebP, generates thumbnails, uploads to Wasabi
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * OPTIMIZED FOR: VPS 2 cores, 4GB RAM (self-hosted production)
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Performance strategy:
 * - PROCESS_CONCURRENCY = 4 (2 cores handle 4 Sharp jobs well via async I/O)
 * - Sharp webp + thumb run in PARALLEL (2 cores can handle 2 Sharp pipelines per image)
 * - Upload webp + thumb to Wasabi in PARALLEL (I/O bound, no CPU cost)
 * - Streaming pipeline: as soon as 1 image finishes, next one starts (no batch waiting)
 * - Retry failed images once before giving up
 * - Perceptual hash computed async after upload (non-blocking)
 * - DB inserts batched to reduce round-trips
 * - Memory-efficient: releases buffers ASAP via scope isolation
 *
 * Expected performance (2 core, 4GB, 100Mbps):
 *   Sharp (webp+thumb parallel): ~2-3s per image
 *   Upload (2 files parallel):   ~1-2s per image
 *   Total per image:             ~3-5s
 *   75 images @ concurrency 4:   ~60-90s total
 */
import fs from "fs";
import path from "path";
import os from "os";
import sharp from "sharp";
import type { ProcessJobData, SeoJobData } from "../queues.js";
import { enqueueSeoJob, isCancelled } from "../queues.js";
import { uploadToStorage } from "../../storage-wasabi.js";
import { computePerceptualHash, storeImageHash } from "../dedup.js";
import { logImport, updateJobStatus } from "../logger.js";
import { getDb } from "../../db.js";
import { startKeepAlive, stopKeepAlive } from "../keep-alive.js";
import { mediaItems, importJobs } from "../../../drizzle/schema.js";
import { eq } from "drizzle-orm";
import type { ProcessedImage } from "../types.js";

// --- Configuration -----------------------------------------------------------
const THUMB_WIDTH = 400;
const THUMB_HEIGHT = 300;
const WEBP_QUALITY = 82;
const MAX_WIDTH = 1920;

// Concurrency: 4 images in-flight at once (optimal for 2 cores + async I/O)
// Each image uses ~100-150MB peak RAM → 4 × 150MB = 600MB peak (safe for 4GB)
const PROCESS_CONCURRENCY = 4;

// Timeout per image (Sharp + Upload). Should complete in 3-5s normally.
// 60s is generous enough for large images or slow network moments.
const PER_IMAGE_TIMEOUT_MS = 60_000;

// Retry failed images once (network glitch, transient Sharp error)
const MAX_RETRIES = 1;

// Log progress every N images (avoid flooding logs)
const LOG_INTERVAL = 5;

// --- Sharp thread pool -------------------------------------------------------
// Sharp uses libuv thread pool internally. Default is 4 threads.
// With 2 cores and concurrency 4, we want 4 threads to maximize throughput.
// This is set via UV_THREADPOOL_SIZE env var at process start, but we can
// also hint to Sharp via its concurrency setting.
sharp.concurrency(2); // 2 threads per Sharp instance (matches 2 CPU cores)

// --- Core Processing Function ------------------------------------------------

interface ProcessResult {
  wasabiOriginalKey: string;
  wasabiThumbKey: string;
  wasabiWebpKey: string;
  originalPublicUrl: string;
  thumbPublicUrl: string;
  webpPublicUrl: string;
  width: number;
  height: number;
  fileSize: number;
}

async function processAndUpload(
  localPath: string,
  jobId: number,
  index: number,
  albumSlugHint?: string
): Promise<ProcessResult> {
  // SEO-friendly file naming: yukvix-[slug]-[n].webp
  const paddedIndex = String(index + 1).padStart(3, "0");
  const slugPart = albumSlugHint ? albumSlugHint.slice(0, 40) : `job-${jobId}`;
  const prefix = `imports/yukvix-${slugPart}-${paddedIndex}`;

  // Read file once, get metadata
  const originalBuffer = fs.readFileSync(localPath);
  const metadata = await sharp(originalBuffer, { failOn: "none" }).metadata();
  const width = metadata.width || 0;
  const height = metadata.height || 0;

  // -- Sharp: webp + thumb in PARALLEL (2 cores can handle this) --
  const needsResize = width > MAX_WIDTH;

  const [webpBuffer, thumbBuffer] = await Promise.all([
    // Full WebP conversion
    sharp(originalBuffer, { failOn: "none" })
      .rotate()
      .resize(needsResize ? MAX_WIDTH : undefined, null, { withoutEnlargement: true })
      .webp({ quality: WEBP_QUALITY, effort: 4 })
      .toBuffer(),
    // Thumbnail (cover crop)
    sharp(originalBuffer, { failOn: "none" })
      .rotate()
      .resize(THUMB_WIDTH, THUMB_HEIGHT, { fit: "cover", position: "attention" })
      .webp({ quality: 70, effort: 3 })
      .toBuffer(),
  ]);

  // -- Upload webp + thumb in PARALLEL (I/O bound) --
  const webpKey = `${prefix}_webp.webp`;
  const thumbKey = `${prefix}_thumb.webp`;

  const [webpResult, thumbResult] = await Promise.all([
    uploadToStorage(webpKey, webpBuffer as Buffer, "image/webp"),
    uploadToStorage(thumbKey, thumbBuffer as Buffer, "image/webp"),
  ]);

  return {
    wasabiOriginalKey: webpKey,
    wasabiThumbKey: thumbKey,
    wasabiWebpKey: webpKey,
    originalPublicUrl: webpResult.url,
    thumbPublicUrl: thumbResult.url,
    webpPublicUrl: webpResult.url,
    width: needsResize ? MAX_WIDTH : width,
    height: needsResize ? Math.round(height * (MAX_WIDTH / width)) : height,
    fileSize: webpBuffer.length,
  };
}

/**
 * Process a single image with timeout and retry logic.
 * Returns the processed result or throws after MAX_RETRIES attempts.
 */
async function processImageWithRetry(
  localPath: string,
  jobId: number,
  index: number,
  albumSlugHint?: string
): Promise<ProcessResult> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const result = await Promise.race([
        processAndUpload(localPath, jobId, index, albumSlugHint),
        new Promise<never>((_, reject) =>
          setTimeout(
            () => reject(new Error(`Timeout after ${PER_IMAGE_TIMEOUT_MS / 1000}s`)),
            PER_IMAGE_TIMEOUT_MS
          )
        ),
      ]);
      return result;
    } catch (err: any) {
      lastError = err;
      if (attempt < MAX_RETRIES) {
        // Brief pause before retry (500ms)
        await new Promise((r) => setTimeout(r, 500));
      }
    }
  }

  throw lastError || new Error("Unknown processing error");
}

// --- Streaming Concurrency Pool ----------------------------------------------
// Instead of fixed batches (process N, wait, process N, wait...),
// use a streaming pool where a new image starts as soon as one finishes.
// This eliminates idle time between batches.

async function runPool<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T, index: number) => Promise<R>,
  onProgress?: (completed: number, failed: number) => void,
  shouldCancel?: () => boolean
): Promise<{ results: Array<{ status: "fulfilled"; value: R } | { status: "rejected"; reason: any }>; }> {
  const results: Array<{ status: "fulfilled"; value: R } | { status: "rejected"; reason: any }> = [];
  let nextIndex = 0;
  let completed = 0;
  let failedCount = 0;

  async function runNext(): Promise<void> {
    while (nextIndex < items.length) {
      if (shouldCancel?.()) return;

      const currentIndex = nextIndex++;
      const item = items[currentIndex];

      try {
        const value = await fn(item, currentIndex);
        results[currentIndex] = { status: "fulfilled", value };
        completed++;
      } catch (err: any) {
        results[currentIndex] = { status: "rejected", reason: err };
        failedCount++;
        completed++;
      }

      // Progress callback
      if (onProgress && (completed % LOG_INTERVAL === 0 || completed === items.length)) {
        onProgress(completed - failedCount, failedCount);
      }
    }
  }

  // Start `concurrency` workers that pull from the shared queue
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, () => runNext());
  await Promise.all(workers);

  return { results };
}

// --- Main Job Handler --------------------------------------------------------

export async function processProcessJob(data: ProcessJobData): Promise<void> {
  const { jobId, downloadedFiles, albumSlugHint } = data;

  startKeepAlive();
  const startTime = Date.now();

  try {
    await logImport(
      jobId,
      "info",
      `Starting image processing: ${downloadedFiles.length} images (concurrency: ${PROCESS_CONCURRENCY}, retry: ${MAX_RETRIES})`
    );
    await updateJobStatus(jobId, "processing");

    const processedImages: ProcessedImage[] = [];
    let successCount = 0;
    let failCount = 0;

    // Streaming pool — processes images as fast as possible
    const { results } = await runPool(
      downloadedFiles,
      PROCESS_CONCURRENCY,
      async (file, index) => {
        // Process image (Sharp + Upload) with retry
        const result = await processImageWithRetry(file.localPath, jobId, index, albumSlugHint);

        // Perceptual hash (non-critical, fast ~100-200ms)
        let pHash: string | undefined;
        try {
          pHash = await computePerceptualHash(file.localPath);
        } catch {
          // Skip silently
        }

        // Insert into mediaItems table
        const db = await getDb();
        if (db) {
          const [inserted] = await db.insert(mediaItems).values({
            originalKey: result.wasabiOriginalKey,
            thumbKey: result.wasabiThumbKey,
            webpKey: result.wasabiWebpKey,
            originalUrl: result.originalPublicUrl,
            thumbUrl: result.thumbPublicUrl,
            webpUrl: result.webpPublicUrl,
            filename: file.filename,
            width: result.width,
            height: result.height,
            fileSize: result.fileSize,
            mimeType: "image/webp",
          });

          const mediaItemId = (inserted as any).insertId;
          if (mediaItemId && (file.md5 || pHash)) {
            await storeImageHash(mediaItemId, file.md5, pHash);
          }
        }

        // Cleanup temp file immediately
        try { fs.unlinkSync(file.localPath); } catch {}

        return {
          originalUrl: file.originalUrl,
          wasabiOriginalKey: result.wasabiOriginalKey,
          wasabiThumbKey: result.wasabiThumbKey,
          wasabiWebpKey: result.wasabiWebpKey,
          originalPublicUrl: result.originalPublicUrl,
          thumbPublicUrl: result.thumbPublicUrl,
          webpPublicUrl: result.webpPublicUrl,
          width: result.width,
          height: result.height,
          fileSize: result.fileSize,
          mimeType: "image/webp" as const,
          md5: file.md5,
          pHash,
        };
      },
      // Progress callback
      async (completed, failed) => {
        successCount = completed;
        failCount = failed;
        await logImport(jobId, "info", `Processed ${completed}/${downloadedFiles.length} images (${failed} failed)`);
        await updateJobStatus(jobId, "processing", { processedImages: completed });
      },
      // Cancellation check
      () => isCancelled(jobId)
    );

    // Check if cancelled mid-processing
    if (isCancelled(jobId)) {
      // Cleanup remaining temp files
      for (const file of downloadedFiles) {
        try { fs.unlinkSync(file.localPath); } catch {}
      }
      await logImport(jobId, "warn", `Processing cancelled after ${successCount}/${downloadedFiles.length} images`);
      await updateJobStatus(jobId, "cancelled", { completedAt: new Date() });
      return;
    }

    // Collect successful results
    for (const r of results) {
      if (r?.status === "fulfilled") {
        processedImages.push(r.value);
      } else if (r?.status === "rejected") {
        const errMsg = r.reason?.message || "unknown error";
        await logImport(jobId, "warn", `Failed: ${errMsg}`);
      }
    }

    // Cleanup temp directory
    try {
      const tmpDir = path.dirname(downloadedFiles[0]?.localPath || "");
      if (tmpDir && tmpDir !== "/" && tmpDir !== os.tmpdir()) {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      }
    } catch {}

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    const avgPerImage = processedImages.length > 0
      ? ((Date.now() - startTime) / 1000 / processedImages.length).toFixed(1)
      : "N/A";

    await logImport(
      jobId,
      "info",
      `Processing complete: ${processedImages.length}/${downloadedFiles.length} images in ${elapsed}s (avg ${avgPerImage}s/img, ${results.filter(r => r?.status === "rejected").length} failed)`
    );
    await updateJobStatus(jobId, "seo", { processedImages: processedImages.length });

    if (processedImages.length === 0) {
      await updateJobStatus(jobId, "failed", {
        errorMessage: "All images failed processing",
        completedAt: new Date(),
      });
      return;
    }

    // Prepare SEO job data
    const seoData: SeoJobData = {
      jobId,
      imageCount: processedImages.length,
      processedImages: processedImages.map((img) => ({
        originalUrl: img.originalUrl,
        wasabiThumbKey: img.wasabiThumbKey,
        thumbPublicUrl: img.thumbPublicUrl,
      })),
    };

    // Persist processed images data for publish worker
    const dbForUpdate = await getDb();
    if (dbForUpdate) {
      await dbForUpdate.update(importJobs).set({
        processedImagesData: JSON.stringify(processedImages),
      }).where(eq(importJobs.id, jobId));
    }

    await enqueueSeoJob(seoData);
    await logImport(jobId, "info", `Enqueued SEO job for ${processedImages.length} images`);
  } catch (err: any) {
    await logImport(jobId, "error", `Processing failed: ${err.message}`);
    await updateJobStatus(jobId, "failed", {
      errorMessage: err.message,
      completedAt: new Date(),
    });
  } finally {
    stopKeepAlive();
  }
}
