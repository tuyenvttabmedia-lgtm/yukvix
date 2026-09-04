/**
 * Creator Service (V4.17)
 * Finds or creates creators during ZIP import pipeline.
 * Handles alias matching, normalized name matching, and auto-creation.
 *
 * Key rules:
 * - Do NOT treat collection names (XIUREN, ArtGravia, DJAWA, etc.) as creators
 * - Creator pages require admin review before indexing (publishStatus=draft)
 * - After image processing, use first album cover as creator avatar if empty
 */

import { getDb } from "../db";
import { albums, creators, photos } from "../../drizzle/schema";
import { desc, eq, or, sql } from "drizzle-orm";
import type { YukvixCategory } from "./seo-generator";
import { generateSlug } from "./seo-generator";
import { copyObject, getPublicUrl } from "../storage-wasabi";
import {
  extractStorageObjectKey,
  preferredBannerSourceKey,
  toPublicCreatorImageUrl,
  toPublicThumbKey,
} from "../public-media-url";

// Known collection names — do NOT create creators for these
export const KNOWN_COLLECTIONS = new Set([
  "XIUREN", "XiuRen", "IMISS", "UOM", "YouMi", "FeiLin", "MFStar", "Ugirls", "TouTiao",
  "ArtGravia", "DJAWA", "PIA", "Pure Media", "CreamSoda", "SWEETBOX",
  "MissKON", "MrCong", "Yukvix", "Photoset", "Photobook", "Espacia", "EHC",
]);

/**
 * Normalize a creator name for matching.
 * Lowercase, remove special chars, collapse whitespace.
 * Used for fuzzy matching across aliases.
 */
export function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^\w\u4e00-\u9fff\u3040-\u309f\u30a0-\u30ff\uac00-\ud7af\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export interface FindOrCreateCreatorInput {
  name: string;
  category?: YukvixCategory;
  aliases?: string[];
  avatarKey?: string;
  description?: string;
}

export interface FindOrCreateCreatorResult {
  creatorId: number;
  isNew: boolean;
  creator: typeof creators.$inferSelect;
}

/**
 * Match an existing creator only (name / normalized / alias). Never inserts.
 */
export async function findExistingCreator(
  name: string
): Promise<FindOrCreateCreatorResult | null> {
  if (!name.trim() || KNOWN_COLLECTIONS.has(name)) return null;

  const db = await getDb();
  if (!db) throw new Error("DB not available");

  const normalizedInput = normalizeName(name);

  const exactMatch = await db.select().from(creators).where(eq(creators.name, name)).limit(1);
  if (exactMatch.length > 0) {
    return { creatorId: exactMatch[0].id, isNew: false, creator: exactMatch[0] };
  }

  const normalizedMatch = await db
    .select()
    .from(creators)
    .where(eq(creators.normalizedName, normalizedInput))
    .limit(1);
  if (normalizedMatch.length > 0) {
    return { creatorId: normalizedMatch[0].id, isNew: false, creator: normalizedMatch[0] };
  }

  const aliasMatch = await db
    .select()
    .from(creators)
    .where(sql`JSON_CONTAINS(${creators.aliases}, ${JSON.stringify(name)})`)
    .limit(1);
  if (aliasMatch.length > 0) {
    return { creatorId: aliasMatch[0].id, isNew: false, creator: aliasMatch[0] };
  }

  return null;
}

export async function matchCreatorsByHints(
  hints: string[]
): Promise<Map<string, { id: number; name: string }>> {
  const result = new Map<string, { id: number; name: string }>();
  const unique = Array.from(new Set(hints.map(h => h.trim()).filter(Boolean)));
  if (!unique.length) return result;
  const db = await getDb();
  if (!db) return result;

  const rows = await db
    .select({
      id: creators.id,
      name: creators.name,
      normalizedName: creators.normalizedName,
      aliases: creators.aliases,
    })
    .from(creators);

  const byName = new Map<string, { id: number; name: string }>();
  const byNorm = new Map<string, { id: number; name: string }>();
  const byAlias = new Map<string, { id: number; name: string }>();

  for (const row of rows) {
    const ref = { id: row.id, name: row.name };
    byName.set(row.name.toLowerCase(), ref);
    if (row.normalizedName) byNorm.set(row.normalizedName, ref);
    try {
      const aliases = JSON.parse(row.aliases || "[]") as unknown;
      if (!Array.isArray(aliases)) continue;
      for (const alias of aliases) {
        if (typeof alias !== "string" || !alias.trim()) continue;
        byAlias.set(alias.trim().toLowerCase(), ref);
      }
    } catch {
      /* ignore bad alias JSON */
    }
  }

  for (const hint of unique) {
    if (KNOWN_COLLECTIONS.has(hint)) continue;
    const lower = hint.toLowerCase();
    const hit =
      byName.get(lower) || byNorm.get(normalizeName(hint)) || byAlias.get(lower);
    if (hit) result.set(hint, hit);
  }
  return result;
}

