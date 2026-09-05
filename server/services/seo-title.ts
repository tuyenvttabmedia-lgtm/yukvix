/**
 * Natural SEO titles from the original album / filename.
 * Bulk Generate SEO and ZIP import must keep name order — never rearrange
 * collection codes, volume numbers, or model names.
 */

export const SEO_TITLE_MAX = 60;
export const SEO_DESCRIPTION_MAX = 160;

const GENERIC_TOKENS = new Set([
  "photoset",
  "photobook",
  "photos",
  "photo",
  "album",
  "gallery",
  "vol",
  "volume",
  "no",
  "the",
  "and",
  "set",
  "zip",
  "rar",
  "collection",
]);

const BANNED_AI_WORDS = [
  "allure",
  "captivating",
  "stunning",
  "breathtaking",
  "enchanting",
  "mesmerizing",
  "ethereal",
  "exquisite",
  "sensual",
  "seductive",
  "provocative",
  "tantalizing",
  "sultry",
  "irresistible",
  "magnetic",
  "spellbinding",
  "dive into",
  "unlock",
  "must-see",
  "unmissable",
];

export type AlbumSeoContext = {
  title: string;
  cosplayer?: string | null;
  character?: string | null;
  series?: string | null;
  isVip?: boolean;
};

export type AlbumSeoFields = {
  focusKeyword: string;
  metaTitle: string;
  metaDescription: string;
};

export function tidyAlbumTitle(raw: string): string {
  return (raw || "")
    .replace(/\.(zip|rar|7z)$/i, "")
    .replace(/[._]+/g, " ")
    .replace(/\s*[-–—]\s*/g, " - ")
    .replace(/\s+/g, " ")
    .trim();
}

export function clipSeoTitle(value: string, max = SEO_TITLE_MAX): string {
  const s = value.trim();
  if (s.length <= max) return s;
  const cut = s.slice(0, max);
  const sp = cut.lastIndexOf(" ");
  const clipped = (sp > Math.min(40, max - 20) ? cut.slice(0, sp) : cut)
    .replace(/[-–—,.:;|/]+$/g, "")
    .trim();
  return clipped || s.slice(0, max).trim();
}

export function clipSeoDescription(value: string, max = SEO_DESCRIPTION_MAX): string {
  const s = value.replace(/\s+/g, " ").trim();
  if (s.length <= max) return s;
  const cut = s.slice(0, max);
  const sp = cut.lastIndexOf(" ");
  return (sp > 80 ? cut.slice(0, sp) : cut).replace(/[-–—,.:;]+$/g, "").trim();
}

export function significantTitleTokens(title: string): string[] {
  return tidyAlbumTitle(title)
    .split(/\s+/)
    .map((token) => token.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, ""))
    .filter((token) => token.length >= 2 && !GENERIC_TOKENS.has(token.toLowerCase()));
}

/** True when candidate keeps original name tokens in the same relative order. */
export function titleKeepsOriginalOrder(original: string, candidate: string): boolean {
  const tokens = significantTitleTokens(original);
  if (tokens.length === 0) return true;
  const hay = (candidate || "").toLowerCase();
  let from = 0;
  for (const token of tokens) {
    const idx = hay.indexOf(token.toLowerCase(), from);
    if (idx < 0) return false;
    from = idx + token.length;
  }
  return true;
}

export function looksLikeCosplay(album: AlbumSeoContext, tagNames = ""): boolean {
  const blob = `${album.title} ${album.character || ""} ${album.series || ""} ${tagNames}`.toLowerCase();
  return /\bcosplay\b|コスプレ/.test(blob);
}

export function hasBannedAiWording(text: string): boolean {
  const lower = (text || "").toLowerCase();
  return BANNED_AI_WORDS.some((word) => lower.includes(word));
}

export function naturalAlbumSeoTitle(originalTitle: string, siteName = "Yukvix"): string {
  const tidy = tidyAlbumTitle(originalTitle);
  if (!tidy) return clipSeoTitle(`Photo gallery | ${siteName}`);
  const withSite = `${tidy} | ${siteName}`;
  if (withSite.length <= SEO_TITLE_MAX) return withSite;
  return clipSeoTitle(tidy);
}

