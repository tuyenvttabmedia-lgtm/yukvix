import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { adminProcedure, protectedProcedure, router } from "../_core/trpc";
import { getAnalytics } from "../db";
import { getDb } from "../db";
import {
  subscriptions,
  subscriptionPlans,
  users,
  albums,
  creators,
} from "../../drizzle/schema";
import { and, eq, gte, lte, lt, desc, sql, inArray } from "drizzle-orm";
import { isAdmin, isVipOrAdmin } from '@shared/const';

function daysAgo(n: number): Date {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() - n);
  return d;
}

function fmtDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export const analyticsRouter = router({
  overview: protectedProcedure.query(async ({ ctx }) => {
    if (!isAdmin(ctx.user.role)) throw new TRPCError({ code: "FORBIDDEN" });
    return getAnalytics();
  }),

  revenueByDay: adminProcedure
    .input(z.object({ days: z.number().min(7).max(365).default(30) }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];
      const since = daysAgo(input.days);
      const rows = await db
        .select({
          date: sql<string>`DATE(${subscriptions.createdAt})`.as("date"),
          revenue: sql<string>`COALESCE(SUM(${subscriptionPlans.price}), 0)`.as("revenue"),
          transactions: sql<number>`COUNT(${subscriptions.id})`.as("transactions"),
        })
        .from(subscriptions)
        .leftJoin(subscriptionPlans, eq(subscriptions.planId, subscriptionPlans.id))
        .where(and(inArray(subscriptions.status, ["active", "expired"]), gte(subscriptions.createdAt, since)))
        .groupBy(sql`DATE(${subscriptions.createdAt})`)
        .orderBy(sql`DATE(${subscriptions.createdAt})`);
      const map = new Map(rows.map((r) => [r.date, r]));
      const result: { date: string; revenue: number; transactions: number }[] = [];
      for (let i = input.days - 1; i >= 0; i--) {
        const d = new Date();
        d.setUTCDate(d.getUTCDate() - i);
        const key = fmtDate(d);
        const row = map.get(key);
        result.push({ date: key, revenue: row ? parseFloat(row.revenue) : 0, transactions: row ? Number(row.transactions) : 0 });
      }
      return result;
    }),

  revenueByPlan: adminProcedure
    .input(z.object({ days: z.number().min(7).max(365).default(30) }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];
      const since = daysAgo(input.days);
      const rows = await db
        .select({
          planName: subscriptionPlans.name,
          count: sql<number>`COUNT(${subscriptions.id})`.as("count"),
          revenue: sql<string>`COALESCE(SUM(${subscriptionPlans.price}), 0)`.as("revenue"),
        })
        .from(subscriptions)
        .leftJoin(subscriptionPlans, eq(subscriptions.planId, subscriptionPlans.id))
        .where(and(inArray(subscriptions.status, ["active", "expired"]), gte(subscriptions.createdAt, since)))
        .groupBy(subscriptions.planId, subscriptionPlans.name)
        .orderBy(desc(sql`SUM(${subscriptionPlans.price})`));
      const total = rows.reduce((s, r) => s + parseFloat(r.revenue), 0);
      return rows.map((r) => ({
        planName: r.planName ?? "Unknown",
        count: Number(r.count),
        revenue: parseFloat(r.revenue),
        percentage: total > 0 ? Math.round((parseFloat(r.revenue) / total) * 100) : 0,
      }));
    }),

  revenueMetrics: adminProcedure
    .input(z.object({ days: z.number().min(7).max(365).default(30) }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return { total: 0, mrr: 0, avgTransaction: 0, totalTransactions: 0, growthPercent: null };
      const since = daysAgo(input.days);
      const prevSince = daysAgo(input.days * 2);
      const prevUntil = daysAgo(input.days);
      const [current] = await db
        .select({ total: sql<string>`COALESCE(SUM(${subscriptionPlans.price}), 0)`, count: sql<number>`COUNT(${subscriptions.id})` })
        .from(subscriptions).leftJoin(subscriptionPlans, eq(subscriptions.planId, subscriptionPlans.id))
        .where(and(inArray(subscriptions.status, ["active", "expired"]), gte(subscriptions.createdAt, since)));
      const [previous] = await db
        .select({ total: sql<string>`COALESCE(SUM(${subscriptionPlans.price}), 0)` })
        .from(subscriptions).leftJoin(subscriptionPlans, eq(subscriptions.planId, subscriptionPlans.id))
        .where(and(inArray(subscriptions.status, ["active", "expired"]), gte(subscriptions.createdAt, prevSince), lt(subscriptions.createdAt, prevUntil)));
      const [mrrRow] = await db
        .select({ mrr: sql<string>`COALESCE(SUM(${subscriptionPlans.price} * 30 / ${subscriptionPlans.intervalDays}), 0)` })
        .from(subscriptions).leftJoin(subscriptionPlans, eq(subscriptions.planId, subscriptionPlans.id))
        .where(eq(subscriptions.status, "active"));
      const total = parseFloat(current?.total ?? "0");
      const count = Number(current?.count ?? 0);
      const prevTotal = parseFloat(previous?.total ?? "0");
      return {
        total, mrr: parseFloat(mrrRow?.mrr ?? "0"),
        avgTransaction: count > 0 ? total / count : 0,
        totalTransactions: count,
        growthPercent: prevTotal > 0 ? Math.round(((total - prevTotal) / prevTotal) * 100) : null,
      };
    }),

  signupsByDay: adminProcedure
    .input(z.object({ days: z.number().min(7).max(365).default(30) }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];
      const since = daysAgo(input.days);
      const rows = await db
        .select({ date: sql<string>`DATE(${users.createdAt})`.as("date"), signups: sql<number>`COUNT(${users.id})`.as("signups") })
        .from(users).where(gte(users.createdAt, since))
        .groupBy(sql`DATE(${users.createdAt})`).orderBy(sql`DATE(${users.createdAt})`);
      const map = new Map(rows.map((r) => [r.date, Number(r.signups)]));
      const result: { date: string; signups: number }[] = [];
      for (let i = input.days - 1; i >= 0; i--) {
        const d = new Date(); d.setUTCDate(d.getUTCDate() - i);
        const key = fmtDate(d);
        result.push({ date: key, signups: map.get(key) ?? 0 });
      }
      return result;
    }),

  userFunnelMetrics: adminProcedure.query(async () => {
    const db = await getDb();
    if (!db) return { total: 0, free: 0, vip: 0, admin: 0, conversionRate: 0, newThisMonth: 0 };
    const [totals] = await db
      .select({
        total: sql<number>`COUNT(*)`,
        vip: sql<number>`SUM(CASE WHEN ${users.role} = 'vip' THEN 1 ELSE 0 END)`,
        admin: sql<number>`SUM(CASE WHEN ${users.role} = 'admin' THEN 1 ELSE 0 END)`,
        free: sql<number>`SUM(CASE WHEN ${users.role} = 'user' THEN 1 ELSE 0 END)`,
      }).from(users);
    const [newMonth] = await db
      .select({ count: sql<number>`COUNT(*)` }).from(users).where(gte(users.createdAt, daysAgo(30)));
    const total = Number(totals?.total ?? 0);
    const vip = Number(totals?.vip ?? 0);
    return {
      total, free: Number(totals?.free ?? 0), vip,
      admin: Number(totals?.admin ?? 0),
      conversionRate: total > 0 ? Math.round((vip / total) * 100 * 10) / 10 : 0,
      newThisMonth: Number(newMonth?.count ?? 0),
    };
  }),

  expiringVips: adminProcedure
    .input(z.object({ days: z.number().min(1).max(90).default(30) }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];
      const now = new Date();
      const until = new Date(); until.setDate(until.getDate() + input.days);
      const rows = await db
        .select({
          subscriptionId: subscriptions.id,
          userId: subscriptions.userId, userName: users.name, userEmail: users.email,
          planName: subscriptionPlans.name, expiresAt: subscriptions.expiresAt,
        })
        .from(subscriptions)
        .leftJoin(users, eq(subscriptions.userId, users.id))
        .leftJoin(subscriptionPlans, eq(subscriptions.planId, subscriptionPlans.id))
        .where(and(eq(subscriptions.status, "active"), gte(subscriptions.expiresAt, now), lte(subscriptions.expiresAt, until)))
        .orderBy(subscriptions.expiresAt).limit(100);
      // Deduplicate: keep earliest-expiring subscription per user
      const seen = new Map<number, typeof rows[0]>();
      for (const r of rows) {
        if (!seen.has(r.userId) || r.expiresAt! < seen.get(r.userId)!.expiresAt!) {
          seen.set(r.userId, r);
        }
      }
      return Array.from(seen.values()).slice(0, 50).map((r) => ({
        subscriptionId: r.subscriptionId,
        userId: r.userId, userName: r.userName ?? "Unknown", userEmail: r.userEmail ?? "",
        planName: r.planName ?? "Unknown", expiresAt: r.expiresAt?.toISOString() ?? "",
        daysLeft: r.expiresAt ? Math.ceil((r.expiresAt.getTime() - now.getTime()) / 86400000) : 0,
      }));
    }),

  topAlbums: adminProcedure
    .input(z.object({ limit: z.number().min(5).max(50).default(10) }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];
      return db.select({
        id: albums.id, title: albums.title, slug: albums.slug, coverUrl: albums.coverUrl,
        viewCount: albums.viewCount, photoCount: albums.photoCount, isVip: albums.isVip,
        cosplayer: albums.cosplayer, createdAt: albums.createdAt,
      }).from(albums).where(eq(albums.status, "published")).orderBy(desc(albums.viewCount)).limit(input.limit);
    }),

  topCreators: adminProcedure
    .input(z.object({ limit: z.number().min(5).max(50).default(10) }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];
      const rows = await db
        .select({
          id: creators.id, name: creators.name, slug: creators.slug, avatarUrl: creators.avatarUrl,
          albumCount: sql<number>`COUNT(${albums.id})`.as("albumCount"),
          totalViews: sql<number>`COALESCE(SUM(${albums.viewCount}), 0)`.as("totalViews"),
        })
        .from(creators)
        .leftJoin(albums, and(eq(albums.creatorId, creators.id), eq(albums.status, "published")))
        .groupBy(creators.id, creators.name, creators.slug, creators.avatarUrl)
        .orderBy(desc(sql`COUNT(${albums.id})`)).limit(input.limit);
      return rows.map((r) => ({ ...r, albumCount: Number(r.albumCount), totalViews: Number(r.totalViews) }));
    }),

  contentGrowth: adminProcedure.query(async () => {
    const db = await getDb();
    if (!db) return [];
    const since = daysAgo(180);
    const rows = await db
      .select({
        month: sql<string>`DATE_FORMAT(${albums.createdAt}, '%Y-%m')`.as("month"),
        albumsAdded: sql<number>`COUNT(${albums.id})`.as("albumsAdded"),
        photosAdded: sql<number>`COALESCE(SUM(${albums.photoCount}), 0)`.as("photosAdded"),
      })
      .from(albums)
      .where(and(eq(albums.status, "published"), gte(albums.createdAt, since)))
      .groupBy(sql`DATE_FORMAT(${albums.createdAt}, '%Y-%m')`)
      .orderBy(sql`DATE_FORMAT(${albums.createdAt}, '%Y-%m')`);
    return rows.map((r) => ({ month: r.month, albumsAdded: Number(r.albumsAdded), photosAdded: Number(r.photosAdded) }));
  }),
});
