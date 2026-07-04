/**
 * Job worker lock + heartbeat (Phase 2)
 * DB is source of truth — no in-memory job state.
 */

import crypto from "crypto";
import os from "os";
import { eq } from "drizzle-orm";
import { getDb } from "../db";
import { zipImportJobs } from "../../drizzle/schema";

export const HEARTBEAT_INTERVAL_MS = parseInt(
  process.env.IMPORT_HEARTBEAT_INTERVAL_MS || "30000",
  10
);
export const HEARTBEAT_STALE_MS = parseInt(
  process.env.IMPORT_HEARTBEAT_STALE_MS || String(2 * 60 * 1000),
  10
);

export function generateWorkerId(): string {
  return `${os.hostname()}-${process.pid}-${crypto.randomBytes(4).toString("hex")}`;
}

export function isZipImportV2Enabled(): boolean {
  return process.env.ZIP_IMPORT_V2 === "true";
}

export async function touchJobHeartbeat(jobId: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db
    .update(zipImportJobs)
    .set({ heartbeatAt: new Date(), updatedAt: new Date() })
    .where(eq(zipImportJobs.id, jobId));
}

export async function clearJobWorkerLock(jobId: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db
    .update(zipImportJobs)
    .set({
      workerId: null,
      lockedAt: null,
      heartbeatAt: null,
      updatedAt: new Date(),
    })
    .where(eq(zipImportJobs.id, jobId));
}

export function startJobHeartbeat(jobId: number): () => void {
  const timer = setInterval(() => {
    touchJobHeartbeat(jobId).catch((err) => {
      console.warn(`[ImportWorker][Job ${jobId}] heartbeat failed: ${(err as Error).message}`);
    });
  }, HEARTBEAT_INTERVAL_MS);

  return () => clearInterval(timer);
}
