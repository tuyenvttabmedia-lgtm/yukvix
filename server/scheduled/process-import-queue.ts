/**
 * Scheduled endpoint: Process Import Queue
 * Delegates to ImportScheduler.dispatch() + structured scheduler logging.
 */

import { Request, Response } from "express";
import { eq } from "drizzle-orm";
import { getDb } from "../db";
import { adminSettings, zipImportJobs } from "../../drizzle/schema";
import {
  dispatch,
  getMaxActiveJobs,
  runScheduledBatchContinuation,
} from "../services/import-scheduler";
import { appendSchedulerRun } from "../services/scheduler-log";
import { normalizeScheduleConfig } from "../services/schedule-config";

const SCHEDULER_NAME = "zip-import";

async function countWaitingJobs(): Promise<number> {
  const db = await getDb();
  if (!db) return 0;
  const rows = await db
    .select({ id: zipImportJobs.id })
    .from(zipImportJobs)
    .where(eq(zipImportJobs.status, "waiting"));
  return rows.length;
}

async function saveBatchProgress(data: Record<string, unknown>): Promise<void> {
  try {
    const db = await getDb();
    if (!db) return;
    const value = JSON.stringify({ ...data, updatedAt: new Date().toISOString() });
    await db
      .insert(adminSettings)
      .values({ key: "import_batch_progress", value })
      .onDuplicateKeyUpdate({ set: { value, updatedAt: new Date() } });
  } catch {
    // non-fatal
  }
}

async function loadConfig() {
  try {
    const db = await getDb();
    if (!db) return normalizeScheduleConfig({ enabled: false }, { localHour: 17, batchSize: 10 });
    const rows = await db
      .select()
      .from(adminSettings)
      .where(eq(adminSettings.key, "import_schedule_config"))
      .limit(1);
    if (rows[0]?.value) {
      const parsed = JSON.parse(rows[0].value);
      return normalizeScheduleConfig(
        {
          enabled: parsed.enabled ?? false,
          cronHour: parsed.cronHour,
          localHour: parsed.localHour,
          batchSize: Math.min(parsed.batchSize ?? 10, 50),
          timezone: parsed.timezone,
        },
        { localHour: 17, batchSize: 10 }
      );
    }
  } catch {
    // defaults
  }
  return normalizeScheduleConfig({ enabled: false }, { localHour: 17, batchSize: 10 });
}

function startBatchContinuation(params: {
  targetBatch: number;
  initialStarted: number[];
  initialSkipped: number[];
  source: string;
  triggeredBy: "cron" | "manual";
  config: Awaited<ReturnType<typeof loadConfig>>;
}): void {
  if (params.targetBatch <= 1) return;
  if (params.initialStarted.length + params.initialSkipped.length >= params.targetBatch) return;

  void saveBatchProgress({
    targetBatch: params.targetBatch,
    startedCount: params.initialStarted.length,
    startedJobIds: params.initialStarted,
    status: "continuing",
  });

  runScheduledBatchContinuation({
    targetBatchSize: params.targetBatch,
    initialStarted: params.initialStarted,
    initialSkipped: params.initialSkipped,
    source: params.source,
  })
    .then(async (final) => {
      await saveBatchProgress({
        targetBatch: params.targetBatch,
        startedCount: final.started.length,
        startedJobIds: final.started,
        skippedJobIds: final.skipped,
        status: "complete",
      });
      await appendSchedulerRun({
        schedulerName: SCHEDULER_NAME,
        configuredHourUtc: params.config.cronHourUtc,
        configuredHourLocal: params.config.localHour,
        shouldRun: true,
        reason: `Sequential batch complete (${final.started.length}/${params.targetBatch})`,
        waitingJobs: await countWaitingJobs(),
        pickedJobs: final.started,
        durationMs: 0,
        result: `batch complete: ${final.started.length}/${params.targetBatch} job(s)`,
        triggeredBy: params.triggeredBy,
        manual: params.triggeredBy === "manual",
      });
    })
    .catch((err: Error) => {
      console.error(`[process-import-queue] Batch continuation error: ${err.message}`);
    });
}

