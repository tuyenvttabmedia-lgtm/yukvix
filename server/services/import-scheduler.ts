/**
 * Import Scheduler (Phase 2)
 * Single entry point for dispatching ZIP import jobs.
 * - MySQL GET_LOCK global scheduler lock
 * - FOR UPDATE SKIP LOCKED per-job pick
 * - Dead worker recovery via heartbeat (default 2 min)
 */

import { execFile } from "child_process";
import { promisify } from "util";
import type { RowDataPacket } from "mysql2";
import { and, eq, inArray, isNotNull, isNull, lt, or, sql } from "drizzle-orm";
import { getDb, getDbPool } from "../db";
import { albums, zipImportJobs } from "../../drizzle/schema";
import { processImportJob } from "../workers/import-worker";
import { generateWorkerId, HEARTBEAT_STALE_MS } from "./import-job-lock";

const execFileAsync = promisify(execFile);

const SCHEDULER_LOCK_NAME = "yukvix_zip_scheduler";
const MAX_ACTIVE_JOBS = parseInt(process.env.IMPORT_MAX_ACTIVE_JOBS || "1", 10);

export interface DispatchOptions {
  manual?: boolean;
  batchSize?: number;
  source?: string;
}

export interface DispatchResult {
  started: number[];
  skipped: number[];
  reason?: string;
  message?: string;
}

export function isZipImportV2Enabled(): boolean {
  return process.env.ZIP_IMPORT_V2 === "true";
}

export { HEARTBEAT_STALE_MS, HEARTBEAT_INTERVAL_MS } from "./import-job-lock";

async function acquireSchedulerLock(): Promise<boolean> {
  const pool = getDbPool();
  if (!pool) return false;
  const [rows] = await pool.query<RowDataPacket[]>(
    "SELECT GET_LOCK(?, 0) as acquired",
    [SCHEDULER_LOCK_NAME]
  );
  return rows[0]?.acquired === 1;
}

async function releaseSchedulerLock(): Promise<void> {
  const pool = getDbPool();
  if (!pool) return;
  await pool.query("SELECT RELEASE_LOCK(?)", [SCHEDULER_LOCK_NAME]);
}

async function countActiveJobs(): Promise<number> {
  const db = await getDb();
  if (!db) return MAX_ACTIVE_JOBS;
  const rows = await db
    .select({ id: zipImportJobs.id })
    .from(zipImportJobs)
    .where(inArray(zipImportJobs.status, ["scheduled", "processing"]));
  return rows.length;
}

async function checkDiskSpace(): Promise<boolean> {
  const minFreeGb = parseFloat(process.env.IMPORT_LOCAL_DISK_MIN_FREE_GB || "0");
  if (minFreeGb <= 0) return true;

  const tempPath = process.env.IMPORT_TEMP_PATH || "/tmp";
  try {
    const { stdout } = await execFileAsync("df", ["-BG", "--output=avail", tempPath]);
    const lines = stdout.trim().split("\n");
    const availStr = lines[lines.length - 1].trim().replace("G", "");
    const availGb = parseFloat(availStr);
    if (!isNaN(availGb) && availGb < minFreeGb) {
      console.warn(
        `[ImportScheduler] Low disk: ${availGb}GB available, ${minFreeGb}GB required`
      );
      const db = await getDb();
      if (db) {
        await db
          .update(zipImportJobs)
          .set({ status: "waiting_disk_space", updatedAt: new Date() })
          .where(eq(zipImportJobs.status, "waiting"));
      }
      return false;
    }
  } catch (diskErr) {
    console.warn(`[ImportScheduler] Disk check failed (non-fatal): ${(diskErr as Error).message}`);
  }
  return true;
}

async function restoreDiskSpaceWaitingJobs(): Promise<void> {
  const db = await getDb();
  if (!db) return;
  const rows = await db
    .select({ id: zipImportJobs.id })
    .from(zipImportJobs)
    .where(eq(zipImportJobs.status, "waiting_disk_space"));
  if (rows.length > 0) {
    await db
      .update(zipImportJobs)
      .set({ status: "waiting", updatedAt: new Date() })
      .where(eq(zipImportJobs.status, "waiting_disk_space"));
    console.log(`[ImportScheduler] Restored ${rows.length} job(s) from waiting_disk_space`);
  }
}

interface PickedJobRow extends RowDataPacket {
  id: number;
  albumId: number | null;
  sourceArchiveKey: string | null;
  sourceArchiveOriginalName: string | null;
  archivePasswordIndex: number;
  workerId: string | null;
}

