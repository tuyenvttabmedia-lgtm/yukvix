/**
 * Image Validator Service (V4.17)
 * Recursively scans extracted archive directory for valid images.
 * Returns valid image paths and invalid image reasons.
 */

import fs from "fs/promises";
import path from "path";

const ALLOWED_EXTENSIONS = [".jpg", ".jpeg", ".png", ".webp"];
const MIN_FILE_SIZE = 1024; // 1KB minimum (skip corrupt/empty files)
const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100MB maximum per image

export interface ValidatedImage {
  path: string;
  filename: string;
  size: number;
}

export interface InvalidImage {
  path: string;
  filename: string;
  reason: string;
}

export interface ImageValidationResult {
  validImages: ValidatedImage[];
  invalidImages: InvalidImage[];
  totalScanned: number;
}

/**
 * Recursively scan all subdirectories for images.
 * Returns valid and invalid images separately.
 */
export async function validateImages(dir: string): Promise<ImageValidationResult> {
  const validImages: ValidatedImage[] = [];
  const invalidImages: InvalidImage[] = [];
  let totalScanned = 0;

  async function walkDir(currentDir: string): Promise<void> {
    let entries: Awaited<ReturnType<typeof fs.readdir>>;
    try {
      entries = await fs.readdir(currentDir, { withFileTypes: true });
    } catch {
      return; // Skip unreadable directories
    }

    // Sort entries for consistent ordering
    entries.sort((a, b) => a.name.localeCompare(b.name));

    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);

      if (entry.isDirectory()) {
        await walkDir(fullPath);
        continue;
      }

      if (!entry.isFile()) continue;

      const ext = path.extname(entry.name).toLowerCase();
      if (!ALLOWED_EXTENSIONS.includes(ext)) continue; // Skip non-image files silently

      totalScanned++;

      // Check file size
      let stat: Awaited<ReturnType<typeof fs.stat>>;
      try {
        stat = await fs.stat(fullPath);
      } catch (err) {
        invalidImages.push({
          path: fullPath,
          filename: entry.name,
          reason: `Cannot stat file: ${(err as Error).message}`,
        });
        continue;
      }

      if (stat.size < MIN_FILE_SIZE) {
        invalidImages.push({
          path: fullPath,
          filename: entry.name,
          reason: `File too small: ${stat.size} bytes (min ${MIN_FILE_SIZE})`,
        });
        continue;
      }

      if (stat.size > MAX_FILE_SIZE) {
        invalidImages.push({
          path: fullPath,
          filename: entry.name,
          reason: `File too large: ${(stat.size / 1024 / 1024).toFixed(1)}MB (max ${MAX_FILE_SIZE / 1024 / 1024}MB)`,
        });
        continue;
      }

      validImages.push({
        path: fullPath,
        filename: entry.name,
        size: stat.size,
      });
    }
  }

  await walkDir(dir);

  return { validImages, invalidImages, totalScanned };
}
