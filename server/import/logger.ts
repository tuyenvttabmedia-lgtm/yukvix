/**
 * Import Pipeline Logger — writes to DB import_logs table + console
 */
import { getDb } from "../db.js";
import { importLogs, importJobs } from "../../drizzle/schema.js";
import { eq } from "drizzle-orm";

type LogLevel = "info" | "warn" | "error" | "debug";

export async function logImport(jobId: number, level: LogLevel, message: string, data?: unknown): Promise<void> {
  console.log(`[Import:${jobId}] [${level.toUpperCase()}] ${message}`, data ? JSON.stringify(data) : "");
  try {
    const db = await getDb();
    if (!db) return;
    await db.insert(importLogs).values({
      jobId,
      level,
      message,
      data: data ? JSON.stringify(data) : null,
    });
  } catch {
    // Don't throw on logging errors
  }
}

export async function updateJobStatus(
  jobId: number,
  status: "queued" | "crawling" | "downloading" | "processing" | "seo" | "done" | "failed" | "cancelled",
  extra?: {
    totalPages?: number;
    crawledPages?: number;
    totalImages?: number;
    downloadedImages?: number;
    processedImages?: number;
    albumId?: number;
    errorMessage?: string;
    extractedTitle?: string;
    extractedCreator?: string;
    extractedTags?: string[];
    startedAt?: Date;
    completedAt?: Date;
  }
): Promise<void> {
  try {
    const db = await getDb();
    if (!db) return;

    const updateData: Record<string, unknown> = { status };
    if (extra?.totalPages !== undefined) updateData.totalPages = extra.totalPages;
    if (extra?.crawledPages !== undefined) updateData.crawledPages = extra.crawledPages;
    if (extra?.totalImages !== undefined) updateData.totalImages = extra.totalImages;
    if (extra?.downloadedImages !== undefined) updateData.downloadedImages = extra.downloadedImages;
    if (extra?.processedImages !== undefined) updateData.processedImages = extra.processedImages;
    if (extra?.albumId !== undefined) updateData.albumId = extra.albumId;
    if (extra?.errorMessage !== undefined) updateData.errorMessage = extra.errorMessage;
    if (extra?.extractedTitle !== undefined) updateData.extractedTitle = extra.extractedTitle;
    if (extra?.extractedCreator !== undefined) updateData.extractedCreator = extra.extractedCreator;
    if (extra?.extractedTags !== undefined) updateData.extractedTags = JSON.stringify(extra.extractedTags);
    if (extra?.startedAt !== undefined) updateData.startedAt = extra.startedAt;
    if (extra?.completedAt !== undefined) updateData.completedAt = extra.completedAt;

    await db.update(importJobs).set(updateData as any).where(eq(importJobs.id, jobId));
  } catch (err) {
    console.error(`[Import] Failed to update job ${jobId} status:`, err);
  }
}
