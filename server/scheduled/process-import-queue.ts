/**
 * Scheduled endpoint: Process Import Queue
 * Called by Linux cron job on VPS at configured hour.
 * Reads config from admin_settings: import_schedule_enabled, import_schedule_hour, import_batch_size.
 * Processes up to import_batch_size waiting jobs.
 *
 * Auth: X-Cron-Secret header (CRON_SECRET env var)
 */

import { Request, Response } from "express";
import { getDb } from "../db";
import { adminSettings, zipImportJobs, albums } from "../../drizzle/schema";
import { eq, inArray } from "drizzle-orm";
import { processImportJob } from "../workers/import-worker";

interface ImportScheduleConfig {
  enabled: boolean;
  cronHour: number; // 0-23 UTC
  batchSize: number; // albums per run
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
  } catch (_) {}
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

  // If not manual run, check if schedule is enabled
  if (!isManualRun && !config.enabled) {
    res.json({ skipped: true, reason: "Import schedule is disabled" });
    return;
  }

  const db = await getDb();
  if (!db) {
    res.status(500).json({ error: "Database unavailable" });
    return;
  }

  // Find waiting jobs, limit by batchSize
  const waitingJobs = await db
    .select()
    .from(zipImportJobs)
    .where(eq(zipImportJobs.status, "waiting"))
    .orderBy(zipImportJobs.createdAt)
    .limit(config.batchSize);

  if (waitingJobs.length === 0) {
    res.json({ processed: 0, message: "No waiting jobs in queue" });
    return;
  }

  const started: number[] = [];
  const skipped: number[] = [];

  for (const job of waitingJobs) {
    if (!job.albumId || !job.sourceArchiveKey) {
      skipped.push(job.id);
      continue;
    }

    // Mark as scheduled
    await db
      .update(zipImportJobs)
      .set({ status: "scheduled", scheduledAt: new Date(), updatedAt: new Date() })
      .where(eq(zipImportJobs.id, job.id));

    const albumRow = await db
      .select({ slug: albums.slug, title: albums.title })
      .from(albums)
      .where(eq(albums.id, job.albumId))
      .limit(1);

    if (!albumRow[0]) {
      await db
        .update(zipImportJobs)
        .set({ status: "failed", updatedAt: new Date() })
        .where(eq(zipImportJobs.id, job.id));
      skipped.push(job.id);
      continue;
    }

    console.log(`[ProcessImportQueue] Starting job ${job.id} for album "${albumRow[0].title}"`);

    // Process asynchronously
    processImportJob({
      jobId: job.id,
      albumId: job.albumId,
      albumSlug: albumRow[0].slug,
      albumTitle: albumRow[0].title,
      sourceArchiveKey: job.sourceArchiveKey,
      sourceArchiveOriginalName: job.sourceArchiveOriginalName || "archive.zip",
      archivePasswordIndex: job.archivePasswordIndex,
    }).catch((err: Error) => {
      console.error(`[ProcessImportQueue] Job ${job.id} failed: ${err.message}`);
    });

    started.push(job.id);
  }

  res.json({
    processed: started.length,
    skipped: skipped.length,
    jobIds: started,
    batchSize: config.batchSize,
    message: `Started ${started.length} import job(s)`,
  });
}
