/**
 * Delete redundant ZIP archives from Wasabi (failed copies, skipped dupes, orphan staging).
 * Never deletes albums/{slug}/ image prefixes — those may be live published media.
 */
import { and, eq, inArray, lt, ne, sql } from "drizzle-orm";
import { getDb } from "../db";
import { zipImportJobs } from "../../drizzle/schema";
import { deleteFromStorage } from "../storage-wasabi";
import { getPendingImportAnywayJobIds } from "./zip-dedup";

const ACTIVE_SIBLING = ["uploaded", "waiting", "scheduled", "processing", "waiting_disk_space", "completed"] as const;
const SKIPPED_RETENTION_DAYS = parseInt(process.env.IMPORT_SKIPPED_RETENTION_DAYS || "30", 10);

export interface ArchivePurgeStats {
  failedCount: number;
  failedBytes: number;
  skippedCount: number;
  skippedBytes: number;
  staleStagingCount: number;
  staleStagingBytes: number;
}

export interface ArchivePurgeResult {
  scanned: number;
  deleted: number;
  freedBytes: number;
  skippedPendingAnyway: number;
  message: string;
}

function isSafeArchiveKey(key: string | null | undefined): key is string {
  if (!key) return false;
  return (
    key.startsWith("imports/failed/") ||
    key.startsWith("imports/skipped/") ||
    key.startsWith("imports/staging/")
  );
}

async function deleteArchiveKey(jobId: number, key: string): Promise<number> {
  const db = await getDb();
  if (!db) return 0;
  const [row] = await db
    .select({ size: zipImportJobs.sourceArchiveSize })
    .from(zipImportJobs)
    .where(eq(zipImportJobs.id, jobId))
    .limit(1);
  await deleteFromStorage(key).catch(() => {});
  const logs: string[] = [];
  const current = await db
    .select({ importLogs: zipImportJobs.importLogs })
    .from(zipImportJobs)
    .where(eq(zipImportJobs.id, jobId))
    .limit(1);
  if (current[0]?.importLogs) {
    try {
      logs.push(...(JSON.parse(current[0].importLogs) as string[]));
    } catch {
      /* ignore */
    }
  }
  logs.push(`[${new Date().toISOString()}] [Purge] deleted Wasabi archive ${key}`);
  await db
    .update(zipImportJobs)
    .set({
      sourceArchiveKey: null,
      importLogs: JSON.stringify(logs).slice(0, 50000),
      updatedAt: new Date(),
    })
    .where(eq(zipImportJobs.id, jobId));
  return Number(row?.size) || 0;
}

export async function getArchivePurgeStats(): Promise<ArchivePurgeStats> {
  const db = await getDb();
  const empty = {
    failedCount: 0,
    failedBytes: 0,
    skippedCount: 0,
    skippedBytes: 0,
    staleStagingCount: 0,
    staleStagingBytes: 0,
  };
  if (!db) return empty;

  const [failed] = await db
    .select({
      count: sql<number>`COUNT(*)`,
      bytes: sql<number>`COALESCE(SUM(${zipImportJobs.sourceArchiveSize}), 0)`,
    })
    .from(zipImportJobs)
    .where(
      and(
        eq(zipImportJobs.status, "failed"),
        sql`${zipImportJobs.sourceArchiveKey} IS NOT NULL AND ${zipImportJobs.sourceArchiveKey} <> ''`
      )
    );

  const [skipped] = await db
    .select({
      count: sql<number>`COUNT(*)`,
      bytes: sql<number>`COALESCE(SUM(${zipImportJobs.sourceArchiveSize}), 0)`,
    })
    .from(zipImportJobs)
    .where(eq(zipImportJobs.status, "skipped" as "failed"));

  const [stale] = await db
    .select({
      count: sql<number>`COUNT(*)`,
      bytes: sql<number>`COALESCE(SUM(${zipImportJobs.sourceArchiveSize}), 0)`,
    })
    .from(zipImportJobs)
    .where(
      and(
        inArray(zipImportJobs.status, ["failed", "cancelled", "expired"]),
        sql`${zipImportJobs.sourceArchiveKey} LIKE 'imports/staging/%'`
      )
    );

  return {
    failedCount: Number(failed?.count) || 0,
    failedBytes: Number(failed?.bytes) || 0,
    skippedCount: Number(skipped?.count) || 0,
    skippedBytes: Number(skipped?.bytes) || 0,
    staleStagingCount: Number(stale?.count) || 0,
    staleStagingBytes: Number(stale?.bytes) || 0,
  };
}

