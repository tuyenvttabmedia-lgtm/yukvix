import path from "path";
import { eq } from "drizzle-orm";
import { getDb } from "../../db";
import {
  albums,
  photos,
  mediaItems,
  albumMediaItems,
  zipImportJobs,
} from "../../../drizzle/schema";
import { getPublicUrl } from "../../storage-wasabi";
import { rebuildProcessedFromUploads } from "../import-image-utils";
import {
  updateCreatorAvatarIfEmpty,
  updateCreatorBannerIfEmpty,
  incrementCreatorAlbumCount,
} from "../../services/creator-service";
import { verifyAllObjects } from "../wasabi-verify";
import { BasePipelineStep, type StepContext, type StepResult } from "../pipeline-step";
import { isCheckpointStepDone } from "../pipeline-checkpoint";

export class AlbumCreationStep extends BasePipelineStep {
  readonly name = "creating_album" as const;

  async run(ctx: StepContext): Promise<StepResult> {
    if (isCheckpointStepDone(ctx.checkpoint, this.name)) {
      if (ctx.checkpoint.albumId) ctx.albumId = ctx.checkpoint.albumId;
      return { outcome: "continue" };
    }

    if (!ctx.allProcessed?.length) {
      ctx.allProcessed = rebuildProcessedFromUploads(
        ctx.checkpoint.verifiedUploads || {},
        ctx.albumSlug
      );
    }
    if (!ctx.allProcessed?.length) {
      throw new Error("Image processing must complete before album creation");
    }

    await ctx.log("Verifying media objects before album commit...");
    await verifyAllObjects(ctx.uploadedKeys);

    const db = await getDb();
    if (!db) throw new Error("DB not available");

    const photoRows = ctx.allProcessed.map((p) => ({
      originalKey: p.webpKey,
      webpKey: p.webpKey,
      webpUrl: getPublicUrl(p.webpKey),
      mediumKey: p.mediumKey,
      mediumUrl: getPublicUrl(p.mediumKey),
      thumbKey: p.thumbKey,
      thumbUrl: getPublicUrl(p.thumbKey),
      sortOrder: p.sortOrder,
      width: p.width || null,
      height: p.height || null,
      filename: p.filename,
    }));

    const SKIP_COVER_NAMES = /^(logo|banner|preview|sample|thumb|watermark|cover_text)/i;
    const validCoverPhotos = photoRows.filter(
      (p) => !SKIP_COVER_NAMES.test(path.basename(p.filename || ""))
    );
    let coverThumbKey = photoRows[0]?.thumbKey;
    let heroMediumKey = photoRows[0]?.mediumKey;
    const explicitCover = photoRows.find((p) =>
      /^cover\./i.test(path.basename(p.filename || ""))
    );
    if (explicitCover) {
      coverThumbKey = explicitCover.thumbKey;
      heroMediumKey = explicitCover.mediumKey;
    } else if (validCoverPhotos.length >= 2) {
      coverThumbKey = validCoverPhotos[1].thumbKey;
      heroMediumKey = validCoverPhotos[1].mediumKey;
    } else if (validCoverPhotos.length === 1) {
      coverThumbKey = validCoverPhotos[0].thumbKey;
      heroMediumKey = validCoverPhotos[0].mediumKey;
    }

    if (!coverThumbKey) {
      throw new Error("Cover selection failed — cannot commit album");
    }

    try {
      if (ctx.isV2 && ctx.pendingAlbum && !ctx.albumId) {
        const pending = ctx.pendingAlbum;
        const albumId = await db.transaction(async (tx) => {
          const [albumResult] = await tx.insert(albums).values({
            slug: pending.slug,
            title: pending.title,
            creator: pending.creator,
            creatorId: pending.creatorId,
            collectionName: pending.collectionName,
            description: pending.description,
            shortDescription: pending.shortDescription,
            category: pending.category,
            tags: pending.tags ? JSON.stringify(pending.tags) : null,
            metaTitle: pending.metaTitle,
            metaDescription: pending.metaDescription,
            focusKeyword: pending.focusKeyword,
            relatedKeywords: pending.relatedKeywords
              ? JSON.stringify(pending.relatedKeywords)
              : null,
            altTextTemplate: pending.altTextTemplate,
            originalFileName: pending.originalFileName,
            aiGenerated: true,
            publishStatus: "processing",
            status: "draft",
            isVip: pending.isVip ?? ctx.importProfile?.vip ?? true,
            freePreviewCount: pending.freePreviewCount ?? ctx.importProfile?.preview ?? 10,
            coverKey: coverThumbKey,
            coverUrl: getPublicUrl(coverThumbKey),
            photoCount: photoRows.length,
          });

          const newAlbumId = (albumResult as { insertId: number }).insertId;

          await tx.insert(photos).values(
            photoRows.map((p) => ({
              ...p,
              albumId: newAlbumId,
            }))
          );

          await tx
            .update(zipImportJobs)
            .set({ albumId: newAlbumId, updatedAt: new Date() })
            .where(eq(zipImportJobs.id, ctx.jobId));

          return newAlbumId;
        });

        ctx.albumId = albumId;
        ctx.checkpoint.albumId = albumId;
        await ctx.saveCheckpoint();

        if (pending.creatorId && coverThumbKey) {
          await updateCreatorAvatarIfEmpty(pending.creatorId, coverThumbKey);
        }
        if (pending.creatorId && heroMediumKey) {
          await updateCreatorBannerIfEmpty(
            pending.creatorId,
            heroMediumKey,
            getPublicUrl(heroMediumKey)
          );
        }
        if (pending.creatorId) {
          await incrementCreatorAlbumCount(pending.creatorId);
        }
      } else if (ctx.albumId) {
        await db.transaction(async (tx) => {
          await tx.insert(photos).values(
            photoRows.map((p) => ({
              ...p,
              albumId: ctx.albumId!,
            }))
          );

          await tx
            .update(albums)
            .set({
              coverKey: coverThumbKey,
              coverUrl: getPublicUrl(coverThumbKey),
              photoCount: photoRows.length,
              updatedAt: new Date(),
            })
            .where(eq(albums.id, ctx.albumId!));
        });
      } else {
        throw new Error("No album context for creation step");
      }

      const albumId = ctx.albumId!;

      const mediaRows = photoRows.map((p) => ({
        originalKey: p.webpKey,
        thumbKey: p.thumbKey,
        webpKey: p.webpKey,
        originalUrl: p.webpUrl,
        thumbUrl: p.thumbUrl,
        webpUrl: p.webpUrl,
        filename: p.webpKey.split("/").pop() || p.webpKey,
      }));
      const insertedMediaIds: number[] = [];
      for (const mr of mediaRows) {
        try {
          const [result] = await db.insert(mediaItems).values(mr);
          if (result.insertId) insertedMediaIds.push(result.insertId);
        } catch {
          // Duplicate key
        }
      }
      if (insertedMediaIds.length > 0) {
        const amiRows = insertedMediaIds.map((mediaItemId, idx) => ({
          albumId,
          mediaItemId,
          sortOrder: idx,
          isFreePreview: false,
        }));
        await db.insert(albumMediaItems).values(amiRows).catch(() => {});
      }

      await ctx.log(
        `Album TX complete: albumId=${albumId}, ${photoRows.length} photos, cover=${coverThumbKey}`
      );
    } catch (dbErr) {
      await ctx.log(`Album TX failed: ${(dbErr as Error).message}`);
      throw new Error(`Album creation failed: ${(dbErr as Error).message}`);
    }

    return { outcome: "continue" };
  }

  async rollback(_ctx: StepContext): Promise<void> {
    // BR§7: never rollback completed uploads on resume
  }
}
