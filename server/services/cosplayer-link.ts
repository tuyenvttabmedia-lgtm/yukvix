import { and, desc, eq, inArray, isNull, like, notInArray, or, sql } from "drizzle-orm";
import { adminSettings, albums, creators } from "../../drizzle/schema";
import { getDb, updateCreatorAlbumCount } from "../db";
import { mysqlAffectedRows } from "../social/mysql-result";
import {
  albumCosplayerHint,
  displayCosplayerName,
} from "./cosplayer-name";
import { enrichCreatorAfterLink, findOrCreateCreator, matchCreatorsByHints } from "./creator-service";

export const COSPLAYER_SKIPPED_KEY = "cosplayer_link_skipped_ids";

export type CosplayerQueueBucket = "named" | "empty" | "skipped";

function parseSkippedIds(raw: string | null | undefined): number[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return Array.from(
      new Set(
        parsed.filter(
          (id): id is number => typeof id === "number" && Number.isInteger(id) && id > 0
        )
      )
    );
  } catch {
    return [];
  }
}

export async function loadSkippedAlbumIds(): Promise<number[]> {
  const db = await getDb();
  if (!db) return [];
  const [row] = await db
    .select({ value: adminSettings.value })
    .from(adminSettings)
    .where(eq(adminSettings.key, COSPLAYER_SKIPPED_KEY))
    .limit(1);
  return parseSkippedIds(row?.value);
}

async function saveSkippedAlbumIds(ids: number[]): Promise<void> {
  const db = await getDb();
  if (!db) return;
  const unique = Array.from(new Set(ids)).sort((a, b) => a - b);
  const value = JSON.stringify(unique);
  const [existing] = await db
    .select({ id: adminSettings.id })
    .from(adminSettings)
    .where(eq(adminSettings.key, COSPLAYER_SKIPPED_KEY))
    .limit(1);
  if (existing) {
    await db
      .update(adminSettings)
      .set({ value })
      .where(eq(adminSettings.key, COSPLAYER_SKIPPED_KEY));
    return;
  }
  await db.insert(adminSettings).values({ key: COSPLAYER_SKIPPED_KEY, value });
}

const emptyName = or(isNull(albums.cosplayer), eq(albums.cosplayer, ""));
const emptyCreatorText = or(isNull(albums.creator), eq(albums.creator, ""));
const hasHint = or(
  and(sql`${albums.cosplayer} IS NOT NULL`, sql`${albums.cosplayer} <> ''`),
  and(sql`${albums.creator} IS NOT NULL`, sql`${albums.creator} <> ''`)
);
const noHint = and(emptyName, emptyCreatorText);
const unlinked = isNull(albums.creatorId);

function notInIds(ids: number[]) {
  if (ids.length === 0) return undefined;
  return notInArray(albums.id, ids);
}

function inIds(ids: number[]) {
  if (ids.length === 0) return sql`1 = 0`;
  return inArray(albums.id, ids);
}

export const COSPLAYER_LINK_BULK_MAX = 500;

/** Strip LIKE wildcards so a typed name cannot match everything. */
export function likeContainsPattern(raw?: string): string | undefined {
  const search = raw?.trim();
  if (!search) return undefined;
  const cleaned = search.replace(/[%_\\]/g, "");
  if (!cleaned) return undefined;
  return `%${cleaned}%`;
}

export function albumSearchCondition(search?: string) {
  const pattern = likeContainsPattern(search);
  if (!pattern) return undefined;
  return or(
    like(albums.title, pattern),
    like(albums.cosplayer, pattern),
    like(albums.creator, pattern)
  );
}

