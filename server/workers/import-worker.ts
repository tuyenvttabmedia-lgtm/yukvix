/**
 * ZIP Import Worker (Simplified)
 * Processes plain ZIP archives (no password, files already named correctly).
 *
 * Pipeline:
 * 1. Download ZIP from Wasabi staging
 * 2. Validate archive (7z list + test)
 * 3. Extract archive
 * 4. Validate images (recursive scan)
 * 5. Generate VIP ZIP from originals
 * 6. Process web images (WebP 4K + medium + thumb)
 * 7. Upload to Wasabi
 * 8. DB insert (with rollback on failure)
 * 9. Cleanup temp files
 */

import sharp from "sharp";
import fs from "fs/promises";
import path from "path";
import { getDb } from "../db";
import {
  zipImportJobs,
  albums,
  photos,
  mediaItems,
  albumMediaItems,
} from "../../drizzle/schema";
import { eq, sql } from "drizzle-orm";
import {
  validateArchive,
  extractArchive,
} from "../services/archive-validator";
import { validateImages, ValidatedImage } from "../services/image-validator";
import {
  updateCreatorAvatarIfEmpty,
  incrementCreatorAlbumCount,
} from "../services/creator-service";
import {
  uploadToStorage,
  deleteFromStorage,
  getPublicUrl,
  getS3ClientForProcessing,
} from "../storage-wasabi";
import { GetObjectCommand, CopyObjectCommand } from "@aws-sdk/client-s3";
import { createRequire } from "module";
const require = createRequire(import.meta.url);
// eslint-disable-next-line @typescript-eslint/no-require-imports
const archiverLib = require("archiver") as { ZipArchive: new (opts?: object) => import("archiver").Archiver };
import { createWriteStream } from "fs";
import os from "os";

const CONCURRENCY = parseInt(process.env.IMPORT_CONCURRENCY || "2");
const BATCH_SIZE = parseInt(process.env.IMPORT_BATCH_SIZE || "5");

// Sharp concurrency semaphore
let _sharpActive = 0;
const _sharpWaiters: Array<() => void> = [];
const MAX_SHARP_CONCURRENT = parseInt(process.env.IMPORT_SHARP_CONCURRENT || "1");

function acquireSharpSlot(): Promise<void> {
  return new Promise((resolve) => {
    if (_sharpActive < MAX_SHARP_CONCURRENT) {
      _sharpActive++;
      resolve();
    } else {
      _sharpWaiters.push(() => {
        _sharpActive++;
        resolve();
      });
    }
  });
}

function releaseSharpSlot(): void {
  _sharpActive = Math.max(0, _sharpActive - 1);
  const next = _sharpWaiters.shift();
  if (next) next();
}

interface ImportJobData {
  jobId: number;
  albumId: number;
  albumSlug: string;
  albumTitle: string;
  sourceArchiveKey: string;
  sourceArchiveOriginalName: string;
  archivePasswordIndex: number; // kept for API compat, always 0
}

/**
 * Process a single import job.
 * Called by the scheduler when a job is in 'waiting' status.
 */
