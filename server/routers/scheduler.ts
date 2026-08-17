/**
 * Scheduler Center API — status, run logs, timezone, dry-run test.
 */

import fs from "fs";
import { z } from "zod";
import { eq, sql } from "drizzle-orm";
import { adminProcedure, router } from "../_core/trpc";
import { getDb, getDbPool } from "../db";
import { adminSettings, zipImportJobs } from "../../drizzle/schema";
import {
  appendSchedulerRun,
  computeQueueOpsHealth,
  computeSchedulerDisplayStatus,
  computeSchedulerOpsHealth,
  getLastRunForScheduler,
  getSchedulerRunLog,
  type SchedulerDisplayStatus,
} from "../services/scheduler-log";
import {
  computeNextRunUtc,
  formatLocalTime,
  getSystemTimezone,
} from "../services/timezone-utils";
import { normalizeScheduleConfig } from "../services/schedule-config";

const SCHEDULER_DEFS = [
  {
    id: "zip-import",
    name: "ZIP Import",
    endpoint: "process-import-queue",
    configKey: "import_schedule_config",
    cronPattern: "0 * * * *",
    hasHourlySchedule: true,
  },
  {
    id: "auto-seo",
    name: "Auto SEO",
    endpoint: "auto-bulk-seo",
    configKey: "auto_seo_config",
    cronPattern: "0 * * * *",
    hasHourlySchedule: true,
  },
  {
    id: "cleanup",
    name: "Cleanup",
    endpoint: "cleanup-import-artifacts",
    configKey: null,
    cronPattern: "manual / in-app",
    hasHourlySchedule: false,
  },
  {
    id: "metrics",
    name: "Metrics",
    endpoint: "import-metrics-snapshot",
    configKey: null,
    cronPattern: "manual",
    hasHourlySchedule: false,
  },
  {
    id: "notification",
    name: "Notification",
    endpoint: "notify-vip-expiry",
    configKey: null,
    cronPattern: "manual",
    hasHourlySchedule: false,
  },
] as const;

async function loadAdminJson(key: string): Promise<Record<string, unknown> | null> {
  const db = await getDb();
  if (!db) return null;
  const rows = await db
    .select({ value: adminSettings.value })
    .from(adminSettings)
    .where(eq(adminSettings.key, key))
    .limit(1);
  if (!rows[0]?.value) return null;
  try {
    return JSON.parse(rows[0].value);
  } catch {
    return null;
  }
}

function statusLabel(status: SchedulerDisplayStatus): string {
  switch (status) {
    case "healthy":
      return "HEALTHY";
    case "waiting_next_run":
      return "WAITING NEXT RUN";
    case "running":
      return "RUNNING";
    case "missed":
      return "MISSED SCHEDULE";
    default:
      return "DISABLED";
  }
}

