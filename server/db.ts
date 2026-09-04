import { and, desc, eq, gt, gte, ilike, inArray, like, lt, ne, or, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import type { Pool } from "mysql2/promise";
import { createPool } from "mysql2/promise";
import {
  Album,
  InsertAlbum,
  InsertCreator,
  InsertMediaItem,
  InsertPhoto,
  InsertUser,
  albumMediaItems,
  albumTags,
  albums,
  bookmarks,
  categories,
  creators,
  downloads,
  emailVerificationTokens,
  emailLogs,
  emailQueue,
  imageProcessingJobs,
  mediaItems,
  passwordResetTokens,
  photos,
  subscriptionPlans,
  subscriptions,
  tags,
  uploadJobs,
  users,
  type InsertEmailLog,
  type InsertEmailQueueItem,
} from "../drizzle/schema";
import { ENV } from "./_core/env";
import { isCreatorPubliclyVisible, withRewrittenCreatorMedia } from "./public-media-url";

let _db: ReturnType<typeof drizzle> | null = null;
let _pool: Pool | null = null;

export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _pool = createPool({
        uri: process.env.DATABASE_URL,
        waitForConnections: true,
        connectionLimit: 20, // increased from 5 to handle burst upload of 1000+ images
        enableKeepAlive: true,
        keepAliveInitialDelay: 10000,
        connectTimeout: 30000,
      });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      _db = drizzle(_pool as any);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
      _pool = null;
    }
  }
  return _db;
}

export function getDbPool(): Pool | null {
  return _pool;

}

// --- Users --------------------------------------------------------------------
export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) throw new Error("User openId is required for upsert");
  const db = await getDb();
  if (!db) return;

  const values: InsertUser = { openId: user.openId };
  const updateSet: Record<string, unknown> = {};

  const textFields = ["name", "email", "loginMethod", "avatarUrl", "passwordHash"] as const;
  for (const field of textFields) {
    const value = user[field as keyof InsertUser];
    if (value !== undefined) {
      (values as Record<string, unknown>)[field] = value ?? null;
      updateSet[field] = value ?? null;
    }
  }

  if (user.lastSignedIn !== undefined) {
    values.lastSignedIn = user.lastSignedIn;
    updateSet.lastSignedIn = user.lastSignedIn;
  }
  if (user.role !== undefined) {
    values.role = user.role;
    updateSet.role = user.role;
  } else if (ENV.ownerOpenId && user.openId === ENV.ownerOpenId) {
    values.role = "admin";
    // Do not force admin on every login — a demoted owner stays demoted.
  }

  if (!values.lastSignedIn) values.lastSignedIn = new Date();
  if (Object.keys(updateSet).length === 0) updateSet.lastSignedIn = new Date();

  await db.insert(users).values(values).onDuplicateKeyUpdate({ set: updateSet });
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
  return result[0];
}

export async function getUserById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.id, id)).limit(1);
  return result[0];
}

export async function getUserByEmail(email: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.email, email.toLowerCase().trim())).limit(1);
  return result[0];
}

export async function updateUserRole(userId: number, role: "user" | "vip" | "admin") {
  const db = await getDb();
  if (!db) return;
  await db.update(users).set({ role }).where(eq(users.id, userId));
}

export async function listUsers(
  page = 1,
  limit = 20,
  search?: string,
  role?: string,
  emailVerified?: boolean,
) {
  const db = await getDb();
  if (!db) return { items: [], total: 0 };
  const offset = (page - 1) * limit;
  const conditions: ReturnType<typeof eq>[] = [];
  if (search) {
    const pattern = `%${search}%`;
    conditions.push(or(like(users.name, pattern), like(users.email, pattern)) as any);
  }
  if (role) conditions.push(eq(users.role, role as any));
  if (emailVerified !== undefined) conditions.push(eq(users.emailVerified, emailVerified));
  const where = conditions.length > 0 ? and(...conditions) : undefined;
  const items = await db.select().from(users)
    .where(where)
    .orderBy(desc(users.createdAt))
    .limit(limit)
    .offset(offset);
  const [{ count }] = await db.select({ count: sql<number>`count(*)` }).from(users).where(where);
  return { items, total: Number(count) };
}

// --- Categories ---------------------------------------------------------------
export async function listCategories() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(categories).orderBy(categories.name);
}

export async function createCategory(data: { name: string; slug: string; description?: string }) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.insert(categories).values(data);
}

// --- Tags ---------------------------------------------------------------------
export async function listTags() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(tags).orderBy(tags.name);
}

export async function upsertTag(name: string, slug: string) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.insert(tags).values({ name, slug }).onDuplicateKeyUpdate({ set: { name } });
  const result = await db.select().from(tags).where(eq(tags.slug, slug)).limit(1);
  return result[0];
}

export async function getTagsByAlbumId(albumId: number) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select({ id: tags.id, name: tags.name, slug: tags.slug, createdAt: tags.createdAt })
    .from(tags)
    .innerJoin(albumTags, eq(albumTags.tagId, tags.id))
    .where(eq(albumTags.albumId, albumId));
}

export async function setAlbumTags(albumId: number, tagIds: number[]) {
  const db = await getDb();
  if (!db) return;
  await db.delete(albumTags).where(eq(albumTags.albumId, albumId));
  if (tagIds.length > 0) {
    await db.insert(albumTags).values(tagIds.map((tagId) => ({ albumId, tagId })));
  }
}

// --- Albums -------------------------------------------------------------------
export async function createAlbum(data: InsertAlbum) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.insert(albums).values(data);
  const result = await db.select().from(albums).where(eq(albums.slug, data.slug!)).limit(1);
  return result[0];
}

export async function updateAlbum(id: number, data: Partial<InsertAlbum>) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.update(albums).set(data).where(eq(albums.id, id));
}

export async function deleteAlbum(id: number) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.delete(albumTags).where(eq(albumTags.albumId, id));
  await db.delete(photos).where(eq(photos.albumId, id));
  await db.delete(bookmarks).where(eq(bookmarks.albumId, id));
  await db.delete(albums).where(eq(albums.id, id));
}

export async function getAlbumById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(albums).where(eq(albums.id, id)).limit(1);
  return result[0];
}

export async function getAlbumBySlug(slug: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(albums).where(eq(albums.slug, slug)).limit(1);
  return result[0];
}

