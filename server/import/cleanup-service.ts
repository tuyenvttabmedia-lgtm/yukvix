/**
 * Phase 8 — Cleanup service for Operational Layer dashboard.
 */

import fs from "fs/promises";
import path from "path";
import os from "os";
import { and, eq, inArray, lt, sql } from "drizzle-orm";
import { getDb } from "../db";
import { adminNotifications, adminSettings, zipImportJobs } from "../../drizzle/schema";
import { dirSizeBytes, countTempJobDirs } from "./system-metrics";
import { purgeOldNotifications } from "./notification-service";

export type CleanupCategory = "temp" | "skipped" | "checkpoint" | "logs" | "notification";

export interface CleanupStats {
  temp: { jobDirs: number; sizeBytes: number; path: string };
  skipped: { jobCount: number; note: string };
  checkpoint: { jobsWithCheckpoint: number };
  logs: { jobsWithLogs: number; estimatedLogBytes: number };
  notification: { total: number; unread: number; olderThan90d: number };
  schedule: {
    lastCleanupAt: string | null;
    nextCleanupAt: string | null;
    retention: {
      tempHours: number;
      skippedDays: number;
      logsDays: number;
      notificationDays: number;
    };
  };
}

export interface CleanupResult {
  category: CleanupCategory;
  freedBytes: number;
  itemsRemoved: number;
  message: string;
}

const TEMP_BASE = process.env.IMPORT_TEMP_PATH || path.join(os.tmpdir(), "zip-import");
const LOG_RETENTION_DAYS = parseInt(process.env.IMPORT_LOG_RETENTION_DAYS || "90", 10);
const TEMP_RETENTION_HOURS = parseInt(process.env.IMPORT_TEMP_RETENTION_HOURS || "48", 10);
const SKIPPED_RETENTION_DAYS = parseInt(process.env.IMPORT_SKIPPED_RETENTION_DAYS || "30", 10);
const NOTIF_RETENTION_DAYS = 90;

export async function getCleanupStats(): Promise<CleanupStats> {
  const db = await getDb();
  const tempSize = await dirSizeBytes(TEMP_BASE);
  const jobDirs = await countTempJobDirs(TEMP_BASE);

  let skippedCount = 0;
  let checkpointCount = 0;
  let logsCount = 0;
  let logBytes = 0;
  let notifTotal = 0;
  let notifUnread = 0;
  let notifOld = 0;
  let lastCleanupAt: string | null = null;

  if (db) {
    const [skipRow] = await db
      .select({ count: sql<number>`COUNT(*)` })
      .from(zipImportJobs)
      .where(sql`${zipImportJobs.duplicateInfo} IS NOT NULL AND ${zipImportJobs.status} IN ('failed','waiting')`);

    skippedCount = Number(skipRow?.count ?? 0);

    const [cpRow] = await db
      .select({ count: sql<number>`COUNT(*)` })
      .from(zipImportJobs)
      .where(sql`${zipImportJobs.checkpoint} IS NOT NULL`);
    checkpointCount = Number(cpRow?.count ?? 0);

    const logRows = await db
      .select({ importLogs: zipImportJobs.importLogs })
      .from(zipImportJobs)
      .where(sql`${zipImportJobs.importLogs} IS NOT NULL`)
      .limit(200);

    logsCount = logRows.length;
    for (const r of logRows) {
      logBytes += (r.importLogs?.length ?? 0);
    }

    const [nTotal] = await db
      .select({ count: sql<number>`COUNT(*)` })
      .from(adminNotifications);
    notifTotal = Number(nTotal?.count ?? 0);

    const [nUnread] = await db
      .select({ count: sql<number>`COUNT(*)` })
      .from(adminNotifications)
      .where(sql`${adminNotifications.readAt} IS NULL`);
    notifUnread = Number(nUnread?.count ?? 0);

    const cutoff90 = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
    const [nOld] = await db
      .select({ count: sql<number>`COUNT(*)` })
      .from(adminNotifications)
      .where(lt(adminNotifications.createdAt, cutoff90));
    notifOld = Number(nOld?.count ?? 0);

    const cleanupLogRows = await db
      .select({ value: adminSettings.value })
      .from(adminSettings)
      .where(eq(adminSettings.key, "import_last_cleanup_at"))
      .limit(1);
    if (cleanupLogRows[0]?.value) lastCleanupAt = cleanupLogRows[0].value;
  }

  const retention = {
    tempHours: TEMP_RETENTION_HOURS,
    skippedDays: SKIPPED_RETENTION_DAYS,
    logsDays: LOG_RETENTION_DAYS,
    notificationDays: NOTIF_RETENTION_DAYS,
  };

  const nextCleanupAt = (() => {
    const base = lastCleanupAt ? new Date(lastCleanupAt) : new Date();
    const next = new Date(base);
    next.setUTCDate(next.getUTCDate() + 1);
    next.setUTCHours(2, 0, 0, 0);
    if (next.getTime() <= Date.now()) next.setUTCDate(next.getUTCDate() + 1);
    return next.toISOString();
  })();

  return {
    temp: { jobDirs, sizeBytes: tempSize, path: TEMP_BASE },
    skipped: {
      jobCount: skippedCount,
      note: "Wasabi imports/skipped/ archives — 30d retention (manual/cron)",
    },
    checkpoint: { jobsWithCheckpoint: checkpointCount },
    logs: { jobsWithLogs: logsCount, estimatedLogBytes: logBytes },
    notification: { total: notifTotal, unread: notifUnread, olderThan90d: notifOld },
    schedule: {
      lastCleanupAt,
      nextCleanupAt,
      retention,
    },
  };
}