/**
 * Find or create a creator.
 * Matching order:
 * 1. Exact name match
 * 2. Normalized name match
 * 3. Alias match (JSON array contains)
 * 4. Create new creator if no match found
 */
export async function findOrCreateCreator(
  input: FindOrCreateCreatorInput
): Promise<FindOrCreateCreatorResult> {
  const { name, category, aliases = [], avatarKey, description } = input;

  // Skip known collection names
  if (KNOWN_COLLECTIONS.has(name)) {
    throw new Error(`"${name}" is a collection name, not a creator`);
  }

  const existing = await findExistingCreator(name);
  if (existing) {
    return { creatorId: existing.creatorId, isNew: false, creator: existing.creator };
  }

  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const normalizedInput = normalizeName(name);

  // 4. Create new creator
  const slug = await generateUniqueCreatorSlug(name, db);
  const allAliases = [name, ...aliases].filter(Boolean);

  const [result] = await db.insert(creators).values({
    name,
    slug,
    normalizedName: normalizedInput,
    aliases: JSON.stringify(allAliases),
    avatarKey: avatarKey || null,
    bio: description || null,
    publishStatus: "draft",  // Admin must review before indexing
    aiGenerated: true,
    albumCount: 0,
  });

  const insertId = (result as { insertId: number }).insertId;
  const newCreator = await db
    .select()
    .from(creators)
    .where(eq(creators.id, insertId))
    .limit(1);

  console.log(`[Creator] Created new creator: "${name}" (slug=${slug}, id=${insertId})`);

  return {
    creatorId: insertId,
    isNew: true,
    creator: newCreator[0],
  };
}

/**
 * Update creator avatar if currently empty.
 * Called after image processing with the first album cover thumbnail key.
 */
export async function updateCreatorAvatarIfEmpty(
  creatorId: number,
  thumbKey: string
): Promise<void> {
  const db = await getDb();
  if (!db) return;

  const existing = await db
    .select({ avatarKey: creators.avatarKey, avatarUrl: creators.avatarUrl })
    .from(creators)
    .where(eq(creators.id, creatorId))
    .limit(1);

  if (existing.length > 0 && !existing[0].avatarUrl) {
    await db
      .update(creators)
      .set({
        avatarKey: existing[0].avatarKey || thumbKey,
        avatarUrl: getPublicUrl(thumbKey),
        updatedAt: new Date(),
      })
      .where(eq(creators.id, creatorId));
    console.log(`[Creator] Updated avatar for creator ${creatorId}: ${thumbKey}`);
  }
}

/**
 * Increment album count for a creator.
 */

/**
 * Set creator banner from first album hero image if banner empty (UAT ENHANCEMENT-002).
 */
export async function updateCreatorBannerIfEmpty(
  creatorId: number,
  mediumKey: string,
  mediumUrl?: string
): Promise<void> {
  const db = await getDb();
  if (!db) return;

  const existing = await db
    .select({ bannerKey: creators.bannerKey, bannerUrl: creators.bannerUrl })
    .from(creators)
    .where(eq(creators.id, creatorId))
    .limit(1);

  if (existing.length > 0 && !existing[0].bannerUrl) {
    const published = await publishCreatorImage(creatorId, "banner", mediumKey);
    if (!published) return;
    await db
      .update(creators)
      .set({
        bannerKey: published.key,
        bannerUrl: published.url,
        updatedAt: new Date(),
      })
      .where(eq(creators.id, creatorId));
    console.log(`[Creator] Updated banner for creator ${creatorId}: ${published.key}`);
  }
}