export async function listAlbums(opts: {
  page?: number;
  limit?: number;
  status?: string;
  isVip?: boolean;
  categoryId?: number;
  creatorId?: number;
  search?: string;
  tagIds?: number[];
  tagSlug?: string;
  sortBy?: string;
  excludeProcessing?: boolean;
}) {
  const db = await getDb();
  if (!db) return { items: [], total: 0 };

  const { page = 1, limit = 20, status, isVip, categoryId, creatorId, search, tagIds, tagSlug, sortBy = "newest", excludeProcessing } = opts;
  const offset = (page - 1) * limit;

  const conditions = [];
  if (status) conditions.push(eq(albums.status, status as Album["status"]));
  if (excludeProcessing) conditions.push(ne(albums.publishStatus, "processing"));
  if (isVip !== undefined) conditions.push(eq(albums.isVip, isVip));
  if (categoryId) conditions.push(eq(albums.categoryId, categoryId));
  if (creatorId) conditions.push(eq(albums.creatorId, creatorId));
  if (search) {
    conditions.push(
      or(
        like(albums.title, `%${search}%`),
        like(albums.cosplayer, `%${search}%`),
        like(albums.character, `%${search}%`),
        like(albums.series, `%${search}%`)
      )!
    );
  }
  // Tag filtering by slug (single tag from admin filter)
  if (tagSlug) {
    conditions.push(
      inArray(
        albums.id,
        db
          .select({ albumId: albumTags.albumId })
          .from(albumTags)
          .innerJoin(tags, eq(albumTags.tagId, tags.id))
          .where(or(eq(tags.slug, tagSlug), eq(tags.name, tagSlug))!)
      )
    );
  }
  // Tag filtering: filter albums that have ALL specified tags
  if (tagIds && tagIds.length > 0) {
    conditions.push(
      inArray(
        albums.id,
        db
          .select({ albumId: albumTags.albumId })
          .from(albumTags)
          .where(inArray(albumTags.tagId, tagIds))
          .groupBy(albumTags.albumId)
          .having(sql`count(distinct ${albumTags.tagId}) = ${tagIds.length}`)
      )
    );
  }

  const where = conditions.length > 0 ? and(...conditions) : undefined;

  let orderBy;
  if (sortBy === "popular") orderBy = desc(albums.viewCount);
  else if (sortBy === "oldest") orderBy = albums.createdAt;
  else orderBy = desc(albums.createdAt);

  const rows = await db
    .select({
      id: albums.id,
      title: albums.title,
      slug: albums.slug,
      description: albums.description,
      coverKey: albums.coverKey,
      coverUrl: albums.coverUrl,
      categoryId: albums.categoryId,
      isVip: albums.isVip,
      freePreviewCount: albums.freePreviewCount,
      photoCount: albums.photoCount,
      viewCount: albums.viewCount,
      status: albums.status,
      seoTitle: albums.seoTitle,
      seoDescription: albums.seoDescription,
      seoKeywords: albums.seoKeywords,
      cosplayer: albums.cosplayer,
      character: albums.character,
      series: albums.series,
      creatorId: albums.creatorId,
      zipKey: albums.zipKey,
      zipUrl: albums.zipUrl,
      zipSize: albums.zipSize,
      zipGeneratedAt: albums.zipGeneratedAt,
      createdBy: albums.createdBy,
      createdAt: albums.createdAt,
      updatedAt: albums.updatedAt,
      creatorName: creators.name,
      creatorSlug: creators.slug,
      creatorAlbumCount: creators.albumCount,
      creatorAvatarUrl: creators.avatarUrl,
      creatorBannerUrl: creators.bannerUrl,
    })
    .from(albums)
    .leftJoin(creators, eq(albums.creatorId, creators.id))
    .where(where)
    .orderBy(orderBy)
    .limit(limit)
    .offset(offset);

  const [{ count }] = await db
    .select({ count: sql<number>`count(*)` })
    .from(albums)
    .where(where);

  return {
    items: rows.map((row) => {
      const {
        creatorAlbumCount,
        creatorAvatarUrl,
        creatorBannerUrl,
        creatorName,
        creatorSlug,
        ...album
      } = row;
      const visible = isCreatorPubliclyVisible({
        albumCount: creatorAlbumCount,
        avatarUrl: creatorAvatarUrl,
        bannerUrl: creatorBannerUrl,
      });
      return {
        ...album,
        creatorName: creatorName ?? null,
        creatorSlug: visible ? creatorSlug ?? null : null,
      };
    }),
    total: Number(count),
  };
}

export async function incrementAlbumView(albumId: number) {
  const db = await getDb();
  if (!db) return;
  await db
    .update(albums)
    .set({ viewCount: sql`${albums.viewCount} + 1` })
    .where(eq(albums.id, albumId));
}

export async function updateAlbumPhotoCount(albumId: number) {
  const db = await getDb();
  if (!db) return;
  const [{ count }] = await db
    .select({ count: sql<number>`count(*)` })
    .from(photos)
    .where(eq(photos.albumId, albumId));
  await db.update(albums).set({ photoCount: Number(count) }).where(eq(albums.id, albumId));
}

// --- Photos -------------------------------------------------------------------
export async function createPhoto(data: InsertPhoto) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.insert(photos).values(data);
}

export async function getPhotosByAlbumId(albumId: number) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(photos)
    .where(eq(photos.albumId, albumId))
    .orderBy(photos.sortOrder, photos.createdAt);
}

/** Cheap aggregate — album pages should not hydrate every photo row. */
export async function countPhotosByAlbumId(albumId: number) {
  const db = await getDb();
  if (!db) return { total: 0, preview: 0 };
  const [row] = await db
    .select({
      total: sql<number>`count(*)`,
      preview: sql<number>`coalesce(sum(case when ${photos.isFreePreview} then 1 else 0 end), 0)`,
    })
    .from(photos)
    .where(eq(photos.albumId, albumId));
  return { total: Number(row?.total ?? 0), preview: Number(row?.preview ?? 0) };
}

/**
 * Paginated photo fetch — cursor-based (by sortOrder).
 * cursor = null means first page. Returns items + nextCursor for next page.
 */
