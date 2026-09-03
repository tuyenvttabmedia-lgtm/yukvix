/**
 * Public media URLs (album thumbs/covers).
 * Stored rows may be path-style Wasabi, media-proxy, or CDN — normalize at read time.
 */
import { getPublicUrl, getWasabiBucket } from "./storage-wasabi";

function isPrivateObjectKey(key: string): boolean {
  return (
    /\/(webp|medium|original)\//.test(key) ||
    key.startsWith("vip-zips/") ||
    key.startsWith("download-zips/")
  );
}

/** Pull the Wasabi object key out of a stored URL, or null if it is not ours. */
export function extractStorageObjectKey(url: string, bucket?: string): string | null {
  const bucketName = bucket || getWasabiBucket();
  if (!url) return null;
  try {
    if (url.startsWith("/media-proxy/")) {
      return decodeURIComponent(url.slice("/media-proxy/".length).split("?")[0]);
    }
    const parsed = url.startsWith("http://") || url.startsWith("https://")
      ? new URL(url)
      : null;
    if (!parsed) return null;

    const path = decodeURIComponent(parsed.pathname.replace(/^\/+/, ""));
    if (parsed.pathname.startsWith("/media-proxy/")) {
      return decodeURIComponent(parsed.pathname.slice("/media-proxy/".length).split("?")[0]);
    }
    if (parsed.hostname.includes("wasabisys.com")) {
      if (bucketName && (path === bucketName || path.startsWith(`${bucketName}/`))) {
        return path.slice(bucketName.length).replace(/^\/+/, "") || null;
      }
      return path || null;
    }
    if (parsed.hostname === "media.yukvix.com" || parsed.hostname.startsWith("media.")) {
      return path || null;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Thumbs/covers should hit Wasabi or CDN directly — never the VPS media-proxy.
 * Private full-size keys are left unchanged (they need signed URLs).
 */
export function rewritePublicMediaUrl(url: string | null | undefined): string | null {
  if (!url) return url ?? null;
  const key = extractStorageObjectKey(url);
  if (!key || isPrivateObjectKey(key)) return url;
  return getPublicUrl(key);
}

export function withRewrittenCover<T extends { coverUrl?: string | null }>(album: T): T {
  return { ...album, coverUrl: rewritePublicMediaUrl(album.coverUrl ?? null) };
}
