/**
 * Alt Text Generator
 * Generates SEO-optimized alt text for cosplay photos based on album metadata and tags.
 *
 * Strategy (no LLM required — deterministic, instant):
 * 1. Combine: cosplayer name + character + series + relevant tags
 * 2. Vary per photo index to avoid duplicate alt text (Google penalises identical alts)
 * 3. Always append brand suffix "- yukvix" for brand consistency
 * 4. Cap at 125 chars (screen reader / SEO best practice)
 *
 * Examples:
 *   Photo 1: "Seoahn DJAWA Bunny Girl cosplay photo 1 – yukvix"
 *   Photo 2: "Seoahn DJAWA Bunny Girl cosplay photo 2 – yukvix"
 *   Photo 3: "Seoahn DJAWA Bunny Girl premium cosplay set photo 3 – yukvix"
 */

const BRAND = "yukvix";
const MAX_ALT_LENGTH = 125;

/** Descriptive modifiers cycled across photos to add variety */
const PHOTO_MODIFIERS = [
  "cosplay photo",
  "cosplay set photo",
  "premium cosplay photo",
  "cosplay gallery photo",
  "cosplay collection photo",
];

/** Tags that are too generic to add SEO value as standalone keywords */
const GENERIC_TAGS = new Set([
  "cosplay", "photo", "gallery", "premium", "vip", "set", "collection",
  "cute", "sexy", "hot", "beautiful", "pretty", "girl", "female", "model",
]);

/**
 * Pick the most descriptive tags for alt text (max 3, skip generic ones).
 * Prefer character/series tags over generic costume tags.
 */
function pickKeyTags(tagNames: string[], maxCount = 3): string[] {
  const filtered = tagNames
    .map((t) => t.trim())
    .filter((t) => t.length > 1 && !GENERIC_TAGS.has(t.toLowerCase()));
  // Deduplicate (case-insensitive)
  const seen = new Set<string>();
  const unique: string[] = [];
  for (const t of filtered) {
    const key = t.toLowerCase();
    if (!seen.has(key)) { seen.add(key); unique.push(t); }
  }
  return unique.slice(0, maxCount);
}

/**
 * Build the descriptive subject part of the alt text.
 * Priority: cosplayer > character > series > album title (first 4 words)
 */
function buildSubject(album: {
  title: string;
  cosplayer?: string | null;
  character?: string | null;
  series?: string | null;
}): string {
  const parts: string[] = [];

  if (album.cosplayer?.trim()) parts.push(album.cosplayer.trim());
  if (album.character?.trim()) parts.push(album.character.trim());
  if (album.series?.trim() && album.series.trim() !== album.character?.trim()) {
    parts.push(album.series.trim());
  }

  // Fallback: use first 4 words of album title
  if (parts.length === 0) {
    const titleWords = album.title.trim().split(/\s+/).slice(0, 4).join(" ");
    parts.push(titleWords);
  }

  return parts.join(" ");
}

/**
 * Generate a single SEO alt text for one photo.
 *
 * @param album    Album metadata (title, cosplayer, character, series)
 * @param tagNames Array of tag names attached to the album
 * @param index    0-based photo index within the album
 * @returns        Alt text string (max 125 chars)
 */
export function generateAltText(
  album: {
    title: string;
    cosplayer?: string | null;
    character?: string | null;
    series?: string | null;
  },
  tagNames: string[],
  index: number
): string {
  const subject = buildSubject(album);
  const keyTags = pickKeyTags(tagNames);
  const modifier = PHOTO_MODIFIERS[index % PHOTO_MODIFIERS.length]!;
  const photoNum = index + 1;

  // Build candidate: "Subject [Tag1 Tag2] modifier N - brand"
  let candidate: string;
  if (keyTags.length > 0) {
    candidate = `${subject} ${keyTags.join(" ")} ${modifier} ${photoNum} - ${BRAND}`;
  } else {
    candidate = `${subject} ${modifier} ${photoNum} - ${BRAND}`;
  }

  // Trim to max length while keeping the brand suffix intact
  if (candidate.length <= MAX_ALT_LENGTH) return candidate;

  // Progressively reduce tags until it fits
  for (let tagCount = keyTags.length - 1; tagCount >= 0; tagCount--) {
    const reduced = tagCount > 0
      ? `${subject} ${keyTags.slice(0, tagCount).join(" ")} ${modifier} ${photoNum} - ${BRAND}`
      : `${subject} ${modifier} ${photoNum} - ${BRAND}`;
    if (reduced.length <= MAX_ALT_LENGTH) return reduced;
  }

  // Last resort: truncate subject
  const suffix = ` ${modifier} ${photoNum} - ${BRAND}`;
  const maxSubjectLen = MAX_ALT_LENGTH - suffix.length;
  return subject.slice(0, maxSubjectLen) + suffix;
}

/**
 * Generate alt texts for all photos in an album.
 *
 * @param album     Album metadata
 * @param tagNames  Tag names attached to the album
 * @param count     Number of photos to generate alt texts for
 * @returns         Array of alt text strings (length === count)
 */
export function generateAltTextsForAlbum(
  album: {
    title: string;
    cosplayer?: string | null;
    character?: string | null;
    series?: string | null;
  },
  tagNames: string[],
  count: number
): string[] {
  return Array.from({ length: count }, (_, i) => generateAltText(album, tagNames, i));
}
