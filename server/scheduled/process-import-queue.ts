/**
 * Scheduled endpoint: Process Import Queue
 * Phase 2: delegates to ImportScheduler.dispatch() (single entry point).
 */

import { Request, Response } from "express";
import { getDb } from "../db";
import { adminSettings } from "../../drizzle/schema";
import { eq } from "drizzle-orm";
import { dispatch } from "../services/import-scheduler";

interface ImportScheduleConfig {
  enabled: boolean;
  cronHour: number;
  batchSize: number;
}

async function getImportScheduleConfig(): Promise<ImportScheduleConfig> {
  try {
    const db = await getDb();
    if (!db) return { enabled: false, cronHour: 3, batchSize: 10 };
    const rows = await db
      .select()
      .from(adminSettings)
      .where(eq(adminSettings.key, "import_schedule_config"))
      .limit(1);
    if (rows[0]?.value) {
      const parsed = JSON.parse(rows[0].value);
      return {
        enabled: parsed.enabled ?? false,
        cronHour: parsed.cronHour ?? 3,
        batchSize: Math.min(parsed.batchSize ?? 10, 50),
      };
    }
  } catch {
    // use defaults
  }
  return { enabled: false, cronHour: 3, batchSize: 10 };
}

export async function processImportQueueHandler(req: Request, res: Response): Promise<void> {
  const cronSecret = process.env.CRON_SECRET;
  const providedSecret = req.headers["x-cron-secret"];
  const isManualRun = req.headers["x-manual-run"] === "1";

  if (!cronSecret || providedSecret !== cronSecret) {
    res.status(403).json({ error: "Invalid or missing X-Cron-Secret header" });
    return;
  }

  const config = await getImportScheduleConfig();

  if (!isManualRun && !config.enabled) {
    res.json({ skipped: true, reason: "Import schedule is disabled" });
    return;
  }

  const result = await dispatch({
    manual: isManualRun,
    batchSize: config.batchSize,
    source: isManualRun ? "cron-manual" : "cron",
  });

  if (result.reason === "no_db") {
    res.status(500).json({ error: "Database unavailable" });
    return;
  }

  res.json({
    processed: result.started.length,
    skipped: result.skipped.length,
    jobIds: result.started,
    batchSize: config.batchSize,
    reason: result.reason,
    message: result.message || `Started ${result.started.length} import job(s)`,
  });
}
