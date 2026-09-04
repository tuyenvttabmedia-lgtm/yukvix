import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { protectedProcedure, publicProcedure, router } from "../_core/trpc";
import {
  createCreator,
  deleteCreator,
  getCreatorById,
  getCreatorBySlug,
  listAlbums,
  listCreators,
  updateCreator,
  getDb,
} from "../db";
import { getPublicUrl, uploadToStorage } from "../storage-wasabi";
import { isAdmin, isVipOrAdmin } from '@shared/const';
import { applyCreatorImageFromPhoto, applyCreatorImagesFromAlbums, listCreatorAlbumIds } from "../services/creator-service";
import { isCreatorPubliclyVisible, isLowResCreatorBanner, toPublicCreatorBannerUrl, toPublicCreatorImageUrl } from "../public-media-url";

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .trim();
}

export const creatorsRouter = router({
  // --- Public: list all creators --------------------------------------------
  list: publicProcedure
    .input(z.object({
      page: z.number().min(1).default(1),
      limit: z.number().min(1).max(50).default(24),
      search: z.string().optional(),
      sortBy: z.enum(["name", "albumCount", "newest"]).default("albumCount"),
      hasAlbums: z.boolean().optional(),
    }).optional())
    .query(async ({ input }) => {
      return listCreators({ ...(input ?? {}), publicOnly: true });
    }),

  // --- Public: get creator by slug + their albums -----------------------------
  bySlug: publicProcedure
    .input(z.object({ slug: z.string() }))
    .query(async ({ input }) => {
      const creator = await getCreatorBySlug(input.slug);
      if (!creator) throw new TRPCError({ code: "NOT_FOUND", message: "Creator not found" });

      const albumsResult = await listAlbums({
        page: 1,
        limit: 50,
        status: "published",
        sortBy: "newest",
        creatorId: creator.id,
      });

      if (!isCreatorPubliclyVisible(creator)) {
        if (albumsResult.total > 0) {
          await applyCreatorImagesFromAlbums(creator.id, {
            applyAvatar: !creator.avatarUrl,
            applyBanner: !creator.bannerUrl || isLowResCreatorBanner(creator.bannerUrl),
          });
          const refreshed = await getCreatorBySlug(input.slug);
          if (refreshed && isCreatorPubliclyVisible(refreshed)) {
            return { creator: refreshed, albums: albumsResult.items, totalAlbums: albumsResult.total };
          }
        }
        throw new TRPCError({ code: "NOT_FOUND", message: "Creator not found" });
      }

      if (isLowResCreatorBanner(creator.bannerUrl)) {
        await applyCreatorImagesFromAlbums(creator.id, { applyAvatar: false, applyBanner: true });
        const refreshed = await getCreatorBySlug(input.slug);
        if (refreshed) {
          return { creator: refreshed, albums: albumsResult.items, totalAlbums: albumsResult.total };
        }
      }

      return { creator, albums: albumsResult.items, totalAlbums: albumsResult.total };
    }),

  // --- Admin: list all creators -----------------------------------------------
  adminList: protectedProcedure
    .input(z.object({ page: z.number().min(1).default(1), limit: z.number().min(1).max(500).default(20), search: z.string().optional() }).optional())
    .query(async ({ input, ctx }) => {
      if (!isAdmin(ctx.user.role)) throw new TRPCError({ code: "FORBIDDEN" });
      const result = await listCreators(input ?? {});
      const missing = result.items.filter(
        (c) => !c.avatarUrl || !c.bannerUrl || isLowResCreatorBanner(c.bannerUrl)
      );
      if (missing.length > 0) {
        await Promise.all(
          missing.slice(0, 12).map((c) =>
            applyCreatorImagesFromAlbums(c.id, {
              applyAvatar: !c.avatarUrl,
              applyBanner: !c.bannerUrl || isLowResCreatorBanner(c.bannerUrl),
            })
          )
        );
        return listCreators(input ?? {});
      }
      return result;
    }),

  // --- Admin: get creator by ID -----------------------------------------------
  adminById: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input, ctx }) => {
      if (!isAdmin(ctx.user.role)) throw new TRPCError({ code: "FORBIDDEN" });
      const creator = await getCreatorById(input.id);
      if (!creator) throw new TRPCError({ code: "NOT_FOUND" });
      return creator;
    }),

  // --- Admin: create creator --------------------------------------------------
  adminCreate: protectedProcedure
    .input(z.object({
      name: z.string().min(1).max(128),
      slug: z.string().optional(),
      bio: z.string().optional(),
      socialLinks: z.record(z.string(), z.string()).optional(),
      seoTitle: z.string().optional(),
      seoDescription: z.string().optional(),
      seoKeywords: z.string().optional(),
      focusKeyword: z.string().max(200).optional(),
      canonicalUrl: z.string().max(500).optional(),
      ogImage: z.string().max(500).optional(),
      robotsIndex: z.boolean().optional(),
      seoLanguage: z.string().max(10).optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      if (!isAdmin(ctx.user.role)) throw new TRPCError({ code: "FORBIDDEN" });
      const slug = input.slug || slugify(input.name) + "-" + Date.now().toString(36);
      const creator = await createCreator({
        name: input.name,
        slug,
        ...(input.bio !== undefined ? { bio: input.bio } : {}),
        ...(input.socialLinks !== undefined ? { socialLinks: JSON.stringify(input.socialLinks) } : {}),
        ...(input.seoTitle !== undefined ? { seoTitle: input.seoTitle } : {}),
        ...(input.seoDescription !== undefined ? { seoDescription: input.seoDescription } : {}),
        ...(input.seoKeywords !== undefined ? { seoKeywords: input.seoKeywords } : {}),
        ...(input.focusKeyword !== undefined ? { focusKeyword: input.focusKeyword } : {}),
        ...(input.canonicalUrl !== undefined ? { canonicalUrl: input.canonicalUrl } : {}),
        ...(input.ogImage !== undefined ? { ogImage: input.ogImage } : {}),
        ...(input.robotsIndex !== undefined ? { robotsIndex: input.robotsIndex } : {}),
        ...(input.seoLanguage !== undefined ? { seoLanguage: input.seoLanguage } : {}),
      } as any);
      return creator;
    }),

  // --- Admin: update creator --------------------------------------------------
  adminUpdate: protectedProcedure
    .input(z.object({
      id: z.number(),
      name: z.string().min(1).max(128).optional(),
      slug: z.string().optional(),
      bio: z.string().optional(),
      avatarUrl: z.string().optional(),
      avatarKey: z.string().optional(),
      bannerUrl: z.string().optional(),
      bannerKey: z.string().optional(),
      socialLinks: z.record(z.string(), z.string()).optional(),
      seoTitle: z.string().optional(),
      seoDescription: z.string().optional(),
      seoKeywords: z.string().optional(),
      focusKeyword: z.string().max(200).optional(),
      canonicalUrl: z.string().max(500).optional(),
      ogImage: z.string().max(500).optional(),
      robotsIndex: z.boolean().optional(),
      seoLanguage: z.string().max(10).optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      if (!isAdmin(ctx.user.role)) throw new TRPCError({ code: "FORBIDDEN" });
      const { id, socialLinks, ...rest } = input;
      if (rest.avatarUrl) rest.avatarUrl = toPublicCreatorImageUrl(rest.avatarUrl) ?? rest.avatarUrl;
      if (rest.bannerUrl) rest.bannerUrl = toPublicCreatorBannerUrl(rest.bannerUrl) ?? rest.bannerUrl;
      await updateCreator(id, {
        ...rest,
        ...(socialLinks !== undefined ? { socialLinks: JSON.stringify(socialLinks) } : {}),
      } as any);
      return { success: true };
    }),

  // --- Admin: delete creator --------------------------------------------------
  adminDelete: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input, ctx }) => {
      if (!isAdmin(ctx.user.role)) throw new TRPCError({ code: "FORBIDDEN" });
      await deleteCreator(input.id);
      return { success: true };
    }),

  // --- Admin: presigned upload for avatar/banner ------------------------------
  adminPresignedUpload: protectedProcedure
    .input(z.object({
      creatorId: z.number(),
      type: z.enum(["avatar", "banner"]),
      filename: z.string(),
      contentType: z.string(),
      fileBase64: z.string(), // base64 encoded file
    }))
    .mutation(async ({ input, ctx }) => {
      if (!isAdmin(ctx.user.role)) throw new TRPCError({ code: "FORBIDDEN" });
      const ext = input.filename.split(".").pop() || "jpg";
      const key = `creators/${input.type}/${input.creatorId}-${Date.now()}.${ext}`;
      const buffer = Buffer.from(input.fileBase64, "base64");
      const result = await uploadToStorage(key, buffer, input.contentType);
      // Update creator record
      if (input.type === "avatar") {
        await updateCreator(input.creatorId, { avatarKey: result.key, avatarUrl: result.url });
      } else {
        await updateCreator(input.creatorId, { bannerKey: result.key, bannerUrl: result.url });
      }
      return { key: result.key, url: result.url };
    }),

  // --- Admin: auto-pick avatar & banner from creator's album photos -----------
  adminAutoPickImages: protectedProcedure
    .input(z.object({
      creatorId: z.number(),
      albumId: z.number().optional(),
      applyAvatar: z.boolean().default(true),
      applyBanner: z.boolean().default(true),
    }))
    .mutation(async ({ input, ctx }) => {
      if (!isAdmin(ctx.user.role)) throw new TRPCError({ code: "FORBIDDEN" });
      const result = await applyCreatorImagesFromAlbums(input.creatorId, {
        albumId: input.albumId,
        applyAvatar: input.applyAvatar,
        applyBanner: input.applyBanner,
      });
      if (!result.applied) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Không tìm thấy ảnh album cho cosplayer này",
        });
      }
      return {
        success: true,
        avatarUrl: result.avatarUrl ?? undefined,
        bannerUrl: result.bannerUrl ?? undefined,
        applied: true,
      };
    }),

  adminSetImageFromPhoto: protectedProcedure
    .input(z.object({
      creatorId: z.number(),
      photoId: z.number(),
      type: z.enum(["avatar", "banner"]),
    }))
    .mutation(async ({ input, ctx }) => {
      if (!isAdmin(ctx.user.role)) throw new TRPCError({ code: "FORBIDDEN" });
      try {
        const picked = await applyCreatorImageFromPhoto(input.creatorId, input.photoId, input.type);
        return { success: true, url: picked.url, key: picked.key };
      } catch (err) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: err instanceof Error ? err.message : "Không thể gán ảnh từ album",
        });
      }
    }),

  // --- Admin: list photos from creator's albums for manual picker -------------
  adminListPhotosForPicker: protectedProcedure
    .input(z.object({
      creatorId: z.number(),
      page: z.number().min(1).default(1),
      limit: z.number().min(1).max(50).default(24),
    }))
    .query(async ({ input, ctx }) => {
      if (!isAdmin(ctx.user.role)) throw new TRPCError({ code: "FORBIDDEN" });
      const { photos } = await import("../../drizzle/schema");
      const { inArray } = await import("drizzle-orm");
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const creator = await getCreatorById(input.creatorId);
      if (!creator) throw new TRPCError({ code: "NOT_FOUND" });

      const albumIds = await listCreatorAlbumIds(input.creatorId, creator.name, 40);
      if (albumIds.length === 0) return { photos: [], total: 0, albumCount: 0 };

      const offset = (input.page - 1) * input.limit;
      const photoRows = await db
        .select({
          id: photos.id,
          albumId: photos.albumId,
          thumbUrl: photos.thumbUrl,
          thumbKey: photos.thumbKey,
          width: photos.width,
          height: photos.height,
        })
        .from(photos)
        .where(inArray(photos.albumId, albumIds))
        .orderBy(photos.sortOrder)
        .limit(input.limit)
        .offset(offset);

      return {
        photos: photoRows.map((p) => {
          const thumb = p.thumbKey ? getPublicUrl(p.thumbKey) : toPublicCreatorImageUrl(p.thumbUrl);
          return {
            id: p.id,
            albumId: p.albumId,
            thumbUrl: thumb,
            mediumUrl: thumb,
            webpUrl: thumb,
            width: p.width,
            height: p.height,
          };
        }),
        total: photoRows.length,
        albumCount: albumIds.length,
      };
    }),
});