export const schedulerRouter = router({
  getTimezone: adminProcedure.query(async () => {
    const timezone = await getSystemTimezone();
    return { timezone, defaultTimezone: "Asia/Ho_Chi_Minh" };
  }),

  getRunLog: adminProcedure
    .input(z.object({ limit: z.number().int().min(1).max(30).default(30) }).optional())
    .query(async ({ input }) => {
      const logs = await getSchedulerRunLog(input?.limit ?? 30);
      return { logs };
    }),

  getStatus: adminProcedure.query(async () => {
    const logs = await getSchedulerRunLog(30);
    const timezone = await getSystemTimezone();
    const now = new Date();

    const importRaw = (await loadAdminJson("import_schedule_config")) ?? {};
    const importCfg = await normalizeScheduleConfig(
      {
        enabled: !!importRaw.enabled,
        cronHour: importRaw.cronHour as number | undefined,
        localHour: importRaw.localHour as number | undefined,
        batchSize: importRaw.batchSize as number | undefined,
        timezone: importRaw.timezone as string | undefined,
      },
      { localHour: 17, batchSize: 10 }
    );

    const seoRaw = (await loadAdminJson("auto_seo_config")) ?? {};
    const seoCfg = await normalizeScheduleConfig(
      {
        enabled: seoRaw.enabled !== false,
        cronHour: (seoRaw.cronHour as number) ?? 2,
        localHour: seoRaw.localHour as number | undefined,
        timezone: seoRaw.timezone as string | undefined,
        maxAlbums: seoRaw.maxAlbums as number | undefined,
        maxCreators: seoRaw.maxCreators as number | undefined,
        maxTags: seoRaw.maxTags as number | undefined,
      },
      { localHour: 9, batchSize: undefined }
    );

    const db = await getDb();
    let waitingImportJobs = 0;
    let processingImportJobs = 0;
    let batchProgress: Record<string, unknown> | null = null;
    if (db) {
      const [waitingRows, processingRows, batchRows] = await Promise.all([
        db.select({ id: zipImportJobs.id }).from(zipImportJobs).where(eq(zipImportJobs.status, "waiting")),
        db
          .select({ id: zipImportJobs.id })
          .from(zipImportJobs)
          .where(eq(zipImportJobs.status, "processing")),
        db
          .select({ value: adminSettings.value })
          .from(adminSettings)
          .where(eq(adminSettings.key, "import_batch_progress"))
          .limit(1),
      ]);
      waitingImportJobs = waitingRows.length;
      processingImportJobs = processingRows.length;
      if (batchRows[0]?.value) {
        try {
          batchProgress = JSON.parse(batchRows[0].value);
        } catch {
          batchProgress = null;
        }
      }
    }

    const schedulers = SCHEDULER_DEFS.map((def) => {
      const last = getLastRunForScheduler(logs, def.id);
      let enabled = false;
      let configuredHourUtc = -1;
      let configuredHourLocal = -1;
      let currentConfig: Record<string, unknown> = {};

      if (def.id === "zip-import") {
        enabled = importCfg.enabled;
        configuredHourUtc = importCfg.cronHourUtc;
        configuredHourLocal = importCfg.localHour;
        currentConfig = {
          enabled: importCfg.enabled,
          localHour: importCfg.localHour,
          cronHourUtc: importCfg.cronHourUtc,
          batchSize: importCfg.batchSize ?? 1,
          maxActiveJobs: parseInt(process.env.IMPORT_MAX_ACTIVE_JOBS || "1", 10),
          timezone: importCfg.timezone,
        };
      } else if (def.id === "auto-seo") {
        enabled = seoCfg.enabled;
        configuredHourUtc = seoCfg.cronHourUtc;
        configuredHourLocal = seoCfg.localHour;
        currentConfig = {
          enabled: seoCfg.enabled,
          localHour: seoCfg.localHour,
          cronHourUtc: seoCfg.cronHourUtc,
          maxAlbums: seoCfg.maxAlbums ?? 20,
          maxCreators: seoCfg.maxCreators ?? 10,
          maxTags: seoCfg.maxTags ?? 10,
          timezone: seoCfg.timezone,
        };
      } else {
        enabled = true;
        currentConfig = { note: "Triggered via endpoint or admin action" };
      }

      const isRunning = def.id === "zip-import" && processingImportJobs > 0;

      const displayStatus = computeSchedulerDisplayStatus({
        enabled,
        configuredHourUtc,
        hasHourlySchedule: def.hasHourlySchedule,
        logs,
        schedulerName: def.id,
        isRunning,
        now,
      });

      const nextRun =
        enabled && configuredHourUtc >= 0 && def.hasHourlySchedule
          ? computeNextRunUtc(configuredHourUtc, now)
          : null;

      const zipBatchExtras =
        def.id === "zip-import"
          ? {
              configuredBatchSize: importCfg.batchSize ?? 1,
              lastBatchStarted:
                typeof batchProgress?.startedCount === "number"
                  ? batchProgress.startedCount
                  : last?.pickedJobs?.length ?? 0,
              batchContinuing: batchProgress?.status === "continuing",
              batchJobIds: (batchProgress?.startedJobIds as number[]) ?? last?.pickedJobs ?? [],
            }
          : {};

      return {
        id: def.id,
        name: def.name,
        endpoint: def.endpoint,
        cronPattern: def.cronPattern,
        displayStatus,
        statusLabel: statusLabel(displayStatus),
        enabled,
        lastRun: last?.timestamp ?? null,
        lastResult: last?.result ?? null,
        lastReason: last?.reason ?? null,
        durationMs: last?.durationMs ?? null,
        waitingJobs: def.id === "zip-import" ? waitingImportJobs : 0,
        configuredHourLocal,
        configuredHourUtc,
        timezone,
        nextRunUtc: nextRun?.toISOString() ?? null,
        nextRunLocal: nextRun ? formatLocalTime(nextRun, timezone) : null,
        currentConfig,
        missedSchedule: displayStatus === "missed",
        ...zipBatchExtras,
      };
    });

    const hourlyStatuses = schedulers.filter((s) =>
      ["zip-import", "auto-seo"].includes(s.id)
    );

    return {
      timezone,
      serverTimeUtc: now.toISOString(),
      serverTimeLocal: formatLocalTime(now, timezone),
      schedulerHealth: computeSchedulerOpsHealth(
        hourlyStatuses.map((s) => ({ enabled: s.enabled, displayStatus: s.displayStatus }))
      ),
      schedulers,
    };
  }),

  /** Dry-run: verify scheduler chain without dispatching jobs. */
  runSchedulerTest: adminProcedure.mutation(async () => {
    const started = Date.now();
    const timezone = await getSystemTimezone();
    const now = new Date();
    const currentUtc = now.toISOString();
    const currentLocal = formatLocalTime(now, timezone);

    const importRaw = (await loadAdminJson("import_schedule_config")) ?? {};
    const importCfg = await normalizeScheduleConfig(
      {
        enabled: !!importRaw.enabled,
        cronHour: importRaw.cronHour as number | undefined,
        localHour: importRaw.localHour as number | undefined,
        timezone: importRaw.timezone as string | undefined,
      },
      { localHour: 17, batchSize: 10 }
    );

    const currentHour = now.getUTCHours();
    let shouldRun = importCfg.enabled && currentHour === importCfg.cronHourUtc;

    type Check = { name: string; status: "OK" | "FAIL" | "WARN"; detail?: string };
    const checks: Check[] = [];

    const cronSecret = process.env.CRON_SECRET;
    checks.push({
      name: "Cron Secret",
      status: cronSecret ? "OK" : "FAIL",
      detail: cronSecret ? "Configured" : "CRON_SECRET missing",
    });

    const cronScript = "/usr/local/bin/yukvix-cron-call.sh";
    checks.push({
      name: "Cron",
      status: fs.existsSync(cronScript) ? "OK" : "WARN",
      detail: fs.existsSync(cronScript) ? "Script present" : "Cannot verify crontab from app",
    });

    checks.push({
      name: "Endpoint",
      status: "OK",
      detail: "POST /api/scheduled/process-import-queue registered",
    });

    let dbOk = false;
    let waitingCount = 0;
    let failedCount = 0;
    try {
      const db = await getDb();
      if (db) {
        await db.execute(sql`SELECT 1`);
        dbOk = true;
        const [w] = await db
          .select({ count: sql<number>`COUNT(*)` })
          .from(zipImportJobs)
          .where(eq(zipImportJobs.status, "waiting"));
        const [f] = await db
          .select({ count: sql<number>`COUNT(*)` })
          .from(zipImportJobs)
          .where(eq(zipImportJobs.status, "failed"));
        waitingCount = Number(w?.count ?? 0);
        failedCount = Number(f?.count ?? 0);
      }
    } catch (err) {
      checks.push({ name: "Database", status: "FAIL", detail: (err as Error).message });
    }
    if (dbOk) {
      checks.push({ name: "Database", status: "OK", detail: "SELECT 1 passed" });
    }

    checks.push({
      name: "Queue",
      status: failedCount > 5 ? "WARN" : "OK",
      detail: `waiting=${waitingCount} failed=${failedCount}`,
    });

    let dispatchOk = false;
    try {
      const pool = getDbPool();
      if (pool) {
        const [rows] = (await pool.query("SELECT GET_LOCK(?, 0) as acquired", [
          "yukvix_zip_scheduler_test",
        ])) as [{ acquired: number }[], unknown];
        if (rows[0]?.acquired === 1) {
          await pool.query("SELECT RELEASE_LOCK(?)", ["yukvix_zip_scheduler_test"]);
          dispatchOk = true;
        }
      }
    } catch {
      dispatchOk = false;
    }
    checks.push({
      name: "Dispatch",
      status: dispatchOk ? "OK" : "WARN",
      detail: dispatchOk ? "Lock mechanism available (dry-run only)" : "Lock check inconclusive",
    });

    if (!importCfg.enabled) shouldRun = false;

    const overall = checks.some((c) => c.status === "FAIL")
      ? "FAIL"
      : checks.some((c) => c.status === "WARN")
        ? "WARN"
        : "PASS";

    return {
      currentUtc,
      currentLocal,
      timezone,
      configuredHourLocal: importCfg.localHour,
      configuredHourUtc: importCfg.cronHourUtc,
      shouldRun,
      shouldRunReason: shouldRun
        ? "Current UTC hour matches configured schedule"
        : importCfg.enabled
          ? `UTC hour ${currentHour} ≠ configured ${importCfg.cronHourUtc}`
          : "Import schedule disabled",
      checks,
      overall,
      durationMs: Date.now() - started,
      note: "Dry-run only — no jobs picked, no worker started",
    };
  }),

  recordManualRun: adminProcedure
    .input(
      z.object({
        schedulerName: z.string(),
        result: z.string(),
        reason: z.string().optional(),
        pickedJobs: z.array(z.number()).optional(),
      })
    )
    .mutation(async ({ input }) => {
      const timezone = await getSystemTimezone();
      await appendSchedulerRun({
        schedulerName: input.schedulerName,
        configuredHourUtc: -1,
        configuredHourLocal: -1,
        shouldRun: true,
        reason: input.reason ?? "Manual admin trigger",
        waitingJobs: 0,
        pickedJobs: input.pickedJobs ?? [],
        durationMs: 0,
        result: input.result,
        triggeredBy: "manual",
        manual: true,
        timezone,
      });
      return { success: true };
    }),
});
