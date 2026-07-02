/**
 * Import Cron Service (V4.17)
 * Scheduler for ZIP import jobs.
 *
 * Cron 1: Job Scheduler — picks up 'waiting' jobs and starts processing
 * Cron 2: Orphan Cleanup — marks 'uploaded' jobs as 'expired' after 24h
 * Cron 3: Stuck Recovery — resets 'processing' jobs stuck > 2h to 'waiting'
 */

import { getDb } from "../db";
import { zipImportJobs, albums } from "../../drizzle/schema";
import { eq, and, lt, inArray } from "drizzle-orm";
import { processImportJob } from "../workers/import-worker";
import { deleteFromStorage } from "../storage-wasabi";
import { execFile } from "child_process";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

const MAX_ACTIVE_JOBS = parseInt(process.env.IMPORT_MAX_ACTIVE_JOBS || "1");
const SCHEDULER_INTERVAL_MS =
  parseInt(process.env.IMPORT_PROCESS_INTERVAL_MINUTES || "1") * 60 * 1000;
const ORPHAN_CUTOFF_HOURS = 24;
const STUCK_CUTOFF_HOURS = 2;
// When IMPORT_SCHEDULED_ONLY=true, the auto-interval scheduler is disabled.
// Jobs only process when explicitly triggered via /api/scheduled/process-import-queue (Linux cron).
const SCHEDULED_ONLY = process.env.IMPORT_SCHEDULED_ONLY === "true";

let _schedulerRunning = false;
let _schedulerTimer: ReturnType<typeof setInterval> | null = null;

/**
 * Main scheduler: pick up 'waiting' jobs and start processing.
 * Only runs MAX_ACTIVE_JOBS at a time.
 */
