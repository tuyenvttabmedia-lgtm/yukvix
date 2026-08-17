/**
 * Phase 6 — Run pipeline step with per-step timeout.
 */

import type { PipelineStepName } from "./pipeline-step";
import { getStepMatrix } from "./pipeline-resume-matrix";

export class StepTimeoutError extends Error {
  constructor(
    public readonly step: PipelineStepName,
    public readonly timeoutMs: number
  ) {
    super(`Step ${step} timed out after ${timeoutMs}ms`);
    this.name = "StepTimeoutError";
  }
}

export async function runWithStepTimeout<T>(
  step: PipelineStepName,
  fn: () => Promise<T>
): Promise<T> {
  const { timeoutMs } = getStepMatrix(step);
  let timer: ReturnType<typeof setTimeout> | undefined;

  const timeoutPromise = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new StepTimeoutError(step, timeoutMs)), timeoutMs);
  });

  try {
    return await Promise.race([fn(), timeoutPromise]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