export function naturalFocusKeyword(album: AlbumSeoContext): string {
  const cosplayer = album.cosplayer?.trim();
  const character = album.character?.trim();
  if (cosplayer && character) return clipSeoTitle(`${character} ${cosplayer}`, 40);
  if (cosplayer) return clipSeoTitle(`${cosplayer} photos`, 40);
  if (character) return clipSeoTitle(`${character} photos`, 40);
  const tokens = significantTitleTokens(album.title).slice(0, 4);
  if (tokens.length > 0) return tokens.join(" ").slice(0, 40);
  return clipSeoTitle(tidyAlbumTitle(album.title) || "photo gallery", 40);
}

export function naturalAlbumSeoDescription(album: AlbumSeoContext, siteName = "Yukvix"): string {
  const title = tidyAlbumTitle(album.title) || "this album";
  const by = album.cosplayer?.trim() ? ` by ${album.cosplayer.trim()}` : "";
  const series = album.series?.trim() && !title.toLowerCase().includes(album.series.trim().toLowerCase())
    ? ` (${album.series.trim()})`
    : "";
  return clipSeoDescription(`Photos from ${title}${series}${by}. View the full set on ${siteName}.`);
}

export function sanitizeFocusKeyword(album: AlbumSeoContext, candidate: string | undefined, tagNames = ""): string {
  const fallback = naturalFocusKeyword(album);
  let kw = (candidate || "").replace(/\s+/g, " ").trim();
  if (!kw || kw.length < 2) return fallback;
  if (/\bcosplay\b/i.test(kw) && !looksLikeCosplay(album, tagNames)) {
    kw = kw.replace(/\bcosplay\b/gi, "").replace(/\s+/g, " ").trim();
  }
  kw = kw.replace(/\b(premium|vip)\b/gi, "").replace(/\s+/g, " ").trim();
  return clipSeoTitle(kw || fallback, 40);
}

export function sanitizeAiSeoDescription(
  album: AlbumSeoContext,
  candidate: string | undefined,
  siteName = "Yukvix"
): string {
  const fallback = naturalAlbumSeoDescription(album, siteName);
  let text = (candidate || "")
    .replace(/\b(premium|vip)\b/gi, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!text || hasBannedAiWording(text)) return fallback;
  const tokens = significantTitleTokens(album.title);
  if (tokens.length > 0) {
    const hay = text.toLowerCase();
    const mentionsTitle = tokens.some((token) => hay.includes(token.toLowerCase()));
    const mentionsPerson = album.cosplayer && hay.includes(album.cosplayer.toLowerCase());
    if (!mentionsTitle && !mentionsPerson) return fallback;
  }
  return clipSeoDescription(text);
}

/**
 * Always keep the original album/filename order in the SEO title.
 * AI may only supply keyword + description.
 */
export function mergeAiAlbumSeo(
  album: AlbumSeoContext,
  ai?: Partial<AlbumSeoFields>,
  options?: { tagNames?: string; siteName?: string }
): AlbumSeoFields {
  const siteName = options?.siteName || "Yukvix";
  return {
    focusKeyword: sanitizeFocusKeyword(album, ai?.focusKeyword, options?.tagNames),
    metaTitle: naturalAlbumSeoTitle(album.title, siteName),
    metaDescription: sanitizeAiSeoDescription(album, ai?.metaDescription, siteName),
  };
}

export function naturalCreatorSeoTitle(name: string, siteName = "Yukvix"): string {
  const n = (name || "Creator").trim();
  return clipSeoTitle(`${n} | ${siteName}`);
}

export function mergeAiCreatorSeo(
  creator: { name: string; bio?: string | null; country?: string | null },
  ai?: Partial<AlbumSeoFields>,
  siteName = "Yukvix"
): AlbumSeoFields {
  const name = creator.name.trim() || "Creator";
  const country = creator.country?.trim();
  const fallbackDesc = clipSeoDescription(
    `${name} photo gallery${country ? ` from ${country}` : ""}. Browse albums on ${siteName}.`
  );
  let desc = (ai?.metaDescription || "").replace(/\b(premium|vip)\b/gi, "").replace(/\s+/g, " ").trim();
  if (!desc || hasBannedAiWording(desc) || !desc.toLowerCase().includes(name.toLowerCase())) {
    desc = fallbackDesc;
  } else {
    desc = clipSeoDescription(desc);
  }
  let kw = (ai?.focusKeyword || "").replace(/\s+/g, " ").trim();
  if (!kw || kw.length < 2) kw = `${name} photos`;
  return {
    focusKeyword: clipSeoTitle(kw, 40),
    metaTitle: naturalCreatorSeoTitle(name, siteName),
    metaDescription: desc,
  };
}
