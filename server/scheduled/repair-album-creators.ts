import type { Request, Response } from "express";
import { verifyCronSecret } from "./auto-bulk-seo";
import { repairUnlinkedAlbumCreators } from "../services/repair-album-creators";

/** One-shot: link ZIP-imported albums that have no creatorId. Auth: X-Cron-Secret. */
export async function repairAlbumCreatorsHandler(req: Request, res: Response) {
  const valid = await verifyCronSecret(req);
  if (!valid) {
    return res.status(403).json({ error: "Invalid or missing X-Cron-Secret header" });
  }
  try {
    const result = await repairUnlinkedAlbumCreators();
    return res.json({ ok: true, ...result, timestamp: new Date().toISOString() });
  } catch (err) {
    return res.status(500).json({
      error: err instanceof Error ? err.message : "Repair failed",
      timestamp: new Date().toISOString(),
    });
  }
}
