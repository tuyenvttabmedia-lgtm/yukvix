/**
 * Archive Validator Service (V4.17)
 * Validates ZIP/RAR/7z archives using 7z CLI (execFile — safe from injection).
 * Supports password-protected archives via IMPORT_ARCHIVE_PASSWORDS env var.
 *
 * V4.17 Key changes:
 * - Returns archivePasswordIndex (not plaintext password)
 * - 0 = no password, 1 = IMPORT_ARCHIVE_PASSWORDS[0], etc.
 */

import { execFile } from "child_process";
import { promisify } from "util";
import fs from "fs/promises";
import path from "path";

const execFileAsync = promisify(execFile);

// Configurable archive passwords (from ENV, comma-separated)
// Example: IMPORT_ARCHIVE_PASSWORDS=misskon.com,mrcong.com
const ARCHIVE_PASSWORDS: string[] = (process.env.IMPORT_ARCHIVE_PASSWORDS || "")
  .split(",")
  .map((p) => p.trim())
  .filter(Boolean);

/**
 * Try 7z list + test with optional password.
 *
 * IMPORTANT: 7z l (list) may succeed even for password-protected archives
 * because it can read the file index without decrypting content.
 * Only 7z t (test) reliably fails when a password is required.
 *
 * Strategy:
 * 1. Run 7z l (list) without password — always succeeds for valid archives
 * 2. Run 7z t (test) without password — this is the real password check
 * 3. If test fails with password error — try each IMPORT_ARCHIVE_PASSWORDS
 * 4. Returns { stdout, passwordUsed, passwordIndex }
 */
async function tryListAndTest(
  zipPath: string
): Promise<{ stdout: string; passwordUsed: string | null; passwordIndex: number }> {
  // Step 1: List archive (usually works without password)
  const { stdout } = await execFileAsync("7z", ["l", zipPath], {
    maxBuffer: 10 * 1024 * 1024,
  });

  // Step 2: Test without password
  const isPasswordError = (err: unknown) => {
    const e = err as { message?: string; stderr?: string };
    return (
      e?.message?.includes("Wrong password") ||
      e?.message?.includes("encrypted") ||
      e?.message?.includes("Cannot open encrypted archive") ||
      (e?.stderr as string | undefined)?.includes("Wrong password") ||
      (e?.stderr as string | undefined)?.includes("encrypted")
    );
  };

  try {
    await execFileAsync("7z", ["t", zipPath], { maxBuffer: 10 * 1024 * 1024 });
    // Test passed without password
    return { stdout, passwordUsed: null, passwordIndex: 0 };
  } catch (err) {
    if (!isPasswordError(err)) throw err; // Real error, not password issue
    // Password required — fall through to try configured passwords
  }

  // Step 3: Try each configured password
  for (let i = 0; i < ARCHIVE_PASSWORDS.length; i++) {
    const pwd = ARCHIVE_PASSWORDS[i];
    try {
      await execFileAsync("7z", ["t", zipPath, `-p${pwd}`], {
        maxBuffer: 10 * 1024 * 1024,
      });
      // Test passed with this password
      // V4.17: return index (1-based), not plaintext
      return { stdout, passwordUsed: pwd, passwordIndex: i + 1 };
    } catch (err) {
      if (!isPasswordError(err)) throw err; // Real error
      // Wrong password — try next
    }
  }

  throw new Error(
    "Archive is password-protected and no configured password worked. " +
      "Configure IMPORT_ARCHIVE_PASSWORDS env var with comma-separated passwords."
  );
}

/**
 * Extract archive once with correct password (if any).
 * Use execFile with args array — safe from command injection.
 */
export async function extractArchive(
  zipPath: string,
  destDir: string,
  password: string | null
): Promise<void> {
  const args = ["x", zipPath, `-o${destDir}`, "-y"];
  if (password) args.push(`-p${password}`);
  await execFileAsync("7z", args, { maxBuffer: 100 * 1024 * 1024 });
}

export interface ValidationResult {
  valid: boolean;
  totalFiles: number;
  validImages: number;
  extractedSize: number;
  passwordUsed: string | null;
  /** V4.17: 0 = no password, 1 = IMPORT_ARCHIVE_PASSWORDS[0], etc. */
  passwordIndex: number;
}

/**
 * Validate archive using 7z (execFile — safe from command injection)
 * - Try without password first, then try IMPORT_ARCHIVE_PASSWORDS
 * - Use 7z list to check file count + size (no extraction)
 * - Use 7z test to verify integrity (no extraction)
 * - V4.17: Returns passwordIndex (not plaintext passwordUsed)
 */
export async function validateArchive(
  zipPath: string,
  opts: {
    maxUploadSize: number;
    maxExtractedSize: number;
    maxFileCount: number;
    allowedTypes: string[]; // without leading dot: ['jpg', 'jpeg', 'png', 'webp']
  }
): Promise<ValidationResult> {
  const stats = await fs.stat(zipPath);
  if (stats.size > opts.maxUploadSize) {
    throw new Error(
      `Upload too large: ${(stats.size / 1024 / 1024).toFixed(1)}MB (max ${(opts.maxUploadSize / 1024 / 1024).toFixed(1)}MB)`
    );
  }

  // Try list + test without password first, then try configured passwords
  const { stdout, passwordUsed, passwordIndex } = await tryListAndTest(zipPath);

  let totalSize = 0;
  let fileCount = 0;
  let validImages = 0;

  for (const line of stdout.split("\n")) {
    // 7z list format: "2024-01-01 12:00:00 ....A      12345      12345  filename.jpg"
    const match = line.match(
      /\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}\s+.*?\s+(\d+)\s+\d+\s+(.+)$/
    );
    if (!match) continue;
    const size = parseInt(match[1]);
    const filename = match[2].trim();
    if (filename.endsWith("/")) continue; // skip directories

    // Path traversal / zip-slip check
    const normalized = path.normalize(filename);
    if (
      path.isAbsolute(normalized) ||
      normalized.startsWith("..") ||
      normalized.split(/[/\\]/).includes("..") ||
      /^[a-zA-Z]:/.test(filename) ||
      filename.startsWith("/") ||
      filename.startsWith("\\")
    ) {
      throw new Error(`Path traversal detected in archive: ${filename}`);
    }

    totalSize += size;
    fileCount++;

    const ext = path.extname(filename).toLowerCase().slice(1); // remove leading dot
    if (opts.allowedTypes.includes(ext)) validImages++;
  }

  if (totalSize > opts.maxExtractedSize) {
    throw new Error(
      `Extracted size too large: ${(totalSize / 1024 / 1024).toFixed(1)}MB (max ${(opts.maxExtractedSize / 1024 / 1024).toFixed(1)}MB)`
    );
  }
  if (fileCount > opts.maxFileCount) {
    throw new Error(`Too many files: ${fileCount} (max ${opts.maxFileCount})`);
  }

  return {
    valid: true,
    totalFiles: fileCount,
    validImages,
    extractedSize: totalSize,
    passwordUsed,
    passwordIndex,
  };
}

/**
 * Resolve password string from index.
 * V4.17: Worker uses this to get the actual password from stored index.
 * @param index 0 = no password, 1 = IMPORT_ARCHIVE_PASSWORDS[0], etc.
 */
export function resolvePasswordFromIndex(index: number): string | null {
  if (index === 0) return null;
  return ARCHIVE_PASSWORDS[index - 1] ?? null;
}
