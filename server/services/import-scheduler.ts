/**
 * Import Scheduler (Phase 2 + Phase 5 V2 pending album)
 * Single entry point for dispatching ZIP import jobs.
 */

import { execFile } from "child_process";
import { promisify } from "util";
import type { RowDataPacket } from "mysql2";
import { and, eq, inArray, isNotNull, isNull, lt, or } from "drizzle-orm";
import { getDb, getDbPool } from "../db";
import { albums, zipImportJobs } from "../../drizzle/schema";
import { processImportJob } from "../workers/import-worker";
import { prepareJobResume } from "../import/resume-import";
import type { ResumeReason } from "../import/pipeline-checkpoint";
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

const TERMINAL_STATUSES = new Set([
  "completed",
  "failed",
  "cancelled",
  "skipped",
  "expired",
]);

const BATCH_JOB_TIMEOUT_MS = parseInt(
  process.env.IMPORT_BATCH_JOB_TIMEOUT_MS || String(3 * 60 * 60 * 1000),
  10
);
const BATCH_POLL_MS = parseInt(process.env.IMPORT_BATCH_POLL_MS || "5000", 10);

export function getMaxActiveJobs(): number {
  return MAX_ACTIVE_JOBS;
}

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
  pendingAlbumData: string | null;
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
      `SELECT id, albumId, pendingAlbumData, sourceArchiveKey, sourceArchiveOriginalName, archivePasswordIndex, workerId
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
    if (!job.sourceArchiveKey) {
      await conn.rollback();
      return null;
    }
    if (!job.albumId && !job.pendingAlbumData) {
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

  let albumSlug: string;
  let albumTitle: string;
  const albumId: number | null = job.albumId;

  if (job.albumId) {
    const albumRow = await db
      .select({ slug: albums.slug, title: albums.title })
      .from(albums)
      .where(eq(albums.id, job.albumId))
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
    albumSlug = albumRow[0].slug;
    albumTitle = albumRow[0].title;
  } else if (job.pendingAlbumData) {
    try {
      const pending = JSON.parse(job.pendingAlbumData) as { slug: string; title: string };
      albumSlug = pending.slug;
      albumTitle = pending.title;
    } catch {
      await db
        .update(zipImportJobs)
        .set({ status: "failed", updatedAt: new Date() })
        .where(eq(zipImportJobs.id, job.id));
      return false;
    }
  } else {
    return false;
  }

  console.log(
    `[ImportScheduler] Starting job ${job.id} for album "${albumTitle}" (worker=${job.workerId}, v2=${!job.albumId})`
  );

  const { loadJobPipelineState } = await import("../import/pipeline-checkpoint");
  const { checkpoint } = await loadJobPipelineState(job.id);
  const resumeReason =
    checkpoint.completedSteps.length > 0
      ? (checkpoint.resumeReason ?? "heartbeat")
      : "initial";

  processImportJob({
    jobId: job.id,
    albumId,
    albumSlug,
    albumTitle,
    sourceArchiveKey: job.sourceArchiveKey!,
    sourceArchiveOriginalName: job.sourceArchiveOriginalName || "archive.zip",
    archivePasswordIndex: job.archivePasswordIndex,
    workerId: job.workerId || generateWorkerId(),
    resumeReason,
  }).catch((err: Error) => {
    console.error(`[ImportScheduler] Job ${job.id} failed: ${err.message}`);
  });

  return true;
}

export async function recoverDeadWorkers(
  resumeReason: ResumeReason = "heartbeat"
): Promise<number> {
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
      `[${new Date().toISOString()}] [Recovery] Worker heartbeat stale (>${HEARTBEAT_STALE_MS / 1000}s), resume scheduled (heartbeat)`
    );

    await db
      .update(zipImportJobs)
      .set({
        importLogs: JSON.stringify(currentLogs),
        updatedAt: new Date(),
      })
      .where(eq(zipImportJobs.id, job.id));

    await prepareJobResume(job.id, resumeReason, job.workerId);

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
  const count = await recoverDeadWorkers("restart");
  if (count > 0) {
    console.log(`[ImportScheduler] Startup: recovered ${count} stale job(s) (resumeReason=restart)`);
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
  const { isHttpOnlyProcess } = await import("../_core/worker-mode");
  if (isHttpOnlyProcess()) {
    console.log(
      "[ImportScheduler] HTTP process — skip ZIP dispatch; import worker will pick up waiting jobs"
    );
    return { started: [], skipped: [], reason: "http-worker-mode" };
  }
  return dispatch({ ...options, manual: true, source: options.source || "admin" });
}

async function getJobStatus(jobId: number): Promise<string | null> {
  const db = await getDb();
  if (!db) return null;
  const rows = await db
    .select({ status: zipImportJobs.status })
    .from(zipImportJobs)
    .where(eq(zipImportJobs.id, jobId))
    .limit(1);
  return rows[0]?.status ?? null;
}

/** Poll until job reaches a terminal status (completed/failed/cancelled/skipped/expired). */
export async function waitForJobTerminal(
  jobId: number,
  timeoutMs = BATCH_JOB_TIMEOUT_MS
): Promise<string> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const status = await getJobStatus(jobId);
    if (status && TERMINAL_STATUSES.has(status)) {
      return status;
    }
    await new Promise((r) => setTimeout(r, BATCH_POLL_MS));
  }
  console.warn(`[ImportScheduler] waitForJobTerminal timeout for job ${jobId}`);
  return "timeout";
}

export interface ScheduledBatchParams {
  targetBatchSize: number;
  initialStarted: number[];
  initialSkipped: number[];
  source: string;
}

/** Process up to targetBatchSize jobs sequentially when MAX_ACTIVE_JOBS limits concurrency. */
export async function runScheduledBatchContinuation(
  params: ScheduledBatchParams
): Promise<{ started: number[]; skipped: number[] }> {
  const started = [...params.initialStarted];
  const skipped = [...params.initialSkipped];
  const target = Math.max(1, params.targetBatchSize);

  console.log(
    `[ImportScheduler] Batch continuation: target=${target}, already started=${started.length}, skipped=${skipped.length}`
  );

  while (started.length + skipped.length < target) {
    if (started.length > 0) {
      const lastId = started[started.length - 1];
      const status = await getJobStatus(lastId);
      if (!status || !TERMINAL_STATUSES.has(status)) {
        const terminal = await waitForJobTerminal(lastId);
        console.log(`[ImportScheduler] Job ${lastId} terminal: ${terminal}`);
      }
    }

    const activeCount = await countActiveJobs();
    if (activeCount >= MAX_ACTIVE_JOBS && started.length > 0) {
      await waitForJobTerminal(started[started.length - 1]);
    }

    const result = await dispatch({
      batchSize: 1,
      source: `${params.source}-batch`,
    });

    if (result.started.length === 0 && result.skipped.length === 0) {
      console.log(
        `[ImportScheduler] Batch continuation stopped: ${result.reason || "no waiting jobs"}`
      );
      break;
    }

    started.push(...result.started);
    skipped.push(...result.skipped);
  }

  console.log(
    `[ImportScheduler] Batch finished: ${started.length}/${target} started, ${skipped.length} skipped`
  );
  return { started, skipped };
}
