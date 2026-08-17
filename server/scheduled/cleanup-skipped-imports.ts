/**
 * Cleanup imports/skipped/ archives older than retention (default 30 days).
 * Does NOT delete skipped ZIPs linked to incomplete Import Anyway flows.
 */

import { Request, Response } from "express";
import { getDb } from "../db";
import { zipImportJobs } from "../../drizzle/schema";
import { and, eq, inArray, lt, sql } from "drizzle-orm";
import { deleteFromStorage } from "../storage-wasabi";
import { getPendingImportAnywayJobIds } from "../import/zip-dedup";
import { requireCronAuth } from "../_core/cron-auth";

const RETENTION_DAYS = parseInt(process.env.IMPORT_SKIPPED_RETENTION_DAYS || "30", 10);

export async function cleanupSkippedImportsHandler(req: Request, res: Response): Promise<void> {
  if (!(await requireCronAuth(req, res))) return;

  const db = await getDb();
  if (!db) {
    res.status(500).json({ error: "DB unavailable" });
    return;
  }

  const pendingAnywayIds = new Set(await getPendingImportAnywayJobIds());
  const cutoff = new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000);

  const oldSkipped = await db
    .select({
      id: zipImportJobs.id,
      key: zipImportJobs.sourceArchiveKey,
      duplicateOverrideAudit: zipImportJobs.duplicateOverrideAudit,
    })
    .from(zipImportJobs)
    .where(and(eq(zipImportJobs.status, "skipped"), lt(zipImportJobs.updatedAt, cutoff)))
    .limit(100);

  let deleted = 0;
  let skippedPendingAnyway = 0;

  for (const job of oldSkipped) {
    if (pendingAnywayIds.has(job.id)) {
      skippedPendingAnyway++;
      continue;
    }

    if (job.duplicateOverrideAudit) {
      skippedPendingAnyway++;
      continue;
    }

    const skippedPrefix = `imports/skipped/${job.id}/`;
    if (job.key?.startsWith(skippedPrefix)) {
      await deleteFromStorage(job.key).catch(() => {});
      deleted++;
    }
  }

  res.json({
    scanned: oldSkipped.length,
    deleted,
    skippedPendingAnyway,
    retentionDays: RETENTION_DAYS,
  });
}
