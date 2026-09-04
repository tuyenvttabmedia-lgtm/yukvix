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

/** Map a stored full-size key to the public thumb variant. */
export function toPublicThumbKey(key: string): string {
  return key.replace(/\/(webp|medium|original)\//, "/thumb/");
}

/**
 * Image worker writes medium next to thumb/webp:
 *   library/thumb/TS_Name_thumb.webp  → library/medium/TS_Name_medium.webp
 *   library/webp/TS_Name.webp         → library/medium/TS_Name_medium.webp
 * Photos attached from the media library often omit mediumKey; derive it so
 * the lightbox never falls back to the 400×400 square thumb.
 */
export function deriveMediumObjectKey(
  storedKey?: string | null,
  publicUrl?: string | null
): string | null {
  const key = storedKey || (publicUrl ? extractStorageObjectKey(publicUrl) : null);
  if (!key) return null;
  if (/\/medium\//.test(key)) return key;
  if (/\/thumb\//.test(key)) {
    const next = key
      .replace(/\/thumb\//, "/medium/")
      .replace(/_thumb(\.[a-z0-9]+)$/i, "_medium$1");
    return next !== key ? next : null;
  }
  if (/\/webp\//.test(key)) {
    const next = key
      .replace(/\/webp\//, "/medium/")
      .replace(/(\.[a-z0-9]+)$/i, "_medium$1");
    return next !== key ? next : null;
  }
  return null;
}

/**
 * Creator avatars must be public thumbs/covers — never private webp/medium.
 */
export function toPublicCreatorImageUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  const key = extractStorageObjectKey(url);
  if (!key) return url;
  if (key.startsWith("vip-zips/") || key.startsWith("download-zips/")) return url;
  if (key.startsWith("creators/")) return getPublicUrl(key);
  return getPublicUrl(toPublicThumbKey(key));
}

/**
 * Banners copied under creators/ are already public and high-res.
 * Album thumbs stay public thumbs until upgraded; private medium/webp map to thumb to avoid 403.
 */
export function toPublicCreatorBannerUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  const key = extractStorageObjectKey(url);
  if (!key) return url;
  if (key.startsWith("vip-zips/") || key.startsWith("download-zips/")) return url;
  if (key.startsWith("creators/")) return getPublicUrl(key);
  if (isPrivateObjectKey(key)) return getPublicUrl(toPublicThumbKey(key));
  return getPublicUrl(key);
}

export function preferredBannerSourceKey(photo: {
  mediumKey?: string | null;
  webpKey?: string | null;
  thumbKey?: string | null;
}): string | null {
  return photo.mediumKey || photo.webpKey || photo.thumbKey || null;
}

/** True when the stored banner is still an album thumb (~400px) stretched across the hero. */
export function isLowResCreatorBanner(url: string | null | undefined): boolean {
  if (!url?.trim()) return true;
  const key = extractStorageObjectKey(url) || url;
  if (key.startsWith("creators/")) return false;
  return /\/thumb\//.test(key);
}

/** Public frontend only lists creators that have albums and an avatar. */
export function isCreatorPubliclyVisible(creator: {
  albumCount?: number | null;
  avatarUrl?: string | null;
  bannerUrl?: string | null;
}): boolean {
  return (creator.albumCount ?? 0) > 0 && Boolean(creator.avatarUrl?.trim());
}

export function withRewrittenCover<T extends { coverUrl?: string | null }>(album: T): T {
  return { ...album, coverUrl: rewritePublicMediaUrl(album.coverUrl ?? null) };
}

export function withRewrittenCreatorMedia<T extends {
  avatarUrl?: string | null;
  bannerUrl?: string | null;
  ogImage?: string | null;
}>(creator: T): T {
  return {
    ...creator,
    avatarUrl: toPublicCreatorImageUrl(creator.avatarUrl ?? null),
    bannerUrl: toPublicCreatorBannerUrl(creator.bannerUrl ?? null),
    ogImage: creator.ogImage != null ? toPublicCreatorBannerUrl(creator.ogImage) : creator.ogImage,
  };
}
