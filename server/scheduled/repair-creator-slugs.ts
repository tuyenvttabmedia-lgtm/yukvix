import type { Request, Response } from "express";
import { verifyCronSecret } from "./auto-bulk-seo";
import { repairPlaceholderCreatorSlugs } from "../services/creator-service";

/** One-shot: replace album-1 leftover Cosplayer slugs with Latinized names. Auth: X-Cron-Secret. */
export async function repairCreatorSlugsHandler(req: Request, res: Response) {
  const valid = await verifyCronSecret(req);
  if (!valid) {
    return res.status(403).json({ error: "Invalid or missing X-Cron-Secret header" });
  }
  try {
    const result = await repairPlaceholderCreatorSlugs();
    return res.json({ ok: true, ...result, timestamp: new Date().toISOString() });
  } catch (err) {
    return res.status(500).json({
      error: err instanceof Error ? err.message : "Repair failed",
      timestamp: new Date().toISOString(),
    });
  }
}
