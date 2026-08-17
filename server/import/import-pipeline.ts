/**
 * Phase 6 — Pipeline orchestrator with resume matrix, timeouts, safe failure handling.
 */

import fs from "fs/promises";
import path from "path";
import os from "os";
import { eq, sql } from "drizzle-orm";
import { getDb } from "../db";
import { zipImportJobs, albums } from "../../drizzle/schema";
import {
  startJobHeartbeat,
  clearJobWorkerLock,
  generateWorkerId,
} from "../services/import-job-lock";
import { moveWasabiObject } from "./wasabi-import-utils";
import type { PipelineStepName, StepContext, StepResult } from "./pipeline-step";
import { PIPELINE_STEP_ORDER } from "./pipeline-step";
import { DownloadStep } from "./steps/download-step";
import { ExtractStep } from "./steps/extract-step";
import { ValidateStep } from "./steps/validate-step";
import { DuplicateStep } from "./steps/duplicate-step";
import { ImageProcessStep } from "./steps/image-process-step";
import { AlbumCreationStep } from "./steps/album-creation-step";
import { SeoGenerationStep } from "./steps/seo-generation-step";
import { FinalizeStep } from "./steps/finalize-step";
import type { PipelineStep } from "./pipeline-step";
import {
  appendResumeHistory,
  getResumeStartStep,
  isCheckpointStepDone,
  loadJobPipelineState,
  markCheckpointStepDone,
  persistCheckpoint,
  persistStepMetrics,
  recordStepDuration,
  recordStepFailure,
  type ResumeReason,
} from "./pipeline-checkpoint";
import { getStepMatrix } from "./pipeline-resume-matrix";
import { runWithStepTimeout, StepTimeoutError } from "./step-timeout";
import { validateImages } from "../services/image-validator";
import { parseImportProfile, isZipImportV2Enabled } from "./import-profile";
import { parsePendingAlbumData } from "./pending-album";

export interface ImportJobData {
  jobId: number;
  albumId: number | null;
  albumSlug: string;
  albumTitle: string;
  sourceArchiveKey: string;
  sourceArchiveOriginalName: string;
  archivePasswordIndex: number;
  workerId?: string;
  resumeReason?: ResumeReason;
}

const STEPS: PipelineStep[] = [
  new DownloadStep(),
  new ExtractStep(),
  new ValidateStep(),
  new DuplicateStep(),
  new ImageProcessStep(),
  new AlbumCreationStep(),
  new SeoGenerationStep(),
  new FinalizeStep(),
];

