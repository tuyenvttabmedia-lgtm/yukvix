/**
 * Public CMS assets (logo, favicon, banners) live in a private Wasabi bucket.
 * Serve them through the app so <img> / favicon do not 403.
 */
import type { Express, Request, Response } from "express";
import { Readable } from "node:stream";
import { GetObjectCommand } from "@aws-sdk/client-s3";
import {
  getS3ClientForProcessing,
  getWasabiBucket,
  isWasabiConfigured,
} from "./storage-wasabi";

export const CMS_MEDIA_PREFIX = "/api/cms-media/";
export const CMS_MAX_UPLOAD_BYTES = 2 * 1024 * 1024;
const CMS_KEY_RE = /^cms\/[A-Za-z0-9._\-/]+$/;
const CMS_FOLDER_RE = /^cms(\/[a-z0-9_-]+)*$/i;
const CMS_EXT_RE = /^(png|jpe?g|webp|svg|ico|gif)$/i;
const CMS_URL_SETTING_KEYS = ["logo_url", "logo_mobile_url", "favicon_url"] as const;

const CONTENT_TYPE_BY_EXT: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  svg: "image/svg+xml",
  ico: "image/x-icon",
  gif: "image/gif",
};

export function isCmsStorageKey(key: string): boolean {
  return CMS_KEY_RE.test(key) && !key.includes("..");
}

export function isCmsFolder(folder: string): boolean {
  return CMS_FOLDER_RE.test(folder) && !folder.includes("..");
}

export function cmsMediaPath(key: string): string {
  return `${CMS_MEDIA_PREFIX}${key}`;
}

export function extensionFromFilename(filename: string): string {
  const ext = filename.split(".").pop()?.toLowerCase() || "";
  return CMS_EXT_RE.test(ext) ? ext : "";
}

export function normalizeCmsContentType(filename: string, contentType?: string): string {
  const ext = extensionFromFilename(filename);
  if (ext && CONTENT_TYPE_BY_EXT[ext]) return CONTENT_TYPE_BY_EXT[ext];
  if (contentType && contentType !== "application/octet-stream") return contentType;
  return "image/png";
}

/** Convert a stored Wasabi/CDN CMS URL into a stable same-origin proxy URL. */
export function rewriteCmsAssetUrl(url: string | null | undefined): string {
  if (!url) return "";
  if (url.startsWith(CMS_MEDIA_PREFIX)) return url;
  try {
    const path = url.startsWith("http://") || url.startsWith("https://")
      ? new URL(url).pathname
      : url;
    const idx = path.indexOf("/cms/");
    if (idx >= 0) {
      const key = decodeURIComponent(path.slice(idx + 1).split("?")[0]);
      if (isCmsStorageKey(key)) return cmsMediaPath(key);
    }
  } catch {
    /* keep original */
  }
  return url;
}

export function rewriteCmsSettings(
  settings: Record<string, string | null>
): Record<string, string | null> {
  for (const key of CMS_URL_SETTING_KEYS) {
    if (settings[key]) settings[key] = rewriteCmsAssetUrl(settings[key]);
  }
  const rawBanners = settings.homepage_banners;
  if (rawBanners) {
    try {
      const banners = JSON.parse(rawBanners) as Array<{ imageUrl?: string }>;
      if (Array.isArray(banners)) {
        for (const banner of banners) {
          if (banner.imageUrl) banner.imageUrl = rewriteCmsAssetUrl(banner.imageUrl);
        }
        settings.homepage_banners = JSON.stringify(banners);
      }
    } catch {
      /* leave banners as-is */
    }
  }
  return settings;
}

function bodyToNodeStream(body: unknown): Readable {
  if (body instanceof Readable) return body;
  if (body && typeof (body as { getReader?: unknown }).getReader === "function") {
    return Readable.fromWeb(body as import("node:stream/web").ReadableStream);
  }
  throw new Error("Unsupported S3 body");
}

export function registerCmsMediaRoutes(app: Express): void {
  app.get("/api/cms-media/*", async (req: Request, res: Response) => {
    const raw = (req.params as Record<string, string>)[0] || "";
    const key = decodeURIComponent(raw);
    if (!isCmsStorageKey(key)) {
      res.status(400).send("Invalid CMS key");
      return;
    }
    if (!isWasabiConfigured()) {
      res.status(503).send("Storage not configured");
      return;
    }
    const bucket = getWasabiBucket();
    if (!bucket) {
      res.status(503).send("Storage bucket missing");
      return;
    }
    try {
      const obj = await getS3ClientForProcessing().send(
        new GetObjectCommand({ Bucket: bucket, Key: key })
      );
      if (!obj.Body) {
        res.status(404).send("Not found");
        return;
      }
      res.setHeader("Content-Type", obj.ContentType || "application/octet-stream");
      res.setHeader("Cache-Control", "public, max-age=86400, stale-while-revalidate=604800");
      if (obj.ContentLength != null) res.setHeader("Content-Length", String(obj.ContentLength));
      if (obj.ETag) res.setHeader("ETag", obj.ETag);
      bodyToNodeStream(obj.Body).pipe(res);
    } catch (err: any) {
      const status =
        err?.name === "NoSuchKey" || err?.$metadata?.httpStatusCode === 404 ? 404 : 502;
      console.error(`[cms-media] GET ${key} failed: ${err?.message || err}`);
      res.status(status).send(status === 404 ? "Not found" : "Storage error");
    }
  });
}
