/**
 * Phase 8 — Admin Notification Center (INFO / SUCCESS / WARNING / ERROR).
 * DB-backed; sync from job state without modifying frozen worker layers.
 */

import { and, desc, eq, gte, isNull, lt, sql } from "drizzle-orm";
import { getDb } from "../db";
import { adminNotifications, zipImportJobs } from "../../drizzle/schema";

export type NotificationLevel = "info" | "success" | "warning" | "error";

export interface CreateNotificationInput {
  level: NotificationLevel;
  type: string;
  title: string;
  message?: string;
  jobId?: number;
}

const HEARTBEAT_STALE_SEC = parseInt(process.env.IMPORT_HEARTBEAT_STALE_SEC || "120", 10);
const QUEUE_WARN_THRESHOLD = parseInt(process.env.IMPORT_QUEUE_WARN_THRESHOLD || "50", 10);

export async function createNotification(input: CreateNotificationInput): Promise<number | null> {
  const db = await getDb();
  if (!db) return null;

  const [result] = await db.insert(adminNotifications).values({
    level: input.level,
    type: input.type,
    title: input.title,
    message: input.message ?? null,
    jobId: input.jobId ?? null,
  });

  return (result as { insertId?: number }).insertId ?? null;
}

export async function listNotifications(limit = 50, unreadOnly = false) {
  const db = await getDb();
  if (!db) return { items: [], unreadCount: 0 };

  const where = unreadOnly ? isNull(adminNotifications.readAt) : undefined;

  const items = await db
    .select()
    .from(adminNotifications)
    .where(where)
    .orderBy(desc(adminNotifications.createdAt))
    .limit(limit);

  const [unreadRow] = await db
    .select({ count: sql<number>`COUNT(*)` })
    .from(adminNotifications)
    .where(isNull(adminNotifications.readAt));

  return {
    items,
    unreadCount: Number(unreadRow?.count ?? 0),
  };
}

export async function markNotificationRead(id: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db
    .update(adminNotifications)
    .set({ readAt: new Date() })
    .where(eq(adminNotifications.id, id));
}

export async function markAllNotificationsRead(): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db
    .update(adminNotifications)
    .set({ readAt: new Date() })
    .where(isNull(adminNotifications.readAt));
}

/** Dedupe: skip if same type+jobId within last hour. */
async function recentlyNotified(type: string, jobId?: number): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;
  const since = new Date(Date.now() - 60 * 60 * 1000);
  const conditions = [eq(adminNotifications.type, type), gte(adminNotifications.createdAt, since)];
  if (jobId != null) {
    conditions.push(eq(adminNotifications.jobId, jobId));
  }
  const [row] = await db
    .select({ count: sql<number>`COUNT(*)` })
    .from(adminNotifications)
    .where(and(...conditions));
  return Number(row?.count ?? 0) > 0;
}

/**
 * Infer notifications from current job state (called by metrics snapshot cron).
 * Does not modify jobs — read-only sync.
 */
export async function syncNotificationsFromJobs(): Promise<number> {
  const db = await getDb();
  if (!db) return 0;
  let created = 0;

  const [queueRow] = await db
    .select({ count: sql<number>`COUNT(*)` })
    .from(zipImportJobs)
    .where(eq(zipImportJobs.status, "waiting"));
  const queueLen = Number(queueRow?.count ?? 0);
  if (queueLen > QUEUE_WARN_THRESHOLD) {
    if (!(await recentlyNotified("QUEUE_HIGH"))) {
      await createNotification({
        level: "warning",
        type: "QUEUE_HIGH",
        title: "Queue Waiting Too Long",
        message: `${queueLen} jobs waiting (threshold ${QUEUE_WARN_THRESHOLD})`,
      });
      created++;
    }
  }

  const staleJobs = await db
    .select({
      id: zipImportJobs.id,
      heartbeatAt: zipImportJobs.heartbeatAt,
      sourceArchiveOriginalName: zipImportJobs.sourceArchiveOriginalName,
    })
    .from(zipImportJobs)
    .where(eq(zipImportJobs.status, "processing"))
    .limit(20);

  const now = Date.now();
  for (const job of staleJobs) {
    if (!job.heartbeatAt) continue;
    const ageSec = (now - new Date(job.heartbeatAt).getTime()) / 1000;
    if (ageSec > HEARTBEAT_STALE_SEC) {
      if (!(await recentlyNotified("HEARTBEAT_LOST", job.id))) {
        await createNotification({
          level: "error",
          type: "HEARTBEAT_LOST",
          title: `Worker Lost Heartbeat — job #${job.id}`,
          message: job.sourceArchiveOriginalName || undefined,
          jobId: job.id,
        });
        created++;
      }
    }
  }

  const recentFailed = await db
    .select({
      id: zipImportJobs.id,
      lastError: zipImportJobs.lastError,
      sourceArchiveOriginalName: zipImportJobs.sourceArchiveOriginalName,
    })
    .from(zipImportJobs)
    .where(
      and(
        eq(zipImportJobs.status, "failed"),
        gte(zipImportJobs.updatedAt, new Date(Date.now() - 15 * 60 * 1000))
      )
    )
    .limit(10);

  for (const job of recentFailed) {
    if (await recentlyNotified("JOB_FAILED", job.id)) continue;
    await createNotification({
      level: "error",
      type: "JOB_FAILED",
      title: `Album Import Failed — #${job.id}`,
      message: job.lastError || job.sourceArchiveOriginalName || undefined,
      jobId: job.id,
    });
    created++;
  }

  const recentCompleted = await db
    .select({
      id: zipImportJobs.id,
      sourceArchiveOriginalName: zipImportJobs.sourceArchiveOriginalName,
    })
    .from(zipImportJobs)
    .where(
      and(
        eq(zipImportJobs.status, "completed"),
        gte(zipImportJobs.completedAt, new Date(Date.now() - 10 * 60 * 1000))
      )
    )
    .limit(5);

  for (const job of recentCompleted) {
    if (await recentlyNotified("JOB_COMPLETED", job.id)) continue;
    await createNotification({
      level: "success",
      type: "JOB_COMPLETED",
      title: "Album Import Completed",
      message: job.sourceArchiveOriginalName || `Job #${job.id}`,
      jobId: job.id,
    });
    created++;
  }

  return created;
}

/** Retention: delete notifications older than 90 days. */
export async function purgeOldNotifications(): Promise<number> {
  const db = await getDb();
  if (!db) return 0;
  const cutoff = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
  const result = await db
    .delete(adminNotifications)
    .where(lt(adminNotifications.createdAt, cutoff));
  return (result as { affectedRows?: number }).affectedRows ?? 0;
}
