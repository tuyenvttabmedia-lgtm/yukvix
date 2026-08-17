/**
 * Phase 6 — Checkpoint v2 + resume history.
 */

import { eq } from "drizzle-orm";
import { getDb } from "../db";
import { zipImportJobs } from "../../drizzle/schema";
import { getStepMatrix } from "./pipeline-resume-matrix";

/** Checkpoint schema version — backward compatibility in parseCheckpoint. */
export const CHECKPOINT_VERSION = 2;
export const LEGACY_CHECKPOINT_VERSION = 1;

export type ResumeReason = "heartbeat" | "restart" | "manual" | "timeout" | "initial";

export interface VerifiedUpload {
  etag: string | null;
  size: number;
}

export interface PipelineCheckpoint {
  checkpointVersion: number;
  /** @deprecated use checkpointVersion — kept for v1 reads */
  version?: number;
  completedSteps: PipelineStepName[];
  uploadedKeys: string[];
  verifiedUploads: Record<string, VerifiedUpload>;
  currentImageIndex: number;
  albumId?: number;
  vipZipKey?: string;
  resumeReason?: ResumeReason | null;
  failedStep?: PipelineStepName | null;
  stepRetryCounts: Partial<Record<PipelineStepName, number>>;
  lastError?: string | null;
  lastFailedAt?: string | null;
}

export interface ResumeHistoryEntry {
  at: string;
  reason: ResumeReason;
  fromStep: PipelineStepName | null;
  failedStep?: PipelineStepName | null;
  workerId?: string | null;
  message?: string;
}

export interface StepMetrics {
  downloadDuration?: number;
  extractDuration?: number;
  validateDuration?: number;
  duplicateDuration?: number;
  imageDuration?: number;
  albumDuration?: number;
  seoDuration?: number;
  finalizeDuration?: number;
}

export function emptyCheckpoint(resumeReason: ResumeReason = "initial"): PipelineCheckpoint {
  return {
    checkpointVersion: CHECKPOINT_VERSION,
    completedSteps: [],
    uploadedKeys: [],
    verifiedUploads: {},
    currentImageIndex: 0,
    resumeReason,
    failedStep: null,
    stepRetryCounts: {},
    lastError: null,
  };
}

function migrateCheckpoint(raw: Record<string, unknown>): PipelineCheckpoint {
  const ver = (raw.checkpointVersion ?? raw.version ?? LEGACY_CHECKPOINT_VERSION) as number;

  const base = emptyCheckpoint();
  if (ver === LEGACY_CHECKPOINT_VERSION) {
    return {
      ...base,
      checkpointVersion: CHECKPOINT_VERSION,
      completedSteps: (raw.completedSteps as PipelineStepName[]) ?? [],
      uploadedKeys: (raw.uploadedKeys as string[]) ?? [],
      verifiedUploads: (raw.verifiedUploads as Record<string, VerifiedUpload>) ?? {},
      currentImageIndex: (raw.currentImageIndex as number) ?? 0,
      albumId: raw.albumId as number | undefined,
      vipZipKey: raw.vipZipKey as string | undefined,
    };
  }

  return {
    ...base,
    ...raw,
    checkpointVersion: CHECKPOINT_VERSION,
    completedSteps: (raw.completedSteps as PipelineStepName[]) ?? [],
    uploadedKeys: (raw.uploadedKeys as string[]) ?? [],
    verifiedUploads: (raw.verifiedUploads as Record<string, VerifiedUpload>) ?? {},
    currentImageIndex: (raw.currentImageIndex as number) ?? 0,
    stepRetryCounts: (raw.stepRetryCounts as Partial<Record<PipelineStepName, number>>) ?? {},
    failedStep: (raw.failedStep as PipelineStepName | null) ?? null,
    resumeReason: (raw.resumeReason as ResumeReason | null) ?? null,
    lastError: (raw.lastError as string | null) ?? null,
  };
}

export function parseCheckpoint(raw: string | null | undefined): PipelineCheckpoint {
  if (!raw) return emptyCheckpoint();
  try {
    return migrateCheckpoint(JSON.parse(raw) as Record<string, unknown>);
  } catch {
    return emptyCheckpoint();
  }
}

export function parseStepMetrics(raw: string | null | undefined): StepMetrics {
  if (!raw) return {};
  try {
    return JSON.parse(raw) as StepMetrics;
  } catch {
    return {};
  }
}

