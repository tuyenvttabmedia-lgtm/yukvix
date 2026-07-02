/**
 * Publish Worker — creates album draft + inserts photos rows
 * The app reads images from the `photos` table (not album_media_items),
 * so we must insert into `photos` and call updateAlbumPhotoCount.
 */
import type { PublishJobData } from "../queues.js";
import { logImport, updateJobStatus } from "../logger.js";
import { markUrlImported } from "../dedup.js";
import { getDb } from "../../db.js";
import { updateAlbumPhotoCount } from "../../db.js";
import {
  albums,
  albumMediaItems,
  mediaItems,
  photos,
  tags,
  albumTags,
  importJobs,
} from "../../../drizzle/schema.js";
import { eq } from "drizzle-orm";

async function upsertTags(db: any, tagNames: string[]): Promise<number[]> {
  const ids: number[] = [];
  for (const name of tagNames) {
    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    if (!slug) continue;

    const existing = await db.select({ id: tags.id }).from(tags).where(eq(tags.slug, slug)).limit(1);
    if (existing.length > 0) {
      ids.push(existing[0].id);
    } else {
      const [result] = await db.insert(tags).values({ name, slug });
      const insertId = (result as any).insertId;
      if (insertId) ids.push(insertId);
    }
  }
  return ids;
}

export async function processPublishJob(data: PublishJobData): Promise<void> {
  const {
    jobId,
    title,
    slug,
    description,
    creator,
    tags: tagNames,
    altTexts,
    processedImages,
    categoryId,
    defaultVip,
    freePreviewCount: passedFreePreviewCount,
  } = data;

  try {
    await logImport(jobId, "info", `Creating album draft: "${title}" with ${processedImages.length} images`);

    const db = await getDb();
    if (!db) throw new Error("Database not available");

    const [importJob] = await db.select().from(importJobs).where(eq(importJobs.id, jobId)).limit(1);
    if (!importJob) throw new Error(`Import job ${jobId} not found`);

    // Determine publish mode: check source config, fallback to draft
    let publishMode: "draft" | "published" = "draft";
    if (importJob.sourceId) {
      const { importSources } = await import("../../../drizzle/schema.js");
      const [src] = await db.select({ publishMode: importSources.publishMode }).from(importSources).where(eq(importSources.id, importJob.sourceId)).limit(1);
      if (src?.publishMode === "published") publishMode = "published";
    }

    const coverImage = processedImages[0];
    const coverUrl = coverImage?.thumbPublicUrl || null;
    const coverKey = coverImage?.wasabiThumbKey || null;

    // Resolve freePreviewCount: source config > Album Defaults CMS setting > hardcoded fallback 3
    let resolvedFreePreviewCount = 3; // fallback
    if (passedFreePreviewCount !== null && passedFreePreviewCount !== undefined) {
      // Source has explicit override
      resolvedFreePreviewCount = passedFreePreviewCount;
    } else {
      // null or undefined = use Album Defaults from CMS settings
      try {
        const { getSetting } = await import("../../settings-service.js");
        const settingVal = await getSetting("default_free_preview_count", "", "3");
        const parsed = parseInt(settingVal, 10);
        if (!isNaN(parsed) && parsed >= 0) resolvedFreePreviewCount = parsed;
      } catch { /* keep fallback */ }
    }

    const [albumResult] = await db.insert(albums).values({
      title,
      slug,
      description: creator ? `${description}\n\nCreator: ${creator}` : description,
      status: publishMode,
      coverUrl,
      coverKey,
      seoTitle: title,
      seoDescription: description,
      categoryId: categoryId || null,
      isVip: defaultVip ?? false,
      freePreviewCount: resolvedFreePreviewCount,
    });

    const albumId = (albumResult as any).insertId;
    if (!albumId) throw new Error("Failed to create album");

    await logImport(jobId, "info", `Album created: ID ${albumId} (${publishMode}${defaultVip ? ", VIP" : ""}, freePreview=${resolvedFreePreviewCount})`);

    // --- Insert photos rows (primary read path for album images) -------------
    let sortOrder = 0;
    for (const img of processedImages) {
      const isFreePreview = sortOrder < resolvedFreePreviewCount;
      const altText = altTexts[sortOrder] || altTexts[0] || title;

      try {
        await db.insert(photos).values({
          albumId,
          originalKey: img.wasabiOriginalKey,
          originalUrl: img.originalPublicUrl,
          webpKey: img.wasabiWebpKey,
          webpUrl: img.webpPublicUrl,
          thumbKey: img.wasabiThumbKey,
          thumbUrl: img.thumbPublicUrl,
          width: img.width || 0,
          height: img.height || 0,
          fileSize: img.fileSize || 0,
          mimeType: "image/webp",
          sortOrder,
          isFreePreview,
          altText,
        });
        sortOrder++;
      } catch (err: any) {
        await logImport(jobId, "warn", `Failed to insert photo ${sortOrder}: ${err.message}`);
      }
    }

    await logImport(jobId, "info", `Inserted ${sortOrder} photos into album ${albumId}`);

    // --- Also link to media_items / album_media_items (media library) --------
    let mediaLinked = 0;
    for (const img of processedImages) {
      try {
        // Find or create media_item
        let mediaRows = await db
          .select({ id: mediaItems.id })
          .from(mediaItems)
          .where(eq(mediaItems.originalKey, img.wasabiOriginalKey))
          .limit(1);

        let mediaItemId: number | null = null;

        if (mediaRows.length > 0) {
          mediaItemId = mediaRows[0].id;
        } else {
          const [insertedMedia] = await db.insert(mediaItems).values({
            originalKey: img.wasabiOriginalKey,
            thumbKey: img.wasabiThumbKey,
            webpKey: img.wasabiWebpKey,
            originalUrl: img.originalPublicUrl,
            thumbUrl: img.thumbPublicUrl,
            webpUrl: img.webpPublicUrl,
            filename: img.wasabiOriginalKey.split("/").pop() || "image.webp",
            width: img.width || 0,
            height: img.height || 0,
            fileSize: img.fileSize || 0,
            mimeType: "image/webp",
          });
          mediaItemId = (insertedMedia as any).insertId || null;
        }

        if (mediaItemId) {
          await db.insert(albumMediaItems).ignore().values({
            albumId,
            mediaItemId,
            sortOrder: mediaLinked,
            isFreePreview: mediaLinked < resolvedFreePreviewCount,
          });
          mediaLinked++;
        }
      } catch { /* skip */ }
    }

    // --- Update album photo count ---------------------------------------------
    await updateAlbumPhotoCount(albumId);

    // --- Tags -----------------------------------------------------------------
    if (tagNames.length > 0) {
      const tagIds = await upsertTags(db, tagNames);
      if (tagIds.length > 0) {
        for (const tagId of tagIds) {
          await db.insert(albumTags).ignore().values({ albumId, tagId });
        }
        await logImport(jobId, "info", `Linked ${tagIds.length} tags to album`);
      }
    }

    await markUrlImported(importJob.sourceUrl, jobId, albumId);

    await updateJobStatus(jobId, "done", {
      albumId,
      completedAt: new Date(),
    });

    await logImport(jobId, "info", `Import complete! Album created: /admin/albums/${albumId} — ${sortOrder} photos, ${publishMode}`);
  } catch (err: any) {
    await logImport(jobId, "error", `Publish failed: ${err.message}`);
    await updateJobStatus(jobId, "failed", {
      errorMessage: err.message,
      completedAt: new Date(),
    });
  }
}