async function buildContext(data: ImportJobData): Promise<StepContext> {
  const db = await getDb();
  if (!db) throw new Error("DB not available");

  const { jobId } = data;
  const tempBase = process.env.IMPORT_TEMP_PATH || path.join(os.tmpdir(), "zip-import");
  const tempDir = path.join(tempBase, `job-${jobId}-extract`);
  const processedDir = path.join(tempBase, `job-${jobId}-processed`);

  const row = await db
    .select({
      pipelineStep: zipImportJobs.pipelineStep,
      importProfile: zipImportJobs.importProfile,
      pendingAlbumData: zipImportJobs.pendingAlbumData,
      albumId: zipImportJobs.albumId,
    })
    .from(zipImportJobs)
    .where(eq(zipImportJobs.id, jobId))
    .limit(1);

  const importProfile = parseImportProfile(row[0]?.importProfile);
  const pendingAlbum = parsePendingAlbumData(row[0]?.pendingAlbumData);
  const isV2 = isZipImportV2Enabled(importProfile);
  const { checkpoint, stepMetrics } = await loadJobPipelineState(jobId);

  const log = async (msg: string) => {
    console.log(`[ImportWorker][Job ${jobId}] ${msg}`);
    try {
      const current = await db
        .select({ importLogs: zipImportJobs.importLogs })
        .from(zipImportJobs)
        .where(eq(zipImportJobs.id, jobId))
        .limit(1);
      const logs: string[] = current[0]?.importLogs ? JSON.parse(current[0].importLogs) : [];
      logs.push(`[${new Date().toISOString()}] ${msg}`);
      await db
        .update(zipImportJobs)
        .set({ importLogs: JSON.stringify(logs), updatedAt: new Date() })
        .where(eq(zipImportJobs.id, jobId));
    } catch {
      // Non-fatal
    }
  };

  const logFailed = async (filePath: string, reason: string) => {
    try {
      const current = await db
        .select({ failedImageList: zipImportJobs.failedImageList })
        .from(zipImportJobs)
        .where(eq(zipImportJobs.id, jobId))
        .limit(1);
      const list: Array<{ file: string; reason: string }> = current[0]?.failedImageList
        ? JSON.parse(current[0].failedImageList)
        : [];
      list.push({ file: path.basename(filePath), reason });
      await db
        .update(zipImportJobs)
        .set({
          failedImageList: JSON.stringify(list),
          failedImages: sql`${zipImportJobs.failedImages} + 1`,
          updatedAt: new Date(),
        })
        .where(eq(zipImportJobs.id, jobId));
    } catch {
      // Non-fatal
    }
  };

  const setPipelineStep = async (step: PipelineStepName) => {
    await db
      .update(zipImportJobs)
      .set({ pipelineStep: step, updatedAt: new Date() })
      .where(eq(zipImportJobs.id, jobId));
  };

  let ctxCheckpoint = checkpoint;
  let ctxMetrics = stepMetrics;
  const uploadedKeys = [...checkpoint.uploadedKeys];

  const ctx: StepContext = {
    jobId: data.jobId,
    albumId: data.albumId ?? row[0]?.albumId ?? checkpoint.albumId ?? null,
    albumSlug: data.albumSlug,
    albumTitle: data.albumTitle,
    sourceArchiveKey: data.sourceArchiveKey,
    sourceArchiveOriginalName: data.sourceArchiveOriginalName,
    workerId: data.workerId || generateWorkerId(),
    tempDir,
    processedDir,
    uploadedKeys,
    pipelineStep: (row[0]?.pipelineStep as PipelineStepName | null) ?? null,
    checkpoint: ctxCheckpoint,
    stepMetrics: ctxMetrics,
    importProfile,
    pendingAlbum,
    isV2,
    log,
    logFailed,
    setPipelineStep,
    reloadCheckpoint: async () => {
      const state = await loadJobPipelineState(jobId);
      ctxCheckpoint = state.checkpoint;
      ctxMetrics = state.stepMetrics;
      ctx.checkpoint = ctxCheckpoint;
      ctx.stepMetrics = ctxMetrics;
      ctx.uploadedKeys.length = 0;
      ctx.uploadedKeys.push(...ctxCheckpoint.uploadedKeys);
      if (ctxCheckpoint.albumId) ctx.albumId = ctxCheckpoint.albumId;
    },
    markStepComplete: async (step: PipelineStepName) => {
      markCheckpointStepDone(ctxCheckpoint, step);
      ctx.checkpoint = ctxCheckpoint;
      await persistCheckpoint(jobId, ctxCheckpoint);
    },
    saveCheckpoint: async () => {
      ctxCheckpoint.uploadedKeys = [...ctx.uploadedKeys];
      if (ctx.albumId) ctxCheckpoint.albumId = ctx.albumId;
      ctx.checkpoint = ctxCheckpoint;
      await persistCheckpoint(jobId, ctxCheckpoint);
    },
  };

  return ctx;
}

function stepsFromResumeStart(start: PipelineStepName | null): PipelineStep[] {
  if (!start) return STEPS;
  const idx = PIPELINE_STEP_ORDER.indexOf(start);
  if (idx <= 0) return STEPS;
  return STEPS.filter((s) => PIPELINE_STEP_ORDER.indexOf(s.name) >= idx);
}

/** Restore in-memory step context skipped by checkpoint resume (e.g. validImages after validating). */
async function hydrateResumeContext(ctx: StepContext): Promise<void> {
  if (!isCheckpointStepDone(ctx.checkpoint, "validating") || ctx.validImages) {
    return;
  }

  const { validImages } = await validateImages(ctx.tempDir);
  if (validImages.length === 0) {
    throw new Error("Cannot resume: no valid images found in extracted temp dir.");
  }

  ctx.validImages = validImages;
  await ctx.log(`[Resume] Restored ${validImages.length} validated image(s) from extract dir`);
}

async function tempExtractDirHasFiles(tempDir: string): Promise<boolean> {
  try {
    await fs.access(tempDir);
    const entries = await fs.readdir(tempDir);
    return entries.some((e) => !e.startsWith("."));
  } catch {
    return false;
  }
}

/**
 * When resuming mid-pipeline, ensure extract dir exists or rewind checkpoint to re-download.
 */
async function ensureResumeArtifacts(ctx: StepContext, resumeReason: ResumeReason): Promise<void> {
  if (resumeReason === "initial") return;

  const start = getResumeStartStep(ctx.checkpoint);
  if (!start) return;

  const startIdx = PIPELINE_STEP_ORDER.indexOf(start);
  const validateIdx = PIPELINE_STEP_ORDER.indexOf("validating");
  if (startIdx < validateIdx) return;

  if (await tempExtractDirHasFiles(ctx.tempDir)) {
    await hydrateResumeContext(ctx);
    return;
  }

  const downloadIdx = PIPELINE_STEP_ORDER.indexOf("downloading");
  ctx.checkpoint.completedSteps = ctx.checkpoint.completedSteps.filter(
    (s) => PIPELINE_STEP_ORDER.indexOf(s) < downloadIdx
  );
  ctx.checkpoint.failedStep = "downloading";
  await persistCheckpoint(ctx.jobId, ctx.checkpoint);
  await ctx.reloadCheckpoint();
  await ctx.log(
    "[Resume] Extract dir missing — rewinding checkpoint to re-download archive"
  );
}

