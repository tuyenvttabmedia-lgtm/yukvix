/**
 * Phase 8 — Scheduled metrics snapshot + notification sync.
 * POST /api/scheduled/import-metrics-snapshot
 */

import type { Request, Response } from "express";
import { persistMetricsSnapshot } from "../import/import-metrics";
import { syncNotificationsFromJobs } from "../import/notification-service";

export async function importMetricsSnapshotHandler(_req: Request, res: Response) {
  try {
    await persistMetricsSnapshot();
    let notificationsCreated = 0;
    try {
      notificationsCreated = await syncNotificationsFromJobs();
    } catch (syncErr) {
      console.warn(`[MetricsSnapshot] notification sync: ${(syncErr as Error).message}`);
    }
    res.json({
      ok: true,
      notificationsCreated,
      ts: new Date().toISOString(),
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: (err as Error).message });
  }
}