function queueWhereParts(opts: {
  bucket: CosplayerQueueBucket;
  skipped: number[];
  search?: string;
  includeLinked?: boolean;
}) {
  const skipFilter = notInIds(opts.skipped);
  const searchFilter = albumSearchCondition(opts.search);
  if (opts.bucket === "skipped") {
    return and(...[inIds(opts.skipped), searchFilter].filter(Boolean));
  }
  // Searching by name should find albums even when the hint is only in the title.
  if (searchFilter) {
    return and(
      ...[opts.includeLinked ? undefined : unlinked, skipFilter, searchFilter].filter(Boolean)
    );
  }
  const bucketParts =
    opts.bucket === "named"
      ? [opts.includeLinked ? undefined : unlinked, hasHint, skipFilter]
      : [unlinked, noHint, skipFilter];
  return and(...bucketParts.filter(Boolean));
}

/** Copy catalog name onto albums that already have creatorId but empty cosplayer. */
export async function backfillAlbumCosplayerFromCreator(): Promise<number> {
  const db = await getDb();
  if (!db) return 0;
  const result = await db.execute(sql`
    UPDATE albums
    INNER JOIN creators ON creators.id = albums.creatorId
    SET
      albums.cosplayer = LEFT(creators.name, 128),
      albums.creator = COALESCE(NULLIF(albums.creator, ''), LEFT(creators.name, 100))
    WHERE albums.creatorId IS NOT NULL
      AND (albums.cosplayer IS NULL OR albums.cosplayer = '')
  `);
  return mysqlAffectedRows(result);
}

export async function countCosplayerQueue(): Promise<{
  named: number;
  empty: number;
  skipped: number;
}> {
  const db = await getDb();
  if (!db) return { named: 0, empty: 0, skipped: 0 };
  const skipped = await loadSkippedAlbumIds();
  const skipFilter = notInIds(skipped);
  const namedParts = [unlinked, hasHint, skipFilter].filter(Boolean);
  const emptyParts = [unlinked, noHint, skipFilter].filter(Boolean);

  const namedWhere = and(...namedParts);
  const emptyWhere = and(...emptyParts);

  const [[namedRow], [emptyRow]] = await Promise.all([
    db.select({ n: sql<number>`count(*)` }).from(albums).where(namedWhere),
    db.select({ n: sql<number>`count(*)` }).from(albums).where(emptyWhere),
  ]);

  return {
    named: Number(namedRow?.n ?? 0),
    empty: Number(emptyRow?.n ?? 0),
    skipped: skipped.length,
  };
}

export async function listCosplayerQueue(opts: {
  bucket: CosplayerQueueBucket;
  page: number;
  limit: number;
  search?: string;
  includeLinked?: boolean;
}): Promise<{
  items: Array<{
    id: number;
    title: string;
    slug: string;
    status: string;
    coverUrl: string | null;
    cosplayer: string | null;
    creator: string | null;
    creatorId: number | null;
    hint: string | null;
    suggested: { id: number; name: string } | null;
  }>;
  total: number;
}> {
  const db = await getDb();
  if (!db) return { items: [], total: 0 };

  const skipped = await loadSkippedAlbumIds();
  const where = queueWhereParts({
    bucket: opts.bucket,
    skipped,
    search: opts.search,
    includeLinked: opts.includeLinked,
  });
  const offset = (opts.page - 1) * opts.limit;

  const [countRow] = await db
    .select({ n: sql<number>`count(*)` })
    .from(albums)
    .where(where);
  const rows = await db
    .select({
      id: albums.id,
      title: albums.title,
      slug: albums.slug,
      status: albums.status,
      coverUrl: albums.coverUrl,
      cosplayer: albums.cosplayer,
      creator: albums.creator,
      creatorId: albums.creatorId,
    })
    .from(albums)
    .where(where)
    .orderBy(desc(albums.updatedAt), desc(albums.id))
    .limit(opts.limit)
    .offset(offset);

  const hintById = new Map(
    rows.map(row => [row.id, albumCosplayerHint(row)] as const)
  );
  const uniqueHints = Array.from(
    new Set(Array.from(hintById.values()).filter((h): h is string => Boolean(h)))
  );
  const suggestedByHint = await matchCreatorsByHints(uniqueHints);

  return {
    total: Number(countRow?.n ?? 0),
    items: rows.map(row => {
      const hint = hintById.get(row.id) ?? null;
      return {
        ...row,
        hint,
        suggested: hint ? suggestedByHint.get(hint) ?? null : null,
      };
    }),
  };
}

