/**
 * Reuse the same Wasabi/CDN presigned GET URL for a key while it still has TTL left.
 *
 * AWS signatures include X-Amz-Date, so a fresh getSignedUrl() every request
 * busts the browser (and Cloudflare) cache — lightbox next then re-downloads
 * medium/4K even for photos the user just viewed.
 */

const MIN_REUSE_MS = 10 * 60 * 1000;
const MAX_ENTRIES = 8_000;

type Entry = { url: string; expiresAt: number };

const cache = new Map<string, Entry>();

function cacheKey(objectKey: string, expiresInSeconds: number): string {
  return `${expiresInSeconds}:${objectKey}`;
}

export function peekSignedMediaUrl(
  objectKey: string,
  expiresInSeconds = 3600,
  now = Date.now(),
  minRemainingMs = MIN_REUSE_MS
): string | null {
  const key = cacheKey(objectKey, expiresInSeconds);
  const row = cache.get(key);
  if (!row) return null;
  if (row.expiresAt - now < minRemainingMs) {
    cache.delete(key);
    return null;
  }
  cache.delete(key);
  cache.set(key, row);
  return row.url;
}

export function rememberSignedMediaUrl(
  objectKey: string,
  url: string,
  expiresInSeconds = 3600,
  now = Date.now()
): void {
  while (cache.size >= MAX_ENTRIES) {
    const oldest = cache.keys().next().value;
    if (oldest === undefined) break;
    cache.delete(oldest);
  }
  cache.set(cacheKey(objectKey, expiresInSeconds), {
    url,
    expiresAt: now + expiresInSeconds * 1000,
  });
}

export function clearSignedMediaUrlCache(): void {
  cache.clear();
}

export function signedMediaUrlCacheSize(): number {
  return cache.size;
}