export async function getPhotosByAlbumIdPaginated(
  albumId: number,
  cursor: number | null,
  limit: number = 24
) {
  const db = await getDb();
  if (!db) return { items: [], nextCursor: null };

  const rows = await db
    .select()
    .from(photos)
    .where(
      cursor === null
        ? eq(photos.albumId, albumId)
        : and(eq(photos.albumId, albumId), gt(photos.sortOrder, cursor))
    )
    .orderBy(photos.sortOrder, photos.createdAt)
    .limit(limit + 1); // fetch one extra to detect hasMore

  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;
  const nextCursor = hasMore ? items[items.length - 1].sortOrder : null;
  return { items, nextCursor };
}

/**
 * Photos a guest / logged-in non-VIP may see on a VIP album.
 * Prefer explicit isFreePreview flags; if none were stored, fall back to the
 * first `freePreviewCount` photos in display order.
 */
export async function getPreviewPhotosForNonVip(albumId: number, freePreviewCount: number) {
  const db = await getDb();
  if (!db) return [];
  const flagged = await db
    .select()
    .from(photos)
    .where(and(eq(photos.albumId, albumId), eq(photos.isFreePreview, true)))
    .orderBy(photos.sortOrder, photos.createdAt);
  if (flagged.length > 0) return flagged;
  const n = Math.max(0, Number(freePreviewCount) || 0);
  if (n === 0) return [];
  return db
    .select()
    .from(photos)
    .where(eq(photos.albumId, albumId))
    .orderBy(photos.sortOrder, photos.createdAt)
    .limit(n);
}

export async function getPhotoById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(photos).where(eq(photos.id, id)).limit(1);
  return result[0];
}

export async function deletePhoto(id: number) {
  const db = await getDb();
  if (!db) return;
  await db.delete(photos).where(eq(photos.id, id));
}

export async function setFreePreviewPhotos(albumId: number, count: number) {
  const db = await getDb();
  if (!db) return;
  // Reset all to false first
  await db.update(photos).set({ isFreePreview: false }).where(eq(photos.albumId, albumId));
  // Get first N photos by sortOrder
  const firstN = await db
    .select({ id: photos.id })
    .from(photos)
    .where(eq(photos.albumId, albumId))
    .orderBy(photos.sortOrder, photos.createdAt)
    .limit(count);
  if (firstN.length > 0) {
    await db
      .update(photos)
      .set({ isFreePreview: true })
      .where(inArray(photos.id, firstN.map((p) => p.id)));
  }
}

// --- Subscriptions ------------------------------------------------------------
export async function getSubscriptionPlans() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(subscriptionPlans).where(eq(subscriptionPlans.isActive, true));
}

export async function getActiveSubscription(userId: number) {
  const db = await getDb();
  if (!db) return undefined;
  const now = new Date();
  const result = await db
    .select()
    .from(subscriptions)
    .where(
      and(
        eq(subscriptions.userId, userId),
        eq(subscriptions.status, "active"),
        sql`${subscriptions.expiresAt} > ${now}`
      )
    )
    .limit(1);
  return result[0];
}

export async function createSubscription(data: {
  userId: number;
  planId: number;
  /** Provider-agnostic session/transaction ID — stored in stripeSessionId column for backward compat */
  sessionId: string;
  /** NOWPayments order_id (vip_user_plan_ts) — IPN sends this, not invoice.id */
  orderId?: string;
  provider?: string;
  paymentMethod?: string;
}) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.insert(subscriptions).values({
    userId: data.userId,
    planId: data.planId,
    stripeSessionId: data.sessionId,
    cryptoOrderId: data.orderId || null,
    provider: data.provider || "ccbill",
    paymentMethod: data.paymentMethod || "card",
    status: "pending",
  });
  const result = await getSubscriptionBySessionId(data.sessionId);
  return result;
}

/** Look up by invoice id, NOWPayments order_id, or provider subscription id */
export async function getSubscriptionBySessionId(sessionId: string) {
  const db = await getDb();
  if (!db || !sessionId) return undefined;
  const result = await db
    .select()
    .from(subscriptions)
    .where(
      or(
        eq(subscriptions.stripeSessionId, sessionId),
        eq(subscriptions.stripeSubscriptionId, sessionId),
        eq(subscriptions.cryptoOrderId, sessionId)
      )
    )
    .orderBy(desc(subscriptions.id))
    .limit(1);
  return result[0];
}

async function findPendingSubscriptionForUser(userId: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db
    .select()
    .from(subscriptions)
    .where(and(eq(subscriptions.userId, userId), eq(subscriptions.status, "pending")))
    .orderBy(desc(subscriptions.id))
    .limit(1);
  return result[0];
}

/** Activate VIP by invoice id, order_id, or latest pending row for userId */
export async function activateSubscription(
  sessionId: string,
  expiresAt: Date,
  extras?: { userId?: number }
) {
  const db = await getDb();
  if (!db) return;
  let sub = sessionId ? await getSubscriptionBySessionId(sessionId) : undefined;
  if (!sub && extras?.userId) {
    sub = await findPendingSubscriptionForUser(extras.userId);
  }
  if (!sub) {
    console.warn(
      `[Activate] No subscription for sessionId=${sessionId} userId=${extras?.userId ?? ""}`
    );
    return;
  }
  const alreadyActive = sub.status === "active";
  await db
    .update(subscriptions)
    .set({ status: "active", startedAt: new Date(), expiresAt })
    .where(eq(subscriptions.id, sub.id));
  await updateUserRole(sub.userId, "vip");
  if (!alreadyActive) {
    void import("./email")
      .then((m) => m.notifyVipActivated(sub.userId, expiresAt))
      .catch((err) =>
        console.error("[Activate] welcome email failed:", err instanceof Error ? err.message : err)
      );
  }
}

