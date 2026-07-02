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
import { uploadToStorage } from "../storage-wasabi";
import { isAdmin, isVipOrAdmin } from '@shared/const';

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
      return listCreators(input ?? {});
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

      return { creator, albums: albumsResult.items, totalAlbums: albumsResult.total };
    }),

  // --- Admin: list all creators -----------------------------------------------
  adminList: protectedProcedure
    .input(z.object({ page: z.number().min(1).default(1), limit: z.number().min(1).max(500).default(20), search: z.string().optional() }).optional())
    .query(async ({ input, ctx }) => {
      if (!isAdmin(ctx.user.role)) throw new TRPCError({ code: "FORBIDDEN" });
      return listCreators(input ?? {});
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
  // Picks the best available photo from the creator's albums:
  //   avatar → first photo of the most-viewed album (square-ish or portrait)
  //   banner → first landscape photo found across all albums
  // If a specific albumId is provided, restricts search to that album.
  adminAutoPickImages: protectedProcedure
    .input(z.object({
      creatorId: z.number(),
      albumId: z.number().optional(), // restrict to specific album
      applyAvatar: z.boolean().default(true),
      applyBanner: z.boolean().default(true),
    }))
    .mutation(async ({ input, ctx }) => {
      if (!isAdmin(ctx.user.role)) throw new TRPCError({ code: "FORBIDDEN" });
      const { albums, photos } = await import("../../drizzle/schema");
      const { eq, and, desc, isNotNull } = await import("drizzle-orm");
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      // Get albums for this creator (ordered by viewCount desc)
      const albumRows = await db
        .select({ id: albums.id, coverUrl: albums.coverUrl })
        .from(albums)
        .where(and(
          eq(albums.creatorId, input.creatorId),
          eq(albums.status, "published"),
          ...(input.albumId ? [eq(albums.id, input.albumId)] : [])
        ))
        .orderBy(desc(albums.viewCount))
        .limit(10);

      if (albumRows.length === 0) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Creator has no published albums" });
      }

      let avatarUrl: string | null = null;
      let bannerUrl: string | null = null;

      // Collect photos from all albums (up to 5 albums, 20 photos each)
      for (const album of albumRows) {
        if (avatarUrl && bannerUrl) break;
        const photoRows = await db
          .select({
            id: photos.id,
            thumbUrl: photos.thumbUrl,
            webpUrl: photos.webpUrl,
            mediumUrl: photos.mediumUrl,
            width: photos.width,
            height: photos.height,
          })
          .from(photos)
          .where(and(eq(photos.albumId, album.id), isNotNull(photos.thumbUrl)))
          .orderBy(photos.sortOrder)
          .limit(20);

        for (const photo of photoRows) {
          const url = photo.mediumUrl || photo.webpUrl || photo.thumbUrl;
          if (!url) continue;
          // Avatar: pick first available photo (portrait or square preferred)
          if (!avatarUrl && input.applyAvatar) {
            const isPortraitOrSquare = !photo.width || !photo.height ||
              photo.height >= photo.width * 0.8; // portrait or near-square
            if (isPortraitOrSquare) avatarUrl = url;
          }
          // Banner: pick first landscape photo (width > height * 1.3)
          if (!bannerUrl && input.applyBanner) {
            const isLandscape = photo.width && photo.height &&
              photo.width > photo.height * 1.3;
            if (isLandscape) bannerUrl = url;
          }
          if (avatarUrl && bannerUrl) break;
        }
        // Fallback: use album cover for avatar if no portrait found
        if (!avatarUrl && input.applyAvatar && album.coverUrl) {
          avatarUrl = album.coverUrl;
        }
        // Fallback: use first photo as banner if no landscape found
        if (!bannerUrl && input.applyBanner) {
          const firstPhoto = await db
            .select({ mediumUrl: photos.mediumUrl, webpUrl: photos.webpUrl, thumbUrl: photos.thumbUrl })
            .from(photos)
            .where(and(eq(photos.albumId, album.id), isNotNull(photos.thumbUrl)))
            .orderBy(photos.sortOrder)
            .limit(1);
          if (firstPhoto[0]) {
            bannerUrl = firstPhoto[0].mediumUrl || firstPhoto[0].webpUrl || firstPhoto[0].thumbUrl || null;
          }
        }
      }

      // Apply to creator record (store URL directly — no re-upload needed)
      const updates: Record<string, string | null> = {};
      if (input.applyAvatar && avatarUrl) { updates.avatarUrl = avatarUrl; updates.avatarKey = "auto-picked"; }
      if (input.applyBanner && bannerUrl) { updates.bannerUrl = bannerUrl; updates.bannerKey = "auto-picked"; }
      if (Object.keys(updates).length > 0) {
        await updateCreator(input.creatorId, updates as any);
      }

      return {
        success: true,
        avatarUrl: input.applyAvatar ? avatarUrl : undefined,
        bannerUrl: input.applyBanner ? bannerUrl : undefined,
        applied: Object.keys(updates).length > 0,
      };
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
      const { albums, photos } = await import("../../drizzle/schema");
      const { eq, and, desc, isNotNull } = await import("drizzle-orm");
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const offset = (input.page - 1) * input.limit;
      // Get all album IDs for this creator
      const albumRows = await db
        .select({ id: albums.id, title: albums.title })
        .from(albums)
        .where(eq(albums.creatorId, input.creatorId))
        .orderBy(desc(albums.viewCount))
        .limit(20);

      if (albumRows.length === 0) return { photos: [], total: 0, albumCount: 0 };
      const albumIds = albumRows.map((a) => a.id);

      const { inArray } = await import("drizzle-orm");
      const photoRows = await db
        .select({
          id: photos.id,
          albumId: photos.albumId,
          thumbUrl: photos.thumbUrl,
          mediumUrl: photos.mediumUrl,
          webpUrl: photos.webpUrl,
          width: photos.width,
          height: photos.height,
        })
        .from(photos)
        .where(and(inArray(photos.albumId, albumIds), isNotNull(photos.thumbUrl)))
        .orderBy(photos.sortOrder)
        .limit(input.limit)
        .offset(offset);

      return {
        photos: photoRows,
        total: photoRows.length,
        albumCount: albumRows.length,
      };
    }),
});
