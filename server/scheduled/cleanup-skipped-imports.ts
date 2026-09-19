/**
 * Cleanup imports/skipped/ archives older than retention (default 30 days).
 * Does NOT delete skipped ZIPs linked to incomplete Import Anyway flows.
 */

import { Request, Response } from "express";
import { requireCronAuth } from "../_core/cron-auth";
import { purgeOldSkippedArchives, purgeRedundantFailedArchives, purgeStaleStagingArchives } from "../import/wasabi-archive-purge";

export async function cleanupSkippedImportsHandler(req: Request, res: Response): Promise<void> {
  if (!(await requireCronAuth(req, res))) return;
  try {
    const skipped = await purgeOldSkippedArchives();
    const failed = await purgeRedundantFailedArchives();
    const staging = await purgeStaleStagingArchives();
    res.json({ ok: true, skipped, failed, staging, ts: new Date().toISOString() });
  } catch (err) {
    res.status(500).json({ ok: false, error: (err as Error).message });
  }
}