export async function listCosplayerQueueIds(opts: {
  bucket: CosplayerQueueBucket;
  search?: string;
  includeLinked?: boolean;
  limit?: number;
}): Promise<{ ids: number[]; total: number }> {
  const db = await getDb();
  if (!db) return { ids: [], total: 0 };
  const skipped = await loadSkippedAlbumIds();
  const where = queueWhereParts({
    bucket: opts.bucket,
    skipped,
    search: opts.search,
    includeLinked: opts.includeLinked,
  });
  const cap = Math.min(Math.max(opts.limit ?? COSPLAYER_LINK_BULK_MAX, 1), COSPLAYER_LINK_BULK_MAX);
  const [countRow] = await db
    .select({ n: sql<number>`count(*)` })
    .from(albums)
    .where(where);
  const rows = await db
    .select({ id: albums.id })
    .from(albums)
    .where(where)
    .orderBy(desc(albums.updatedAt), desc(albums.id))
    .limit(cap);
  return { ids: rows.map(row => row.id), total: Number(countRow?.n ?? 0) };
}

export async function linkAlbumsToCreator(
  albumIds: number[],
  creatorId: number
): Promise<{ linked: number }> {
  const db = await getDb();
  if (!db) return { linked: 0 };
  const ids = Array.from(new Set(albumIds)).filter(id => id > 0);
  if (!ids.length) return { linked: 0 };

  const [creator] = await db
    .select()
    .from(creators)
    .where(eq(creators.id, creatorId))
    .limit(1);
  if (!creator) throw new Error("Cosplayer not found");

  const previous = await db
    .select({ creatorId: albums.creatorId })
    .from(albums)
    .where(inArray(albums.id, ids));
  const previousCreatorIds = Array.from(
    new Set(
      previous
        .map(row => row.creatorId)
        .filter((id): id is number => typeof id === "number" && id > 0 && id !== creatorId)
    )
  );

  const result = await db
    .update(albums)
    .set({
      creatorId,
      cosplayer: creator.name.slice(0, 128),
      creator: creator.name.slice(0, 100),
    })
    .where(inArray(albums.id, ids));

  const skipped = await loadSkippedAlbumIds();
  const skipSet = new Set(skipped);
  for (const id of ids) skipSet.delete(id);
  await saveSkippedAlbumIds(Array.from(skipSet));

  await updateCreatorAlbumCount(creatorId);
  await Promise.all(previousCreatorIds.map(id => updateCreatorAlbumCount(id)));
  await enrichCreatorAfterLink(creatorId);
  return { linked: mysqlAffectedRows(result) };
}

export async function linkAlbumsMatchingFilter(opts: {
  creatorId: number;
  bucket: CosplayerQueueBucket;
  search?: string;
  includeLinked?: boolean;
  albumIds?: number[];
}): Promise<{ linked: number; matched: number }> {
  const selected = Array.from(new Set(opts.albumIds ?? [])).filter(id => id > 0);
  const hasSearch = Boolean(opts.search?.trim());
  if (!selected.length && !hasSearch) {
    throw new Error("Tìm tên cosplayer trên album hoặc tick album trước khi gắn hàng loạt");
  }
  const ids = selected.length
    ? selected.slice(0, COSPLAYER_LINK_BULK_MAX)
    : (await listCosplayerQueueIds({
        bucket: opts.bucket,
        search: opts.search,
        includeLinked: opts.includeLinked,
      })).ids;
  if (!ids.length) return { linked: 0, matched: 0 };
  const { linked } = await linkAlbumsToCreator(ids, opts.creatorId);
  return { linked, matched: ids.length };
}