export async function incrementCreatorAlbumCount(creatorId: number): Promise<void> {
  const { updateCreatorAlbumCount } = await import("../db");
  await updateCreatorAlbumCount(creatorId);
}

export type PickedCreatorImage = { url: string; key: string };

function imageFromThumb(thumbKey: string | null | undefined, thumbUrl: string | null | undefined): PickedCreatorImage | null {
  if (thumbKey) return { url: getPublicUrl(thumbKey), key: thumbKey };
  const url = toPublicCreatorImageUrl(thumbUrl);
  if (!url) return null;
  const extracted = thumbUrl ? extractStorageObjectKey(thumbUrl) : null;
  return { url, key: extracted ? toPublicThumbKey(extracted) : "auto-picked" };
}

/** Copy a private album variant into the public creators/ prefix (bucket policy allows GetObject). */
export async function publishCreatorImage(
  creatorId: number,
  type: "avatar" | "banner",
  sourceKey: string
): Promise<PickedCreatorImage | null> {
  if (!sourceKey) return null;
  if (sourceKey.startsWith("creators/")) {
    return { url: getPublicUrl(sourceKey), key: sourceKey };
  }
  const destKey = `creators/${type}/${creatorId}-${Date.now()}.webp`;
  try {
    const copied = await copyObject(sourceKey, destKey);
    if (copied) return { url: getPublicUrl(destKey), key: destKey };
  } catch (err) {
    console.warn(`[Creator] Failed to copy ${type} from ${sourceKey}:`, err);
  }
  const thumbKey = toPublicThumbKey(sourceKey);
  return { url: getPublicUrl(thumbKey), key: thumbKey };
}

export async function listCreatorAlbumIds(creatorId: number, creatorName: string, limit = 20): Promise<number[]> {
  const db = await getDb();
  if (!db) return [];
  const rows = await db
    .select({ id: albums.id })
    .from(albums)
    .where(or(eq(albums.creatorId, creatorId), eq(albums.cosplayer, creatorName)))
    .orderBy(desc(albums.viewCount), desc(albums.id))
    .limit(limit);
  return rows.map((r) => r.id);
}

/**
 * Pick public thumb/cover URLs from a creator's albums (by creatorId or cosplayer name).
 */
export async function pickCreatorImagesFromAlbums(
  creatorId: number,
  opts?: { albumId?: number }
): Promise<{ avatar: PickedCreatorImage | null; banner: PickedCreatorImage | null }> {
  const db = await getDb();
  if (!db) return { avatar: null, banner: null };

  const [creator] = await db
    .select({ id: creators.id, name: creators.name })
    .from(creators)
    .where(eq(creators.id, creatorId))
    .limit(1);
  if (!creator) return { avatar: null, banner: null };

  const albumWhere = opts?.albumId
    ? eq(albums.id, opts.albumId)
    : or(eq(albums.creatorId, creatorId), eq(albums.cosplayer, creator.name));

  const albumRows = await db
    .select({ id: albums.id, coverUrl: albums.coverUrl, coverKey: albums.coverKey })
    .from(albums)
    .where(albumWhere)
    .orderBy(desc(albums.viewCount), desc(albums.id))
    .limit(10);

  let avatar: PickedCreatorImage | null = null;
  let banner: PickedCreatorImage | null = null;

  for (const album of albumRows) {
    const photoRows = await db
      .select({
        thumbKey: photos.thumbKey,
        thumbUrl: photos.thumbUrl,
        mediumKey: photos.mediumKey,
        webpKey: photos.webpKey,
        width: photos.width,
        height: photos.height,
      })
      .from(photos)
      .where(eq(photos.albumId, album.id))
      .orderBy(photos.sortOrder)
      .limit(8);

    const coverImage = album.coverKey
      ? { url: getPublicUrl(album.coverKey), key: album.coverKey }
      : imageFromThumb(null, album.coverUrl);

    if (!avatar) {
      const portrait =
        photoRows.find((p) => !p.width || !p.height || p.height >= p.width * 0.8) || photoRows[0];
      avatar = (portrait && imageFromThumb(portrait.thumbKey, portrait.thumbUrl)) || coverImage;
    }
    if (!banner) {
      const landscape = photoRows.find((p) => p.width && p.height && p.width > p.height * 1.3);
      const bannerPhoto = landscape || photoRows[0];
      const sourceKey = bannerPhoto ? preferredBannerSourceKey(bannerPhoto) : null;
      banner = sourceKey
        ? await publishCreatorImage(creatorId, "banner", sourceKey)
        : coverImage;
    }
    if (avatar && banner) break;
  }

  return { avatar, banner };
}

