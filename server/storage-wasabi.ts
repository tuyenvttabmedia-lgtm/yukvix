/**
 * Wasabi S3 Storage Module
 * Handles all media storage operations: upload, signed URLs, WebP conversion, thumbnails.
 * Falls back to built-in Manus storage when Wasabi credentials are not configured.
 *
 * IMPORTANT — Cloudflare bypass:
 *   - Presigned PUT URLs MUST point directly to Wasabi (s3.<region>.wasabisys.com),
 *     NOT to the CDN/custom domain (which may be proxied by Cloudflare).
 *   - CDN_BASE_URL is used ONLY for public media delivery (GET), never for uploads.
 *   - This prevents Cloudflare from intercepting large PUT requests and causing
 *     "Network Error" at ~5% upload progress.
 */
import {
  CopyObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import sharp from "sharp";
import { storagePut } from "./storage";

// Wasabi S3 configuration — mutable so refreshWasabiConfig() can reload from DB
let WASABI_REGION = process.env.WASABI_REGION || "us-east-1";
let WASABI_BUCKET = process.env.WASABI_BUCKET || "";
let WASABI_ACCESS_KEY = process.env.WASABI_ACCESS_KEY_ID || "";
let WASABI_SECRET_KEY = process.env.WASABI_SECRET_ACCESS_KEY || "";
let CDN_BASE_URL = (process.env.CDN_BASE_URL || "").replace(/\/$/, "");
// CDN enabled flag — when false, getPublicUrl() returns direct Wasabi URL regardless of CDN_BASE_URL
let CDN_ENABLED = !!CDN_BASE_URL; // default: ON when CDN_BASE_URL is set

// The DIRECT Wasabi endpoint — always use this for presigned PUT URLs and server-side uploads.
// This bypasses Cloudflare proxy so large uploads go directly to Wasabi.
let WASABI_DIRECT_ENDPOINT =
  process.env.WASABI_ENDPOINT || `https://s3.${WASABI_REGION}.wasabisys.com`;

let hasWasabi = !!(WASABI_BUCKET && WASABI_ACCESS_KEY && WASABI_SECRET_KEY);

/**
 * Reload Wasabi credentials from DB settings (called after saveStorageConfig).
 * Falls back to env vars when DB values are empty.
 */
export async function refreshWasabiConfig(): Promise<void> {
  try {
    const { getWasabiSettings } = await import("./settings-service");
    const cfg = await getWasabiSettings();
    WASABI_BUCKET = cfg.bucket || process.env.WASABI_BUCKET || "";
    WASABI_REGION = cfg.region || process.env.WASABI_REGION || "us-east-1";
    WASABI_ACCESS_KEY = cfg.accessKeyId || process.env.WASABI_ACCESS_KEY_ID || "";
    WASABI_SECRET_KEY = cfg.secretAccessKey || process.env.WASABI_SECRET_ACCESS_KEY || "";
    CDN_BASE_URL = (cfg.cdnBaseUrl || process.env.CDN_BASE_URL || "").replace(/\/$/, "");
    CDN_ENABLED = cfg.cdnEnabled !== undefined ? cfg.cdnEnabled : !!CDN_BASE_URL;
    WASABI_DIRECT_ENDPOINT =
      cfg.endpoint || process.env.WASABI_ENDPOINT || `https://s3.${WASABI_REGION}.wasabisys.com`;
    hasWasabi = !!(WASABI_BUCKET && WASABI_ACCESS_KEY && WASABI_SECRET_KEY);
    s3Client = null; // reset singleton so next call uses new credentials
  } catch {
    // DB not ready — keep existing config
  }
}

// Singleton S3 client — uses direct Wasabi endpoint (not CDN)
let s3Client: S3Client | null = null;

/**
 * Exported for use in routers that need to fetch from Wasabi (e.g., processAfterUpload).
 * Returns the same singleton client with forcePathStyle: true and direct Wasabi endpoint.
 */
export function getS3ClientForProcessing(): S3Client {
  return getS3Client();
}

function getS3Client(): S3Client {
  if (!s3Client) {
    s3Client = new S3Client({
      region: WASABI_REGION,
      endpoint: WASABI_DIRECT_ENDPOINT,
      credentials: {
        accessKeyId: WASABI_ACCESS_KEY,
        secretAccessKey: WASABI_SECRET_KEY,
      },
      // path-style: https://s3.region.wasabisys.com/bucket/key
      // Required for Wasabi when using custom domain buckets to avoid DNS issues.
      forcePathStyle: true,
    });
  }
  return s3Client;
}

export interface UploadResult {
  key: string;
  url: string;
  width?: number;
  height?: number;
  fileSize?: number;
}

/**
 * Upload a file buffer to storage (Wasabi or Manus fallback).
 * Server-side upload — goes directly to Wasabi, bypasses Cloudflare.
 */
export async function uploadToStorage(
  key: string,
  buffer: Buffer,
  contentType: string,
  opts?: { isPrivate?: boolean }
): Promise<UploadResult> {
  const isPrivate = opts?.isPrivate ?? isPrivateMediaKey(key);
  if (hasWasabi) {
    const client = getS3Client();
    console.log(`[Wasabi] uploadToStorage: key=${key} size=${buffer.length} type=${contentType} private=${isPrivate}`);
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 30_000);
      try {
        await client.send(
          new PutObjectCommand({
            Bucket: WASABI_BUCKET,
            Key: key,
            Body: buffer,
            ContentType: contentType,
            CacheControl: isPrivate ? "private, max-age=3600" : "public, max-age=31536000",
            ...(isPrivate ? { ACL: "private" as const } : {}),
          }),
          { abortSignal: controller.signal }
        );
      } finally {
        clearTimeout(timeout);
      }
    } catch (err: any) {
      console.error(`[Wasabi] uploadToStorage FAILED: key=${key} error=${err?.message}`);
      throw err;
    }
    const url = getPublicUrl(key);
    console.log(`[Wasabi] uploadToStorage OK: url=${url}`);
    return { key, url, fileSize: buffer.length };
  } else {
    const result = await storagePut(key, buffer, contentType);
    return { key: result.key, url: result.url, fileSize: buffer.length };
  }
}

