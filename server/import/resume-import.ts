/**
 * Phase 6 — Prepare job for resume (checkpoint + history).
 */

import { eq } from "drizzle-orm";
import { getDb } from "../db";
import { zipImportJobs } from "../../drizzle/schema";
import { clearJobWorkerLock } from "../services/import-job-lock";
import type { PipelineStepName } from "./pipeline-step";
import {
  appendResumeHistory,
  getResumeStartStep,
  loadJobPipelineState,
  persistCheckpoint,
  type ResumeReason,
} from "./pipeline-checkpoint";

export interface PrepareResumeResult {
  ok: boolean;
  error?: string;
  fromStep?: PipelineStepName | null;
}

export async function prepareJobResume(
  jobId: number,
  reason: ResumeReason,
  workerId?: string | null
): Promise<PrepareResumeResult> {
  const db = await getDb();
  if (!db) return { ok: false, error: "DB not available" };

  const rows = await db
    .select({
      status: zipImportJobs.status,
      pipelineStep: zipImportJobs.pipelineStep,
    })
    .from(zipImportJobs)
    .where(eq(zipImportJobs.id, jobId))
    .limit(1);

  const job = rows[0];
  if (!job) return { ok: false, error: "Job not found" };

  const allowed = ["failed", "waiting", "processing", "scheduled", "waiting_disk_space"];
  if (!allowed.includes(job.status)) {
    return { ok: false, error: `Cannot resume job in status: ${job.status}` };
  }

  const { checkpoint } = await loadJobPipelineState(jobId);
  const fromStep = getResumeStartStep(checkpoint) ?? (job.pipelineStep as PipelineStepName | null);

  checkpoint.resumeReason = reason;
  await persistCheckpoint(jobId, checkpoint);

  await appendResumeHistory(jobId, {
    at: new Date().toISOString(),
    reason,
    fromStep,
    failedStep: checkpoint.failedStep ?? null,
    workerId: workerId ?? null,
  });

  await db
    .update(zipImportJobs)
    .set({
      status: "waiting",
      workerId: null,
      lockedAt: null,
      heartbeatAt: null,
      updatedAt: new Date(),
    })
    .where(eq(zipImportJobs.id, jobId));

  await clearJobWorkerLock(jobId);

  return { ok: true, fromStep };
}
