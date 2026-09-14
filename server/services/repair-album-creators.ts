import { desc, eq, isNull } from "drizzle-orm";
import { getDb, updateCreatorAlbumCount } from "../db";
import { albums } from "../../drizzle/schema";
import { detectCategory } from "./seo-generator";
import { findOrCreateCreator } from "./creator-service";
import { looksLikeCreatorName, parseCreatorFromFilename, findCreatorInDb } from "./creator-detect";

export async function repairUnlinkedAlbumCreators(): Promise<{
  total: number;
  updated: number;
  skipped: number;
  created: number;
}> {
  const db = await getDb();
  if (!db) throw new Error("DB not available");

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
  let created = 0;

  for (const row of rows) {
    const filename = row.originalFileName || row.title || "";
    const parsed =
      parseCreatorFromFilename(filename) ||
      (looksLikeCreatorName(row.cosplayer) ? row.cosplayer : null) ||
      (looksLikeCreatorName(row.creator) ? row.creator : null);

    if (!looksLikeCreatorName(parsed)) {
      skipped += 1;
      continue;
    }

    try {
      const existing = await findCreatorInDb(filename);
      const linked = existing
        ? { creatorId: existing.id, creator: { name: existing.name }, isNew: false }
        : await findOrCreateCreator({
            name: parsed!,
            category: detectCategory(filename),
          });
      if (linked.isNew) created += 1;
      await db
        .update(albums)
        .set({
          creatorId: linked.creatorId,
          cosplayer: linked.creator.name.slice(0, 128),
          creator: linked.creator.name.slice(0, 100),
          updatedAt: new Date(),
        })
        .where(eq(albums.id, row.id));
      await updateCreatorAlbumCount(linked.creatorId);
      updated += 1;
    } catch {
      skipped += 1;
    }
  }

  return { total: rows.length, updated, skipped, created };
}