async function cleanupTemp(): Promise<CleanupResult> {
  let freed = 0;
  let removed = 0;
  try {
    const entries = await fs.readdir(TEMP_BASE, { withFileTypes: true });
    for (const ent of entries) {
      if (!ent.isDirectory() || !ent.name.startsWith("job-")) continue;
      const full = path.join(TEMP_BASE, ent.name);
      const size = await dirSizeBytes(full);
      await fs.rm(full, { recursive: true, force: true });
      freed += size;
      removed++;
    }
  } catch {
    // path may not exist
  }
  return {
    category: "temp",
    freedBytes: freed,
    itemsRemoved: removed,
    message: `Removed ${removed} temp job directories`,
  };
}

async function cleanupLogs(): Promise<CleanupResult> {
  const db = await getDb();
  if (!db) {
    return { category: "logs", freedBytes: 0, itemsRemoved: 0, message: "DB unavailable" };
  }

  const cutoff = new Date(Date.now() - LOG_RETENTION_DAYS * 24 * 60 * 60 * 1000);
  const rows = await db
    .select({ id: zipImportJobs.id, importLogs: zipImportJobs.importLogs })
    .from(zipImportJobs)
    .where(
      and(
        inArray(zipImportJobs.status, ["completed", "failed", "cancelled", "expired"]),
        lt(zipImportJobs.completedAt, cutoff),
        sql`${zipImportJobs.importLogs} IS NOT NULL`
      )
    )
    .limit(100);

  let bytes = 0;
  for (const row of rows) {
    bytes += row.importLogs?.length ?? 0;
    await db
      .update(zipImportJobs)
      .set({ importLogs: null, updatedAt: new Date() })
      .where(eq(zipImportJobs.id, row.id));
  }

  return {
    category: "logs",
    freedBytes: bytes,
    itemsRemoved: rows.length,
    message: `Cleared logs on ${rows.length} jobs older than ${LOG_RETENTION_DAYS}d`,
  };
}

async function cleanupCheckpoints(): Promise<CleanupResult> {
  const db = await getDb();
  if (!db) {
    return { category: "checkpoint", freedBytes: 0, itemsRemoved: 0, message: "DB unavailable" };
  }

  const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const baseWhere = and(
    eq(zipImportJobs.status, "completed"),
    sql`${zipImportJobs.completedAt} IS NOT NULL`,
    sql`${zipImportJobs.completedAt} < ${cutoff}`
  );

  // Idempotent: only touch rows that still have checkpoint/resume data.
  const hasDataWhere = and(
    baseWhere,
    sql`(${zipImportJobs.checkpoint} IS NOT NULL OR ${zipImportJobs.resumeHistory} IS NOT NULL)`
  );

  let n = 0;
  try {
    const result = await db
      .update(zipImportJobs)
      .set({ checkpoint: null, resumeHistory: null, updatedAt: new Date() })
      .where(hasDataWhere);
    n = (result as { affectedRows?: number }).affectedRows ?? 0;
  } catch {
    // Pre-migration fallback: resumeHistory column may not exist yet.
    const result = await db
      .update(zipImportJobs)
      .set({ checkpoint: null, updatedAt: new Date() })
      .where(
        and(
          baseWhere,
          sql`${zipImportJobs.checkpoint} IS NOT NULL`
        )
      );
    n = (result as { affectedRows?: number }).affectedRows ?? 0;
  }

  return {
    category: "checkpoint",
    freedBytes: 0,
    itemsRemoved: n,
    message: `Cleared checkpoint on ${n} completed jobs (>30d)`,
  };
}

async function cleanupNotifications(): Promise<CleanupResult> {
  const n = await purgeOldNotifications();
  return {
    category: "notification",
    freedBytes: 0,
    itemsRemoved: n,
    message: `Purged ${n} notifications older than 90d`,
  };
}

async function cleanupSkipped(): Promise<CleanupResult> {
  return {
    category: "skipped",
    freedBytes: 0,
    itemsRemoved: 0,
    message: "Skipped Wasabi archives require dedicated cron — use Cleanup Now for temp/logs first",
  };
}

export async function runCleanup(categories: CleanupCategory[]): Promise<CleanupResult[]> {
  const results: CleanupResult[] = [];
  for (const cat of categories) {
    switch (cat) {
      case "temp":
        results.push(await cleanupTemp());
        break;
      case "logs":
        results.push(await cleanupLogs());
        break;
      case "checkpoint":
        results.push(await cleanupCheckpoints());
        break;
      case "notification":
        results.push(await cleanupNotifications());
        break;
      case "skipped":
        results.push(await cleanupSkipped());
        break;
    }
  }
  return results;
}

export async function runFullCleanup(): Promise<CleanupResult[]> {
  const results = await runCleanup(["temp", "logs", "checkpoint", "notification"]);
  const db = await getDb();
  if (db) {
    const ts = new Date().toISOString();
    await db
      .insert(adminSettings)
      .values({ key: "import_last_cleanup_at", value: ts })
      .onDuplicateKeyUpdate({ set: { value: ts, updatedAt: new Date() } });
  }
  return results;
}
