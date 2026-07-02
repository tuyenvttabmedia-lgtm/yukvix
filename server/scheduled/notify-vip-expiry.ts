/**
 * Scheduled handler: send VIP expiry reminder emails to users whose VIP
 * subscription expires within the next 3 days (72 hours).
 *
 * Triggered by Heartbeat cron daily via POST /api/scheduled/notify-vip-expiry.
 * Auth: sdk.authenticateRequest verifies isCron === true.
 *
 * Deduplication: uses `vipExpiryNotifiedAt` column on subscriptions — if a
 * reminder was sent within the last 20 hours, the subscription is skipped.
 */
import type { Request, Response } from "express";
import { sdk } from "../_core/sdk";
import { getDb } from "../db";
import { subscriptions, users } from "../../drizzle/schema";
import { and, eq, sql, isNotNull } from "drizzle-orm";
import { sendVipExpiryReminderEmail } from "../email";

const DAYS_BEFORE_EXPIRY = 3;
const DEDUP_WINDOW_MS = 20 * 3600 * 1000; // 20 hours — prevents double-send on same day

export async function notifyVipExpiryHandler(req: Request, res: Response) {
  try {
    // Authenticate — only cron callbacks (or admin manual trigger) are allowed
    const user = await sdk.authenticateRequest(req);
    if (!user.isCron) {
      return res.status(403).json({ error: "cron-only" });
    }

    const db = await getDb();
    if (!db) {
      return res.status(500).json({ error: "DB unavailable", timestamp: new Date().toISOString() });
    }

    const now = new Date();
    const windowEnd = new Date(now.getTime() + DAYS_BEFORE_EXPIRY * 24 * 3600 * 1000);
    const dedupCutoff = now.getTime() - DEDUP_WINDOW_MS;

    // Find active subscriptions expiring within the next 3 days
    // that haven't been notified in the last 20 hours
    const expiringSubs = await db
      .select({
        subId: subscriptions.id,
        userId: subscriptions.userId,
        expiresAt: subscriptions.expiresAt,
        vipExpiryNotifiedAt: subscriptions.vipExpiryNotifiedAt,
        userName: users.name,
        userEmail: users.email,
      })
      .from(subscriptions)
      .leftJoin(users, eq(subscriptions.userId, users.id))
      .where(
        and(
          eq(subscriptions.status, "active"),
          sql`${subscriptions.expiresAt} > ${now}`,
          sql`${subscriptions.expiresAt} <= ${windowEnd}`,
          isNotNull(users.email),
          // Not notified recently: either never notified OR notified more than 20h ago
          sql`(${subscriptions.vipExpiryNotifiedAt} IS NULL OR ${subscriptions.vipExpiryNotifiedAt} < ${dedupCutoff})`
        )
      )
      .limit(200); // Safety cap — process at most 200 per run

    console.log(
      `[notify-vip-expiry] Found ${expiringSubs.length} subscription(s) to notify (taskUid: ${user.taskUid})`
    );

    let notified = 0;
    let skipped = 0;
    let errors = 0;

    // Determine the base URL for the renew link
    const baseUrl = process.env.VITE_APP_URL || "https://yukvix.manus.space";
    const renewUrl = `${baseUrl}/vip`;

    for (const sub of expiringSubs) {
      // Skip if email is missing
      if (!sub.userEmail) {
        skipped++;
        continue;
      }

      const expiresAt = sub.expiresAt!;
      const msLeft = expiresAt.getTime() - now.getTime();
      const daysLeft = Math.ceil(msLeft / (24 * 3600 * 1000));

      const result = await sendVipExpiryReminderEmail(
        sub.userEmail,
        sub.userName || "Member",
        expiresAt,
        daysLeft,
        renewUrl
      );

      if (result.success) {
        // Mark as notified
        await db
          .update(subscriptions)
          .set({ vipExpiryNotifiedAt: Date.now() })
          .where(eq(subscriptions.id, sub.subId));
        notified++;
        console.log(
          `[notify-vip-expiry] Sent reminder to ${sub.userEmail} (subId: ${sub.subId}, daysLeft: ${daysLeft})`
        );
      } else {
        errors++;
        console.error(
          `[notify-vip-expiry] Failed to send to ${sub.userEmail} (subId: ${sub.subId}): ${result.error}`
        );
      }
    }

    console.log(
      `[notify-vip-expiry] Done — notified: ${notified}, skipped: ${skipped}, errors: ${errors}`
    );

    return res.json({
      ok: true,
      notified,
      skipped,
      errors,
      total: expiringSubs.length,
      windowDays: DAYS_BEFORE_EXPIRY,
      timestamp: new Date().toISOString(),
    });
  } catch (err: any) {
    console.error("[notify-vip-expiry] Error:", err);
    return res.status(500).json({
      error: err?.message ?? "Unknown error",
      stack: err?.stack,
      context: { url: req.url },
      timestamp: new Date().toISOString(),
    });
  }
}