export async function createAndLinkAlbums(
  albumIds: number[]
): Promise<{ created: number; linked: number; skipped: number }> {
  const db = await getDb();
  if (!db) return { created: 0, linked: 0, skipped: 0 };
  const ids = Array.from(new Set(albumIds)).filter(id => id > 0);
  if (!ids.length) return { created: 0, linked: 0, skipped: 0 };

  const rows = await db
    .select({
      id: albums.id,
      cosplayer: albums.cosplayer,
      creator: albums.creator,
      title: albums.title,
    })
    .from(albums)
    .where(inArray(albums.id, ids));

  let created = 0;
  let linked = 0;
  let skipped = 0;
  for (const row of rows) {
    const name = albumCosplayerHint(row);
    if (!name) {
      skipped++;
      continue;
    }
    try {
      const result = await findOrCreateCreator({ name });
      if (result.isNew) created++;
      const { linked: n } = await linkAlbumsToCreator([row.id], result.creatorId);
      linked += n;
    } catch {
      skipped++;
    }
  }
  return { created, linked, skipped };
}

export async function linkExactMatches(albumIds?: number[]): Promise<{
  linked: number;
  unmatched: number;
}> {
  const db = await getDb();
  if (!db) return { linked: 0, unmatched: 0 };
  const skipped = await loadSkippedAlbumIds();
  const skipFilter = notInIds(skipped);
  const idFilter = albumIds?.length ? inArray(albums.id, albumIds) : undefined;
  const rows = await db
    .select({
      id: albums.id,
      cosplayer: albums.cosplayer,
      creator: albums.creator,
    })
    .from(albums)
    .where(and(...[unlinked, hasHint, skipFilter, idFilter].filter(Boolean)))
    .limit(COSPLAYER_LINK_BULK_MAX);

  let linked = 0;
  let unmatched = 0;
  const hinted = rows
    .map(row => ({ id: row.id, hint: albumCosplayerHint(row) }))
    .filter((row): row is { id: number; hint: string } => Boolean(row.hint));
  const suggested = await matchCreatorsByHints(hinted.map(row => row.hint));
  for (const row of hinted) {
    const hit = suggested.get(row.hint);
    if (!hit) {
      unmatched++;
      continue;
    }
    const result = await linkAlbumsToCreator([row.id], hit.id);
    linked += result.linked;
  }
  unmatched += rows.length - hinted.length;
  return { linked, unmatched };
}

export async function createQuickFromName(opts: {
  name: string;
  albumIds?: number[];
}): Promise<{
  creatorId: number;
  created: boolean;
  linked: number;
  name: string;
}> {
  const name = opts.name.trim();
  if (!name) throw new Error("Nhập tên cosplayer");
  const ids = Array.from(new Set(opts.albumIds ?? [])).filter(id => id > 0);

  const result = await findOrCreateCreator({ name });
  let linked = 0;
  if (ids.length) {
    linked = (await linkAlbumsToCreator(ids, result.creatorId)).linked;
  } else {
    await enrichCreatorAfterLink(result.creatorId);
  }
  return {
    creatorId: result.creatorId,
    created: result.isNew,
    linked,
    name: result.creator.name,
  };
}

export async function skipAlbums(albumIds: number[]): Promise<number> {
  const ids = Array.from(new Set(albumIds)).filter(id => id > 0);
  if (!ids.length) return 0;
  const skipped = await loadSkippedAlbumIds();
  const next = new Set(skipped);
  for (const id of ids) next.add(id);
  await saveSkippedAlbumIds(Array.from(next));
  return ids.length;
}

export async function unskipAlbums(albumIds: number[]): Promise<number> {
  const ids = new Set(albumIds);
  const skipped = await loadSkippedAlbumIds();
  const next = skipped.filter(id => !ids.has(id));
  await saveSkippedAlbumIds(next);
  return skipped.length - next.length;
}

export { displayCosplayerName, albumCosplayerHint };