/** Full-size VIP variants and download ZIPs must not be world-readable. */
export function isPrivateMediaKey(key: string): boolean {
  return (
    /\/(webp|medium|original)\//.test(key) ||
    key.startsWith("vip-zips/") ||
    key.startsWith("download-zips/")
  );
}

/**
 * Generate a signed URL for private/premium content (expires in 1 hour by default).
 * Uses direct Wasabi endpoint — bypasses Cloudflare.
 */
export async function getSignedMediaUrl(key: string, expiresInSeconds = 3600): Promise<string> {
  if (!hasWasabi) {
    // Manus storage URLs are already signed/proxied
    const { storageGet } = await import("./storage");
    const result = await storageGet(key);
    return result.url;
  }

  const client = getS3Client();
  const command = new GetObjectCommand({
    Bucket: WASABI_BUCKET,
    Key: key,
  });
  const url = await getSignedUrl(client, command, { expiresIn: expiresInSeconds });
  console.log(`[Wasabi] getSignedMediaUrl: key=${key} expires=${expiresInSeconds}s`);
  return url;
}

/**
 * Generate a presigned PUT URL for direct browser-to-Wasabi upload.
 *
 * CRITICAL: The returned URL points to WASABI_DIRECT_ENDPOINT (s3.region.wasabisys.com),
 * NOT to the CDN/custom domain. This ensures the browser PUT request goes directly
 * to Wasabi and is NOT intercepted by Cloudflare proxy.
 *
 * Returns null when Wasabi is not configured (falls back to server-side upload).
 */
export async function getPresignedPutUrl(
  key: string,
  contentType: string,
  expiresInSeconds = 300
): Promise<string | null> {
  if (!hasWasabi) return null;

  const client = getS3Client();
  const command = new PutObjectCommand({
    Bucket: WASABI_BUCKET,
    Key: key,
    ContentType: contentType,
    CacheControl: "public, max-age=31536000",
  });

  const url = await getSignedUrl(client, command, { expiresIn: expiresInSeconds });

  // Safety check: presigned URL must point to direct Wasabi, not CDN
  if (CDN_BASE_URL && url.startsWith(CDN_BASE_URL)) {
    console.error(
      `[Wasabi] CRITICAL: presigned PUT URL points to CDN (${CDN_BASE_URL}) instead of direct Wasabi! ` +
        `This will cause upload failures through Cloudflare proxy. ` +
        `Check WASABI_ENDPOINT env var — it must be the direct Wasabi endpoint, not the CDN domain.`
    );
  }

  console.log(
    `[Wasabi] getPresignedPutUrl: key=${key} type=${contentType} ` +
      `expires=${expiresInSeconds}s endpoint=${WASABI_DIRECT_ENDPOINT}`
  );
  return url;
}

