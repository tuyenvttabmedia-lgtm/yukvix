/**
 * Duplicate Detection
 * - URL hash (SHA-256 of normalized URL)
 * - Slug similarity
 * - MD5 exact match
 * - Perceptual hash (pHash) similarity
 */
import crypto from "crypto";
import { getDb } from "../db.js";
import { importedUrls, imageHashes } from "../../drizzle/schema.js";
import { eq } from "drizzle-orm";

/**
 * Normalize URL for dedup: remove tracking params, trailing slashes, fragments
 */
export function normalizeUrl(url: string): string {
  try {
    const u = new URL(url);
    // Remove common tracking params
    const STRIP_PARAMS = ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term", "ref", "source", "fbclid", "gclid"];
    STRIP_PARAMS.forEach((p) => u.searchParams.delete(p));
    // Normalize
    u.hash = "";
    let normalized = u.toString().toLowerCase();
    if (normalized.endsWith("/")) normalized = normalized.slice(0, -1);
    return normalized;
  } catch {
    return url.toLowerCase().trim();
  }
}

export function hashUrl(url: string): string {
  return crypto.createHash("sha256").update(normalizeUrl(url)).digest("hex");
}

export function md5File(buffer: Buffer): string {
  return crypto.createHash("md5").update(buffer).digest("hex");
}

/**
 * Check if a source URL has already been imported
 */
export async function isUrlAlreadyImported(sourceUrl: string): Promise<{ isDuplicate: boolean; jobId?: number; albumId?: number }> {
  const hash = hashUrl(sourceUrl);
  const db = await getDb();
  if (!db) return { isDuplicate: false };
  const rows = await db.select().from(importedUrls).where(eq(importedUrls.urlHash, hash)).limit(1);
  if (rows.length > 0) {
    return { isDuplicate: true, jobId: rows[0].jobId, albumId: rows[0].albumId ?? undefined };
  }
  return { isDuplicate: false };
}

/**
 * Mark a URL as imported
 */
export async function markUrlImported(sourceUrl: string, jobId: number, albumId?: number): Promise<void> {
  const hash = hashUrl(sourceUrl);
  const db = await getDb();
  if (!db) return;
  await db.insert(importedUrls).ignore().values({
    urlHash: hash,
    sourceUrl,
    jobId,
    albumId,
  });
}

/**
 * Check if an image (by MD5) has already been imported
 */
export async function isImageAlreadyImported(md5: string): Promise<{ isDuplicate: boolean; mediaItemId?: number }> {
  const db = await getDb();
  if (!db) return { isDuplicate: false };
  const rows = await db.select().from(imageHashes).where(eq(imageHashes.md5, md5)).limit(1);
  if (rows.length > 0) {
    return { isDuplicate: true, mediaItemId: rows[0].mediaItemId };
  }
  return { isDuplicate: false };
}

/**
 * Store image hash record
 */
export async function storeImageHash(mediaItemId: number, md5: string, pHash?: string, dHash?: string): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.insert(imageHashes).values({
    mediaItemId,
    md5,
    pHash: pHash || null,
    dHash: dHash || null,
  });
}

/**
 * Compute perceptual hash of an image buffer using image-hash library
 * Returns hex string or undefined on failure
 */
export async function computePerceptualHash(imagePath: string): Promise<string | undefined> {
  try {
    const { imageHash } = await import("image-hash");
    return new Promise((resolve) => {
      imageHash(imagePath, 16, true, (err: any, data: string) => {
        if (err) { resolve(undefined); return; }
        resolve(data);
      });
    });
  } catch {
    return undefined;
  }
}

/**
 * Hamming distance between two binary hash strings
 * Used to detect near-duplicate images
 */
export function hammingDistance(a: string, b: string): number {
  if (a.length !== b.length) return Infinity;
  let dist = 0;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) dist++;
  }
  return dist;
}

/**
 * Check if two perceptual hashes are similar (threshold: 10 bits difference)
 */
export function areSimilarImages(pHash1: string, pHash2: string, threshold = 10): boolean {
  return hammingDistance(pHash1, pHash2) <= threshold;
}
