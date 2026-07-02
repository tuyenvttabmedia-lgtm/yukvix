/**
 * VIP ZIP Generator (V4.13 Final — Normalized Structure)
 *
 * ZIP structure (normalized — no messy source folders):
 *
 *   VIP_ALBUM_{albumSlug}.zip
 *     /{albumSlug}/
 *       {albumSlug}-yukvix-001.jpg
 *       {albumSlug}-yukvix-002.jpg
 *       ...
 *       metadata.json
 *
 * - Images are renamed sequentially: {albumSlug}-yukvix-001.jpg
 * - Original folder structure is NOT preserved
 * - metadata.json contains album info + Yukvix branding
 */

import { createRequire } from "module";
const require = createRequire(import.meta.url);
const archiver = require("archiver");

import fs from "fs";
import fsp from "fs/promises";
import path from "path";
import os from "os";
import { storagePut } from "../storage";

export interface VipZipResult {
  vipZipKey: string;
  vipZipSize: number;
  vipZipGeneratedAt: Date;
}

/**
 * V4.10: Generate VIP ZIP from cleaned originals.
 * Called AFTER processVipDirectory (ExifTool metadata applied).
 * Source: original-resolution files in sourceDir (after rename + metadata).
 */
export async function generateVipZipFromOriginals(
  jobId: number,
  albumId: number,
  albumSlug: string,
  albumTitle: string,
  sourceDir: string
): Promise<VipZipResult> {
  // Collect all image files recursively (sorted for consistent numbering)
  const imageFiles = await collectImageFiles(sourceDir);
  imageFiles.sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

  const zipFilename = `VIP_ALBUM_${albumSlug}.zip`;
  const tempBase = process.env.IMPORT_TEMP_PATH || os.tmpdir();
  const zipLocalPath = path.join(tempBase, `${jobId}-${zipFilename}`);

  // Build metadata.json
  // V4.11: Added version field for future format compatibility
  const metadata = {
    version: "1.0",
    site: "Yukvix",
    album: albumTitle,
    slug: albumSlug,
    creator: "Yukvix",
    copyright: "Yukvix.com",
    website: "https://yukvix.com",
    generatedAt: new Date().toISOString(),
    totalImages: imageFiles.length,
  };

  // Create ZIP with normalized structure
  await new Promise<void>((resolve, reject) => {
    const output = fs.createWriteStream(zipLocalPath);
    const archive = archiver("zip", { zlib: { level: 6 } });

    output.on("close", resolve);
    archive.on("error", reject);
    archive.pipe(output);

    // Add images with normalized names: {albumSlug}-yukvix-001.{ext}
    imageFiles.forEach((filePath, index) => {
      const ext = path.extname(filePath).toLowerCase();
      const paddedNum = String(index + 1).padStart(3, "0");
      const newName = `${albumSlug}-yukvix-${paddedNum}${ext}`;
      archive.file(filePath, { name: `${albumSlug}/${newName}` });
    });

    // Add metadata.json
    archive.append(JSON.stringify(metadata, null, 2), {
      name: `${albumSlug}/metadata.json`,
    });

    archive.finalize();
  });

  // Upload ZIP to Wasabi
  const zipBuffer = await fsp.readFile(zipLocalPath);
  const vipZipKey = `vip-zips/${albumSlug}/${zipFilename}`;
  await storagePut(vipZipKey, zipBuffer, "application/zip");

  const stats = await fsp.stat(zipLocalPath);
  const vipZipSize = stats.size;

  // Delete local ZIP
  await fsp.unlink(zipLocalPath).catch(() => {});

  return { vipZipKey, vipZipSize, vipZipGeneratedAt: new Date() };
}

/**
 * Recursively collect all image files from directory.
 */
async function collectImageFiles(dir: string): Promise<string[]> {
  const results: string[] = [];
  const entries = await fsp.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      const sub = await collectImageFiles(fullPath);
      results.push(...sub);
    } else if (/\.(jpg|jpeg|png|webp)$/i.test(entry.name)) {
      results.push(fullPath);
    }
  }
  return results;
}