export async function listSubscriptions(page = 1, limit = 20, search?: string, status?: string) {
  const db = await getDb();
  if (!db) return { items: [], total: 0 };
  const offset = (page - 1) * limit;
  const conditions: any[] = [];
  if (search) {
    const pattern = `%${search}%`;
    conditions.push(or(like(users.name, pattern), like(users.email, pattern)));
  }
  if (status) conditions.push(eq(subscriptions.status, status as any));
  const where = conditions.length > 0 ? and(...conditions) : undefined;
  const items = await db
    .select({
      id: subscriptions.id,
      userId: subscriptions.userId,
      planId: subscriptions.planId,
      status: subscriptions.status,
      stripeSessionId: subscriptions.stripeSessionId,
      stripeSubscriptionId: subscriptions.stripeSubscriptionId,
      stripeCustomerId: subscriptions.stripeCustomerId,
      provider: subscriptions.provider,
      paymentMethod: subscriptions.paymentMethod,
      startedAt: subscriptions.startedAt,
      expiresAt: subscriptions.expiresAt,
      createdAt: subscriptions.createdAt,
      updatedAt: subscriptions.updatedAt,
      userName: users.name,
      userEmail: users.email,
      planName: subscriptionPlans.name,
    })
    .from(subscriptions)
    .leftJoin(users, eq(subscriptions.userId, users.id))
    .leftJoin(subscriptionPlans, eq(subscriptions.planId, subscriptionPlans.id))
    .where(where)
    .orderBy(desc(subscriptions.createdAt))
    .limit(limit)
    .offset(offset);
  const [{ count }] = await db
    .select({ count: sql<number>`count(*)` })
    .from(subscriptions)
    .leftJoin(users, eq(subscriptions.userId, users.id))
    .where(where);
  return { items, total: Number(count) };
}

// --- Bookmarks ----------------------------------------------------------------
export async function toggleBookmark(userId: number, albumId: number) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const existing = await db
    .select()
    .from(bookmarks)
    .where(and(eq(bookmarks.userId, userId), eq(bookmarks.albumId, albumId)))
    .limit(1);
  if (existing[0]) {
    await db
      .delete(bookmarks)
      .where(and(eq(bookmarks.userId, userId), eq(bookmarks.albumId, albumId)));
    return { bookmarked: false };
  } else {
    await db.insert(bookmarks).values({ userId, albumId });
    return { bookmarked: true };
  }
}

export async function getBookmarksByUser(userId: number) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select({ albumId: bookmarks.albumId, createdAt: bookmarks.createdAt })
    .from(bookmarks)
    .where(eq(bookmarks.userId, userId))
    .orderBy(desc(bookmarks.createdAt));
}

export async function isBookmarked(userId: number, albumId: number) {
  const db = await getDb();
  if (!db) return false;
  const result = await db
    .select()
    .from(bookmarks)
    .where(and(eq(bookmarks.userId, userId), eq(bookmarks.albumId, albumId)))
    .limit(1);
  return result.length > 0;
}

// --- Upload Jobs --------------------------------------------------------------
export async function createUploadJob(albumId: number, userId: number, fileName: string) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.insert(uploadJobs).values({ albumId, userId, fileName, status: "pending" });
  const result = await db
    .select()
    .from(uploadJobs)
    .where(and(eq(uploadJobs.albumId, albumId), eq(uploadJobs.userId, userId)))
    .orderBy(desc(uploadJobs.createdAt))
    .limit(1);
  return result[0];
}

export async function updateUploadJob(
  id: number,
  data: { status?: "pending" | "processing" | "completed" | "failed"; processedFiles?: number; totalFiles?: number; errorMessage?: string }
) {
  const db = await getDb();
  if (!db) return;
  await db.update(uploadJobs).set(data).where(eq(uploadJobs.id, id));
}

// --- Analytics ----------------------------------------------------------------
export async function getAnalytics() {
  const db = await getDb();
  if (!db) return null;

  const [totalUsers] = await db.select({ count: sql<number>`count(*)` }).from(users);
  const [vipUsers] = await db
    .select({ count: sql<number>`count(*)` })
    .from(users)
    .where(eq(users.role, "vip"));
  const [totalAlbums] = await db.select({ count: sql<number>`count(*)` }).from(albums);
  const [publishedAlbums] = await db
    .select({ count: sql<number>`count(*)` })
    .from(albums)
    .where(eq(albums.status, "published"));
  const [totalPhotos] = await db.select({ count: sql<number>`count(*)` }).from(photos);
  const [activeSubscriptions] = await db
    .select({ count: sql<number>`count(*)` })
    .from(subscriptions)
    .where(eq(subscriptions.status, "active"));

  const [totalViewsRow] = await db
    .select({ total: sql<number>`coalesce(sum(viewCount), 0)` })
    .from(albums);

  const topAlbumRows = await db
    .select({ id: albums.id, title: albums.title, viewCount: albums.viewCount })
    .from(albums)
    .orderBy(desc(albums.viewCount))
    .limit(10);

  const recentUserRows = await db
    .select({ id: users.id, name: users.name, email: users.email, role: users.role, createdAt: users.createdAt })
    .from(users)
    .orderBy(desc(users.createdAt))
    .limit(10);

  return {
    totalUsers: Number(totalUsers.count),
    vipUsers: Number(vipUsers.count),
    totalAlbums: Number(totalAlbums.count),
    publishedAlbums: Number(publishedAlbums.count),
    totalPhotos: Number(totalPhotos.count),
    activeSubscriptions: Number(activeSubscriptions.count),
    totalViews: Number(totalViewsRow?.total ?? 0),
    topAlbums: topAlbumRows.map(r => ({ id: r.id, title: r.title, viewCount: Number(r.viewCount) })),
    recentUsers: recentUserRows,
  };
}

// --- Password Reset Tokens ----------------------------------------------------

export async function createPasswordResetToken(
  userId: number,
  token: string,
  expiresAt: Date
): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.insert(passwordResetTokens).values({ userId, token, expiresAt });
}

export async function getPasswordResetToken(token: string) {
  const db = await getDb();
  if (!db) return null;
  const rows = await db
    .select()
    .from(passwordResetTokens)
    .where(eq(passwordResetTokens.token, token))
    .limit(1);
  return rows[0] ?? null;
}

export async function markPasswordResetTokenUsed(token: string): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db
    .update(passwordResetTokens)
    .set({ usedAt: new Date() })
    .where(eq(passwordResetTokens.token, token));
}

export async function deleteExpiredPasswordResetTokens(): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db
    .delete(passwordResetTokens)
    .where(lt(passwordResetTokens.expiresAt, new Date()));
}

export async function invalidateUserPasswordResetTokens(userId: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  // Mark all existing tokens for this user as used (invalidate them)
  await db
    .update(passwordResetTokens)
    .set({ usedAt: new Date() })
    .where(eq(passwordResetTokens.userId, userId));
}

export async function updateUserPassword(userId: number, passwordHash: string): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db
    .update(users)
    .set({ passwordHash, sessionInvalidBefore: new Date(), updatedAt: new Date() })
    .where(eq(users.id, userId));
}

