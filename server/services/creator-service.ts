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
import { creators } from "../../drizzle/schema";
import { eq, sql } from "drizzle-orm";
import type { YukvixCategory } from "./seo-generator";
import { generateSlug } from "./seo-generator";

// Known collection names — do NOT create creators for these
export const KNOWN_COLLECTIONS = new Set([
  "XIUREN", "XiuRen", "IMISS", "UOM", "YouMi", "FeiLin", "MFStar", "Ugirls", "TouTiao",
  "ArtGravia", "DJAWA", "PIA", "Pure Media", "CreamSoda", "SWEETBOX",
  "MissKON", "MrCong", "Yukvix",
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

  const db = await getDb();
  if (!db) throw new Error("DB not available");

  const normalizedInput = normalizeName(name);

  // 1. Exact name match
  const exactMatch = await db
    .select()
    .from(creators)
    .where(eq(creators.name, name))
    .limit(1);

  if (exactMatch.length > 0) {
    return { creatorId: exactMatch[0].id, isNew: false, creator: exactMatch[0] };
  }

  // 2. Normalized name match
  const normalizedMatch = await db
    .select()
    .from(creators)
    .where(eq(creators.normalizedName, normalizedInput))
    .limit(1);

  if (normalizedMatch.length > 0) {
    return { creatorId: normalizedMatch[0].id, isNew: false, creator: normalizedMatch[0] };
  }

  // 3. Alias match — check if any existing creator has this name in their aliases JSON array
  const aliasMatch = await db
    .select()
    .from(creators)
    .where(sql`JSON_CONTAINS(${creators.aliases}, ${JSON.stringify(name)})`)
    .limit(1);

  if (aliasMatch.length > 0) {
    return { creatorId: aliasMatch[0].id, isNew: false, creator: aliasMatch[0] };
  }

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
    .select({ avatarKey: creators.avatarKey })
    .from(creators)
    .where(eq(creators.id, creatorId))
    .limit(1);

  if (existing.length > 0 && !existing[0].avatarKey) {
    await db
      .update(creators)
      .set({ avatarKey: thumbKey, updatedAt: new Date() })
      .where(eq(creators.id, creatorId));
    console.log(`[Creator] Updated avatar for creator ${creatorId}: ${thumbKey}`);
  }
}

/**
 * Increment album count for a creator.
 */
export async function incrementCreatorAlbumCount(creatorId: number): Promise<void> {
  const db = await getDb();
  if (!db) return;

  await db
    .update(creators)
    .set({
      albumCount: sql`${creators.albumCount} + 1`,
      updatedAt: new Date(),
    })
    .where(eq(creators.id, creatorId));
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
