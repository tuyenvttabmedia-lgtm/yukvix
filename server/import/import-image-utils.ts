/**
 * Image processing utilities for import pipeline (Phase 4).
 */

import sharp from "sharp";
import fs from "fs/promises";
import path from "path";
import type { ValidatedImage } from "../services/image-validator";

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

export interface ProcessedImage {
  webpKey: string;
  mediumKey: string;
  thumbKey: string;
  filename: string;
  sortOrder: number;
  width?: number;
  height?: number;
}

export interface BatchResult {
  successes: ProcessedImage[];
  failures: Array<{ file: string; reason: string }>;
}

export async function processSingleImage(
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

    const metadata = await sharp(filePath).metadata();
    const origWidth = metadata.width || 0;
    const origHeight = metadata.height || 0;

    const webpPath = path.join(processedDir, "webp", `${outputName}.webp`);
    await sharp(filePath)
      .resize({ width: 3840, withoutEnlargement: true })
      .webp({ quality: 85 })
      .toFile(webpPath);

    const mediumPath = path.join(processedDir, "medium", `${outputName}.webp`);
    await sharp(filePath)
      .resize({ width: 1200, withoutEnlargement: true })
      .webp({ quality: 80 })
      .toFile(mediumPath);

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

export async function processBatch(
  files: ValidatedImage[],
  processedDir: string,
  albumSlug: string,
  startCounter: number,
  concurrency: number
): Promise<BatchResult> {
  const successes: ProcessedImage[] = [];
  const failures: Array<{ file: string; reason: string }> = [];

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
        failures.push({ file: chunk[j].path, reason });
      }
    }
  }

  return { successes, failures };
}

export function rebuildProcessedFromUploads(
  verifiedUploads: Record<string, { etag?: string | null; size?: number }>,
  albumSlug: string
): ProcessedImage[] {
  const webpPrefix = `albums/${albumSlug}/webp/`;
  const items: ProcessedImage[] = [];
  for (const key of Object.keys(verifiedUploads)) {
    if (!key.startsWith(webpPrefix) || !key.endsWith(".webp")) continue;
    const filename = path.basename(key);
    const match = filename.match(/-(\d+)\.webp$/);
    items.push({
      webpKey: key,
      mediumKey: `albums/${albumSlug}/medium/${filename}`,
      thumbKey: `albums/${albumSlug}/thumb/${filename}`,
      filename,
      sortOrder: match ? parseInt(match[1], 10) : items.length,
    });
  }
  items.sort((a, b) => a.sortOrder - b.sortOrder);
  return items;
}

export async function rebuildProcessedFromDisk(
  processedDir: string,
  albumSlug: string
): Promise<ProcessedImage[]> {
  try {
    const webpDir = path.join(processedDir, "webp");
    const files = (await fs.readdir(webpDir)).filter((f) => f.endsWith(".webp"));
    const items: ProcessedImage[] = files.map((filename, idx) => {
      const match = filename.match(/-(\d+)\.webp$/);
      return {
        webpKey: `albums/${albumSlug}/webp/${filename}`,
        mediumKey: `albums/${albumSlug}/medium/${filename}`,
        thumbKey: `albums/${albumSlug}/thumb/${filename}`,
        filename,
        sortOrder: match ? parseInt(match[1], 10) : idx,
      };
    });
    items.sort((a, b) => a.sortOrder - b.sortOrder);
    return items;
  } catch {
    return [];
  }
}

export async function ensureProcessedDirs(processedDir: string): Promise<void> {
  for (const v of ["webp", "medium", "thumb"]) {
    await fs.mkdir(path.join(processedDir, v), { recursive: true });
  }
}
