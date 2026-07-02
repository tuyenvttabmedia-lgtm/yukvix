/**
 * Image Processor (V4.16 Final)
 * - Converts images to 3 WebP variants: 4K/full, medium (1200px), thumb (400px)
 * - Strips EXIF metadata (Sharp does this automatically during WebP conversion)
 * - Deletes original after processing
 */

import sharp from "sharp";
import path from "path";
import fs from "fs/promises";

export interface ImageProcessOptions {
  inputPath: string;
  outputDir: string; // base dir; subdirs webp/medium/thumb must already exist
  albumSlug: string;
  counter: number; // 1-based sequential number for filename
  webp4kSize?: number; // default 3840
  webp4kQuality?: number; // default 88
  mediumSize?: number; // default 1200
  mediumQuality?: number; // default 85
  thumbSize?: number; // default 400
  thumbQuality?: number; // default 80
}

export interface ImageProcessResult {
  filename: string;
  webpKey: string; // relative path (for upload key)
  mediumKey: string;
  thumbKey: string;
  sortOrder: number;
  webp4kSize: number; // bytes
}

/**
 * Process a single image into 3 WebP variants.
 * V4.15: allowedTypes without leading dot (path.extname().slice(1) returns 'jpg' not '.jpg')
 * V4.16: Delete original after successful processing
 */
export async function processImage(opts: ImageProcessOptions): Promise<ImageProcessResult> {
  const {
    inputPath,
    outputDir,
    albumSlug,
    counter,
    webp4kSize = parseInt(process.env.IMPORT_WEBP_4K_SIZE || "3840"),
    webp4kQuality = parseInt(process.env.IMPORT_WEBP_4K_QUALITY || "88"),
    mediumSize = parseInt(process.env.IMPORT_MEDIUM_SIZE || "1200"),
    mediumQuality = parseInt(process.env.IMPORT_MEDIUM_QUALITY || "85"),
    thumbSize = parseInt(process.env.IMPORT_THUMB_SIZE || "400"),
    thumbQuality = parseInt(process.env.IMPORT_THUMB_QUALITY || "80"),
  } = opts;

  const paddedNum = String(counter).padStart(3, "0");
  const filename = `${albumSlug}-${paddedNum}.webp`;

  const webp4kPath = path.join(outputDir, "webp", filename);
  const mediumPath = path.join(outputDir, "medium", filename);
  const thumbPath = path.join(outputDir, "thumb", filename);

  // Read input file once
  const buffer = await fs.readFile(inputPath);

  // STEP 1: Generate 4K WebP (max webp4kSize px, quality webp4kQuality)
  // Sharp automatically strips EXIF during WebP conversion
  await sharp(buffer)
    .resize(webp4kSize, webp4kSize, { fit: "inside", withoutEnlargement: true })
    .webp({ quality: webp4kQuality })
    .toFile(webp4kPath);

  const webp4kStats = await fs.stat(webp4kPath);

  // STEP 2: Generate medium WebP (max mediumSize px, quality mediumQuality)
  await sharp(buffer)
    .resize(mediumSize, mediumSize, { fit: "inside", withoutEnlargement: true })
    .webp({ quality: mediumQuality })
    .toFile(mediumPath);

  // STEP 3: Generate clean thumb (thumbSize px, quality thumbQuality)
  await sharp(buffer)
    .resize(thumbSize, thumbSize, { fit: "inside", withoutEnlargement: true })
    .webp({ quality: thumbQuality })
    .toFile(thumbPath);

  // STEP 4: Delete original (no longer needed after processing)
  await fs.unlink(inputPath);

  return {
    filename,
    webpKey: `albums/${albumSlug}/webp/${filename}`,
    mediumKey: `albums/${albumSlug}/medium/${filename}`,
    thumbKey: `albums/${albumSlug}/thumb/${filename}`,
    sortOrder: counter,
    webp4kSize: webp4kStats.size,
  };
}
