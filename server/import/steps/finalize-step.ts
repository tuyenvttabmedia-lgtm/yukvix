import fs from "fs/promises";
import { eq } from "drizzle-orm";
import { getDb } from "../../db";
import { zipImportJobs, albums } from "../../../drizzle/schema";
import { deleteFromStorage } from "../../storage-wasabi";
import { clearJobWorkerLock } from "../../services/import-job-lock";
import { copyObjectWithVerify, headObject } from "../wasabi-verify";
import { shouldAutoPublishAfterImport } from "../import-profile";
import { BasePipelineStep, type StepContext, type StepResult } from "../pipeline-step";

export class FinalizeStep extends BasePipelineStep {
  readonly name = "finalizing" as const;

  async run(ctx: StepContext): Promise<StepResult> {
    const db = await getDb();
    if (!db) throw new Error("DB not available");

    await fs.rm(ctx.tempDir, { recursive: true }).catch(() => {});
    await fs.rm(ctx.processedDir, { recursive: true }).catch(() => {});

    const completedJobRow = await db
      .select({ vipZipKey: zipImportJobs.vipZipKey, vipZipSize: zipImportJobs.vipZipSize })
      .from(zipImportJobs)
      .where(eq(zipImportJobs.id, ctx.jobId))
      .limit(1);

    let vipKey = completedJobRow[0]?.vipZipKey ?? ctx.checkpoint.vipZipKey ?? null;
    let vipSize = completedJobRow[0]?.vipZipSize ?? null;

    // Last-chance VIP copy before staging archive is deleted (UAT BUG-001).
    if (!vipKey && ctx.sourceArchiveKey) {
      try {
        const sourceHead = await headObject(ctx.sourceArchiveKey);
        vipKey = `vip-zips/${ctx.albumSlug}/VIP_${ctx.albumSlug}.zip`;
        const verified = await copyObjectWithVerify(
          ctx.sourceArchiveKey,
          vipKey,
          sourceHead.contentLength
        );
        vipSize = verified.contentLength;
        await db
          .update(zipImportJobs)
          .set({
            vipZipStatus: "ready",
            vipZipKey: vipKey,
            vipZipSize: vipSize,
            vipZipGeneratedAt: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(zipImportJobs.id, ctx.jobId));
        ctx.checkpoint.vipZipKey = vipKey;
        await ctx.log(`VIP ZIP finalized (last-chance copy): ${vipKey}`);
      } catch (err) {
        await ctx.log(`VIP ZIP finalize failed: ${(err as Error).message}`);
      }
    }

    const deleteSource = process.env.IMPORT_DELETE_SOURCE_AFTER_SUCCESS !== "false";
    if (deleteSource) {
      await deleteFromStorage(ctx.sourceArchiveKey).catch(() => {});
      await ctx.log("Source archive deleted from staging");
    }

    const processedCount = ctx.allProcessed?.length ?? 0;

    await db
      .update(zipImportJobs)
      .set({
        status: "completed",
        processedImages: processedCount,
        progress: 100,
        completedAt: new Date(),
        pipelineStep: "finalizing",
        updatedAt: new Date(),
      })
      .where(eq(zipImportJobs.id, ctx.jobId));

    if (!ctx.albumId) throw new Error("Album must exist before finalize");

    const albumRow = await db
      .select({ isVip: albums.isVip, photoCount: albums.photoCount })
      .from(albums)
      .where(eq(albums.id, ctx.albumId))
      .limit(1);

    const photoCount = albumRow[0]?.photoCount ?? processedCount;
    const isVipAlbum = albumRow[0]?.isVip === true;
    const autoPublish = shouldAutoPublishAfterImport(ctx.importProfile, {
      photoCount,
      vipZipReady: !!vipKey,
      isVipAlbum,
    });

    await db
      .update(albums)
      .set({
        publishStatus: autoPublish ? "published" : "ready_for_review",
        status: autoPublish ? "published" : "draft",
        ...(vipKey
          ? {
              zipKey: vipKey,
              // Private bucket: never persist a public zipUrl. Download uses signed zipKey.
              zipUrl: null,
              zipSize: vipSize,
              zipGeneratedAt: new Date(),
            }
          : {}),
        updatedAt: new Date(),
      })
      .where(eq(albums.id, ctx.albumId));

    if (autoPublish) {
      await ctx.log("Album auto-published (photos + VIP ZIP ready)");
    } else if (ctx.importProfile?.publish === "published") {
      await ctx.log(
        `[Publish] Auto-publish deferred — ${isVipAlbum && !vipKey ? "VIP ZIP missing" : "content not ready"}`
      );
    }

    if (isVipAlbum && !vipKey) {
      await ctx.log("[WARN] Album created without VIP ZIP download link");
    }

    await ctx.log(`Import completed: ${processedCount} photos processed`);
    await clearJobWorkerLock(ctx.jobId);

    return { outcome: "complete" };
  }
}