export async function invalidateUserSessions(userId: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db
    .update(users)
    .set({ sessionInvalidBefore: new Date(), updatedAt: new Date() })
    .where(eq(users.id, userId));
}

// --- Admin: User Detail Management -------------------------------------------

/** Get full user detail with subscription and counts */
export async function getUserDetail(userId: number) {
  const db = await getDb();
  if (!db) return undefined;

  const userRows = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!userRows[0]) return undefined;
  const user = userRows[0];

  // Active subscription
  const subRows = await db
    .select()
    .from(subscriptions)
    .where(and(eq(subscriptions.userId, userId), eq(subscriptions.status, "active")))
    .orderBy(desc(subscriptions.createdAt))
    .limit(1);
  const subscription = subRows[0] ?? null;

  // Bookmarks count
  const [{ bCount }] = await db
    .select({ bCount: sql<number>`count(*)` })
    .from(bookmarks)
    .where(eq(bookmarks.userId, userId));

  // Albums uploaded count
  const [{ aCount }] = await db
    .select({ aCount: sql<number>`count(*)` })
    .from(albums)
    .where(eq(albums.createdBy, userId));

  return {
    ...user,
    subscription,
    bookmarksCount: Number(bCount),
    albumsCount: Number(aCount),
  };
}

/** Ban a user */
export async function banUser(userId: number): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db
    .update(users)
    .set({ status: "banned", sessionInvalidBefore: new Date(), updatedAt: new Date() })
    .where(eq(users.id, userId));
}

/** Unban a user */
export async function unbanUser(userId: number): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(users).set({ status: "active", updatedAt: new Date() }).where(eq(users.id, userId));
}

/** Hard-delete a user and cascade-clean their data */
export async function deleteUserById(userId: number): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(bookmarks).where(eq(bookmarks.userId, userId));
  await db.delete(passwordResetTokens).where(eq(passwordResetTokens.userId, userId));
  await db.delete(subscriptions).where(eq(subscriptions.userId, userId));
  await db.delete(users).where(eq(users.id, userId));
}

// --- Signed URL Cache ---------------------------------------------------------
/** Return cached signed URL if still valid (>30 min remaining), else null */
export async function getCachedSignedUrl(photoId: number): Promise<string | null> {
  const db = await getDb();
  if (!db) return null;
  const [row] = await db
    .select({ signedUrl: photos.signedUrl, signedUrlExpiresAt: photos.signedUrlExpiresAt })
    .from(photos)
    .where(eq(photos.id, photoId))
    .limit(1);
  if (!row?.signedUrl || !row.signedUrlExpiresAt) return null;
  const bufferMs = 30 * 60 * 1000; // 30 min buffer
  if (Date.now() + bufferMs > row.signedUrlExpiresAt) return null;
  return row.signedUrl;
}

/** Persist a newly generated signed URL with its expiry timestamp */
export async function setCachedSignedUrl(
  photoId: number,
  signedUrl: string,
  expiresInSeconds: number
): Promise<void> {
  const db = await getDb();
  if (!db) return;
  const expiresAt = Date.now() + expiresInSeconds * 1000;
  await db
    .update(photos)
    .set({ signedUrl, signedUrlExpiresAt: expiresAt })
    .where(eq(photos.id, photoId));
}

// --- Bulk Photo Operations ----------------------------------------------------
/** Delete multiple photos by IDs — returns deleted count */
export async function bulkDeletePhotos(photoIds: number[]): Promise<number> {
  if (photoIds.length === 0) return 0;
  const db = await getDb();
  if (!db) return 0;
  const result = await db.delete(photos).where(inArray(photos.id, photoIds));
  return (result as any)[0]?.affectedRows ?? photoIds.length;
}

// --- Image Processing Jobs ----------------------------------------------------
/** Enqueue a new image processing job */
export async function enqueueImageProcessingJob(job: {
  albumId: number;
  originalKey: string;
  fileName: string;
  mimeType: string;
  fileSize: number;
}): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  // Dedup check 1: skip if this originalKey already has a pending/processing/done job
  const [existingJob] = await db
    .select({ id: imageProcessingJobs.id, status: imageProcessingJobs.status })
    .from(imageProcessingJobs)
    .where(eq(imageProcessingJobs.originalKey, job.originalKey))
    .limit(1);
  if (existingJob) {
    console.log(`[DB] Dedup: job for key ${job.originalKey} already exists (id=${existingJob.id}, status=${existingJob.status}), skipping enqueue.`);
    return existingJob.id;
  }

  // Dedup check 2: skip if media_item with this originalKey already exists
  const [existingMedia] = await db
    .select({ id: mediaItems.id })
    .from(mediaItems)
    .where(eq(mediaItems.originalKey, job.originalKey))
    .limit(1);
  if (existingMedia) {
    console.log(`[DB] Dedup: media_item for key ${job.originalKey} already exists (id=${existingMedia.id}), skipping enqueue.`);
    return -existingMedia.id; // negative = already processed
  }

  const result = await db.insert(imageProcessingJobs).values({
    albumId: job.albumId,
    originalKey: job.originalKey,
    fileName: job.fileName,
    mimeType: job.mimeType,
    fileSize: job.fileSize,
    status: "pending",
  });
  return (result as any)[0]?.insertId ?? 0;
}

/** Claim next pending job atomically using UPDATE...WHERE status='pending' to avoid race condition.
 * Returns the claimed job or null if queue is empty.
 */
export async function claimNextProcessingJob() {
  const db = await getDb();
  if (!db) return null;

  // Find the NEWEST pending job (LIFO) — so recently uploaded images appear in library immediately
  const [candidate] = await db
    .select({ id: imageProcessingJobs.id })
    .from(imageProcessingJobs)
    .where(eq(imageProcessingJobs.status, "pending"))
    .orderBy(desc(imageProcessingJobs.createdAt))
    .limit(1);
  if (!candidate) return null;

  // Atomically claim it — only succeeds if still 'pending' (prevents race condition)
  const updateResult = await db
    .update(imageProcessingJobs)
    .set({ status: "processing" })
    .where(and(eq(imageProcessingJobs.id, candidate.id), eq(imageProcessingJobs.status, "pending")));

  // If another worker claimed it first, affectedRows = 0 — skip
  const affectedRows = (updateResult as any)[0]?.affectedRows ?? 1;
  if (affectedRows === 0) return null;

  // Fetch the full job row
  const [job] = await db
    .select()
    .from(imageProcessingJobs)
    .where(eq(imageProcessingJobs.id, candidate.id))
    .limit(1);
  return job ?? null;
}