async function runScheduler(): Promise<void> {
  if (_schedulerRunning) return; // Prevent concurrent runs
  _schedulerRunning = true;

  try {
    const db = await getDb();
    if (!db) return;

    // V4.17: Check disk space before processing
    // If free disk < IMPORT_LOCAL_DISK_MIN_FREE_GB, set waiting jobs to waiting_disk_space
    const minFreeGb = parseFloat(process.env.IMPORT_LOCAL_DISK_MIN_FREE_GB || "0");
    if (minFreeGb > 0) {
      const tempPath = process.env.IMPORT_TEMP_PATH || "/tmp";
      try {
        const { stdout } = await execFileAsync("df", ["-BG", "--output=avail", tempPath]);
        const lines = stdout.trim().split("\n");
        const availStr = lines[lines.length - 1].trim().replace("G", "");
        const availGb = parseFloat(availStr);
        if (!isNaN(availGb) && availGb < minFreeGb) {
          console.warn(
            `[ImportCron] Low disk space: ${availGb}GB available, ${minFreeGb}GB required. Setting waiting jobs to waiting_disk_space.`
          );
          await db
            .update(zipImportJobs)
            .set({ status: "waiting_disk_space", updatedAt: new Date() })
            .where(eq(zipImportJobs.status, "waiting"));
          return;
        }
      } catch (diskErr) {
        console.warn(`[ImportCron] Disk check failed (non-fatal): ${(diskErr as Error).message}`);
      }
    }

    // V4.17: Disk-space recovery — when disk is sufficient again, restore waiting_disk_space jobs to waiting
    // (We only reach here if disk check passed or minFreeGb=0)
    const diskRecoveryJobs = await db
      .select({ id: zipImportJobs.id })
      .from(zipImportJobs)
      .where(eq(zipImportJobs.status, "waiting_disk_space"));
    if (diskRecoveryJobs.length > 0) {
      await db
        .update(zipImportJobs)
        .set({ status: "waiting", updatedAt: new Date() })
        .where(eq(zipImportJobs.status, "waiting_disk_space"));
      console.log(
        `[ImportCron] Disk recovered — restored ${diskRecoveryJobs.length} job(s) from waiting_disk_space to waiting`
      );
    }

    // Count currently active jobs
    const activeJobs = await db
      .select({ id: zipImportJobs.id })
      .from(zipImportJobs)
      .where(inArray(zipImportJobs.status, ["scheduled", "processing"]));

    if (activeJobs.length >= MAX_ACTIVE_JOBS) {
      console.log(
        `[ImportCron] Scheduler: ${activeJobs.length}/${MAX_ACTIVE_JOBS} active jobs, skipping`
      );
      return;
    }

    // Pick the oldest 'waiting' job
    const waitingJobs = await db
      .select()
      .from(zipImportJobs)
      .where(eq(zipImportJobs.status, "waiting"))
      .orderBy(zipImportJobs.createdAt)
      .limit(MAX_ACTIVE_JOBS - activeJobs.length);

    if (waitingJobs.length === 0) return;

    for (const job of waitingJobs) {
      if (!job.albumId || !job.sourceArchiveKey) {
        console.warn(`[ImportCron] Job ${job.id} missing albumId or sourceArchiveKey, skipping`);
        continue;
      }

      // Mark as scheduled
      await db
        .update(zipImportJobs)
        .set({ status: "scheduled", scheduledAt: new Date(), updatedAt: new Date() })
        .where(eq(zipImportJobs.id, job.id));

      // Get album info
      const albumRow = await db
        .select({ slug: albums.slug, title: albums.title })
        .from(albums)
        .where(eq(albums.id, job.albumId))
        .limit(1);

      if (!albumRow[0]) {
        console.warn(`[ImportCron] Job ${job.id} album ${job.albumId} not found, skipping`);
        await db
          .update(zipImportJobs)
          .set({ status: "failed", updatedAt: new Date() })
          .where(eq(zipImportJobs.id, job.id));
        continue;
      }

      console.log(`[ImportCron] Starting job ${job.id} for album "${albumRow[0].title}"`);

      // Process job asynchronously (don't await — scheduler continues)
      processImportJob({
        jobId: job.id,
        albumId: job.albumId,
        albumSlug: albumRow[0].slug,
        albumTitle: albumRow[0].title,
        sourceArchiveKey: job.sourceArchiveKey,
        sourceArchiveOriginalName: job.sourceArchiveOriginalName || "archive.zip",
        archivePasswordIndex: job.archivePasswordIndex,
      }).catch((err: Error) => {
        console.error(`[ImportCron] Job ${job.id} failed: ${err.message}`);
      });
    }
  } catch (err) {
    console.error(`[ImportCron] Scheduler error: ${(err as Error).message}`);
  } finally {
    _schedulerRunning = false;
  }
}

/**
 * Cron 2: Orphan Cleanup
 * Problem: Admin uploads ZIP but closes browser before submitting SEO form.
 * Result: import_job stays in status='uploaded' forever, blocking queue slots.
 * Fix: Mark as 'expired' after 24h, delete Wasabi staging file.
 */
async function cleanupOrphanJobs(): Promise<void> {
  try {
    const db = await getDb();
    if (!db) return;

    const cutoff = new Date(Date.now() - ORPHAN_CUTOFF_HOURS * 60 * 60 * 1000);

    const orphans = await db
      .select()
      .from(zipImportJobs)
      .where(
        and(
          eq(zipImportJobs.status, "uploaded"),
          lt(zipImportJobs.createdAt, cutoff)
        )
      );

    for (const job of orphans) {
      // Delete Wasabi staging file
      if (job.sourceArchiveKey) {
        await deleteFromStorage(job.sourceArchiveKey).catch(() => {});
      }
      await db
        .update(zipImportJobs)
        .set({ status: "expired", updatedAt: new Date() })
        .where(eq(zipImportJobs.id, job.id));
      console.log(
        `[ImportCron] Expired orphan job ${job.id} (uploaded ${job.createdAt?.toISOString()})`
      );
    }

    if (orphans.length > 0) {
      console.log(`[ImportCron] Expired ${orphans.length} orphan jobs`);
    }
  } catch (err) {
    console.error(`[ImportCron] Orphan cleanup error: ${(err as Error).message}`);
  }
}

