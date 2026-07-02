/**
 * Download Worker — downloads images in parallel, strips metadata, computes MD5
 * Optimized: parallel downloads (10 concurrent) with per-image timeout
 */
import fs from "fs";
import path from "path";
import os from "os";
import type { DownloadJobData, ProcessJobData } from "../queues.js";
import { enqueueProcessJob, isCancelled } from "../queues.js";
import { isImageAlreadyImported, md5File } from "../dedup.js";
import { logImport, updateJobStatus } from "../logger.js";
import { startKeepAlive, stopKeepAlive } from "../keep-alive.js";

const DEFAULT_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";
const DOWNLOAD_CONCURRENCY = 10; // Download 10 images simultaneously
const PER_DOWNLOAD_TIMEOUT_MS = 60_000; // 60s per image

async function downloadImage(
  url: string,
  destPath: string,
  referer: string,
  userAgent?: string
): Promise<{ mimeType: string; fileSize: number }> {
  const gotModule = await import("got");
  const got = gotModule.default;

  const response = await got(url, {
    responseType: "buffer",
    headers: {
      "User-Agent": userAgent || DEFAULT_UA,
      Referer: referer,
      Accept: "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
    },
    timeout: { request: PER_DOWNLOAD_TIMEOUT_MS },
    retry: { limit: 3, methods: ["GET"], statusCodes: [429, 500, 502, 503, 504] },
    followRedirect: true,
  });

  const buffer = response.body as Buffer;
  fs.writeFileSync(destPath, buffer);

  const mimeType = (response.headers["content-type"] || "image/jpeg").split(";")[0].trim();
  return { mimeType, fileSize: buffer.length };
}

function sanitizeFilename(url: string, index: number): string {
  try {
    const urlPath = new URL(url).pathname;
    const ext = path.extname(urlPath) || ".jpg";
    const base = path.basename(urlPath, ext).replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 50);
    return `img_${String(index).padStart(4, "0")}_${base}${ext}`;
  } catch {
    return `img_${String(index).padStart(4, "0")}.jpg`;
  }
}

function isImageMimeType(mimeType: string): boolean {
  return mimeType.startsWith("image/") && !mimeType.includes("svg");
}

function isImageUrl(url: string): boolean {
  const lower = url.toLowerCase();
  if (lower.includes(".svg") || lower.includes(".gif") || lower.includes("data:")) return false;
  const imgExts = [".jpg", ".jpeg", ".png", ".webp", ".avif", ".bmp", ".tiff"];
  const hasImgExt = imgExts.some((ext) => lower.includes(ext));
  const hasNoExt = !lower.match(/\.[a-z]{2,5}(\?|$)/);
  return hasImgExt || hasNoExt;
}

interface DownloadResult {
  localPath: string;
  originalUrl: string;
  filename: string;
  mimeType: string;
  fileSize: number;
  md5: string;
}

export async function processDownloadJob(data: DownloadJobData): Promise<void> {
  const { albumSlugHint } = data;
  const { jobId, images, referer, userAgent } = data;

  startKeepAlive();
  try {
    await logImport(jobId, "info", `Starting download: ${images.length} images (concurrency: ${DOWNLOAD_CONCURRENCY})`);

    const tmpDir = path.join(os.tmpdir(), `cosplay-import-${jobId}-${Date.now()}`);
    fs.mkdirSync(tmpDir, { recursive: true });

    const downloadedFiles: ProcessJobData["downloadedFiles"] = [];
    let downloaded = 0;
    let skipped = 0;

    // Filter valid image URLs first
    const validImages = images.filter((img, _idx) => isImageUrl(img.url));
    const skippedByUrl = images.length - validImages.length;
    skipped += skippedByUrl;

    if (skippedByUrl > 0) {
      await logImport(jobId, "debug", `Skipped ${skippedByUrl} non-image URLs`);
    }

    // Process in batches of DOWNLOAD_CONCURRENCY
    for (let batchStart = 0; batchStart < validImages.length; batchStart += DOWNLOAD_CONCURRENCY) {
      // Check cancellation before each batch
      if (isCancelled(jobId)) {
        await logImport(jobId, "warn", `Download cancelled at image ${batchStart + 1}/${validImages.length}`);
        await updateJobStatus(jobId, "cancelled", { completedAt: new Date() });
        // Cleanup temp dir
        fs.rmSync(tmpDir, { recursive: true, force: true });
        return;
      }

      const batchEnd = Math.min(batchStart + DOWNLOAD_CONCURRENCY, validImages.length);
      const batch = validImages.slice(batchStart, batchEnd);

      // Download batch in parallel
      const batchResults = await Promise.allSettled(
        batch.map(async (img, batchIdx): Promise<DownloadResult | null> => {
          const globalIdx = batchStart + batchIdx;
          const filename = sanitizeFilename(img.url, globalIdx);
          const destPath = path.join(tmpDir, filename);

          try {
            const { mimeType, fileSize } = await downloadImage(img.url, destPath, referer, userAgent);

            if (!isImageMimeType(mimeType)) {
              try { fs.unlinkSync(destPath); } catch {}
              return null; // skip
            }

            if (fileSize < 5000) {
              try { fs.unlinkSync(destPath); } catch {}
              return null; // skip tiny images
            }

            const buffer = fs.readFileSync(destPath);
            const md5 = md5File(buffer);

            const dupCheck = await isImageAlreadyImported(md5);
            if (dupCheck.isDuplicate) {
              try { fs.unlinkSync(destPath); } catch {}
              return null; // skip duplicate
            }

            return {
              localPath: destPath,
              originalUrl: img.url,
              filename,
              mimeType,
              fileSize,
              md5,
            };
          } catch (err: any) {
            try { fs.unlinkSync(destPath); } catch {}
            throw err;
          }
        })
      );

      // Collect results from batch
      for (let i = 0; i < batchResults.length; i++) {
        const result = batchResults[i];
        if (result.status === "fulfilled") {
          if (result.value !== null) {
            downloadedFiles.push(result.value);
            downloaded++;
          } else {
            skipped++;
          }
        } else {
          skipped++;
          const imgUrl = batch[i]?.url || "unknown";
          await logImport(jobId, "warn", `Failed to download ${imgUrl}: ${result.reason?.message || "unknown"}`);
        }
      }

      // Log progress after each batch
      const totalProcessed = batchEnd + skippedByUrl;
      await logImport(jobId, "info", `Downloaded ${downloaded}/${images.length} (${skipped} skipped, batch ${Math.floor(batchStart / DOWNLOAD_CONCURRENCY) + 1})`);
      await updateJobStatus(jobId, "downloading", { downloadedImages: downloaded });
    }

    await logImport(jobId, "info", `Download complete: ${downloaded} downloaded, ${skipped} skipped`);
    await updateJobStatus(jobId, "processing", { downloadedImages: downloaded });

    if (downloadedFiles.length === 0) {
      await logImport(jobId, "error", "No images downloaded successfully");
      await updateJobStatus(jobId, "failed", {
        errorMessage: "No images downloaded",
        completedAt: new Date(),
      });
      fs.rmSync(tmpDir, { recursive: true, force: true });
      return;
    }

    await enqueueProcessJob({ jobId, albumSlugHint, downloadedFiles });
    await logImport(jobId, "info", `Enqueued process job for ${downloadedFiles.length} images`);
  } catch (err: any) {
    await logImport(jobId, "error", `Download failed: ${err.message}`);
    await updateJobStatus(jobId, "failed", {
      errorMessage: err.message,
      completedAt: new Date(),
    });
  } finally {
    stopKeepAlive();
  }
}
