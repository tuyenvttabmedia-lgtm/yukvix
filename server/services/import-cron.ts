/**
 * Import Cron Service (Phase 2)
 * Timers for scheduler dispatch, orphan cleanup, and dead worker recovery.
 * All dispatch goes through import-scheduler.ts (single entry point).
 */

import { getDb } from "../db";
import { zipImportJobs } from "../../drizzle/schema";
import { eq, and, lt } from "drizzle-orm";
import { deleteFromStorage } from "../storage-wasabi";
import {
  dispatch,
  recoverDeadWorkers,
  recoverDeadWorkersOnStartup,
  runSchedulerNow,
} from "./import-scheduler";
import { ensureDuplicatePolicySeeded } from "../import/duplicate-policy";

const SCHEDULER_INTERVAL_MS =
  parseInt(process.env.IMPORT_PROCESS_INTERVAL_MINUTES || "1", 10) * 60 * 1000;
const ORPHAN_CUTOFF_HOURS = 24;
const SCHEDULED_ONLY = process.env.IMPORT_SCHEDULED_ONLY === "true";
const HEARTBEAT_RECOVERY_INTERVAL_MS = parseInt(
  process.env.IMPORT_HEARTBEAT_RECOVERY_MS || "60000",
  10
);

let _schedulerTimer: ReturnType<typeof setInterval> | null = null;

async function cleanupOrphanJobs(): Promise<void> {
  try {
    const db = await getDb();
    if (!db) return;

    const cutoff = new Date(Date.now() - ORPHAN_CUTOFF_HOURS * 60 * 60 * 1000);

    const orphans = await db
      .select()
      .from(zipImportJobs)
      .where(and(eq(zipImportJobs.status, "uploaded"), lt(zipImportJobs.createdAt, cutoff)));

    for (const job of orphans) {
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

export function startImportScheduler(): void {
  if (_schedulerTimer) return;

  recoverDeadWorkersOnStartup().catch(console.error);
  ensureDuplicatePolicySeeded().catch(console.error);

  if (SCHEDULED_ONLY) {
    console.log(
      "[ImportCron] SCHEDULED_ONLY mode — dispatch via /api/scheduled/process-import-queue only"
    );
    cleanupOrphanJobs().catch(console.error);
    recoverDeadWorkers().catch(console.error);

    setInterval(() => {
      cleanupOrphanJobs().catch(console.error);
    }, 10 * 60 * 1000);

    setInterval(() => {
      recoverDeadWorkers().catch(console.error);
    }, HEARTBEAT_RECOVERY_INTERVAL_MS);

    _schedulerTimer = setInterval(() => {}, 24 * 60 * 60 * 1000);
    return;
  }

  const maxActive = process.env.IMPORT_MAX_ACTIVE_JOBS || "1";
  console.log(
    `[ImportCron] Starting interval scheduler (${SCHEDULER_INTERVAL_MS / 1000}s, maxActive=${maxActive})`
  );

  dispatch({ source: "startup" }).catch(console.error);
  cleanupOrphanJobs().catch(console.error);
  recoverDeadWorkers().catch(console.error);

  _schedulerTimer = setInterval(() => {
    dispatch({ source: "interval" }).catch(console.error);
  }, SCHEDULER_INTERVAL_MS);

  setInterval(() => {
    cleanupOrphanJobs().catch(console.error);
  }, 10 * 60 * 1000);

  setInterval(() => {
    recoverDeadWorkers().catch(console.error);
  }, HEARTBEAT_RECOVERY_INTERVAL_MS);
}

export { runSchedulerNow };

export function stopImportScheduler(): void {
  if (_schedulerTimer) {
    clearInterval(_schedulerTimer);
    _schedulerTimer = null;
    console.log("[ImportCron] Scheduler stopped");
  }
}

export { dispatch as dispatchImportQueue };