/** Mark a processing job as done or failed */
export async function finishProcessingJob(
  jobId: number,
  result: "done" | "failed",
  error?: string
): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db
    .update(imageProcessingJobs)
    .set({ status: result, error: error ?? null, processedAt: new Date() })
    .where(eq(imageProcessingJobs.id, jobId));
}

/** Get job status by ID */
export async function getProcessingJobStatus(jobId: number) {
  const db = await getDb();
  if (!db) return null;
  const [row] = await db
    .select()
    .from(imageProcessingJobs)
    .where(eq(imageProcessingJobs.id, jobId))
    .limit(1);
  return row ?? null;
}

// --- Media Items --------------------------------------------------------------

/** Create a new media item and return its ID.
 * Dedup: if a media_item with the same originalKey already exists, return its ID instead of inserting.
 */
export async function createMediaItem(data: InsertMediaItem): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  // Dedup: check if media_item with same originalKey already exists
  if (data.originalKey) {
    const [existing] = await db
      .select({ id: mediaItems.id })
      .from(mediaItems)
      .where(eq(mediaItems.originalKey, data.originalKey))
      .limit(1);
    if (existing) {
      console.log(`[DB] Dedup: media_item for key ${data.originalKey} already exists (id=${existing.id}), skipping insert.`);
      return existing.id;
    }
  }

  const result = await db.insert(mediaItems).values(data);
  return (result[0] as { insertId: number }).insertId;
}

/** Update URLs on an existing media item (after worker finishes) */
export async function updateMediaItemUrls(
  id: number,
  urls: {
    thumbKey?: string;
    thumbUrl?: string;
    webpKey?: string;
    webpUrl?: string;
    originalUrl?: string;
    width?: number;
    height?: number;
    fileSize?: number;
  }
): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.update(mediaItems).set(urls).where(eq(mediaItems.id, id));
}

/** List media items with optional filename search, paginated */
export async function listMediaItems(opts: {
  search?: string;
  limit?: number;
  offset?: number;
  dateFrom?: Date;
  dateTo?: Date;
  albumId?: number; // filter: only items belonging to this album
  notInAlbumId?: number; // filter: only items NOT in this album
}): Promise<{ items: (typeof mediaItems.$inferSelect)[]; total: number }> {
  const db = await getDb();
  if (!db) return { items: [], total: 0 };
  const limit = opts.limit ?? 48;
  const offset = opts.offset ?? 0;

  const conditions: ReturnType<typeof eq>[] = [];
  if (opts.search) conditions.push(like(mediaItems.filename, `%${opts.search}%`) as any);
  if (opts.dateFrom) conditions.push(gte(mediaItems.createdAt, opts.dateFrom) as any);
  if (opts.dateTo) {
    // include the full day of dateTo
    const endOfDay = new Date(opts.dateTo);
    endOfDay.setHours(23, 59, 59, 999);
    conditions.push(lt(mediaItems.createdAt, new Date(endOfDay.getTime() + 1)) as any);
  }

  // albumId filter: join with albumMediaItems
  if (opts.albumId !== undefined) {
    const ids = await db
      .select({ mediaItemId: albumMediaItems.mediaItemId })
      .from(albumMediaItems)
      .where(eq(albumMediaItems.albumId, opts.albumId));
    const idSet = ids.map((r) => r.mediaItemId);
    if (idSet.length === 0) return { items: [], total: 0 };
    conditions.push(inArray(mediaItems.id, idSet) as any);
  }

  const whereClause = conditions.length > 0 ? and(...(conditions as any[])) : undefined;

  const [items, countResult] = await Promise.all([
    whereClause
      ? db.select().from(mediaItems).where(whereClause).orderBy(desc(mediaItems.createdAt)).limit(limit).offset(offset)
      : db.select().from(mediaItems).orderBy(desc(mediaItems.createdAt)).limit(limit).offset(offset),
    whereClause
      ? db.select({ count: sql<number>`count(*)` }).from(mediaItems).where(whereClause)
      : db.select({ count: sql<number>`count(*)` }).from(mediaItems),
  ]);

  return { items, total: Number(countResult[0]?.count ?? 0) };
}

/** Get a single media item by ID */
export async function getMediaItemById(id: number) {
  const db = await getDb();
  if (!db) return null;
  const [row] = await db.select().from(mediaItems).where(eq(mediaItems.id, id)).limit(1);
  return row ?? null;
}

/** Delete a media item by ID (does NOT delete from Wasabi — caller handles that) */
export async function deleteMediaItem(id: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  // Remove junction rows first
  await db.delete(albumMediaItems).where(eq(albumMediaItems.mediaItemId, id));
  await db.delete(mediaItems).where(eq(mediaItems.id, id));
}

// --- Album ↔ Media junction ---------------------------------------------------

/** Attach a media item to an album */
export async function attachMediaToAlbum(data: {
  albumId: number;
  mediaItemId: number;
  sortOrder?: number;
  isFreePreview?: boolean;
}): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db
    .insert(albumMediaItems)
    .values({
      albumId: data.albumId,
      mediaItemId: data.mediaItemId,
      sortOrder: data.sortOrder ?? 0,
      isFreePreview: data.isFreePreview ?? false,
    })
    .onDuplicateKeyUpdate({ set: { sortOrder: data.sortOrder ?? 0 } });
}

/** Detach a media item from an album */
export async function detachMediaFromAlbum(albumId: number, mediaItemId: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db
    .delete(albumMediaItems)
    .where(and(eq(albumMediaItems.albumId, albumId), eq(albumMediaItems.mediaItemId, mediaItemId)));
}

/** Get all media items attached to an album, ordered by sortOrder */
export async function getAlbumMediaItems(albumId: number) {
  const db = await getDb();
  if (!db) return [];
  const rows = await db
    .select({
      id: mediaItems.id,
      originalKey: mediaItems.originalKey,
      thumbKey: mediaItems.thumbKey,
      webpKey: mediaItems.webpKey,
      originalUrl: mediaItems.originalUrl,
      thumbUrl: mediaItems.thumbUrl,
      webpUrl: mediaItems.webpUrl,
      filename: mediaItems.filename,
      width: mediaItems.width,
      height: mediaItems.height,
      fileSize: mediaItems.fileSize,
      mimeType: mediaItems.mimeType,
      createdAt: mediaItems.createdAt,
      sortOrder: albumMediaItems.sortOrder,
      isFreePreview: albumMediaItems.isFreePreview,
    })
    .from(albumMediaItems)
    .innerJoin(mediaItems, eq(albumMediaItems.mediaItemId, mediaItems.id))
    .where(eq(albumMediaItems.albumId, albumId))
    .orderBy(albumMediaItems.sortOrder);
  return rows;
}

