import { eq } from "drizzle-orm";
import { getDb } from "../../db";
import { zipImportJobs } from "../../../drizzle/schema";
import {
  computeFileSha256,
  runDuplicateDetection,
  applyDuplicateSkip,
} from "../zip-dedup";
import { BasePipelineStep, type StepContext, type StepResult } from "../pipeline-step";

export class DuplicateStep extends BasePipelineStep {
  readonly name = "duplicate_check" as const;

  async run(ctx: StepContext): Promise<StepResult> {
    if (!ctx.localArchivePath || !ctx.validImages) {
      throw new Error("Validate step must run before duplicate check");
    }

    const db = await getDb();
    if (!db) throw new Error("DB not available");

    const archiveSha256 = await computeFileSha256(ctx.localArchivePath);
    ctx.archiveSha256 = archiveSha256;

    await db
      .update(zipImportJobs)
      .set({ sourceArchiveSha256: archiveSha256, updatedAt: new Date() })
      .where(eq(zipImportJobs.id, ctx.jobId));

    const dupJobRow = await db
      .select({
        duplicateOverride: zipImportJobs.duplicateOverride,
        sourceArchiveSize: zipImportJobs.sourceArchiveSize,
        duplicateInfo: zipImportJobs.duplicateInfo,
      })
      .from(zipImportJobs)
      .where(eq(zipImportJobs.id, ctx.jobId))
      .limit(1);

    if (dupJobRow[0]?.duplicateInfo) {
      await ctx.log("[Duplicate] duplicateInfo immutable — skipping re-detection");
      return { outcome: "continue" };
    }

    const dupResult = await runDuplicateDetection({
      jobId: ctx.jobId,
      albumId: ctx.albumId ?? 0,
      albumTitle: ctx.albumTitle,
      albumSlug: ctx.albumSlug,
      sourceArchiveKey: ctx.sourceArchiveKey,
      sourceArchiveOriginalName: ctx.sourceArchiveOriginalName,
      sourceArchiveSize: dupJobRow[0]?.sourceArchiveSize ?? 0,
      sha256: archiveSha256,
      duplicateOverride: dupJobRow[0]?.duplicateOverride ?? false,
      imagePaths: ctx.validImages.map((v) => v.path),
    });

    if (dupResult.shouldSkip && dupResult.duplicateInfo) {
      await ctx.log(
        `Duplicate: ${dupResult.duplicateInfo.primaryDuplicate.duplicateType} (${Math.round(dupResult.duplicateInfo.primaryDuplicate.confidence * 100)}%)`
      );
      await applyDuplicateSkip(
        ctx.jobId,
        dupResult.duplicateInfo,
        ctx.sourceArchiveKey,
        ctx.sourceArchiveOriginalName
      );
      return { outcome: "skip" };
    }

    await db
      .update(zipImportJobs)
      .set({ totalImages: ctx.validImages.length, updatedAt: new Date() })
      .where(eq(zipImportJobs.id, ctx.jobId));

    return { outcome: "continue" };
  }
}
