#!/usr/bin/env python3
"""Add pagination to listTagsWithCount and tags.adminList."""
from pathlib import Path

DB = Path("/var/www/cosplay-gallery/server/db.ts")
TAGS = Path("/var/www/cosplay-gallery/server/routers/tags.ts")

OLD_FN = '''export async function listTagsWithCount(opts: { search?: string; sortBy?: string; minAlbums?: number } = {}) {
  const db = await getDb();
  if (!db) return [];
  const { search, sortBy = "popular", minAlbums } = opts;
  let query = db
    .select({
      id: tags.id,
      name: tags.name,
      slug: tags.slug,
      seoTitle: tags.seoTitle,
      seoDescription: tags.seoDescription,
      createdAt: tags.createdAt,
      albumCount: sql<number>`count(distinct ${albumTags.albumId})`,
      // Pick the cover of the first (most-viewed) album in this tag as thumbnail
      coverUrl: sql<string | null>`(
        SELECT a.coverUrl FROM album_tags at2
        JOIN albums a ON a.id = at2.albumId
        WHERE at2.tagId = ${tags.id} AND a.coverUrl IS NOT NULL
        ORDER BY a.viewCount DESC LIMIT 1
      )`,
    })
    .from(tags)
    .leftJoin(albumTags, eq(albumTags.tagId, tags.id))
    .groupBy(tags.id);
  if (search) {
    query = query.where(like(tags.name, `%${search}%`)) as typeof query;
  }
  if (minAlbums && minAlbums > 0) {
    query = query.having(sql`count(distinct ${albumTags.albumId}) >= ${minAlbums}`) as typeof query;
  }
  let orderByExpr;
  if (sortBy === "name") orderByExpr = tags.name;
  else if (sortBy === "newest") orderByExpr = desc(tags.createdAt);
  else orderByExpr = desc(sql`count(distinct ${albumTags.albumId})`);
  const rows = await query.orderBy(orderByExpr);
  return rows;
}'''

NEW_FN = '''export async function listTagsWithCount(
  opts: { search?: string; sortBy?: string; minAlbums?: number; page?: number; limit?: number } = {}
) {
  const db = await getDb();
  const paginate = opts.page != null;
  if (!db) return paginate ? { items: [], total: 0 } : [];

  const { search, sortBy = "popular", minAlbums, page = 1, limit = 30 } = opts;

  let query = db
    .select({
      id: tags.id,
      name: tags.name,
      slug: tags.slug,
      seoTitle: tags.seoTitle,
      seoDescription: tags.seoDescription,
      createdAt: tags.createdAt,
      albumCount: sql<number>`count(distinct ${albumTags.albumId})`,
      coverUrl: sql<string | null>`(
        SELECT a.coverUrl FROM album_tags at2
        JOIN albums a ON a.id = at2.albumId
        WHERE at2.tagId = ${tags.id} AND a.coverUrl IS NOT NULL
        ORDER BY a.viewCount DESC LIMIT 1
      )`,
    })
    .from(tags)
    .leftJoin(albumTags, eq(albumTags.tagId, tags.id))
    .groupBy(tags.id);

  if (search) {
    query = query.where(
      or(like(tags.name, `%${search}%`), like(tags.slug, `%${search}%`))
    ) as typeof query;
  }
  if (minAlbums && minAlbums > 0) {
    query = query.having(sql`count(distinct ${albumTags.albumId}) >= ${minAlbums}`) as typeof query;
  }

  let orderByExpr;
  if (sortBy === "name") orderByExpr = tags.name;
  else if (sortBy === "newest") orderByExpr = desc(tags.createdAt);
  else orderByExpr = desc(sql`count(distinct ${albumTags.albumId})`);

  if (!paginate) {
    return await query.orderBy(orderByExpr);
  }

  const offset = (page - 1) * limit;
  const items = await query.orderBy(orderByExpr).limit(limit).offset(offset);

  let countQuery = db
    .select({ id: tags.id })
    .from(tags)
    .leftJoin(albumTags, eq(albumTags.tagId, tags.id))
    .groupBy(tags.id);
  if (search) {
    countQuery = countQuery.where(
      or(like(tags.name, `%${search}%`), like(tags.slug, `%${search}%`))
    ) as typeof countQuery;
  }
  if (minAlbums && minAlbums > 0) {
    countQuery = countQuery.having(sql`count(distinct ${albumTags.albumId}) >= ${minAlbums}`) as typeof countQuery;
  }
  const countRows = await countQuery;
  return { items, total: countRows.length };
}'''

OLD_ADMIN = '''  adminList: protectedProcedure
    .query(async ({ ctx }) => {
      if (!isAdmin(ctx.user.role)) throw new TRPCError({ code: "FORBIDDEN" });
      return listTagsWithCount();
    }),'''

NEW_ADMIN = '''  adminList: protectedProcedure
    .input(
      z.object({
        page: z.number().min(1).default(1),
        limit: z.number().min(1).max(200).default(30),
        search: z.string().optional(),
        sortBy: z.enum(["popular", "name", "newest"]).default("popular"),
      }).optional()
    )
    .query(async ({ input, ctx }) => {
      if (!isAdmin(ctx.user.role)) throw new TRPCError({ code: "FORBIDDEN" });
      return listTagsWithCount({ ...input, page: input?.page ?? 1 });
    }),'''

db_text = DB.read_text(encoding="utf-8")
if OLD_FN not in db_text:
    raise SystemExit("db.ts pattern not found")
DB.write_text(db_text.replace(OLD_FN, NEW_FN), encoding="utf-8")
print("patched db.ts")

tags_text = TAGS.read_text(encoding="utf-8")
if OLD_ADMIN not in tags_text:
    raise SystemExit("tags.ts pattern not found")
TAGS.write_text(tags_text.replace(OLD_ADMIN, NEW_ADMIN), encoding="utf-8")
print("patched tags.ts")
