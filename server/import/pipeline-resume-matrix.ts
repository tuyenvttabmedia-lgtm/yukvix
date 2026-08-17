/**
 * Phase 6 — Resume / Retry / Rollback matrix per pipeline step.
 */

import type { PipelineStepName } from "./pipeline-step";

export type ResumeStrategy =
  | "skip_if_done" // skip when in completedSteps — never re-run (BR §7)
  | "continue_index" // processing_images: resume from currentImageIndex
  | "skip_never"; // duplicate_check after done

export type RollbackStrategy =
  | "none" // no rollback (downloading, duplicate)
  | "none_on_resume" // never rollback completed steps on resume
  | "temp_only" // extract/validate — local temp only
  | "failed_step_uploads"; // only keys added in failed attempt

export interface RetryStrategy {
  maxAttempts: number;
}

export interface StepMatrixEntry {
  resume: ResumeStrategy;
  retry: RetryStrategy;
  rollback: RollbackStrategy;
  /** Step timeout in milliseconds */
  timeoutMs: number;
}

const DEFAULT_TIMEOUT_MS = 30 * 60 * 1000;

function timeoutFromEnv(key: string, fallbackMs: number): number {
  const v = parseInt(process.env[key] || "", 10);
  return Number.isFinite(v) && v > 0 ? v : fallbackMs;
}

export const STEP_RESUME_MATRIX: Record<PipelineStepName, StepMatrixEntry> = {
  downloading: {
    resume: "skip_if_done",
    retry: { maxAttempts: 3 },
    rollback: "none",
    timeoutMs: timeoutFromEnv("IMPORT_STEP_TIMEOUT_DOWNLOAD_MS", 20 * 60 * 1000),
  },
  extracting: {
    resume: "skip_if_done",
    retry: { maxAttempts: 2 },
    rollback: "temp_only",
    timeoutMs: timeoutFromEnv("IMPORT_STEP_TIMEOUT_EXTRACT_MS", 45 * 60 * 1000),
  },
  validating: {
    resume: "skip_if_done",
    retry: { maxAttempts: 2 },
    rollback: "temp_only",
    timeoutMs: timeoutFromEnv("IMPORT_STEP_TIMEOUT_VALIDATE_MS", 15 * 60 * 1000),
  },
  duplicate_check: {
    resume: "skip_if_done",
    retry: { maxAttempts: 1 },
    rollback: "none",
    timeoutMs: timeoutFromEnv("IMPORT_STEP_TIMEOUT_DUPLICATE_MS", 10 * 60 * 1000),
  },
  processing_images: {
    resume: "continue_index",
    retry: { maxAttempts: 3 },
    rollback: "none_on_resume",
    timeoutMs: timeoutFromEnv("IMPORT_STEP_TIMEOUT_IMAGES_MS", DEFAULT_TIMEOUT_MS),
  },
  creating_album: {
    resume: "skip_if_done",
    retry: { maxAttempts: 2 },
    rollback: "none_on_resume",
    timeoutMs: timeoutFromEnv("IMPORT_STEP_TIMEOUT_ALBUM_MS", 10 * 60 * 1000),
  },
  generating_seo: {
    resume: "skip_if_done",
    retry: { maxAttempts: 3 },
    rollback: "none",
    timeoutMs: timeoutFromEnv("IMPORT_STEP_TIMEOUT_SEO_MS", 5 * 60 * 1000),
  },
  finalizing: {
    resume: "skip_if_done",
    retry: { maxAttempts: 2 },
    rollback: "none",
    timeoutMs: timeoutFromEnv("IMPORT_STEP_TIMEOUT_FINALIZE_MS", 5 * 60 * 1000),
  },
};

export function getStepMatrix(step: PipelineStepName): StepMatrixEntry {
  return STEP_RESUME_MATRIX[step];
}

export function canRetryStep(
  step: PipelineStepName,
  stepRetryCounts: Partial<Record<PipelineStepName, number>>
): boolean {
  const matrix = getStepMatrix(step);
  const count = stepRetryCounts[step] ?? 0;
  return count < matrix.retry.maxAttempts;
}
