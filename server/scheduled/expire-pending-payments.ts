/**
 * Scheduled handler: auto-expire pending payment sessions older than 24 hours.
 * Triggered by cron via POST /api/scheduled/expire-pending-payments.
 * Auth: X-Cron-Secret must match CRON_SECRET or admin_settings cron.secret.
 */
import type { Request, Response } from "express";
import { getDb } from "../db";
import { subscriptions } from "../../drizzle/schema";
import { and, eq, sql } from "drizzle-orm";
import { requireCronAuth } from "../_core/cron-auth";

export async function expirePendingPaymentsHandler(req: Request, res: Response) {
  try {
    if (!(await requireCronAuth(req, res))) return;

    const db = await getDb();
    if (!db) {
      return res.status(500).json({ error: "DB unavailable", timestamp: new Date().toISOString() });
    }

    // Expire subscriptions that have been in "pending" status for more than 24 hours
    const cutoff = new Date(Date.now() - 24 * 3600 * 1000);

    const result = await db
      .update(subscriptions)
      .set({ status: "cancelled", updatedAt: new Date() })
      .where(
        and(
          eq(subscriptions.status, "pending"),
          sql`${subscriptions.createdAt} < ${cutoff}`
        )
      );

    const affected = (result as any)[0]?.affectedRows ?? (result as any).rowsAffected ?? 0;

    console.log(
      `[expire-pending-payments] Expired ${affected} pending subscription(s) older than 24h`
    );

    return res.json({
      ok: true,
      affected,
      cutoff: cutoff.toISOString(),
      timestamp: new Date().toISOString(),
    });
  } catch (err: any) {
    console.error("[expire-pending-payments] Error:", err);
    return res.status(500).json({
      error: err?.message ?? "Unknown error",
      stack: err?.stack,
      context: { url: req.url },
      timestamp: new Date().toISOString(),
    });
  }
}
