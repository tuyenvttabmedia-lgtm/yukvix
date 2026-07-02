/**
 * ExifTool Metadata Service (V4.16 Final)
 * - Strip ALL old metadata (EXIF, IPTC, XMP, Comment) from images
 * - Add Yukvix branding metadata
 * - Preserve ICC_Profile for color accuracy
 * - Used for VIP ZIP original-resolution files
 */

import { ExifTool } from "exiftool-vendored";
import path from "path";
import fs from "fs/promises";

const exiftool = new ExifTool({ taskTimeoutMillis: 30000 });

// Always close ExifTool process pool on shutdown
process.on("exit", () => exiftool.end());
process.on("SIGTERM", () => exiftool.end());

/**
 * V4.10: Strip ALL old metadata and add Yukvix branding metadata.
 *
 * Strips (exhaustive list):
 *   - EXIF: all camera/GPS/timestamp/software tags
 *   - IPTC: Source, Credit, CopyrightNotice, ObjectName, Caption, Keywords
 *   - XMP: CreatorTool, Software, Source, Rights, WebStatement, Description
 *   - Comment, UserComment, ImageDescription
 *   - XPComment, XPAuthor, XPTitle, XPSubject, XPKeywords
 *
 * Adds:
 *   - Creator: Yukvix
 *   - Copyright: Yukvix.com
 *   - Website: https://yukvix.com
 *   - Album title
 *
 * Note: ICC_Profile is intentionally NOT stripped — must be preserved for color accuracy.
 * Note: Used for VIP ZIP original-resolution files.
 *       Web images (WebP) have EXIF stripped automatically by Sharp during conversion.
 */
export async function applyYukvixMetadata(
  filePath: string,
  albumTitle: string
): Promise<void> {
  // Step 1: Strip specific metadata groups ONLY.
  // V4.11: Do NOT use 'all=' — it can remove ICC_Profile causing color shift.
  // Instead, strip each group explicitly to preserve ICC_Profile.
  await exiftool.write(
    filePath,
    {},
    [
      "-overwrite_original",
      "-EXIF:all=",
      "-IPTC:all=",
      "-XMP:all=",
      "-Comment=",
      "-UserComment=",
      "-ImageDescription=",
      "-XPComment=",
      "-XPAuthor=",
      "-XPTitle=",
      "-XPSubject=",
      "-XPKeywords=",
      // ICC_Profile is intentionally NOT stripped — must be preserved for color accuracy.
    ]
  );

  // Step 2: Add Yukvix metadata
  await exiftool.write(
    filePath,
    {
      "IPTC:By-line": "Yukvix",
      "IPTC:CopyrightNotice": "Yukvix.com",
      "IPTC:Source": "Yukvix.com",
      "IPTC:ObjectName": albumTitle,
      "XMP:Creator": "Yukvix",
      "XMP:Rights": "Yukvix.com",
      "XMP:WebStatement": "https://yukvix.com",
      "XMP:Title": albumTitle,
      "XMP:Description": `Premium photo gallery by Yukvix.com`,
    },
    ["-overwrite_original"]
  );
}

/**
 * V4.10: Process ALL images in directory RECURSIVELY (including subdirectories).
 * Called before VIP ZIP generation.
 * 1. Walk all subdirs
 * 2. Strip old metadata
 * 3. Add Yukvix metadata
 */
export async function processVipDirectory(
  dir: string,
  albumTitle: string
): Promise<void> {
  async function walkAndProcess(currentDir: string): Promise<void> {
    const entries = await fs.readdir(currentDir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        // V4.10: Recurse into subdirectories
        await walkAndProcess(fullPath);
      } else if (/\.(jpg|jpeg|png|webp)$/i.test(entry.name)) {
        await applyYukvixMetadata(fullPath, albumTitle);
      }
    }
  }

  await walkAndProcess(dir);
}