/**
 * Get the public URL for a key.
 * When CDN is enabled AND CDN_BASE_URL is set, returns CDN URL.
 * Otherwise returns direct Wasabi path-style URL.
 * Used for media delivery (GET) only — never for uploads.
 */
export function getPublicUrl(key: string): string {
  if (CDN_ENABLED && CDN_BASE_URL) return `${CDN_BASE_URL}/${key}`;
  return `${WASABI_DIRECT_ENDPOINT}/${WASABI_BUCKET}/${key}`;
}

/**
 * Check if Wasabi is configured
 */
export function isWasabiConfigured(): boolean {
  return hasWasabi;
}

/**
 * Delete a file from storage
 */
export async function deleteFromStorage(key: string): Promise<void> {
  if (!hasWasabi) return; // Manus storage doesn't expose delete
  const client = getS3Client();
  console.log(`[Wasabi] deleteFromStorage: key=${key}`);
  await client.send(new DeleteObjectCommand({ Bucket: WASABI_BUCKET, Key: key }));
}

/**
 * Copy an object within the same Wasabi bucket (server-side copy, no data transfer).
 * Used to move pre-optimized WebP files from tmp/original path to final webp/ path.
 */

/** URL-encode CopySource for keys with spaces/parentheses/non-ASCII (UAT BUG-001). */
function buildCopySource(bucket: string, key: string): string {
  return encodeURIComponent(`${bucket}/${key}`);
}

export async function copyObject(sourceKey: string, destKey: string): Promise<void> {
  if (!hasWasabi) return;
  const client = getS3Client();
  console.log(`[Wasabi] copyObject: ${sourceKey} → ${destKey}`);
  await client.send(
    new CopyObjectCommand({
      Bucket: WASABI_BUCKET,
      CopySource: buildCopySource(WASABI_BUCKET, sourceKey),
      Key: destKey,
    })
  );
}

/**
 * Process only medium (1200px) + thumbnail (400x400) from an existing buffer.
 * Used when the input is already a high-quality WebP ≥2400px — skip the 4K encode step.
 * Returns { medium, thumbnail } buffers with metadata.
 */
export async function processImageMediumThumb(
  inputBuffer: Buffer
): Promise<{
  medium: { buffer: Buffer; width: number; height: number };
  thumbnail: { buffer: Buffer; width: number; height: number };
}> {
  await acquireSharpSlot();
  console.log(`[Sharp] processImageMediumThumb: Slot acquired. Active=${_sharpActive} Queued=${_sharpWaiters.length} Buffer=${inputBuffer.length}b`);
  try {
    const sharpOpts = { limitInputPixels: 536805378 };
    const metadata = await sharp(inputBuffer, sharpOpts).metadata();

    // Medium WebP (max 1200px wide, quality 80)
    const mediumMaxWidth = 1200;
    const mediumBuffer = await sharp(inputBuffer, sharpOpts)
      .rotate()
      .resize({
        width: Math.min(metadata.width || mediumMaxWidth, mediumMaxWidth),
        withoutEnlargement: true,
      })
      .webp({ quality: 80, effort: 3 })
      .toBuffer();
    const mediumMeta = await sharp(mediumBuffer, sharpOpts).metadata();

    // Thumbnail (400x400 cover crop, WebP quality 70)
    const thumbBuffer = await sharp(inputBuffer, sharpOpts)
      .rotate()
      .resize({ width: 400, height: 400, fit: "cover", position: "attention" })
      .webp({ quality: 70, effort: 2 })
      .toBuffer();

    console.log(`[Sharp] processImageMediumThumb done. medium=${mediumBuffer.length}b thumb=${thumbBuffer.length}b`);
    return {
      medium: {
        buffer: mediumBuffer,
        width: mediumMeta.width || 0,
        height: mediumMeta.height || 0,
      },
      thumbnail: {
        buffer: thumbBuffer,
        width: 400,
        height: 400,
      },
    };
  } finally {
    releaseSharpSlot();
    console.log(`[Sharp] processImageMediumThumb: Slot released. Active=${_sharpActive} Queued=${_sharpWaiters.length}`);
  }
}

// --- Server-side concurrency semaphore for Sharp -------------------------------
// Prevents OOM crashes when multiple uploads are processed simultaneously.
// Only MAX_SHARP_CONCURRENT Sharp jobs run at a time; others wait in queue.
// With 3 frontend workers each calling processAfterUpload, without this semaphore
// 3 Sharp jobs run concurrently, each holding 15-60MB RAM → OOM → server crash.
let _sharpActive = 0;
const _sharpWaiters: Array<() => void> = [];
const MAX_SHARP_CONCURRENT = 1; // 1 Sharp job at a time to prevent OOM

