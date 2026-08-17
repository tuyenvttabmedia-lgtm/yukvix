/**
 * Phase 8 — Scheduled import artifact cleanup.
 * POST /api/scheduled/cleanup-import-artifacts
 */

import type { Request, Response } from "express";
import { runFullCleanup } from "../import/cleanup-service";
import { requireCronAuth } from "../_core/cron-auth";

export async function cleanupImportArtifactsHandler(req: Request, res: Response) {
  if (!(await requireCronAuth(req, res))) return;
  try {
    const results = await runFullCleanup();
    res.json({ ok: true, results, ts: new Date().toISOString() });
  } catch (err) {
    res.status(500).json({ ok: false, error: (err as Error).message });
  }
}