/**
 * Cron 3: Stuck Worker Recovery
 * Problem: VPS restart or PM2 crash while job is 'processing'.
 * Result: job stays in status='processing' forever.
 * Fix: If processing > 2h without update, reset to 'waiting' for retry.
 */
async function recoverStuckJobs(): Promise<void> {
  try {
    const db = await getDb();
    if (!db) return;

    const stuckCutoff = new Date(Date.now() - STUCK_CUTOFF_HOURS * 60 * 60 * 1000);

    const stuck = await db
      .select()
      .from(zipImportJobs)
      .where(
        and(
          inArray(zipImportJobs.status, ["processing", "scheduled"]),
          lt(zipImportJobs.updatedAt, stuckCutoff)
        )
      );

    for (const job of stuck) {
      // Reset to waiting so scheduler can retry
      const currentLogs: string[] = job.importLogs ? JSON.parse(job.importLogs) : [];
      currentLogs.push(
        `[${new Date().toISOString()}] [Recovery] Job was stuck in ${job.status} >2h, reset to waiting`
      );

      await db
        .update(zipImportJobs)
        .set({
          status: "waiting",
          importLogs: JSON.stringify(currentLogs),
          updatedAt: new Date(),
        })
        .where(eq(zipImportJobs.id, job.id));
      console.warn(
        `[ImportCron] Recovered stuck job ${job.id} (${job.status} since ${job.updatedAt?.toISOString()})`
      );
    }

    if (stuck.length > 0) {
      console.log(`[ImportCron] Recovered ${stuck.length} stuck jobs`);
    }
  } catch (err) {
    console.error(`[ImportCron] Stuck recovery error: ${(err as Error).message}`);
  }
}

/**
 * Start the import scheduler.
 * Call this once from server startup.
 */
export function startImportScheduler(): void {
  if (_schedulerTimer) return; // Already running

  if (SCHEDULED_ONLY) {
    console.log(
      `[ImportCron] Running in SCHEDULED_ONLY mode — auto-interval disabled. Jobs will only process via /api/scheduled/process-import-queue.`
    );
    // Still run orphan cleanup and stuck recovery on a timer
    cleanupOrphanJobs().catch(console.error);
    recoverStuckJobs().catch(console.error);
    setInterval(() => { cleanupOrphanJobs().catch(console.error); }, 10 * 60 * 1000);
    setInterval(() => { recoverStuckJobs().catch(console.error); }, 10 * 60 * 1000);
    // Use a dummy timer so the guard above works
    _schedulerTimer = setInterval(() => {}, 24 * 60 * 60 * 1000);
    return;
  }

  console.log(
    `[ImportCron] Starting scheduler (interval=${SCHEDULER_INTERVAL_MS / 1000}s, maxActive=${MAX_ACTIVE_JOBS})`
  );

  // Run immediately on startup
  runScheduler().catch(console.error);
  cleanupOrphanJobs().catch(console.error);
  recoverStuckJobs().catch(console.error);

  // Schedule recurring runs
  _schedulerTimer = setInterval(() => {
    runScheduler().catch(console.error);
  }, SCHEDULER_INTERVAL_MS);

  // Orphan cleanup every 10 minutes
  setInterval(() => {
    cleanupOrphanJobs().catch(console.error);
  }, 10 * 60 * 1000);

  // Stuck recovery every 10 minutes
  setInterval(() => {
    recoverStuckJobs().catch(console.error);
  }, 10 * 60 * 1000);
}

/**
 * Trigger the scheduler to run immediately (bypass interval).
 * Used by admin batch import to start processing right away.
 */
export async function runSchedulerNow(): Promise<void> {
  await runScheduler();
}

/**
 * Stop the import scheduler (for graceful shutdown).
 */
export function stopImportScheduler(): void {
  if (_schedulerTimer) {
    clearInterval(_schedulerTimer);
    _schedulerTimer = null;
    console.log("[ImportCron] Scheduler stopped");
  }
}
