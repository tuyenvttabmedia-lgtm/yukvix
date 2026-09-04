import { and, desc, eq, inArray, notInArray, sql } from "drizzle-orm";
import { albums, socialAccounts, socialPosts } from "../../drizzle/schema";
import { getDb } from "../db";
import {
  loadScheduleState,
  loadSocialConfig,
  saveScheduleState,
  type SocialScheduleState,
} from "./config";
import { getSocialQueue } from "./queue";
import { createAutoSharePosts } from "./share";
import type { SocialAccountFlags } from "./types";

const BLOCKING_STATUSES = [
  "pending",
  "processing",
  "awaiting_approval",
  "sent",
  "skipped",
] as const;

export function shouldRunSchedule(opts: {
  moduleEnabled: boolean;
  scheduleEnabled: boolean;
  intervalMinutes: number;
  lastRunAt: string | null;
  now?: Date;
}): boolean {
  if (!opts.moduleEnabled || !opts.scheduleEnabled) return false;
  if (!opts.lastRunAt) return true;
  const last = Date.parse(opts.lastRunAt);
  if (!Number.isFinite(last)) return true;
  const now = opts.now ?? new Date();
  const minutes = Math.max(1, opts.intervalMinutes);
  return now.getTime() - last >= minutes * 60 * 1000;
}

export function nextRunAt(
  lastRunAt: string | null,
  intervalMinutes: number,
  now = new Date()
): Date {
  if (!lastRunAt) return now;
  const last = Date.parse(lastRunAt);
  if (!Number.isFinite(last)) return now;
  const minutes = Math.max(1, intervalMinutes);
  return new Date(last + minutes * 60 * 1000);
}

export function describeScheduleLastRun(opts: {
  lastPostStatus: string | null;
  lastStatus: string | null;
  lastError: string | null;
}): string {
  const status = opts.lastPostStatus || opts.lastStatus;
  if (!status) return "";
  switch (status) {
    case "pending":
      return "Đã xếp hàng, đang gửi";
    case "processing":
      return "Đang gửi lên Telegram";
    case "sent":
      return "Đã lên kênh";
    case "failed":
      return opts.lastError
        ? `Gửi thất bại: ${opts.lastError}`
        : "Gửi thất bại";
    case "skipped":
      return "Đã bỏ qua";
    case "awaiting_approval":
      return "Chờ duyệt";
    case "enabled":
      return "Đã bật lịch (chờ chu kỳ đầu)";
    case "no-telegram-account":
      return "Chưa có tài khoản Telegram";
    case "duplicate skipped":
      return "Bỏ qua (trùng album)";
    default:
      if (status.includes("no unpublished")) return "Hết album chưa share";
      return status;
  }
}

export async function listEnabledTelegramAccounts(): Promise<SocialAccountFlags[]> {
  const db = await getDb();
  if (!db) return [];
  const rows = await db
    .select()
    .from(socialAccounts)
    .where(
      and(eq(socialAccounts.platform, "telegram"), eq(socialAccounts.isEnabled, true))
    );
  return rows.map(row => ({
    id: row.id,
    platform: row.platform,
    displayName: row.displayName,
    isEnabled: row.isEnabled,
    autoShare: row.autoShare,
    requireApproval: row.requireApproval,
    configJson: row.configJson,
  }));
}

export async function countUnsharedPublishedAlbums(
  accountId: number
): Promise<number> {
  const db = await getDb();
  if (!db) return 0;
  const sharedRows = await db
    .selectDistinct({ albumId: socialPosts.albumId })
    .from(socialPosts)
    .where(
      and(
        eq(socialPosts.accountId, accountId),
        inArray(socialPosts.status, [...BLOCKING_STATUSES])
      )
    );
  const sharedIds = sharedRows.map(r => r.albumId);
  const conditions = [
    eq(albums.status, "published"),
    sql`${albums.photoCount} > 0`,
  ];
  if (sharedIds.length > 0) conditions.push(notInArray(albums.id, sharedIds));
  const [row] = await db
    .select({ n: sql<number>`count(*)` })
    .from(albums)
    .where(and(...conditions));
  return Number(row?.n ?? 0);
}

export async function pickRandomUnsharedPublishedAlbumId(
  accountId: number
): Promise<number | null> {
  const db = await getDb();
  if (!db) return null;
  const sharedRows = await db
    .selectDistinct({ albumId: socialPosts.albumId })
    .from(socialPosts)
    .where(
      and(
        eq(socialPosts.accountId, accountId),
        inArray(socialPosts.status, [...BLOCKING_STATUSES])
      )
    );
  const sharedIds = sharedRows.map(r => r.albumId);
  const conditions = [
    eq(albums.status, "published"),
    sql`${albums.photoCount} > 0`,
  ];
  if (sharedIds.length > 0) conditions.push(notInArray(albums.id, sharedIds));
  const rows = await db
    .select({ id: albums.id })
    .from(albums)
    .where(and(...conditions))
    .orderBy(sql`RAND()`)
    .limit(1);
  return rows[0]?.id ?? null;
}

