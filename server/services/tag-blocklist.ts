/** Shared generic tag blocklist — used by AI bulk tagging to prevent junk tags. */
export const GENERIC_TAG_BLOCKLIST = new Set([
  "asian-model",
  "asian-woman",
  "asian-girl",
  "asian-beauty",
  "attractive",
  "beautiful",
  "model",
  "photoshoot",
  "boudoir",
  "boudoir-shoot",
  "lingerie",
  "bedroom",
  "gravure",
  "premium-content",
  "cosplay",
  "cosplayer",
  "korean-model",
  "k-pop-model",
  "fashion",
  "fashioncosplay",
  "digitalphotobook",
  "premiumgallery",
  "photobook",
  "gallery",
  "photos",
  "photo",
  "sexy",
  "hot",
  "cute",
  "girl",
  "woman",
  "asian",
]);

export function isBlockedTagName(name: string): boolean {
  const normalized = name.toLowerCase().trim().replace(/\s+/g, "-");
  if (GENERIC_TAG_BLOCKLIST.has(normalized)) return true;
  if (normalized.startsWith("asian-")) return true;
  if (/^(beautiful|attractive|sexy|hot|cute)$/.test(normalized)) return true;
  return false;
}

export const MAX_TAGS_PER_ALBUM = 5;
