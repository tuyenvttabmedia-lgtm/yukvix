/**
 * SEO Quality Check Service (V4.9 Final)
 * Checks uniqueness, keyword spam, tag count, sentence patterns
 * before allowing an album to be published.
 */

export interface SeoQualityInput {
  seoTitle?: string | null;
  metaDescription?: string | null;
  shortDescription?: string | null;
  focusKeyword?: string | null;
  tags?: string | null; // JSON array string
}

export interface DuplicateMatch {
  field: string;
  albumId: number;
  albumSlug: string;
  similarity: number; // 0-1
}

export interface SeoQualityResult {
  passed: boolean;
  warnings: string[];
  errors: string[];
  duplicates: DuplicateMatch[];
}

export interface AlbumSeoRow {
  id: number;
  slug: string;
  seoTitle?: string | null;
  metaDescription?: string | null;
  shortDescription?: string | null;
  focusKeyword?: string | null;
  tags?: string | null;
}

/**
 * V4.9: SEO quality check before publishing
 * Checks: uniqueness, keyword spam, tag count, sentence patterns
 */
export function checkSeoQuality(
  albumId: number,
  seo: SeoQualityInput,
  recentAlbums: AlbumSeoRow[]
): SeoQualityResult {
  const warnings: string[] = [];
  const errors: string[] = [];
  const duplicates: DuplicateMatch[] = [];

  // 1. SEO title must be unique (>85% similarity = error)
  if (seo.seoTitle) {
    for (const a of recentAlbums) {
      if (a.id === albumId || !a.seoTitle) continue;
      const sim = similarity(a.seoTitle, seo.seoTitle);
      if (sim > 0.85) {
        errors.push(`SEO title too similar to album #${a.id} (${Math.round(sim * 100)}%)`);
        duplicates.push({ field: "seoTitle", albumId: a.id, albumSlug: a.slug, similarity: sim });
      }
    }
  }

  // 2. Meta description must be unique (>80% similarity = error)
  if (seo.metaDescription) {
    for (const a of recentAlbums) {
      if (a.id === albumId || !a.metaDescription) continue;
      const sim = similarity(a.metaDescription, seo.metaDescription);
      if (sim > 0.8) {
        errors.push(`Meta description too similar to album #${a.id} (${Math.round(sim * 100)}%)`);
        duplicates.push({ field: "metaDescription", albumId: a.id, albumSlug: a.slug, similarity: sim });
      }
    }
  }

  // 3. Short description must not duplicate (>75% similarity = warning)
  if (seo.shortDescription) {
    for (const a of recentAlbums) {
      if (a.id === albumId || !a.shortDescription) continue;
      const sim = similarity(a.shortDescription, seo.shortDescription);
      if (sim > 0.75) {
        warnings.push(
          `Short description similar to album #${a.id} (${Math.round(sim * 100)}%) — consider rewriting`
        );
        duplicates.push({ field: "shortDescription", albumId: a.id, albumSlug: a.slug, similarity: sim });
      }
    }
  }

  // 4. Focus keyword spam check (max 3 albums with same keyword)
  if (seo.focusKeyword) {
    const focusKwCount = recentAlbums.filter(
      (a) =>
        a.id !== albumId &&
        a.focusKeyword?.toLowerCase() === seo.focusKeyword!.toLowerCase()
    ).length;
    if (focusKwCount >= 3) {
      warnings.push(
        `Focus keyword "${seo.focusKeyword}" used in ${focusKwCount} other albums — may cause keyword cannibalization`
      );
    }
  }

  // 5. Tags count (3-20, soft warnings only)
  if (seo.tags) {
    let tagList: string[] = [];
    try {
      tagList = JSON.parse(seo.tags);
    } catch {
      // ignore parse error
    }
    if (tagList.length < 3) warnings.push(`Too few tags: ${tagList.length} (recommended: 5+)`);
    if (tagList.length > 20) warnings.push(`Too many tags: ${tagList.length} (recommended: max 20)`);
  }

  // 6. No repeated sentence templates
  if (seo.shortDescription) {
    const sentencePattern = extractSentencePattern(seo.shortDescription);
    for (const a of recentAlbums) {
      if (a.id === albumId || !a.shortDescription) continue;
      if (extractSentencePattern(a.shortDescription) === sentencePattern) {
        warnings.push(`Short description uses same sentence pattern as album #${a.id}`);
        break;
      }
    }
  }

  return { passed: errors.length === 0, warnings, errors, duplicates };
}

/** Simple string similarity (Jaccard on word sets) */
function similarity(a: string, b: string): number {
  if (!a || !b) return 0;
  const setA = new Set(a.toLowerCase().split(/\s+/));
  const setB = new Set(b.toLowerCase().split(/\s+/));
  const intersection = new Set([...setA].filter((x) => setB.has(x)));
  const union = new Set([...setA, ...setB]);
  return intersection.size / union.size;
}

/** Extract sentence pattern (first 5 words of each sentence) */
function extractSentencePattern(text: string): string {
  if (!text) return "";
  return text
    .split(/[.!?]/)
    .map((s) => s.trim().split(/\s+/).slice(0, 5).join(" ").toLowerCase())
    .filter(Boolean)
    .join("|");
}
