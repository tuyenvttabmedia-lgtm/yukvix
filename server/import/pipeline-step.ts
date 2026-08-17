/**
 * Phase 4/5 — Pipeline step contract (stateless; state in DB + checkpoint).
 */

import type { ValidatedImage } from "../services/image-validator";
import type { ProcessedImage } from "./import-image-utils";
import type { ImportProfileSnapshot } from "./import-profile";
import type { PendingAlbumData } from "./pending-album";
import type { PipelineCheckpoint, StepMetrics } from "./pipeline-checkpoint";
import { isCheckpointStepDone } from "./pipeline-checkpoint";

export type PipelineStepName =
  | "downloading"
  | "extracting"
  | "validating"
  | "duplicate_check"
  | "processing_images"
  | "creating_album"
  | "generating_seo"
  | "finalizing";

export const PIPELINE_STEP_ORDER: PipelineStepName[] = [
  "downloading",
  "extracting",
  "validating",
  "duplicate_check",
  "processing_images",
  "creating_album",
  "generating_seo",
  "finalizing",
];

export type StepOutcome = "continue" | "skip" | "complete";

export interface StepResult {
  outcome: StepOutcome;
}

export interface StepContext {
  jobId: number;
  albumId: number | null;
  albumSlug: string;
  albumTitle: string;
  sourceArchiveKey: string;
  sourceArchiveOriginalName: string;
  workerId: string;
  tempDir: string;
  processedDir: string;
  uploadedKeys: string[];
  pipelineStep: PipelineStepName | null;
  checkpoint: PipelineCheckpoint;
  stepMetrics: StepMetrics;
  importProfile: ImportProfileSnapshot | null;
  pendingAlbum: PendingAlbumData | null;
  isV2: boolean;
  localArchivePath?: string;
  validImages?: ValidatedImage[];
  archiveSha256?: string;
  allProcessed?: ProcessedImage[];
  log: (msg: string) => Promise<void>;
  logFailed: (filePath: string, reason: string) => Promise<void>;
  setPipelineStep: (step: PipelineStepName) => Promise<void>;
  reloadCheckpoint: () => Promise<void>;
  markStepComplete: (step: PipelineStepName) => Promise<void>;
  saveCheckpoint: () => Promise<void>;
}

export interface PipelineStep {
  readonly name: PipelineStepName;
  run(ctx: StepContext): Promise<StepResult>;
  rollback(ctx: StepContext): Promise<void>;
  resume(ctx: StepContext): Promise<StepResult>;
}

export function stepIndex(name: PipelineStepName): number {
  return PIPELINE_STEP_ORDER.indexOf(name);
}

export function isStepCompleted(name: PipelineStepName, current: PipelineStepName | null): boolean {
  if (!current) return false;
  return stepIndex(name) < stepIndex(current);
}

export abstract class BasePipelineStep implements PipelineStep {
  abstract readonly name: PipelineStepName;

  abstract run(ctx: StepContext): Promise<StepResult>;

  async rollback(_ctx: StepContext): Promise<void> {
    // Default: no side effects to undo
  }

  async resume(ctx: StepContext): Promise<StepResult> {
    await ctx.reloadCheckpoint();
    if (isCheckpointStepDone(ctx.checkpoint, this.name)) {
      await ctx.log(`[Step:${this.name}] idempotent skip (checkpoint)`);
      return { outcome: "continue" };
    }
    if (isStepCompleted(this.name, ctx.pipelineStep)) {
      return { outcome: "continue" };
    }
    return this.run(ctx);
  }
}