export async function processImportQueueHandler(req: Request, res: Response): Promise<void> {
  const started = Date.now();
  const cronSecret = process.env.CRON_SECRET;
  const providedSecret = req.headers["x-cron-secret"];
  const isManualRun = req.headers["x-manual-run"] === "1";

  if (!cronSecret || providedSecret !== cronSecret) {
    res.status(403).json({ error: "Invalid or missing X-Cron-Secret header" });
    return;
  }

  const config = await loadConfig();
  const waitingJobs = await countWaitingJobs();
  const currentHour = new Date().getUTCHours();
  const targetBatch = config.batchSize ?? 1;
  const triggeredBy = isManualRun ? "manual" : "cron";

  let shouldRun = true;
  let reason = isManualRun ? "Manual run" : "Scheduled dispatch";

  if (!isManualRun && !config.enabled) {
    shouldRun = false;
    reason = "Import schedule is disabled";
  } else if (!isManualRun && currentHour !== config.cronHourUtc) {
    shouldRun = false;
    reason = `Not scheduled hour (UTC ${currentHour}, configured ${config.cronHourUtc} / local ${config.localHour}:00 ${config.timezone})`;
  }

  if (!shouldRun) {
    await appendSchedulerRun({
      schedulerName: SCHEDULER_NAME,
      configuredHourUtc: config.cronHourUtc,
      configuredHourLocal: config.localHour,
      shouldRun: false,
      reason,
      waitingJobs,
      pickedJobs: [],
      durationMs: Date.now() - started,
      result: "skipped",
      triggeredBy,
      manual: isManualRun,
    });
    res.json({
      skipped: true,
      reason,
      cronHour: config.cronHourUtc,
      localHour: config.localHour,
      timezone: config.timezone,
      currentHour,
    });
    return;
  }

  const maxActive = getMaxActiveJobs();
  const firstBatchSize = Math.min(targetBatch, maxActive);

  const result = await dispatch({
    manual: isManualRun,
    batchSize: firstBatchSize,
    source: isManualRun ? "cron-manual" : "cron",
  });

  const durationMs = Date.now() - started;

  if (result.reason === "no_db") {
    await appendSchedulerRun({
      schedulerName: SCHEDULER_NAME,
      configuredHourUtc: config.cronHourUtc,
      configuredHourLocal: config.localHour,
      shouldRun: true,
      reason: "Database unavailable",
      waitingJobs,
      pickedJobs: [],
      durationMs,
      result: "error",
      triggeredBy,
      manual: isManualRun,
    });
    res.status(500).json({ error: "Database unavailable" });
    return;
  }

  const needsContinuation =
    targetBatch > 1 &&
    result.started.length + result.skipped.length < targetBatch;

  const resultLabel = needsContinuation
    ? `started ${result.started.length}/${targetBatch} job(s), batch continuing`
    : result.started.length > 0
      ? `started ${result.started.length} job(s)`
      : result.reason || "no jobs started";

  await appendSchedulerRun({
    schedulerName: SCHEDULER_NAME,
    configuredHourUtc: config.cronHourUtc,
    configuredHourLocal: config.localHour,
    shouldRun: true,
    reason: result.message || resultLabel,
    waitingJobs,
    pickedJobs: result.started,
    durationMs,
    result: resultLabel,
    triggeredBy,
    manual: isManualRun,
  });

  if (needsContinuation) {
    startBatchContinuation({
      targetBatch,
      initialStarted: result.started,
      initialSkipped: result.skipped,
      source: isManualRun ? "cron-manual" : "cron",
      triggeredBy,
      config,
    });
  }

  res.json({
    processed: result.started.length,
    skipped: result.skipped.length,
    jobIds: result.started,
    batchSize: targetBatch,
    batchContinuing: needsContinuation,
    maxActiveJobs: maxActive,
    reason: result.reason,
    message: result.message || resultLabel,
  });
}