export async function runImportPipeline(data: ImportJobData): Promise<void> {
  const ctx = await buildContext(data);
  const stopHeartbeat = startJobHeartbeat(data.jobId);

  const resumeReason: ResumeReason = data.resumeReason ?? ctx.checkpoint.resumeReason ?? "initial";

  if (resumeReason !== "initial") {
    await appendResumeHistory(data.jobId, {
      at: new Date().toISOString(),
      reason: resumeReason,
      fromStep: getResumeStartStep(ctx.checkpoint),
      failedStep: ctx.checkpoint.failedStep ?? null,
      workerId: data.workerId ?? null,
      message: "Pipeline run started",
    });
  }

  ctx.checkpoint.resumeReason = resumeReason;
  await persistCheckpoint(data.jobId, ctx.checkpoint);

  const stepsToRun = stepsFromResumeStart(getResumeStartStep(ctx.checkpoint));

  try {
    await fs.mkdir(ctx.tempDir, { recursive: true });

    if (stepsToRun.length < STEPS.length) {
      await ensureResumeArtifacts(ctx, resumeReason);
    }

    const effectiveSteps = stepsFromResumeStart(getResumeStartStep(ctx.checkpoint));

    for (const step of effectiveSteps) {
      await ctx.reloadCheckpoint();

      if (isCheckpointStepDone(ctx.checkpoint, step.name)) {
        await ctx.log(`[Step:${step.name}] skip — already completed (BR§7)`);
        continue;
      }

      const t0 = Date.now();
      await ctx.setPipelineStep(step.name);
      ctx.pipelineStep = step.name;

      let result: StepResult;
      try {
        result = await runWithStepTimeout(step.name, () => step.resume(ctx));
      } catch (err) {
        const isTimeout = err instanceof StepTimeoutError;
        const msg = (err as Error).message;
        const reason: ResumeReason = isTimeout ? "timeout" : resumeReason;

        await ctx.log(`[Step:${step.name}] failed: ${msg}`);

        const { requeue } = await recordStepFailure(
          data.jobId,
          ctx.checkpoint,
          step.name,
          msg
        );

        if (requeue) {
          await appendResumeHistory(data.jobId, {
            at: new Date().toISOString(),
            reason,
            fromStep: step.name,
            failedStep: step.name,
            workerId: data.workerId ?? null,
            message: `Re-queued after failure: ${msg}`,
          });
          await clearJobWorkerLock(data.jobId);
        } else {
          const db = await getDb();
          if (db && data.sourceArchiveKey?.startsWith("imports/staging/")) {
            const failedKey = data.sourceArchiveKey.replace("imports/staging/", "imports/failed/");
            await moveWasabiObject(data.sourceArchiveKey, failedKey).catch(() => {});
            await db
              .update(zipImportJobs)
              .set({ sourceArchiveKey: failedKey, updatedAt: new Date() })
              .where(eq(zipImportJobs.id, data.jobId));
          }
          await clearJobWorkerLock(data.jobId);
        }

        throw err;
      }

      const elapsed = Date.now() - t0;
      recordStepDuration(ctx.stepMetrics, step.name, elapsed);
      await persistStepMetrics(data.jobId, ctx.stepMetrics);
      await ctx.markStepComplete(step.name);
      await ctx.saveCheckpoint();

      await ctx.log(`[Step:${step.name}] completed in ${elapsed}ms`);

      if (result.outcome === "skip") {
        await fs.rm(ctx.tempDir, { recursive: true }).catch(() => {});
        await fs.rm(ctx.processedDir, { recursive: true }).catch(() => {});
        stopHeartbeat();
        return;
      }

      if (result.outcome === "complete") {
        stopHeartbeat();
        return;
      }
    }
  } catch (err) {
    // BR§7: do NOT delete uploadedKeys or rollback completed steps on resume failure
    await fs.rm(ctx.tempDir, { recursive: true }).catch(() => {});
    await fs.rm(ctx.processedDir, { recursive: true }).catch(() => {});

    console.error(`[ImportWorker][Job ${data.jobId}] FAILED: ${(err as Error).message}`);
    throw err;
  } finally {
    stopHeartbeat();
  }
}