export async function applyCreatorImagesFromAlbums(
  creatorId: number,
  opts?: { albumId?: number; applyAvatar?: boolean; applyBanner?: boolean }
): Promise<{ avatarUrl: string | null; bannerUrl: string | null; applied: boolean }> {
  const applyAvatar = opts?.applyAvatar !== false;
  const applyBanner = opts?.applyBanner !== false;
  const picked = await pickCreatorImagesFromAlbums(creatorId, { albumId: opts?.albumId });
  const db = await getDb();
  if (!db) return { avatarUrl: null, bannerUrl: null, applied: false };

  const updates: Partial<typeof creators.$inferInsert> = { updatedAt: new Date() };
  if (applyAvatar && picked.avatar) {
    updates.avatarUrl = picked.avatar.url;
    updates.avatarKey = picked.avatar.key;
  }
  if (applyBanner && picked.banner) {
    updates.bannerUrl = picked.banner.url;
    updates.bannerKey = picked.banner.key;
  }
  const applied = Boolean((applyAvatar && picked.avatar) || (applyBanner && picked.banner));
  if (applied) {
    await db.update(creators).set(updates).where(eq(creators.id, creatorId));
  }
  return {
    avatarUrl: applyAvatar ? picked.avatar?.url ?? null : null,
    bannerUrl: applyBanner ? picked.banner?.url ?? null : null,
    applied,
  };
}

function clipSeo(text: string, max: number): string {
  const t = text.trim();
  if (t.length <= max) return t;
  return `${t.slice(0, Math.max(0, max - 1)).trimEnd()}…`;
}

export function fallbackCreatorSeo(name: string): {
  focusKeyword: string;
  seoTitle: string;
  seoDescription: string;
} {
  const n = name.trim() || "Cosplayer";
  return {
    focusKeyword: clipSeo(`${n} cosplay`, 200),
    seoTitle: clipSeo(`${n} Cosplay Photos | Yukvix`, 60),
    seoDescription: clipSeo(
      `Browse ${n} cosplay photosets on Yukvix — characters, series, and albums.`,
      160
    ),
  };
}

async function tryAiCreatorSeo(name: string, bio?: string | null): Promise<{
  focusKeyword: string;
  seoTitle: string;
  seoDescription: string;
} | null> {
  try {
    const { callAi } = await import("./ai-provider");
    const contextParts = [`Name: ${name}`];
    if (bio) contextParts.push(`Bio: ${bio}`);
    const result = await callAi({
      messages: [
        {
          role: "system",
          content: `You are an SEO expert specializing in cosplay content creators.
Generate SEO metadata for a cosplay creator/model profile page.
Rules:
- focusKeyword: 2-4 words, most important search term (e.g. "Sakura cosplay model")
- metaTitle: 50-60 characters, include creator name and "cosplay"
- metaDescription: 140-160 characters, engaging description of the creator
- Use English for all output
- Return valid JSON only`,
        },
        {
          role: "user",
          content: `Generate SEO metadata for this cosplay creator:\n\n${contextParts.join("\n")}`,
        },
      ],
      responseFormat: {
        type: "json_schema",
        json_schema: {
          name: "creator_seo",
          strict: true,
          schema: {
            type: "object",
            properties: {
              focusKeyword: { type: "string" },
              metaTitle: { type: "string" },
              metaDescription: { type: "string" },
            },
            required: ["focusKeyword", "metaTitle", "metaDescription"],
            additionalProperties: false,
          },
        },
      },
    });
    if (!result.content) return null;
    const parsed = JSON.parse(result.content) as {
      focusKeyword?: string;
      metaTitle?: string;
      metaDescription?: string;
    };
    if (!parsed.metaTitle || !parsed.metaDescription) return null;
    return {
      focusKeyword: clipSeo(parsed.focusKeyword || `${name} cosplay`, 200),
      seoTitle: clipSeo(parsed.metaTitle, 60),
      seoDescription: clipSeo(parsed.metaDescription, 160),
    };
  } catch {
    return null;
  }
}

