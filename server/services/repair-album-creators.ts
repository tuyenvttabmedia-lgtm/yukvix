import { desc, eq, isNull, or, sql } from "drizzle-orm";
import { getDb, updateCreatorAlbumCount } from "../db";
import { albums, creators } from "../../drizzle/schema";
import { findExistingCreator } from "./creator-service";
import {
  creatorNamesOverlap,
  looksLikeCreatorName,
  parseCreatorFromFilename,
} from "./creator-detect";

export async function repairUnlinkedAlbumCreators(): Promise<{
  total: number;
  updated: number;
  skipped: number;
  created: number;
  detached: number;
}> {
  const db = await getDb();
  if (!db) throw new Error("DB not available");

  const detached = await detachMislabeledCoserAlbums();

  const rows = await db
    .select({
      id: albums.id,
      title: albums.title,
      originalFileName: albums.originalFileName,
      cosplayer: albums.cosplayer,
      creator: albums.creator,
    })
    .from(albums)
    .where(isNull(albums.creatorId))
    .orderBy(desc(albums.id))
    .limit(2000);

  let updated = 0;
  let skipped = 0;

  for (const row of rows) {
    const filename = row.originalFileName || row.title || "";
    const parsed = parseCreatorFromFilename(filename);

    if (looksLikeCreatorName(parsed) && row.cosplayer !== parsed) {
      await db
        .update(albums)
        .set({
          cosplayer: parsed!.slice(0, 128),
          creator: parsed!.slice(0, 100),
          updatedAt: new Date(),
        })
        .where(eq(albums.id, row.id));
    }

    if (!looksLikeCreatorName(parsed)) {
      skipped += 1;
      continue;
    }

    try {
      const existing = await findExistingCreator(parsed!);
      if (!existing) {
        skipped += 1;
        continue;
      }
      await db
        .update(albums)
        .set({
          creatorId: existing.creatorId,
          cosplayer: existing.creator.name.slice(0, 128),
          creator: existing.creator.name.slice(0, 100),
          updatedAt: new Date(),
        })
        .where(eq(albums.id, row.id));
      await updateCreatorAlbumCount(existing.creatorId);
      updated += 1;
    } catch {
      skipped += 1;
    }
  }

  return { total: rows.length, updated, skipped, created: 0, detached };
}

/** Unlink albums whose assigned creator is leftover title text (rose, Kuuka, Coser). */
export async function detachMislabeledCoserAlbums(): Promise<number> {
  const db = await getDb();
  if (!db) return 0;

  const rows = await db
    .select({
      id: albums.id,
      title: albums.title,
      originalFileName: albums.originalFileName,
      creatorId: albums.creatorId,
      assignedName: creators.name,
    })
    .from(albums)
    .innerJoin(creators, eq(albums.creatorId, creators.id))
    .where(
      or(
        sql`${albums.title} LIKE 'Coser%'`,
        sql`${albums.originalFileName} LIKE 'Coser%'`,
        sql`${albums.title} LIKE 'COS %'`,
      )
    )
    .limit(2000);

  let detached = 0;
  const touchedCreators = new Set<number>();

  for (const row of rows) {
    const filename = row.originalFileName || row.title || "";
    const parsed = parseCreatorFromFilename(filename);
    const assigned = row.assignedName?.trim() || "";
    const samePerson = parsed && assigned && creatorNamesOverlap(parsed, assigned);
    if (samePerson) continue;

    await db
      .update(albums)
      .set({
        creatorId: null,
        cosplayer: looksLikeCreatorName(parsed) ? parsed!.slice(0, 128) : null,
        creator: looksLikeCreatorName(parsed) ? parsed!.slice(0, 100) : null,
        updatedAt: new Date(),
      })
      .where(eq(albums.id, row.id));
    if (row.creatorId) touchedCreators.add(row.creatorId);
    detached += 1;
  }

  for (const creatorId of touchedCreators) {
    await updateCreatorAlbumCount(creatorId);
  }

  return detached;
}