export function parseResumeHistory(raw: string | null | undefined): ResumeHistoryEntry[] {
  if (!raw) return [];
  try {
    const arr = JSON.parse(raw) as ResumeHistoryEntry[];
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

export function isCheckpointStepDone(
  checkpoint: PipelineCheckpoint,
  step: PipelineStepName
): boolean {
  return checkpoint.completedSteps.includes(step);
}

export function getResumeStartStep(checkpoint: PipelineCheckpoint): PipelineStepName | null {
  if (checkpoint.failedStep) return checkpoint.failedStep;
  const order: PipelineStepName[] = [
    "downloading",
    "extracting",
    "validating",
    "duplicate_check",
    "processing_images",
    "creating_album",
    "generating_seo",
    "finalizing",
  ];
  for (const s of order) {
    if (!checkpoint.completedSteps.includes(s)) return s;
  }
  return null;
}

export async function loadJobPipelineState(jobId: number): Promise<{
  checkpoint: PipelineCheckpoint;
  stepMetrics: StepMetrics;
  resumeHistory: ResumeHistoryEntry[];
}> {
  const db = await getDb();
  if (!db) {
    return { checkpoint: emptyCheckpoint(), stepMetrics: {}, resumeHistory: [] };
  }

  const row = await db
    .select({
      checkpoint: zipImportJobs.checkpoint,
      stepMetrics: zipImportJobs.stepMetrics,
      resumeHistory: zipImportJobs.resumeHistory,
    })
    .from(zipImportJobs)
    .where(eq(zipImportJobs.id, jobId))
    .limit(1);

  return {
    checkpoint: parseCheckpoint(row[0]?.checkpoint),
    stepMetrics: parseStepMetrics(row[0]?.stepMetrics),
    resumeHistory: parseResumeHistory(row[0]?.resumeHistory),
  };
}

export async function persistCheckpoint(
  jobId: number,
  checkpoint: PipelineCheckpoint
): Promise<void> {
  const db = await getDb();
  if (!db) return;
  checkpoint.checkpointVersion = CHECKPOINT_VERSION;
  await db
    .update(zipImportJobs)
    .set({ checkpoint: JSON.stringify(checkpoint), updatedAt: new Date() })
    .where(eq(zipImportJobs.id, jobId));
}

export async function persistStepMetrics(
  jobId: number,
  stepMetrics: StepMetrics
): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db
    .update(zipImportJobs)
    .set({ stepMetrics: JSON.stringify(stepMetrics), updatedAt: new Date() })
    .where(eq(zipImportJobs.id, jobId));
}

export async function appendResumeHistory(
  jobId: number,
  entry: ResumeHistoryEntry
): Promise<void> {
  const db = await getDb();
  if (!db) return;

  const row = await db
    .select({ resumeHistory: zipImportJobs.resumeHistory })
    .from(zipImportJobs)
    .where(eq(zipImportJobs.id, jobId))
    .limit(1);

  const history = parseResumeHistory(row[0]?.resumeHistory);
  history.push(entry);

  await db
    .update(zipImportJobs)
    .set({ resumeHistory: JSON.stringify(history), updatedAt: new Date() })
    .where(eq(zipImportJobs.id, jobId));
}

export function markCheckpointStepDone(
  checkpoint: PipelineCheckpoint,
  step: PipelineStepName
): PipelineCheckpoint {
  if (!checkpoint.completedSteps.includes(step)) {
    checkpoint.completedSteps.push(step);
  }
  if (checkpoint.failedStep === step) {
    checkpoint.failedStep = null;
  }
  return checkpoint;
}

export function incrementStepRetry(
  checkpoint: PipelineCheckpoint,
  step: PipelineStepName
): number {
  const next = (checkpoint.stepRetryCounts[step] ?? 0) + 1;
  checkpoint.stepRetryCounts[step] = next;
  return next;
}

const STEP_METRIC_KEY: Partial<Record<PipelineStepName, keyof StepMetrics>> = {
  downloading: "downloadDuration",
  extracting: "extractDuration",
  validating: "validateDuration",
  duplicate_check: "duplicateDuration",
  processing_images: "imageDuration",
  creating_album: "albumDuration",
  generating_seo: "seoDuration",
  finalizing: "finalizeDuration",
};

export function recordStepDuration(
  metrics: StepMetrics,
  step: PipelineStepName,
  ms: number
): StepMetrics {
  const key = STEP_METRIC_KEY[step];
  if (key) metrics[key] = ms;
  return metrics;
}

export async function recordStepFailure(
  jobId: number,
  checkpoint: PipelineCheckpoint,
  step: PipelineStepName,
  error: string
): Promise<{ requeue: boolean }> {
  checkpoint.failedStep = step;
  checkpoint.lastError = error;
  checkpoint.lastFailedAt = new Date().toISOString();
  const attempt = incrementStepRetry(checkpoint, step);
  const requeue = attempt < getStepMatrix(step).retry.maxAttempts;
  await persistCheckpoint(jobId, checkpoint);

  const db = await getDb();
  if (!db) return;

  await db
    .update(zipImportJobs)
    .set({
      status: requeue ? "waiting" : "failed",
      updatedAt: new Date(),
    })
    .where(eq(zipImportJobs.id, jobId));

  return { requeue };
}
