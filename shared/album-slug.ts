/**
 * Album URL slugs. CJK titles must romanize instead of being stripped to "coser"/"album".
 */
import { isPlaceholderCreatorSlug, slugifyCreatorName } from "./creator-slug";

const WEAK_SLUG = /^(album|coser|creator|photo|photoset|gallery)$/i;

export function clipSlug(slug: string, maxLen: number): string {
  const cleaned = slug.replace(/-+/g, "-").replace(/^-+|-+$/g, "");
  if (cleaned.length <= maxLen) return cleaned;
  const cut = cleaned.slice(0, maxLen).replace(/-+$/g, "");
  const lastDash = cut.lastIndexOf("-");
  return lastDash >= 16 ? cut.slice(0, lastDash) : cut;
}

/** True when slugify stripped CJK and left a generic token that will collide. */
export function isWeakAlbumSlug(slug: string | null | undefined): boolean {
  const s = (slug || "").trim().toLowerCase();
  if (!s) return true;
  if (WEAK_SLUG.test(s)) return true;
  if (isPlaceholderCreatorSlug(s)) return true;
  return s.length < 5;
}

/**
 * Romanize the full title (Latin kept, CJK pinyin/hangul/kana) then apply album cleanup.
 */
export function slugifyAlbumTitle(title: string, maxLen = 80): string {
  let s = title.trim();
  s = s.replace(/\([^)]*\)/g, " ");
  s = s.replace(/\.(zip|rar|7z)$/i, "");
  s = s.replace(/\bvol\.?\s*(\d+)/gi, " vol $1 ");
  s = s.replace(/\bno\.?\s*(\d+)/gi, " no $1 ");
  s = slugifyCreatorName(s, maxLen + 40);
  s = s.replace(/-(?:photoset|photobook|photo-set|set|collection)$/i, "");
  s = clipSlug(s, maxLen);
  return s || "album";
}

/** Prefer a romanized unique candidate; callers append jobId when the base is taken. */
export function albumSlugCandidate(title: string, jobId?: number, maxLen = 80): string {
  const base = slugifyAlbumTitle(title, jobId ? maxLen - String(jobId).length - 1 : maxLen);
  if (!jobId) return base || "album";
  const clipped = clipSlug(base, maxLen - String(jobId).length - 1);
  return `${clipped || "album"}-${jobId}`;
}

/** Pick a slug not in `taken`. Weak leftovers like "coser" always get a job suffix. */
export function nextUniqueAlbumSlug(base: string, jobId: number, taken: Set<string>): string {
  const normalized = clipSlug(base || "album", 80) || "album";
  if (!isWeakAlbumSlug(normalized) && !taken.has(normalized)) return normalized;

  const suffix = `-${jobId}`;
  let candidate = `${clipSlug(normalized, 80 - suffix.length) || "album"}${suffix}`;
  let n = 2;
  while (taken.has(candidate) || isWeakAlbumSlug(candidate)) {
    candidate = `${clipSlug(normalized, 70)}-${jobId}-${n}`;
    n += 1;
    if (n > 50) {
      candidate = `album-${jobId}-${Date.now().toString(36)}`;
      break;
    }
  }
  return candidate;
}
