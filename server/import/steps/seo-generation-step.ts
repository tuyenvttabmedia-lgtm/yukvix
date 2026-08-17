import { eq } from "drizzle-orm";
import { getDb } from "../../db";
import { albums } from "../../../drizzle/schema";
import { BasePipelineStep, type StepContext, type StepResult } from "../pipeline-step";
import { isCheckpointStepDone } from "../pipeline-checkpoint";
import { enrichAlbumSeoForJob } from "../seo-import";

/**
 * Phase 7 — Optional SEO enrichment after album creation.
 * BR: AI failure never fails the import job; always continues pipeline.
 */
export class SeoGenerationStep extends BasePipelineStep {
  readonly name = "generating_seo" as const;

  async run(ctx: StepContext): Promise<StepResult> {
    if (isCheckpointStepDone(ctx.checkpoint, this.name)) {
      return { outcome: "continue" };
    }

    if (!ctx.albumId) {
      await ctx.log("[SEO] No albumId — skipping optional enrichment");
      return { outcome: "continue" };
    }

    try {
      const db = await getDb();
      if (!db) {
        await ctx.log("[SEO] DB unavailable — skipping optional enrichment");
        return { outcome: "continue" };
      }

      const albumRow = await db
        .select({
          title: albums.title,
          creator: albums.creator,
          categoryId: albums.categoryId,
          originalFileName: albums.originalFileName,
        })
        .from(albums)
        .where(eq(albums.id, ctx.albumId))
        .limit(1);

      const album = albumRow[0];
      const filename =
        ctx.sourceArchiveOriginalName ||
        album?.originalFileName ||
        ctx.albumTitle ||
        "album";

      const imageCount = ctx.allProcessed?.length ?? 0;

      const result = await enrichAlbumSeoForJob(ctx.jobId, ctx.albumId, {
        originalFileName: filename,
        adminTitle: album?.title || ctx.albumTitle,
        creator: ctx.pendingAlbum?.creator || album?.creator || undefined,
        category: ctx.pendingAlbum?.category || undefined,
        imageCount,
      });

      const mode = result.metadata.usedFallback ? "fallback" : "AI";
      await ctx.log(
        `[SEO] Optional enrichment done (${mode}): focusKeyword=${result.seo.focusKeyword}, latency=${result.metrics.latencyMs}ms`
      );
    } catch (err) {
      await ctx.log(
        `[SEO] Optional step error (job continues): ${(err as Error).message}`
      );
    }

    return { outcome: "continue" };
  }

  async rollback(_ctx: StepContext): Promise<void> {
    // Optional step — no rollback of album SEO on resume
  }
}
