import type { Request, Response } from "express";
import { eq, and, lt, isNull } from "drizzle-orm";
import { subscriptions, users } from "../../drizzle/schema.js";

export async function paymentReconciliationHandler(req: Request, res: Response) {
  const secret = req.headers["x-cron-secret"];
  if (secret !== process.env.CRON_SECRET) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  try {
    const { getDb } = await import("../db.js");
    const db = await getDb();
    if (!db) return res.status(503).json({ error: "DB unavailable" });

    const now = new Date();
    const expired = await db
      .update(subscriptions)
      .set({ status: "expired", updatedAt: now })
      .where(and(eq(subscriptions.status, "active"), lt(subscriptions.expiresAt, now)));

    const affectedSubs = (expired[0] as any)?.affectedRows ?? 0;

    const vipUsers = await db.select({ id: users.id }).from(users).where(eq(users.role, "vip"));
    let downgraded = 0;
    for (const u of vipUsers) {
      const active = await db
        .select({ id: subscriptions.id })
        .from(subscriptions)
        .where(and(eq(subscriptions.userId, u.id), eq(subscriptions.status, "active")))
        .limit(1);
      if (active.length === 0) {
        await db.update(users).set({ role: "user", updatedAt: now }).where(eq(users.id, u.id));
        downgraded++;
      }
    }

    console.log(`[payment-reconciliation] expired=${affectedSubs} downgraded=${downgraded}`);
    res.json({ ok: true, expiredSubscriptions: affectedSubs, downgradedVipUsers: downgraded });
  } catch (err) {
    console.error("[payment-reconciliation] Error:", err);
    res.status(500).json({ error: "Internal error" });
  }
}