/** Fill empty SEO and pick avatar/banner from a linked album. */
export async function enrichCreatorAfterLink(
  creatorId: number,
  opts?: { albumId?: number }
): Promise<{ seo: boolean; images: boolean }> {
  const db = await getDb();
  if (!db) return { seo: false, images: false };
  const [creator] = await db
    .select()
    .from(creators)
    .where(eq(creators.id, creatorId))
    .limit(1);
  if (!creator) return { seo: false, images: false };

  let seo = false;
  if (!creator.seoTitle?.trim() || !creator.seoDescription?.trim()) {
    const next = fallbackCreatorSeo(creator.name);
    await db
      .update(creators)
      .set({
        seoTitle: creator.seoTitle?.trim() || next.seoTitle,
        seoDescription: creator.seoDescription?.trim() || next.seoDescription,
        focusKeyword: creator.focusKeyword?.trim() || next.focusKeyword,
        updatedAt: new Date(),
      })
      .where(eq(creators.id, creatorId));
    seo = true;
    void tryAiCreatorSeo(creator.name, creator.bio)
      .then(async ai => {
        if (!ai) return;
        const [latest] = await db
          .select({
            seoTitle: creators.seoTitle,
            seoDescription: creators.seoDescription,
            focusKeyword: creators.focusKeyword,
          })
          .from(creators)
          .where(eq(creators.id, creatorId))
          .limit(1);
        if (!latest) return;
        const stillFallback =
          latest.seoTitle === next.seoTitle && latest.seoDescription === next.seoDescription;
        if (!stillFallback) return;
        await db
          .update(creators)
          .set({
            seoTitle: ai.seoTitle,
            seoDescription: ai.seoDescription,
            focusKeyword: latest.focusKeyword?.trim() || ai.focusKeyword,
            updatedAt: new Date(),
          })
          .where(eq(creators.id, creatorId));
      })
      .catch(() => undefined);
  }

  const images = await applyCreatorImagesFromAlbums(creatorId, {
    albumId: opts?.albumId,
    applyAvatar: !creator.avatarUrl,
    applyBanner: !creator.bannerUrl,
  });
  return { seo, images: images.applied };
}

export async function applyCreatorImageFromPhoto(
  creatorId: number,
  photoId: number,
  type: "avatar" | "banner"
): Promise<{ url: string; key: string }> {
  const db = await getDb();
  if (!db) throw new Error("DB not available");

  const [photo] = await db
    .select({
      thumbKey: photos.thumbKey,
      thumbUrl: photos.thumbUrl,
      mediumKey: photos.mediumKey,
      webpKey: photos.webpKey,
    })
    .from(photos)
    .where(eq(photos.id, photoId))
    .limit(1);
  if (!photo) throw new Error("Photo not found");

  let picked: PickedCreatorImage | null = null;
  if (type === "banner") {
    const sourceKey = preferredBannerSourceKey(photo);
    picked = sourceKey ? await publishCreatorImage(creatorId, "banner", sourceKey) : null;
  } else {
    picked = imageFromThumb(photo.thumbKey, photo.thumbUrl);
  }
  if (!picked) throw new Error("Photo has no usable image");

  const updates: Partial<typeof creators.$inferInsert> =
    type === "avatar"
      ? { avatarUrl: picked.url, avatarKey: picked.key, updatedAt: new Date() }
      : { bannerUrl: picked.url, bannerKey: picked.key, updatedAt: new Date() };
  await db.update(creators).set(updates).where(eq(creators.id, creatorId));
  return picked;
}

/**
 * Generate a unique slug for a creator.
 * Appends numeric suffix if slug already exists.
 */
async function generateUniqueCreatorSlug(
  name: string,
  db: Awaited<ReturnType<typeof getDb>>
): Promise<string> {
  if (!db) throw new Error("DB not available");
  const base = generateSlug(name) || "creator";
  let slug = base;
  let attempt = 1;

  while (true) {
    const existing = await db
      .select({ id: creators.id })
      .from(creators)
      .where(eq(creators.slug, slug))
      .limit(1);

    if (existing.length === 0) return slug;

    attempt++;
    slug = `${base}-${attempt}`;
  }
}