async function pickAndScheduleJob(workerId: string): Promise<PickedJobRow | null> {
  const pool = getDbPool();
  if (!pool) return null;

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [rows] = await conn.query<PickedJobRow[]>(
      `SELECT id, albumId, sourceArchiveKey, sourceArchiveOriginalName, archivePasswordIndex, workerId
       FROM zip_import_jobs
       WHERE status = 'waiting'
       ORDER BY createdAt ASC
       LIMIT 1
       FOR UPDATE SKIP LOCKED`
    );

    if (!rows.length) {
      await conn.rollback();
      return null;
    }

    const job = rows[0];
    if (!job.albumId || !job.sourceArchiveKey) {
      await conn.rollback();
      return null;
    }

    await conn.query(
      `UPDATE zip_import_jobs
       SET status = 'scheduled',
           scheduledAt = NOW(),
           workerId = ?,
           lockedAt = NOW(),
           heartbeatAt = NOW(),
           updatedAt = NOW()
       WHERE id = ?`,
      [workerId, job.id]
    );

    await conn.commit();
    job.workerId = workerId;
    return job;
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

async function startJob(job: PickedJobRow): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;

  const albumRow = await db
    .select({ slug: albums.slug, title: albums.title })
    .from(albums)
    .where(eq(albums.id, job.albumId!))
    .limit(1);

  if (!albumRow[0]) {
    await db
      .update(zipImportJobs)
      .set({
        status: "failed",
        workerId: null,
        lockedAt: null,
        heartbeatAt: null,
        updatedAt: new Date(),
      })
      .where(eq(zipImportJobs.id, job.id));
    return false;
  }

  console.log(
    `[ImportScheduler] Starting job ${job.id} for album "${albumRow[0].title}" (worker=${job.workerId})`
  );

  processImportJob({
    jobId: job.id,
    albumId: job.albumId!,
    albumSlug: albumRow[0].slug,
    albumTitle: albumRow[0].title,
    sourceArchiveKey: job.sourceArchiveKey!,
    sourceArchiveOriginalName: job.sourceArchiveOriginalName || "archive.zip",
    archivePasswordIndex: job.archivePasswordIndex,
    workerId: job.workerId || generateWorkerId(),
  }).catch((err: Error) => {
    console.error(`[ImportScheduler] Job ${job.id} failed: ${err.message}`);
  });

  return true;
}

/**
 * Recover jobs whose worker heartbeat is stale.
 * Phase 2: re-queue to waiting (checkpoint resume in Phase 6).
 */
export async function recoverDeadWorkers(): Promise<number> {
  const db = await getDb();
  if (!db) return 0;

  const staleCutoff = new Date(Date.now() - HEARTBEAT_STALE_MS);

  const deadJobs = await db
    .select()
    .from(zipImportJobs)
    .where(
      and(
        inArray(zipImportJobs.status, ["scheduled", "processing"]),
        or(
          and(isNotNull(zipImportJobs.heartbeatAt), lt(zipImportJobs.heartbeatAt, staleCutoff)),
          and(
            isNull(zipImportJobs.heartbeatAt),
            isNotNull(zipImportJobs.lockedAt),
            lt(zipImportJobs.lockedAt, staleCutoff)
          ),
          and(
            isNull(zipImportJobs.heartbeatAt),
            isNull(zipImportJobs.lockedAt),
            lt(zipImportJobs.updatedAt, staleCutoff)
          )
        )
      )
    );

  for (const job of deadJobs) {
    const currentLogs: string[] = job.importLogs ? JSON.parse(job.importLogs) : [];
    currentLogs.push(
      `[${new Date().toISOString()}] [Recovery] Worker heartbeat stale (>${HEARTBEAT_STALE_MS / 1000}s), re-queued to waiting`
    );

    await db
      .update(zipImportJobs)
      .set({
        status: "waiting",
        workerId: null,
        lockedAt: null,
        heartbeatAt: null,
        importLogs: JSON.stringify(currentLogs),
        updatedAt: new Date(),
      })
      .where(eq(zipImportJobs.id, job.id));

    console.warn(
      `[ImportScheduler] Recovered dead worker job ${job.id} (was ${job.status}, worker=${job.workerId})`
    );
  }

  if (deadJobs.length > 0) {
    console.log(`[ImportScheduler] Recovered ${deadJobs.length} dead worker job(s)`);
  }

  return deadJobs.length;
}

export async function recoverDeadWorkersOnStartup(): Promise<void> {
  const count = await recoverDeadWorkers();
  if (count > 0) {
    console.log(`[ImportScheduler] Startup: recovered ${count} stale job(s)`);
  }
}

export async function dispatch(options: DispatchOptions = {}): Promise<DispatchResult> {
  const db = await getDb();
  if (!db) {
    return { started: [], skipped: [], reason: "no_db" };
  }

  const locked = await acquireSchedulerLock();
  if (!locked) {
    return {
      started: [],
      skipped: [],
      reason: "lock_busy",
      message: "Another scheduler instance is running",
    };
  }

  try {
    await recoverDeadWorkers();

    const diskOk = await checkDiskSpace();
    if (!diskOk) {
      return {
        started: [],
        skipped: [],
        reason: "disk_full",
        message: "Insufficient disk space for import temp",
      };
    }

    await restoreDiskSpaceWaitingJobs();

    const activeCount = await countActiveJobs();
    const slots = MAX_ACTIVE_JOBS - activeCount;
    if (slots <= 0) {
      return {
        started: [],
        skipped: [],
        reason: "max_active",
        message: `${activeCount}/${MAX_ACTIVE_JOBS} jobs active`,
      };
    }

    const batchSize = Math.min(options.batchSize ?? slots, slots);
    const started: number[] = [];
    const skipped: number[] = [];

    for (let i = 0; i < batchSize; i++) {
      const workerId = generateWorkerId();
      const job = await pickAndScheduleJob(workerId);
      if (!job) break;

      const ok = await startJob(job);
      if (ok) {
        started.push(job.id);
      } else {
        skipped.push(job.id);
      }
    }

    return {
      started,
      skipped,
      message: `Started ${started.length} job(s) via ${options.source || "scheduler"}`,
    };
  } catch (err) {
    console.error(`[ImportScheduler] dispatch error: ${(err as Error).message}`);
    return { started: [], skipped: [], reason: "error", message: (err as Error).message };
  } finally {
    await releaseSchedulerLock();
  }
}

export async function runSchedulerNow(options: DispatchOptions = {}): Promise<DispatchResult> {
  return dispatch({ ...options, manual: true, source: options.source || "admin" });
}