// --- Creators ----------------------------------------------------------------
export async function listCreators(opts: { page?: number; limit?: number; search?: string; sortBy?: string; hasAlbums?: boolean; publicOnly?: boolean } = {}) {
  const db = await getDb();
  if (!db) return { items: [], total: 0 };
  const { page = 1, limit = 20, search, sortBy = "name", hasAlbums, publicOnly } = opts;
  const offset = (page - 1) * limit;
  const conditions: any[] = [];
  if (search) conditions.push(or(like(creators.name, `%${search}%`), like(creators.bio ?? sql`''`, `%${search}%`))!);
  if (hasAlbums || publicOnly) conditions.push(sql`${creators.albumCount} > 0`);
  if (publicOnly) {
    conditions.push(sql`${creators.avatarUrl} IS NOT NULL AND ${creators.avatarUrl} != ''`);
  }
  const where = conditions.length > 0 ? and(...conditions) : undefined;
  let orderBy;
  if (sortBy === "albumCount") orderBy = desc(creators.albumCount);
  else if (sortBy === "newest") orderBy = desc(creators.createdAt);
  else orderBy = creators.name;
  const items = await db.select().from(creators).where(where).orderBy(orderBy).limit(limit).offset(offset);
  const [{ count }] = await db.select({ count: sql<number>`count(*)` }).from(creators).where(where);
  return { items: items.map(withRewrittenCreatorMedia), total: Number(count) };
}

export async function getCreatorBySlug(slug: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(creators).where(eq(creators.slug, slug)).limit(1);
  return result[0] ? withRewrittenCreatorMedia(result[0]) : undefined;
}

export async function getCreatorById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(creators).where(eq(creators.id, id)).limit(1);
  return result[0] ? withRewrittenCreatorMedia(result[0]) : undefined;
}

export async function createCreator(data: InsertCreator) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.insert(creators).values(data);
  const result = await db.select().from(creators).where(eq(creators.slug, data.slug!)).limit(1);
  return result[0];
}

export async function updateCreator(id: number, data: Partial<InsertCreator>) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.update(creators).set(data).where(eq(creators.id, id));
}

export async function deleteCreator(id: number) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  // Unlink albums from this creator first
  await db.update(albums).set({ creatorId: null }).where(eq(albums.creatorId, id));
  await db.delete(creators).where(eq(creators.id, id));
}

export async function updateCreatorAlbumCount(creatorId: number) {
  const db = await getDb();
  if (!db) return;
  const [{ count }] = await db
    .select({ count: sql<number>`count(*)` })
    .from(albums)
    .where(and(eq(albums.creatorId, creatorId), eq(albums.status, "published")));
  await db.update(creators).set({ albumCount: Number(count) }).where(eq(creators.id, creatorId));
}

// --- Tags (extended) --------------------------------------------------------------
export async function getTagBySlug(slug: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(tags).where(eq(tags.slug, slug)).limit(1);
  return result[0];
}

export async function updateTag(id: number, data: { name?: string; slug?: string; seoTitle?: string; seoDescription?: string }) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.update(tags).set(data).where(eq(tags.id, id));
}

export async function deleteTag(id: number) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.delete(albumTags).where(eq(albumTags.tagId, id));
  await db.delete(tags).where(eq(tags.id, id));
}

export async function mergeTag(sourceId: number, targetId: number) {
  // Move all album_tags from source to target (ignore duplicates)
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const sourceAlbums = await db.select({ albumId: albumTags.albumId }).from(albumTags).where(eq(albumTags.tagId, sourceId));
  for (const { albumId } of sourceAlbums) {
    await db.insert(albumTags).values({ albumId, tagId: targetId }).onDuplicateKeyUpdate({ set: { tagId: targetId } });
  }
  await db.delete(albumTags).where(eq(albumTags.tagId, sourceId));
  await db.delete(tags).where(eq(tags.id, sourceId));
}

export async function listTagsWithCount(
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
}

// --- Downloads ---------------------------------------------------------------------
export async function logDownload(userId: number, albumId: number, zipSize?: number) {
  const db = await getDb();
  if (!db) return;
  await db.insert(downloads).values({ userId, albumId, zipSize: zipSize ?? null });
}

export async function getDownloadHistory(userId: number, page = 1, limit = 20) {
  const db = await getDb();
  if (!db) return { items: [], total: 0 };
  const offset = (page - 1) * limit;
  const rows = await db
    .select({
      id: downloads.id,
      albumId: downloads.albumId,
      albumTitle: albums.title,
      albumSlug: albums.slug,
      albumCoverUrl: albums.coverUrl,
      zipSize: downloads.zipSize,
      downloadedAt: downloads.downloadedAt,
    })
    .from(downloads)
    .leftJoin(albums, eq(albums.id, downloads.albumId))
    .where(eq(downloads.userId, userId))
    .orderBy(desc(downloads.downloadedAt))
    .limit(limit)
    .offset(offset);
  const [{ count }] = await db
    .select({ count: sql<number>`count(*)` })
    .from(downloads)
    .where(eq(downloads.userId, userId));
  return { items: rows, total: Number(count) };
}

/** Bulk attach multiple media items to an album (for multi-select) */
export async function bulkAttachMediaToAlbum(
  albumId: number,
  mediaItemIds: number[]
): Promise<void> {
  const db = await getDb();
  if (!db) return;
  if (mediaItemIds.length === 0) return;

  // Get current max sortOrder for this album
  const [maxRow] = await db
    .select({ maxOrder: sql<number>`COALESCE(MAX(sortOrder), -1)` })
    .from(albumMediaItems)
    .where(eq(albumMediaItems.albumId, albumId));
  let nextOrder = (Number(maxRow?.maxOrder ?? -1)) + 1;

  const values = mediaItemIds.map((mediaItemId) => ({
    albumId,
    mediaItemId,
    sortOrder: nextOrder++,
    isFreePreview: false,
  }));

  await db.insert(albumMediaItems).values(values).onDuplicateKeyUpdate({ set: { sortOrder: sql`sortOrder` } });
}


