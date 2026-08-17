import fs from "fs/promises";
import path from "path";
import { eq } from "drizzle-orm";
import { getDb } from "../../db";
import { zipImportJobs } from "../../../drizzle/schema";
import { ensureProcessedDirs, processBatch } from "../import-image-utils";
import { generateVipZip } from "../wasabi-import-utils";
import { uploadBufferVerified, copyObjectWithVerify, headObject } from "../wasabi-verify";
import { deleteFromStorage } from "../../storage-wasabi";
import { BasePipelineStep, type StepContext, type StepResult } from "../pipeline-step";
import { isCheckpointStepDone } from "../pipeline-checkpoint";

const CONCURRENCY = parseInt(process.env.IMPORT_CONCURRENCY || "2");
const BATCH_SIZE = parseInt(process.env.IMPORT_BATCH_SIZE || "5");

export class ImageProcessStep extends BasePipelineStep {
  readonly name = "processing_images" as const;

  async run(ctx: StepContext): Promise<StepResult> {
    const imagesDone = isCheckpointStepDone(ctx.checkpoint, this.name);
    if (imagesDone && ctx.checkpoint.vipZipKey) {
      return { outcome: "continue" };
    }

    if (!ctx.validImages) throw new Error("Validate step must run before image processing");

    const db = await getDb();
    if (!db) throw new Error("DB not available");

    const albumSlug = ctx.albumSlug;
    await ensureProcessedDirs(ctx.processedDir);

    const vipMode = ctx.importProfile?.vipZipMode ?? process.env.VIP_ZIP_MODE ?? "copy";
    const vipEnabled = ctx.importProfile?.vip !== false;

    if (vipEnabled && !ctx.checkpoint.vipZipKey) {
      await db
        .update(zipImportJobs)
        .set({ vipZipStatus: "generating", updatedAt: new Date() })
        .where(eq(zipImportJobs.id, ctx.jobId));
      await ctx.log(`VIP ZIP (${vipMode})...`);

      try {
        if (vipMode === "copy") {
          const sourceHead = await headObject(ctx.sourceArchiveKey);
          const vipKey = `vip-zips/${albumSlug}/VIP_${albumSlug}.zip`;
          const verified = await copyObjectWithVerify(
            ctx.sourceArchiveKey,
            vipKey,
            sourceHead.contentLength
          );
          ctx.checkpoint.vipZipKey = vipKey;
          await db
            .update(zipImportJobs)
            .set({
              vipZipStatus: "ready",
              vipZipKey,
              vipZipSize: verified.contentLength,
              vipZipGeneratedAt: new Date(),
              updatedAt: new Date(),
            })
            .where(eq(zipImportJobs.id, ctx.jobId));
          await ctx.saveCheckpoint();
          await ctx.log(`VIP copy verified: ${vipKey} (${verified.contentLength} bytes)`);
        } else {
          const vipResult = await generateVipZip(
            ctx.jobId,
            albumSlug,
            ctx.albumTitle,
            ctx.tempDir,
            ctx.validImages
          );
          await verifyObjectExistsSafe(vipResult.key, vipResult.size);
          ctx.checkpoint.vipZipKey = vipResult.key;
          await db
            .update(zipImportJobs)
            .set({
              vipZipStatus: "ready",
              vipZipKey: vipResult.key,
              vipZipSize: vipResult.size,
              vipZipGeneratedAt: new Date(),
              updatedAt: new Date(),
            })
            .where(eq(zipImportJobs.id, ctx.jobId));
          await ctx.saveCheckpoint();
          await ctx.log(`VIP ZIP ready: ${vipResult.key}`);
        }
      } catch (zipErr) {
        await db
          .update(zipImportJobs)
          .set({ vipZipStatus: "failed", updatedAt: new Date() })
          .where(eq(zipImportJobs.id, ctx.jobId));
        await ctx.log(`VIP ZIP failed (non-fatal): ${(zipErr as Error).message}`);
      }
    }

    if (imagesDone) {
      return { outcome: "continue" };
    }

    const allProcessed = [];
    let counter = ctx.checkpoint.currentImageIndex;

    for (let i = counter; i < ctx.validImages.length; i += BATCH_SIZE) {
      const batch = ctx.validImages.slice(i, i + BATCH_SIZE);
      const batchResults = await processBatch(
        batch,
        ctx.processedDir,
        albumSlug,
        counter,
        CONCURRENCY
      );

      for (const r of batchResults.successes) allProcessed.push(r);
      for (const f of batchResults.failures) await ctx.logFailed(f.file, f.reason);
      counter += batch.length;
      ctx.checkpoint.currentImageIndex = i + batch.length;

      const progress = Math.round(((i + batch.length) / ctx.validImages.length) * 100);
      await db
        .update(zipImportJobs)
        .set({ progress, processedImages: allProcessed.length, updatedAt: new Date() })
        .where(eq(zipImportJobs.id, ctx.jobId));
    }

    if (allProcessed.length === 0) throw new Error("All images failed processing");
    ctx.allProcessed = allProcessed;
    await ctx.log(`Processed ${allProcessed.length} images`);

    await ctx.log("Uploading web images to Wasabi (verified)...");
    for (const variant of ["webp", "medium", "thumb"]) {
      const variantDir = path.join(ctx.processedDir, variant);
      let files: string[];
      try {
        files = await fs.readdir(variantDir);
      } catch {
        continue;
      }

      for (const file of files) {
        const filePath = path.join(variantDir, file);
        const s3Key = `albums/${albumSlug}/${variant}/${file}`;

        if (ctx.checkpoint.verifiedUploads[s3Key]) {
          continue;
        }

        const buffer = await fs.readFile(filePath);
        const verified = await uploadBufferVerified(s3Key, buffer, "image/webp");
        ctx.checkpoint.verifiedUploads[s3Key] = {
          etag: verified.etag,
          size: verified.size,
        };
        if (!ctx.uploadedKeys.includes(s3Key)) {
          ctx.uploadedKeys.push(s3Key);
        }
      }
    }

    await ctx.saveCheckpoint();
    await ctx.log(`Uploaded ${ctx.uploadedKeys.length} verified files to Wasabi`);

    return { outcome: "continue" };
  }

  async rollback(_ctx: StepContext): Promise<void> {
    // BR§7: never delete verified uploads on resume
  }
}

async function verifyObjectExistsSafe(key: string, expectedSize: number): Promise<void> {
  const { verifyObjectExists } = await import("../wasabi-verify");
  await verifyObjectExists(key, expectedSize);
}
