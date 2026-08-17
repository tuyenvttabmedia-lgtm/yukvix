/**
 * ZIP Import Worker — Phase 4 orchestrator.
 * Delegates to stateless pipeline step classes; state persisted in DB only.
 */

import { runImportPipeline, type ImportJobData } from "../import/import-pipeline";

export type { ImportJobData };

export async function processImportJob(data: ImportJobData): Promise<void> {
  return runImportPipeline(data);
}
