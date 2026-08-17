import path from "path";
import { eq } from "drizzle-orm";
import { getDb } from "../../db";
import { zipImportJobs } from "../../../drizzle/schema";
import { touchJobHeartbeat } from "../../services/import-job-lock";
import { downloadFromWasabi } from "../wasabi-import-utils";
import { BasePipelineStep, type StepContext, type StepResult } from "../pipeline-step";

export class DownloadStep extends BasePipelineStep {
  readonly name = "downloading" as const;

  async run(ctx: StepContext): Promise<StepResult> {
    const db = await getDb();
    if (!db) throw new Error("DB not available");

    await db
      .update(zipImportJobs)
      .set({
        status: "processing",
        workerId: ctx.workerId,
        lockedAt: new Date(),
        heartbeatAt: new Date(),
        startedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(zipImportJobs.id, ctx.jobId));
    await touchJobHeartbeat(ctx.jobId);

    ctx.localArchivePath = path.join(ctx.tempDir, ctx.sourceArchiveOriginalName);
    await ctx.log(`Downloading archive from Wasabi: ${ctx.sourceArchiveKey}`);
    await downloadFromWasabi(ctx.sourceArchiveKey, ctx.localArchivePath);
    await ctx.log(`Archive downloaded`);

    return { outcome: "continue" };
  }
}