export type ScheduleTickResult = {
  ran: boolean;
  reason?: string;
  albumId?: number | null;
  accountId?: number;
  postId?: number;
  status?: string;
  remaining?: number;
};

async function shareOneForAccount(
  account: SocialAccountFlags
): Promise<ScheduleTickResult> {
  const albumId = await pickRandomUnsharedPublishedAlbumId(account.id);
  const remaining = await countUnsharedPublishedAlbums(account.id);
  if (!albumId) {
    return {
      ran: false,
      reason: "no unpublished albums left for this channel",
      remaining: 0,
      accountId: account.id,
    };
  }
  const result = await createAutoSharePosts(albumId, {
    accounts: [account],
    requireAutoShare: false,
    scheduledAt: new Date(),
  });
  const created = result.created[0];
  return {
    ran: true,
    albumId,
    accountId: account.id,
    postId: created?.id,
    status: created?.status,
    remaining: Math.max(0, remaining - (created?.duplicate ? 0 : 1)),
    reason: created?.duplicate ? "duplicate skipped" : undefined,
  };
}

export async function runTelegramScheduleTick(opts?: {
  force?: boolean;
}): Promise<ScheduleTickResult> {
  const config = await loadSocialConfig();
  const state = await loadScheduleState();
  if (
    !opts?.force &&
    !shouldRunSchedule({
      moduleEnabled: config.enabled,
      scheduleEnabled: config.schedule.enabled,
      intervalMinutes: config.schedule.intervalMinutes,
      lastRunAt: state.lastRunAt,
    })
  ) {
    return { ran: false, reason: "not due" };
  }
  if (!config.enabled || (!config.schedule.enabled && !opts?.force)) {
    return { ran: false, reason: "schedule disabled" };
  }

  const accounts = await listEnabledTelegramAccounts();
  if (accounts.length === 0) {
    const nextState: SocialScheduleState = {
      lastRunAt: new Date().toISOString(),
      lastAlbumId: null,
      lastStatus: "no-telegram-account",
      lastPostId: null,
    };
    await saveScheduleState(nextState);
    return { ran: false, reason: "no enabled Telegram account" };
  }

  const outcome = await shareOneForAccount(accounts[0]);
  await saveScheduleState({
    lastRunAt: new Date().toISOString(),
    lastAlbumId: outcome.albumId ?? null,
    lastStatus: outcome.status || outcome.reason || "ok",
    lastPostId: outcome.postId ?? null,
  });
  return outcome;
}

async function loadLastSchedulePost(
  lastPostId: number | null,
  lastAlbumId: number | null,
  accountId: number | null
) {
  if (lastPostId) {
    const post = await getSocialQueue().getById(lastPostId);
    if (post) return post;
  }
  if (!lastAlbumId || !accountId) return null;
  const db = await getDb();
  if (!db) return null;
  const rows = await db
    .select()
    .from(socialPosts)
    .where(
      and(eq(socialPosts.albumId, lastAlbumId), eq(socialPosts.accountId, accountId))
    )
    .orderBy(desc(socialPosts.id))
    .limit(1);
  return rows[0] ?? null;
}

export async function getTelegramScheduleStatus() {
  const config = await loadSocialConfig();
  const state = await loadScheduleState();
  const accounts = await listEnabledTelegramAccounts();
  const account = accounts[0] ?? null;
  const remaining = account
    ? await countUnsharedPublishedAlbums(account.id)
    : 0;
  const lastPost = await loadLastSchedulePost(
    state.lastPostId,
    state.lastAlbumId,
    account?.id ?? null
  );
  const lastPostStatus = lastPost?.status ?? null;
  const lastError = lastPost?.lastError ?? null;
  return {
    enabled: config.enabled && config.schedule.enabled,
    intervalMinutes: config.schedule.intervalMinutes,
    lastRunAt: state.lastRunAt,
    lastAlbumId: state.lastAlbumId,
    lastPostId: lastPost?.id ?? state.lastPostId,
    lastStatus: state.lastStatus,
    lastPostStatus,
    lastPostUrl: lastPost?.externalUrl ?? null,
    lastError,
    lastStatusLabel: describeScheduleLastRun({
      lastPostStatus,
      lastStatus: state.lastStatus,
      lastError,
    }),
    nextRunAt: config.schedule.enabled
      ? nextRunAt(state.lastRunAt, config.schedule.intervalMinutes).toISOString()
      : null,
    remaining,
    accountId: account?.id ?? null,
    accountName: account?.displayName ?? null,
  };
}