export async function purgeRedundantFailedArchives(): Promise<ArchivePurgeResult> {
  const db = await getDb();
  if (!db) {
    return { scanned: 0, deleted: 0, freedBytes: 0, skippedPendingAnyway: 0, message: "DB unavailable" };
  }

  const failed = await db
    .select({
      id: zipImportJobs.id,
      key: zipImportJobs.sourceArchiveKey,
      name: zipImportJobs.sourceArchiveOriginalName,
      size: zipImportJobs.sourceArchiveSize,
    })
    .from(zipImportJobs)
    .where(eq(zipImportJobs.status, "failed"));

  let deleted = 0;
  let freed = 0;
  for (const job of failed) {
    if (!isSafeArchiveKey(job.key) || !job.name) continue;

    const siblings = await db
      .select({ id: zipImportJobs.id })
      .from(zipImportJobs)
      .where(
        and(
          ne(zipImportJobs.id, job.id),
          inArray(zipImportJobs.status, [...ACTIVE_SIBLING]),
          sql`LOWER(${zipImportJobs.sourceArchiveOriginalName}) = ${job.name.toLowerCase()}`,
          job.size != null ? eq(zipImportJobs.sourceArchiveSize, job.size) : sql`1=1`
        )
      )
      .limit(1);

    if (!siblings[0]) continue;
    freed += await deleteArchiveKey(job.id, job.key);
    deleted += 1;
  }

  return {
    scanned: failed.length,
    deleted,
    freedBytes: freed,
    skippedPendingAnyway: 0,
    message: `Deleted ${deleted} failed ZIP copies that already have a queued/completed sibling`,
  };
}

export async function purgeOldSkippedArchives(): Promise<ArchivePurgeResult> {
  const db = await getDb();
  if (!db) {
    return { scanned: 0, deleted: 0, freedBytes: 0, skippedPendingAnyway: 0, message: "DB unavailable" };
  }

  const pendingAnywayIds = new Set(await getPendingImportAnywayJobIds());
  const cutoff = new Date(Date.now() - SKIPPED_RETENTION_DAYS * 24 * 60 * 60 * 1000);

  const oldSkipped = await db
    .select({
      id: zipImportJobs.id,
      key: zipImportJobs.sourceArchiveKey,
      duplicateOverrideAudit: zipImportJobs.duplicateOverrideAudit,
    })
    .from(zipImportJobs)
    .where(and(eq(zipImportJobs.status, "skipped" as "failed"), lt(zipImportJobs.updatedAt, cutoff)))
    .limit(200);

  let deleted = 0;
  let freed = 0;
  let skippedPendingAnyway = 0;

  for (const job of oldSkipped) {
    if (pendingAnywayIds.has(job.id) || job.duplicateOverrideAudit) {
      skippedPendingAnyway += 1;
      continue;
    }
    if (!isSafeArchiveKey(job.key) || !job.key.startsWith(`imports/skipped/${job.id}/`)) continue;
    freed += await deleteArchiveKey(job.id, job.key);
    deleted += 1;
  }

  return {
    scanned: oldSkipped.length,
    deleted,
    freedBytes: freed,
    skippedPendingAnyway,
    message: `Deleted ${deleted} skipped archives older than ${SKIPPED_RETENTION_DAYS}d`,
  };
}

export async function purgeStaleStagingArchives(): Promise<ArchivePurgeResult> {
  const db = await getDb();
  if (!db) {
    return { scanned: 0, deleted: 0, freedBytes: 0, skippedPendingAnyway: 0, message: "DB unavailable" };
  }

  const rows = await db
    .select({
      id: zipImportJobs.id,
      key: zipImportJobs.sourceArchiveKey,
    })
    .from(zipImportJobs)
    .where(
      and(
        inArray(zipImportJobs.status, ["failed", "cancelled", "expired"]),
        sql`${zipImportJobs.sourceArchiveKey} LIKE 'imports/staging/%'`
      )
    );

  let deleted = 0;
  let freed = 0;
  for (const job of rows) {
    if (!isSafeArchiveKey(job.key)) continue;
    if (!job.key.startsWith(`imports/staging/${job.id}/`)) continue;

    const [statusRow] = await db
      .select({ status: zipImportJobs.status, name: zipImportJobs.sourceArchiveOriginalName, size: zipImportJobs.sourceArchiveSize })
      .from(zipImportJobs)
      .where(eq(zipImportJobs.id, job.id))
      .limit(1);
    if (statusRow?.status === "failed") {
      const siblings = await db
        .select({ id: zipImportJobs.id })
        .from(zipImportJobs)
        .where(
          and(
            ne(zipImportJobs.id, job.id),
            inArray(zipImportJobs.status, [...ACTIVE_SIBLING]),
            statusRow.name
              ? sql`LOWER(${zipImportJobs.sourceArchiveOriginalName}) = ${statusRow.name.toLowerCase()}`
              : sql`1=0`
          )
        )
        .limit(1);
      if (!siblings[0]) continue;
    }

    freed += await deleteArchiveKey(job.id, job.key);
    deleted += 1;
  }

  return {
    scanned: rows.length,
    deleted,
    freedBytes: freed,
    skippedPendingAnyway: 0,
    message: `Deleted ${deleted} leftover staging archives on failed/cancelled/expired jobs`,
  };
}