// --- Email Verification Tokens ------------------------------------------------

export async function createEmailVerificationToken(
  userId: number,
  token: string,
  expiresAt: Date
): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.insert(emailVerificationTokens).values({ userId, token, expiresAt });
}

export async function getEmailVerificationToken(token: string) {
  const db = await getDb();
  if (!db) return null;
  const rows = await db
    .select()
    .from(emailVerificationTokens)
    .where(eq(emailVerificationTokens.token, token))
    .limit(1);
  return rows[0] ?? null;
}

export async function markEmailVerificationTokenUsed(tokenId: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db
    .update(emailVerificationTokens)
    .set({ usedAt: new Date() })
    .where(eq(emailVerificationTokens.id, tokenId));
}

export async function setUserEmailVerified(userId: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db
    .update(users)
    .set({ emailVerified: true, updatedAt: new Date() })
    .where(eq(users.id, userId));
}

export async function invalidateUserEmailVerificationTokens(userId: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db
    .update(emailVerificationTokens)
    .set({ usedAt: new Date() })
    .where(eq(emailVerificationTokens.userId, userId));
}

/**
 * Count how many verification emails were sent to a user in the last `windowMs` milliseconds.
 * Used for rate limiting resend requests.
 */
export async function countRecentEmailVerificationTokens(
  userId: number,
  windowMs: number
): Promise<{ count: number; oldestCreatedAt: Date | null }> {
  const db = await getDb();
  if (!db) return { count: 0, oldestCreatedAt: null };
  const since = new Date(Date.now() - windowMs);
  const rows = await db
    .select({ createdAt: emailVerificationTokens.createdAt })
    .from(emailVerificationTokens)
    .where(
      and(
        eq(emailVerificationTokens.userId, userId),
        gte(emailVerificationTokens.createdAt, since)
      )
    )
    .orderBy(emailVerificationTokens.createdAt);
  const oldest = rows.length > 0 ? rows[0].createdAt : null;
  return { count: rows.length, oldestCreatedAt: oldest };
}

// --- Email Logs ---------------------------------------------------------------

export async function insertEmailLog(data: InsertEmailLog): Promise<void> {
  const db = await getDb();
  if (!db) return;
  try {
    await db.insert(emailLogs).values(data);
  } catch (err) {
    console.error("[EmailLog] Failed to insert log:", err);
  }
}

export async function getEmailLogs(opts: {
  page?: number;
  limit?: number;
  status?: "sent" | "failed";
  type?: string;
  recipient?: string;
}): Promise<{ items: typeof emailLogs.$inferSelect[]; total: number }> {
  const db = await getDb();
  if (!db) return { items: [], total: 0 };

  const page = opts.page ?? 1;
  const limit = Math.min(opts.limit ?? 50, 200);
  const offset = (page - 1) * limit;

  const conditions = [];
  if (opts.status) conditions.push(eq(emailLogs.status, opts.status));
  if (opts.type) conditions.push(eq(emailLogs.type, opts.type));
  if (opts.recipient) conditions.push(like(emailLogs.recipient, `%${opts.recipient}%`));

  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const [items, countRows] = await Promise.all([
    db.select().from(emailLogs).where(where).orderBy(desc(emailLogs.sentAt)).limit(limit).offset(offset),
    db.select({ count: sql<number>`count(*)` }).from(emailLogs).where(where),
  ]);

  return { items, total: Number(countRows[0]?.count ?? 0) };
}

// --- Email Queue --------------------------------------------------------------

export async function enqueueEmail(data: Omit<InsertEmailQueueItem, "status" | "attempts" | "createdAt">): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const [result] = await db.insert(emailQueue).values({
    ...data,
    status: "pending",
    attempts: 0,
  });
  return (result as any).insertId ?? 0;
}

export async function getNextPendingEmails(limit = 10): Promise<typeof emailQueue.$inferSelect[]> {
  const db = await getDb();
  if (!db) return [];
  const now = new Date();
  return db
    .select()
    .from(emailQueue)
    .where(
      and(
        eq(emailQueue.status, "pending"),
        lt(emailQueue.scheduledAt, now)
      )
    )
    .orderBy(emailQueue.priority, emailQueue.scheduledAt)
    .limit(limit);
}

export async function markEmailQueueProcessing(id: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.update(emailQueue).set({ status: "processing" }).where(eq(emailQueue.id, id));
}

export async function markEmailQueueSent(id: number, messageId: string, attempts: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.update(emailQueue).set({
    status: "sent",
    processedAt: new Date(),
    attempts,
    error: null,
  }).where(eq(emailQueue.id, id));
}

export async function markEmailQueueFailed(id: number, error: string, attempts: number, maxAttempts: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  const isFinal = attempts >= maxAttempts;
  await db.update(emailQueue).set({
    status: isFinal ? "failed" : "pending",
    attempts,
    error,
    processedAt: isFinal ? new Date() : undefined,
    // Exponential backoff: retry after 1min, 5min, 15min
    scheduledAt: isFinal ? undefined : new Date(Date.now() + Math.min(attempts * attempts * 60000, 900000)),
  }).where(eq(emailQueue.id, id));
}

export async function getEmailQueue(opts: {
  page?: number;
  limit?: number;
  status?: "pending" | "processing" | "sent" | "failed";
}): Promise<{ items: typeof emailQueue.$inferSelect[]; total: number }> {
  const db = await getDb();
  if (!db) return { items: [], total: 0 };

  const page = opts.page ?? 1;
  const limit = Math.min(opts.limit ?? 50, 200);
  const offset = (page - 1) * limit;

  const conditions = [];
  if (opts.status) conditions.push(eq(emailQueue.status, opts.status));
  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const [items, countRows] = await Promise.all([
    db.select().from(emailQueue).where(where).orderBy(desc(emailQueue.createdAt)).limit(limit).offset(offset),
    db.select({ count: sql<number>`count(*)` }).from(emailQueue).where(where),
  ]);

  return { items, total: Number(countRows[0]?.count ?? 0) };
}

export async function retryQueueItem(id: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.update(emailQueue).set({
    status: "pending",
    scheduledAt: new Date(),
    error: null,
  }).where(eq(emailQueue.id, id));
}
