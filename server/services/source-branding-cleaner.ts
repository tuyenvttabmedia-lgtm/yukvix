/**
 * Source Branding Cleaner (V4.17)
 * Renames files to replace source branding with Yukvix branding.
 * Called AFTER extraction, BEFORE VIP ZIP generation and web image processing.
 *
 * Replacements (case-sensitive, all variants):
 *   misskon.com  → yukvix.com
 *   MissKON.com  → Yukvix.com
 *   mrcong.com   → yukvix.com
 *   MrCong.com   → Yukvix.com
 *
 * Example:
 *   SWEETBOX-SOSO-Once-MissKON.com-004.jpg
 *   → SWEETBOX-SOSO-Once-Yukvix.com-004.jpg
 */

import fs from "fs/promises";
import path from "path";

const BRAND_REPLACEMENTS: [RegExp, string][] = [
  [/MissKON\.com/g, "Yukvix.com"],
  [/misskon\.com/g, "yukvix.com"],
  [/MrCong\.com/g, "Yukvix.com"],
  [/mrcong\.com/g, "yukvix.com"],
];

function applyBrandReplacements(name: string): string {
  let result = name;
  for (const [pattern, replacement] of BRAND_REPLACEMENTS) {
    result = result.replace(pattern, replacement);
  }
  return result;
}

export async function cleanSourceBranding(
  dir: string
): Promise<{ renamed: number; files: string[] }> {
  const renamedFiles: string[] = [];

  async function walkAndRename(currentDir: string) {
    const entries = await fs.readdir(currentDir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        // Process children FIRST, then rename the folder itself.
        // This avoids path invalidation when parent folder is renamed before children are processed.
        await walkAndRename(fullPath);

        // Rename folder if branding found
        const newFolderName = applyBrandReplacements(entry.name);
        if (newFolderName !== entry.name) {
          const newFolderPath = path.join(currentDir, newFolderName);
          await fs.rename(fullPath, newFolderPath);
          renamedFiles.push(`[dir] ${entry.name} → ${newFolderName}`);
        }
      } else {
        // Rename file if branding found
        const newName = applyBrandReplacements(entry.name);
        if (newName !== entry.name) {
          const newPath = path.join(currentDir, newName);
          await fs.rename(fullPath, newPath);
          renamedFiles.push(`${entry.name} → ${newName}`);
        }
      }
    }
  }

  await walkAndRename(dir);
  return { renamed: renamedFiles.length, files: renamedFiles };
}
