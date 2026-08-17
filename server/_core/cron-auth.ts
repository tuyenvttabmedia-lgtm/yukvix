import crypto from "crypto";
import type { Request, Response } from "express";
import { eq } from "drizzle-orm";
import { getDb } from "../db";
import { adminSettings } from "../../drizzle/schema";

function timingSafeEqualString(a: string, b: string): boolean {
  const ha = crypto.createHash("sha256").update(a).digest();
  const hb = crypto.createHash("sha256").update(b).digest();
  return crypto.timingSafeEqual(ha, hb);
}

export async function isValidCronSecret(req: Request): Promise<boolean> {
  const provided = String(req.headers["x-cron-secret"] ?? "").trim();
  if (!provided) return false;

  const envSecret = process.env.CRON_SECRET?.trim();
  if (envSecret && timingSafeEqualString(provided, envSecret)) return true;

  try {
    const db = await getDb();
    if (!db) return false;
    const rows = await db
      .select({ value: adminSettings.value })
      .from(adminSettings)
      .where(eq(adminSettings.key, "cron.secret"))
      .limit(1);
    const stored = rows[0]?.value?.trim();
    if (stored && timingSafeEqualString(provided, stored)) return true;
  } catch {
    // ignore
  }
  return false;
}

/** Returns true when authorized. Sends 403 and returns false otherwise. */
export async function requireCronAuth(req: Request, res: Response): Promise<boolean> {
  const ok = await isValidCronSecret(req);
  if (!ok) {
    res.status(403).json({ error: "Invalid or missing X-Cron-Secret header" });
    return false;
  }
  return true;
}