function acquireSharpSlot(): Promise<void> {
  return new Promise((resolve) => {
    if (_sharpActive < MAX_SHARP_CONCURRENT) {
      _sharpActive++;
      resolve();
    } else {
      _sharpWaiters.push(() => { _sharpActive++; resolve(); });
    }
  });
}

function releaseSharpSlot(): void {
  _sharpActive = Math.max(0, _sharpActive - 1);
  const next = _sharpWaiters.shift();
  if (next) next();
}

export type WatermarkSettings = {
  enabled: boolean;
  key: string;
  opacity: number;
  position: "southeast" | "southwest" | "northeast" | "northwest" | "center";
};

/**
 * Process an image: convert to WebP, generate medium (1200px), and generate thumbnail.
 * Optionally composites a watermark onto the full-size and medium WebP.
 * Returns { webp, medium, thumbnail } buffers with metadata.
 */
export async function processImage(
  inputBuffer: Buffer,
  watermark?: WatermarkSettings
): Promise<{
  webp: { buffer: Buffer; width: number; height: number };
  medium: { buffer: Buffer; width: number; height: number };
  thumbnail: { buffer: Buffer; width: number; height: number };
}> {
  // Wait for a Sharp processing slot (prevents concurrent OOM)
  await acquireSharpSlot();
  console.log(`[Sharp] Slot acquired. Active=${_sharpActive} Queued=${_sharpWaiters.length} Buffer=${inputBuffer.length}b`);

  try {
    // limitInputPixels: block images > 23170x23170 to prevent memory bombs (536M pixels = 2x default)
    const sharpOpts = { limitInputPixels: 536805378 };
    const image = sharp(inputBuffer, sharpOpts);
    const metadata = await image.metadata();

    // Full WebP conversion (max 3840px / 4K wide, quality 85)
    const maxWidth = 3840;
    let webpPipeline = sharp(inputBuffer, sharpOpts)
      .rotate() // auto-rotate based on EXIF
      .resize({
        width: Math.min(metadata.width || maxWidth, maxWidth),
        withoutEnlargement: true,
      });

    // Apply watermark if enabled
    if (watermark?.enabled && watermark.key) {
      try {
        const wmCmd = new GetObjectCommand({
          Bucket: WASABI_BUCKET,
          Key: watermark.key,
        });
        const wmObj = await getS3Client().send(wmCmd);
        const wmChunks: Uint8Array[] = [];
        const wmStream = wmObj.Body as any;
        for await (const chunk of wmStream) wmChunks.push(chunk);
        const wmBuffer = Buffer.concat(wmChunks);
        // Resize watermark to 20% of image width
        const imgWidth = Math.min(metadata.width || maxWidth, maxWidth);
        const wmWidth = Math.round(imgWidth * 0.2);
        const wmResized = await sharp(wmBuffer)
          .resize({ width: wmWidth, withoutEnlargement: true })
          .ensureAlpha(watermark.opacity)
          .toBuffer();
        webpPipeline = (webpPipeline as any).composite([{
          input: wmResized,
          gravity: watermark.position,
          blend: "over",
        }]);
        console.log(`[Sharp] Watermark applied: key=${watermark.key} pos=${watermark.position}`);
      } catch (wmErr: any) {
        console.warn(`[Sharp] Watermark failed (skipped): ${wmErr?.message}`);
      }
    }

    const webpBuffer = await webpPipeline.webp({ quality: 85, effort: 4 }).toBuffer();
    const webpMeta = await sharp(webpBuffer, sharpOpts).metadata();

    // Medium WebP (max 1200px wide, quality 80) — for mobile/tablet, with watermark
    const mediumMaxWidth = 1200;
    let mediumPipeline = sharp(inputBuffer, sharpOpts)
      .rotate()
      .resize({
        width: Math.min(metadata.width || mediumMaxWidth, mediumMaxWidth),
        withoutEnlargement: true,
      });
    // Apply watermark to medium too (same as full WebP)
    if (watermark?.enabled && watermark.key) {
      try {
        const wmCmd = new GetObjectCommand({ Bucket: WASABI_BUCKET, Key: watermark.key });
        const wmObj = await getS3Client().send(wmCmd);
        const wmChunks: Uint8Array[] = [];
        const wmStream = wmObj.Body as any;
        for await (const chunk of wmStream) wmChunks.push(chunk);
        const wmBuffer = Buffer.concat(wmChunks);
        const imgWidth = Math.min(metadata.width || mediumMaxWidth, mediumMaxWidth);
        const wmWidth = Math.round(imgWidth * 0.2);
        const wmResized = await sharp(wmBuffer)
          .resize({ width: wmWidth, withoutEnlargement: true })
          .ensureAlpha(watermark.opacity)
          .toBuffer();
        mediumPipeline = (mediumPipeline as any).composite([{ input: wmResized, gravity: watermark.position, blend: "over" }]);
      } catch { /* skip watermark on medium if it fails */ }
    }
    const mediumBuffer = await mediumPipeline.webp({ quality: 80, effort: 3 }).toBuffer();
    const mediumMeta = await sharp(mediumBuffer, sharpOpts).metadata();

    // Thumbnail (400x400 cover crop, WebP quality 75) — no watermark on thumbnails
    const thumbBuffer = await sharp(inputBuffer, sharpOpts)
      .rotate()
      .resize({ width: 400, height: 400, fit: "cover", position: "attention" })
      .webp({ quality: 70, effort: 2 })
      .toBuffer();

    console.log(`[Sharp] Done. webp=${webpBuffer.length}b medium=${mediumBuffer.length}b thumb=${thumbBuffer.length}b`);
    return {
      webp: {
        buffer: webpBuffer,
        width: webpMeta.width || 0,
        height: webpMeta.height || 0,
      },
      medium: {
        buffer: mediumBuffer,
        width: mediumMeta.width || 0,
        height: mediumMeta.height || 0,
      },
      thumbnail: {
        buffer: thumbBuffer,
        width: 400,
        height: 400,
      },
    };
  } finally {
    releaseSharpSlot();
    console.log(`[Sharp] Slot released. Active=${_sharpActive} Queued=${_sharpWaiters.length}`);
  }
}

