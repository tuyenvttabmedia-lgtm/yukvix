/**
 * Scheduled handler: auto-expire pending payment sessions older than 24 hours.
 * Triggered by Heartbeat cron every hour via POST /api/scheduled/expire-pending-payments.
 * Auth: sdk.authenticateRequest verifies isCron === true.
 */
import type { Request, Response } from "express";
import { sdk } from "../_core/sdk";
import { getDb } from "../db";
import { subscriptions } from "../../drizzle/schema";
import { and, eq, sql } from "drizzle-orm";

export async function expirePendingPaymentsHandler(req: Request, res: Response) {
  try {
    // Authenticate — only cron callbacks are allowed
    const user = await sdk.authenticateRequest(req);
    if (!user.isCron) {
      return res.status(403).json({ error: "cron-only" });
    }

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
      `[expire-pending-payments] Expired ${affected} pending subscription(s) older than 24h (taskUid: ${user.taskUid})`
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