export async function processImportJob(data: ImportJobData): Promise<void> {
  const {
    jobId,
    albumId,
    albumSlug,
    albumTitle,
    sourceArchiveKey,
    sourceArchiveOriginalName,
  } = data;

  const db = await getDb();
  if (!db) throw new Error("DB not available");

  const tempBase = process.env.IMPORT_TEMP_PATH || path.join(os.tmpdir(), "zip-import");
  const tempDir = path.join(tempBase, `job-${jobId}-extract`);
  const processedDir = path.join(tempBase, `job-${jobId}-processed`);
  const uploadedKeys: string[] = [];
  let localArchivePath: string | null = null;

  const log = async (msg: string) => {
    console.log(`[ImportWorker][Job ${jobId}] ${msg}`);
    try {
      const current = await db
        .select({ importLogs: zipImportJobs.importLogs })
        .from(zipImportJobs)
        .where(eq(zipImportJobs.id, jobId))
        .limit(1);
      const logs: string[] = current[0]?.importLogs
        ? JSON.parse(current[0].importLogs)
        : [];
      logs.push(`[${new Date().toISOString()}] ${msg}`);
      await db
        .update(zipImportJobs)
        .set({ importLogs: JSON.stringify(logs), updatedAt: new Date() })
        .where(eq(zipImportJobs.id, jobId));
    } catch {
      // Non-fatal log failure
    }
  };

  const logFailed = async (filePath: string, reason: string) => {
    try {
      const current = await db
        .select({ failedImageList: zipImportJobs.failedImageList })
        .from(zipImportJobs)
        .where(eq(zipImportJobs.id, jobId))
        .limit(1);
      const list: Array<{ file: string; reason: string }> = current[0]?.failedImageList
        ? JSON.parse(current[0].failedImageList)
        : [];
      list.push({ file: path.basename(filePath), reason });
      await db
        .update(zipImportJobs)
        .set({
          failedImageList: JSON.stringify(list),
          failedImages: sql`${zipImportJobs.failedImages} + 1`,
          updatedAt: new Date(),
        })
        .where(eq(zipImportJobs.id, jobId));
    } catch {
      // Non-fatal
    }
  };

  try {
    // Step 0: Create output directories
    await fs.mkdir(tempDir, { recursive: true });
    for (const v of ["webp", "medium", "thumb"]) {
      await fs.mkdir(path.join(processedDir, v), { recursive: true });
    }

    // Step 1: Download source archive from Wasabi staging
    await db
      .update(zipImportJobs)
      .set({ status: "processing", startedAt: new Date(), updatedAt: new Date() })
      .where(eq(zipImportJobs.id, jobId));

    localArchivePath = path.join(tempDir, sourceArchiveOriginalName);
    await log(`Downloading archive from Wasabi: ${sourceArchiveKey}`);
    await downloadFromWasabi(sourceArchiveKey, localArchivePath);
    await log(`Archive downloaded: ${(await fs.stat(localArchivePath)).size} bytes`);

    // Step 1b: Validate archive
    await log("Validating archive...");
    const validation = await validateArchive(localArchivePath, {
      maxUploadSize: parseInt(
        process.env.IMPORT_MAX_UPLOAD_SIZE_BYTES || String(4 * 1024 * 1024 * 1024)
      ),
      maxExtractedSize: parseInt(
        process.env.IMPORT_MAX_EXTRACTED_SIZE_BYTES || String(20 * 1024 * 1024 * 1024)
      ),
      maxFileCount: parseInt(process.env.IMPORT_MAX_FILE_COUNT || "2000"),
      allowedTypes: ["jpg", "jpeg", "png", "webp"],
    });
    await log(
      `Archive validated: ${validation.validImages} images, ${validation.totalFiles} total files`
    );

    // Step 1c: Extract
    await log("Extracting archive...");
    await extractArchive(localArchivePath, tempDir, null);
    await log("Archive extracted");

    // Step 2: Validate images (recursive scan)
    await log("Scanning for valid images...");
    const { validImages, invalidImages } = await validateImages(tempDir);
    for (const inv of invalidImages) {
      await logFailed(inv.path, inv.reason);
    }
    if (validImages.length === 0) throw new Error("No valid images found in archive");
    await log(`Found ${validImages.length} valid images (${invalidImages.length} skipped)`);

    await db
      .update(zipImportJobs)
      .set({ totalImages: validImages.length, updatedAt: new Date() })
      .where(eq(zipImportJobs.id, jobId));

    // Step 4: Generate VIP ZIP from cleaned originals
    await db
      .update(zipImportJobs)
      .set({ vipZipStatus: "generating", updatedAt: new Date() })
      .where(eq(zipImportJobs.id, jobId));
    await log("Generating VIP ZIP...");

    try {
      const vipResult = await generateVipZip(jobId, albumSlug, albumTitle, tempDir, validImages);
      await db
        .update(zipImportJobs)
        .set({
          vipZipStatus: "ready",
          vipZipKey: vipResult.key,
          vipZipSize: vipResult.size,
          vipZipGeneratedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(zipImportJobs.id, jobId));
      await log(`VIP ZIP ready: ${vipResult.key} (${(vipResult.size / 1024 / 1024).toFixed(1)}MB)`);
    } catch (zipErr) {
      // Non-fatal: import continues even if VIP ZIP fails
      await db
        .update(zipImportJobs)
        .set({ vipZipStatus: "failed", updatedAt: new Date() })
        .where(eq(zipImportJobs.id, jobId));
      await log(`VIP ZIP failed (non-fatal): ${(zipErr as Error).message}`);
    }

    // Step 5: Process web images (sequential per image, batch BATCH_SIZE, concurrency CONCURRENCY)
    await log(`Processing ${validImages.length} images (batch=${BATCH_SIZE}, concurrency=${CONCURRENCY})...`);
    const allProcessed: Array<{
      webpKey: string;
      mediumKey: string;
      thumbKey: string;
      filename: string;
      sortOrder: number;
    }> = [];
    let counter = 1;

    for (let i = 0; i < validImages.length; i += BATCH_SIZE) {
      // Check cancellation
      const jobRow = await db
        .select({ cancelRequested: zipImportJobs.cancelRequested })
        .from(zipImportJobs)
        .where(eq(zipImportJobs.id, jobId))
        .limit(1);
      if (jobRow[0]?.cancelRequested) {
        await log("Cancellation requested — stopping");
        break;
      }

      const batch = validImages.slice(i, i + BATCH_SIZE);
      const batchResults = await processBatch(
        batch,
        processedDir,
        albumSlug,
        counter,
        CONCURRENCY
      );

      for (const r of batchResults.successes) {
        allProcessed.push(r);
      }
      for (const f of batchResults.failures) {
        await logFailed(f.file, f.reason);
      }
      counter += batch.length;

      const progress = Math.round(((i + batch.length) / validImages.length) * 100);
      await db
        .update(zipImportJobs)
        .set({ progress, processedImages: allProcessed.length, updatedAt: new Date() })
        .where(eq(zipImportJobs.id, jobId));
    }

    if (allProcessed.length === 0) throw new Error("All images failed processing");
    await log(`Processed ${allProcessed.length} images`);

    // Step 6: Upload web images to Wasabi
    await log("Uploading web images to Wasabi...");
    for (const variant of ["webp", "medium", "thumb"]) {
      const variantDir = path.join(processedDir, variant);
      let files: string[];
      try {
        files = await fs.readdir(variantDir);
      } catch {
        continue;
      }

      for (const file of files) {
        const filePath = path.join(variantDir, file);
        const s3Key = `albums/${albumSlug}/${variant}/${file}`;
        const buffer = await fs.readFile(filePath);
        await uploadToStorage(s3Key, buffer, "image/webp");
        uploadedKeys.push(s3Key);
      }
    }
    await log(`Uploaded ${uploadedKeys.length} files to Wasabi`);

    // Step 7: DB insert (with rollback on failure)
    try {
      const photoRows = allProcessed.map((p) => ({
        albumId,
        // originalKey is required (NOT NULL) — use webpKey as the canonical key
        // since we don't keep original files after processing
        originalKey: p.webpKey,
        webpKey: p.webpKey,
        webpUrl: getPublicUrl(p.webpKey),
        mediumKey: p.mediumKey,
        mediumUrl: getPublicUrl(p.mediumKey),
        thumbKey: p.thumbKey,
        thumbUrl: getPublicUrl(p.thumbKey),
        sortOrder: p.sortOrder,
        // Store original image dimensions for correct aspect ratio in lightbox
        width: p.width || null,
        height: p.height || null,
      }));

      await db.insert(photos).values(photoRows);

      // Smart cover selection — skip logo/banner/preview/sample files
      const SKIP_COVER_NAMES = /^(logo|banner|preview|sample|thumb|watermark|cover_text)/i;
      const validCoverPhotos = photoRows.filter(
        (p) => !SKIP_COVER_NAMES.test(path.basename(p.filename || ""))
      );
      let coverThumbKey = photoRows[0]?.thumbKey; // absolute fallback
      const explicitCover = photoRows.find((p) =>
        /^cover\./i.test(path.basename(p.filename || ""))
      );
      if (explicitCover) {
        coverThumbKey = explicitCover.thumbKey;
      } else if (validCoverPhotos.length >= 2) {
        coverThumbKey = validCoverPhotos[1].thumbKey; // Second valid image (skip potential logo)
      } else if (validCoverPhotos.length === 1) {
        coverThumbKey = validCoverPhotos[0].thumbKey;
      }

      if (photoRows.length > 0) {
        await db
          .update(albums)
          .set({
            coverKey: coverThumbKey,
            coverUrl: coverThumbKey ? getPublicUrl(coverThumbKey) : null,
            photoCount: photoRows.length,
            updatedAt: new Date(),
          })
          .where(eq(albums.id, albumId));
      }

      // Update creator avatar if empty (use first album cover)
      const albumRow = await db
        .select({ creatorId: albums.creatorId })
        .from(albums)
        .where(eq(albums.id, albumId))
        .limit(1);
      if (albumRow[0]?.creatorId && coverThumbKey) {
        await updateCreatorAvatarIfEmpty(albumRow[0].creatorId, coverThumbKey);
        await incrementCreatorAlbumCount(albumRow[0].creatorId);
      }

      // Sync to mediaItems table so photos appear in Admin Media Library
      // mediaItems uses originalKey, thumbKey, webpKey (no mediumKey)
      const mediaRows = photoRows.map((p) => ({
        originalKey: p.webpKey,   // webpKey is canonical (no original kept)
        thumbKey: p.thumbKey,
        webpKey: p.webpKey,
        originalUrl: p.webpUrl,
        thumbUrl: p.thumbUrl,
        webpUrl: p.webpUrl,
        filename: p.webpKey.split("/").pop() || p.webpKey,
      }));
      const insertedMediaIds: number[] = [];
      for (const mr of mediaRows) {
        try {
          const [result] = await db.insert(mediaItems).values(mr);
          if (result.insertId) insertedMediaIds.push(result.insertId);
        } catch {
          // Duplicate key — mediaItem already exists, skip
        }
      }
      // Link mediaItems to album via album_media_items
      if (insertedMediaIds.length > 0) {
        const amiRows = insertedMediaIds.map((mediaItemId, idx) => ({
          albumId,
          mediaItemId,
          sortOrder: idx,
          isFreePreview: false,
        }));
        await db.insert(albumMediaItems).values(amiRows).catch(() => {});
      }

      await log(`DB insert complete: ${photoRows.length} photos, ${insertedMediaIds.length} mediaItems synced`);
    } catch (dbErr) {
      // Rollback uploads on DB failure
      await log(`DB insert failed — rolling back ${uploadedKeys.length} uploads`);
      for (const key of uploadedKeys) {
        await deleteFromStorage(key).catch(() => {});
      }
      throw new Error(`DB insert failed (rolled back): ${(dbErr as Error).message}`);
    }

    // Step 8: Cleanup all temp files
    await fs.rm(tempDir, { recursive: true }).catch(() => {});
    await fs.rm(processedDir, { recursive: true }).catch(() => {});

    // Delete source archive from Wasabi staging on success
    const deleteSource = process.env.IMPORT_DELETE_SOURCE_AFTER_SUCCESS !== "false";
    if (deleteSource) {
      await deleteFromStorage(sourceArchiveKey).catch(() => {});
      await log("Source archive deleted from staging");
    }

    // Step 9: Update job + album status
    await db
      .update(zipImportJobs)
      .set({
        status: "completed",
        processedImages: allProcessed.length,
        progress: 100,
        completedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(zipImportJobs.id, jobId));

    // Album moves to ready_for_review after successful import
    // Also link VIP ZIP to album (fetch from zip_import_jobs)
    const completedJobRow = await db
      .select({ vipZipKey: zipImportJobs.vipZipKey, vipZipSize: zipImportJobs.vipZipSize })
      .from(zipImportJobs)
      .where(eq(zipImportJobs.id, jobId))
      .limit(1);
    const completedVipZipKey = completedJobRow[0]?.vipZipKey ?? null;
    const completedVipZipSize = completedJobRow[0]?.vipZipSize ?? null;
    await db
      .update(albums)
      .set({
        publishStatus: "ready_for_review",
        ...(completedVipZipKey ? {
          zipKey: completedVipZipKey,
          zipUrl: getPublicUrl(completedVipZipKey),
          zipSize: completedVipZipSize,
          zipGeneratedAt: new Date(),
        } : {}),
        updatedAt: new Date(),
      })
      .where(eq(albums.id, albumId));

    await log(`Import completed: ${allProcessed.length} photos processed`);
  } catch (err) {
    // Rollback uploads on error
    for (const key of uploadedKeys) {
      await deleteFromStorage(key).catch(() => {});
    }
    await fs.rm(tempDir, { recursive: true }).catch(() => {});
    await fs.rm(processedDir, { recursive: true }).catch(() => {});

    // Move source archive to imports/failed/ for admin retry
    if (sourceArchiveKey) {
      const failedKey = sourceArchiveKey.replace("imports/staging/", "imports/failed/");
      try {
        await moveWasabiObject(sourceArchiveKey, failedKey);
        await db
          .update(zipImportJobs)
          .set({ sourceArchiveKey: failedKey, updatedAt: new Date() })
          .where(eq(zipImportJobs.id, jobId));
      } catch {
        // Non-fatal
      }
    }

    await db
      .update(zipImportJobs)
      .set({ status: "failed", updatedAt: new Date() })
      .where(eq(zipImportJobs.id, jobId));

    // Reset album status to draft on failure
    await db
      .update(albums)
      .set({ publishStatus: "draft", updatedAt: new Date() })
      .where(eq(albums.id, albumId));

    console.error(`[ImportWorker][Job ${jobId}] FAILED: ${(err as Error).message}`);
    throw err;
  }
}

// ─── Image Processing ─────────────────────────────────────────────────────────



interface BatchResult {
  successes: ProcessedImage[];
  failures: Array<{ file: string; reason: string }>;
}

async function processBatch(
  files: ValidatedImage[],
  processedDir: string,
  albumSlug: string,
  startCounter: number,
  concurrency: number
): Promise<BatchResult> {
  const successes: ProcessedImage[] = [];
  const failures: Array<{ file: string; reason: string }> = [];

  // Process in chunks of `concurrency`
  for (let i = 0; i < files.length; i += concurrency) {
    const chunk = files.slice(i, i + concurrency);
    const results = await Promise.allSettled(
      chunk.map((img, idx) =>
        processSingleImage(img.path, processedDir, albumSlug, startCounter + i + idx)
      )
    );

    for (let j = 0; j < results.length; j++) {
      const r = results[j];
      if (r.status === "fulfilled") {
        successes.push(r.value);
      } else {
        const reason = r.reason?.message || String(r.reason) || "Unknown error";
        console.error(`[ImportWorker] Image failed: ${chunk[j].filename} — ${reason}`, r.reason?.stack?.split('\n')[1] || '');
        failures.push({ file: chunk[j].path, reason });
      }
    }
  }

  return { successes, failures };
}

interface ProcessedImage {
  webpKey: string;
  mediumKey: string;
  thumbKey: string;
  filename: string;
  sortOrder: number;
  width?: number;
  height?: number;
}

async function processSingleImage(
  filePath: string,
  processedDir: string,
  albumSlug: string,
  sortOrder: number
): Promise<ProcessedImage> {
  await acquireSharpSlot();
  try {
    const ext = path.extname(filePath).toLowerCase();
    const baseName = path.basename(filePath, ext);
    const paddedNum = String(sortOrder).padStart(4, "0");
    const outputName = `${albumSlug}-${paddedNum}`;

    // Get original image dimensions from source file
    const metadata = await sharp(filePath).metadata();
    const origWidth = metadata.width || 0;
    const origHeight = metadata.height || 0;

    // WebP 4K (max 3840px wide, quality 85)
    const webpPath = path.join(processedDir, "webp", `${outputName}.webp`);
    await sharp(filePath)
      .resize({ width: 3840, withoutEnlargement: true })
      .webp({ quality: 85 })
      .toFile(webpPath);

    // Medium WebP (max 1200px wide, quality 80)
    const mediumPath = path.join(processedDir, "medium", `${outputName}.webp`);
    await sharp(filePath)
      .resize({ width: 1200, withoutEnlargement: true })
      .webp({ quality: 80 })
      .toFile(mediumPath);

    // Thumb WebP (max 400px wide, quality 75)
    const thumbPath = path.join(processedDir, "thumb", `${outputName}.webp`);
    await sharp(filePath)
      .resize({ width: 400, withoutEnlargement: true })
      .webp({ quality: 75 })
      .toFile(thumbPath);

    return {
      webpKey: `albums/${albumSlug}/webp/${outputName}.webp`,
      mediumKey: `albums/${albumSlug}/medium/${outputName}.webp`,
      thumbKey: `albums/${albumSlug}/thumb/${outputName}.webp`,
      filename: `${outputName}.webp`,
      sortOrder,
      width: origWidth,
      height: origHeight,
    };
  } finally {
    releaseSharpSlot();
  }
}

// ─── VIP ZIP Generator ────────────────────────────────────────────────────────

async function generateVipZip(
  jobId: number,
  albumSlug: string,
  albumTitle: string,
  extractedDir: string,
  imageFiles: ValidatedImage[]
): Promise<{ key: string; size: number }> {
  const tempBase = process.env.IMPORT_TEMP_PATH || path.join(os.tmpdir(), "zip-import");
  const zipPath = path.join(tempBase, `vip-${jobId}-${albumSlug}.zip`);

  await new Promise<void>((resolve, reject) => {
    const output = createWriteStream(zipPath);
    const archive = new archiverLib.ZipArchive({ zlib: { level: 6 } });

    output.on("close", resolve);
    archive.on("error", reject);
    archive.pipe(output);

    // Add metadata.json
    const metadata = {
      albumTitle,
      albumSlug,
      generatedAt: new Date().toISOString(),
      imageCount: imageFiles.length,
      source: "Yukvix.com",
    };
    archive.append(JSON.stringify(metadata, null, 2), { name: "metadata.json" });

    // Add all original images
    for (const img of imageFiles) {
      archive.file(img.path, { name: img.filename });
    }

    archive.finalize();
  });

  const stats = await fs.stat(zipPath);
  const buffer = await fs.readFile(zipPath);
  const vipKey = `vip-zips/${albumSlug}/VIP_${albumSlug}.zip`;
  await uploadToStorage(vipKey, buffer, "application/zip");
  await fs.rm(zipPath).catch(() => {});

  return { key: vipKey, size: stats.size };
}

// ─── Wasabi Helpers ───────────────────────────────────────────────────────────

async function downloadFromWasabi(key: string, destPath: string): Promise<void> {
  const s3 = getS3ClientForProcessing();
  const bucket = process.env.WASABI_BUCKET || "";
  const cmd = new GetObjectCommand({ Bucket: bucket, Key: key });
  const response = await s3.send(cmd);
  if (!response.Body) throw new Error(`Empty response body for key: ${key}`);

  const chunks: Buffer[] = [];
  for await (const chunk of response.Body as AsyncIterable<Uint8Array>) {
    chunks.push(Buffer.from(chunk));
  }
  await fs.writeFile(destPath, Buffer.concat(chunks));
}

async function moveWasabiObject(sourceKey: string, destKey: string): Promise<void> {
  const s3 = getS3ClientForProcessing();
  const bucket = process.env.WASABI_BUCKET || "";

  await s3.send(
    new CopyObjectCommand({
      Bucket: bucket,
      CopySource: `${bucket}/${sourceKey}`,
      Key: destKey,
    })
  );
  await deleteFromStorage(sourceKey);
}