/**
 * Upload a photo with full processing pipeline:
 * 1. Convert to WebP (2400px)
 * 2. Generate medium WebP (1200px, mobile/tablet)
 * 3. Generate thumbnail (400x400)
 * 4. Upload all variants to storage
 */
export async function uploadPhoto(
  albumId: number,
  originalBuffer: Buffer,
  originalName: string,
  mimeType: string
): Promise<{
  originalKey: string;
  originalUrl: string;
  webpKey: string;
  webpUrl: string;
  mediumKey: string;
  mediumUrl: string;
  thumbKey: string;
  thumbUrl: string;
  width: number;
  height: number;
  fileSize: number;
}> {
  const timestamp = Date.now();
  const baseName = originalName.replace(/\.[^.]+$/, "").replace(/[^a-zA-Z0-9-_]/g, "_");
  const prefix = `albums/${albumId}`;

  // Process image — generates webp, medium, thumbnail
  const { webp, medium, thumbnail } = await processImage(originalBuffer);

  // Upload original
  const originalKey = `${prefix}/original/${timestamp}_${baseName}.${getExtension(mimeType)}`;
  const originalResult = await uploadToStorage(originalKey, originalBuffer, mimeType);

  // Upload WebP (full, 2400px)
  const webpKey = `${prefix}/webp/${timestamp}_${baseName}.webp`;
  const webpResult = await uploadToStorage(webpKey, webp.buffer, "image/webp");

  // Upload Medium WebP (1200px, mobile/tablet)
  const mediumKey = `${prefix}/medium/${timestamp}_${baseName}_medium.webp`;
  const mediumResult = await uploadToStorage(mediumKey, medium.buffer, "image/webp");

  // Upload thumbnail
  const thumbKey = `${prefix}/thumb/${timestamp}_${baseName}_thumb.webp`;
  const thumbResult = await uploadToStorage(thumbKey, thumbnail.buffer, "image/webp");

  return {
    originalKey,
    originalUrl: originalResult.url,
    webpKey,
    webpUrl: webpResult.url,
    mediumKey,
    mediumUrl: mediumResult.url,
    thumbKey,
    thumbUrl: thumbResult.url,
    width: webp.width,
    height: webp.height,
    fileSize: originalBuffer.length,
  };
}

function getExtension(mimeType: string): string {
  const map: Record<string, string> = {
    "image/jpeg": "jpg",
    "image/jpg": "jpg",
    "image/png": "png",
    "image/gif": "gif",
    "image/webp": "webp",
    "image/avif": "avif",
  };
  return map[mimeType] || "jpg";
}

export function isImageMimeType(mimeType: string): boolean {
  return ["image/jpeg", "image/jpg", "image/png", "image/gif", "image/webp", "image/avif"].includes(
    mimeType
  );
}
