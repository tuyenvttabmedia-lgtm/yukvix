import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { protectedProcedure, publicProcedure, router } from "../_core/trpc";
import {
  countPhotosByAlbumId,
  createAlbum,
  deleteAlbum,
  getAlbumById,
  getAlbumBySlug,
  getTagsByAlbumId,
  getDb,
  incrementAlbumView,
  isBookmarked,
  listAlbums,
  listCategories,
  listTags,
  setAlbumTags,
  setFreePreviewPhotos,
  updateAlbum,
  upsertTag,
} from "../db";
import { albums as albumsTable } from "../../drizzle/schema";
import { assertAlbumPubliclyReadable, viewerFlags } from "../photo-access";
import { isAdmin } from '@shared/const';

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .trim();
}

export const albumsRouter = router({
  // --- Public: List albums ----------------------------------------------------
  list: publicProcedure
    .input(
      z.object({
        page: z.number().min(1).default(1),
        limit: z.number().min(1).max(50).default(20),
        categoryId: z.number().optional(),
        tagIds: z.array(z.number()).optional(),
        tagSlug: z.string().optional(),
        isVip: z.boolean().optional(),
        search: z.string().optional(),
        sortBy: z.enum(["newest", "oldest", "popular"]).default("newest"),
      })
    )
    .query(async ({ input }) => {
      const result = await listAlbums({
        ...input,
        status: "published",
      });
      return result;
    }),

  // --- Public: Get album by slug ----------------------------------------------
  bySlug: publicProcedure
    .input(z.object({ slug: z.string() }))
    .query(async ({ input, ctx }) => {
      const album = await getAlbumBySlug(input.slug);
      assertAlbumPubliclyReadable(album, ctx.user?.role);

      await incrementAlbumView(album.id);

      const albumTags = await getTagsByAlbumId(album.id);
      const { total, preview } = await countPhotosByAlbumId(album.id);

      const { userIsVip, isAdminUser } = viewerFlags(ctx.user?.role);
      const bookmarkedByUser = ctx.user ? await isBookmarked(ctx.user.id, album.id) : false;
      const isVipLocked = !!album.isVip && !userIsVip && !isAdminUser;
      const lockedCount = isVipLocked ? Math.max(0, total - preview) : 0;

      // Fetch creator info if assigned
      let creatorName: string | null = null;
      let creatorSlug: string | null = null;
      if (album.creatorId) {
        const { getCreatorById } = await import("../db");
        const creator = await getCreatorById(album.creatorId);
        if (creator) { creatorName = creator.name; creatorSlug = creator.slug; }
      }

      return {
        album,
        photos: [],
        previewCount: isVipLocked ? preview : total,
        tags: albumTags,
        lockedCount,
        isVipLocked,
        totalPhotos: total,
        bookmarked: bookmarkedByUser,
        creatorName,
        creatorSlug,
      };
    }),

  // --- Public: List categories ------------------------------------------------
  categories: publicProcedure.query(() => listCategories()),

  // --- Public: List tags ------------------------------------------------------
  tags: publicProcedure.query(() => listTags()),

  // --- Public: Site stats (real counts for hero) ---
  publicStats: publicProcedure.query(async () => {
    const { getAnalytics } = await import("../db");
    const stats = await getAnalytics();
    if (!stats) return { totalPhotos: 0, totalAlbums: 0, totalUsers: 0 };
    return {
      totalPhotos: stats.totalPhotos ?? 0,
      totalAlbums: stats.totalAlbums ?? 0,
      totalUsers: stats.totalUsers ?? 0,
    };
  }),

  // --- Admin: Create album ----------------------------------------------------
  create: protectedProcedure
    .input(
      z.object({
        title: z.string().min(1).max(256),
        description: z.string().optional(),
        categoryId: z.number().optional(),
        isVip: z.boolean().default(false),
        freePreviewCount: z.number().min(0).max(20).default(10),
        cosplayer: z.string().optional(),
        character: z.string().optional(),
        series: z.string().optional(),
        tagNames: z.array(z.string()).default([]),
        status: z.enum(["draft", "published", "archived"]).default("draft"),
      })
    )
    .mutation(async ({ input, ctx }) => {
      if (!isAdmin(ctx.user.role)) {
        throw new TRPCError({ code: "FORBIDDEN" });
      }

      const slug = slugify(input.title) + "-" + Date.now().toString(36);
      const album = await createAlbum({
        title: input.title,
        slug,
        description: input.description,
        categoryId: input.categoryId,
        isVip: input.isVip,
        freePreviewCount: input.freePreviewCount,
        cosplayer: input.cosplayer,
        character: input.character,
        series: input.series,
        status: input.status,
        publishStatus: input.status === "published" ? "published" : "draft",
        createdBy: ctx.user.id,
      });

      // Handle tags
      if (input.tagNames.length > 0) {
        const tagIds = await Promise.all(
          input.tagNames.map((name) => upsertTag(name, slugify(name)).then((t) => t!.id))
        );
        await setAlbumTags(album!.id, tagIds);
      }

      return album;
    }),

  // --- Admin: Update album ----------------------------------------------------
  update: protectedProcedure
    .input(
      z.object({
        id: z.number(),
        title: z.string().min(1).max(256).optional(),
        description: z.string().optional(),
        categoryId: z.number().optional(),
        isVip: z.boolean().optional(),
        freePreviewCount: z.number().min(0).max(20).optional(),
        cosplayer: z.string().optional(),
        character: z.string().optional(),
        series: z.string().optional(),
        tagNames: z.array(z.string()).optional(),
        status: z.enum(["draft", "published", "archived"]).optional(),
        seoTitle: z.string().optional(),
        seoDescription: z.string().optional(),
        seoKeywords: z.string().optional(),
        coverUrl: z.string().optional(),
        creatorId: z.number().nullable().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      if (!isAdmin(ctx.user.role)) {
        throw new TRPCError({ code: "FORBIDDEN" });
      }

      const { id, tagNames, ...data } = input;

      const publishSync =
        data.status === "published"
          ? { publishStatus: "published" as const }
          : data.status === "draft" || data.status === "archived"
            ? { publishStatus: "draft" as const }
            : {};

      // Auto-sync cosplayer field with creator name
      if (data.creatorId !== undefined) {
        if (data.creatorId) {
          // Assign creator: set cosplayer = creator.name if not already set
          const { getCreatorById } = await import("../db");
          const creator = await getCreatorById(data.creatorId);
          if (creator) {
            const currentAlbum = await getAlbumById(id);
            if (!currentAlbum?.cosplayer) {
              data.cosplayer = creator.name;
            }
          }
        } else {
          // Remove creator: clear cosplayer if it matches creator name
          const currentAlbum = await getAlbumById(id);
          if (currentAlbum?.creatorId) {
            const { getCreatorById } = await import("../db");
            const oldCreator = await getCreatorById(currentAlbum.creatorId);
            if (oldCreator && currentAlbum.cosplayer === oldCreator.name) {
              data.cosplayer = "";
            }
          }
        }
      }

      await updateAlbum(id, { ...data, ...publishSync });

      if (tagNames !== undefined) {
        const tagIds = await Promise.all(
          tagNames.map((name) => upsertTag(name, slugify(name)).then((t) => t!.id))
        );
        await setAlbumTags(id, tagIds);
      }

      // Update free preview photos if freePreviewCount changed
      if (data.freePreviewCount !== undefined) {
        await setFreePreviewPhotos(id, data.freePreviewCount);
      }

      return { success: true };
    }),

  // --- Admin: Delete album ----------------------------------------------------
  delete: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input, ctx }) => {
      if (!isAdmin(ctx.user.role)) {
        throw new TRPCError({ code: "FORBIDDEN" });
      }
      await deleteAlbum(input.id);
      return { success: true };
    }),

  // --- Admin: List all albums (including drafts) ------------------------------
  adminList: protectedProcedure
    .input(
      z.object({
        page: z.number().min(1).default(1),
        limit: z.number().min(1).max(100).default(20),
        search: z.string().optional(),
        status: z.enum(["draft", "published", "archived"]).optional(),
        isVip: z.boolean().optional(),
        categoryId: z.number().optional(),
        tagSlug: z.string().optional(),
      })
    )
    .query(async ({ input, ctx }) => {
      if (!isAdmin(ctx.user.role)) {
        throw new TRPCError({ code: "FORBIDDEN" });
      }
      return listAlbums({ ...input, excludeProcessing: true });
    }),

  // --- Public: Related albums --------------------------------------------------
  related: publicProcedure
    .input(z.object({ albumId: z.number(), limit: z.number().min(1).max(12).default(6) }))
    .query(async ({ input }) => {
      // Get tags of the current album
      const albumTagList = await getTagsByAlbumId(input.albumId);
      const tagIds = albumTagList.map((t) => t.id);

      // Get the album itself to know its category
      const album = await getAlbumById(input.albumId);
      if (!album) return [];

      // Find albums sharing tags or same category, excluding current
      const opts: Parameters<typeof listAlbums>[0] = {
        page: 1,
        limit: input.limit + 1,
        status: "published",
        sortBy: "popular",
      };
      if (tagIds.length > 0) opts.tagIds = tagIds;
      else if (album.categoryId) opts.categoryId = album.categoryId;

      const result = await listAlbums(opts);
      // Exclude the current album
      return result.items.filter((a) => a.id !== input.albumId).slice(0, input.limit);
    }),

  // --- Admin: Get album by ID (for editor) --------------------------------------
  byId: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input, ctx }) => {
      if (!isAdmin(ctx.user.role)) throw new TRPCError({ code: "FORBIDDEN" });
      const album = await getAlbumById(input.id);
      if (!album) throw new TRPCError({ code: "NOT_FOUND" });
      const tags = await getTagsByAlbumId(input.id);
      // Fetch creator info if assigned
      let creatorName: string | null = null;
      let creatorSlug: string | null = null;
      if (album.creatorId) {
        const { getCreatorById } = await import("../db");
        const creator = await getCreatorById(album.creatorId);
        if (creator) { creatorName = creator.name; creatorSlug = creator.slug; }
      }
      return { ...album, tags, creatorName, creatorSlug };
    }),

  // --- Admin: Sync isFreePreview flags for all albums -------------------------
  syncAllFreePreview: protectedProcedure
    .mutation(async ({ ctx }) => {
      if (!isAdmin(ctx.user.role)) {
        throw new TRPCError({ code: "FORBIDDEN" });
      }
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const allAlbums = await db
        .select({ id: albumsTable.id, freePreviewCount: albumsTable.freePreviewCount })
        .from(albumsTable);
      for (const album of allAlbums) {
        await setFreePreviewPhotos(album.id, album.freePreviewCount);
      }
      return { updated: allAlbums.length };
    }),

  // --- Admin: Generate SEO metadata ------------------------------------------
  generateSeo: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input, ctx }) => {
      if (!isAdmin(ctx.user.role)) {
        throw new TRPCError({ code: "FORBIDDEN" });
      }
      const album = await getAlbumById(input.id);
      if (!album) throw new TRPCError({ code: "NOT_FOUND" });

      const tags = await getTagsByAlbumId(input.id);
      const tagNames = tags.map((t) => t.name).join(", ");

      const seoTitle = `${album.title}${album.cosplayer ? ` by ${album.cosplayer}` : ""} - Yukvix`;
      const seoDescription = `${album.description || `Explore ${album.photoCount} stunning photos`} ${
        album.character ? `featuring ${album.character}` : ""
      } ${album.series ? `from ${album.series}` : ""}`.trim();
      const seoKeywords = [
        "cosplay",
        album.cosplayer,
        album.character,
        album.series,
        tagNames,
        "cosplay gallery",
        "premium cosplay",
      ]
        .filter(Boolean)
        .join(", ");

      await updateAlbum(input.id, { seoTitle, seoDescription, seoKeywords });
      return { seoTitle, seoDescription, seoKeywords };
    }),

  // --- Public: Get album meta (noindex for draft/unreviewed) -----------------
  // V4.17: Only published albums (publishStatus='published') are indexable.
  // Draft/processing/ready_for_review albums get noindex=true.
  getAlbumMeta: publicProcedure
    .input(z.object({ slug: z.string() }))
    .query(async ({ input }) => {
      const album = await getAlbumBySlug(input.slug);
      if (!album) throw new TRPCError({ code: "NOT_FOUND" });
      return {
        id: album.id,
        title: album.title,
        slug: album.slug,
        seoTitle: album.seoTitle,
        seoDescription: album.seoDescription,
        focusKeyword: album.focusKeyword,
        canonicalUrl: album.canonicalUrl,
        ogImage: album.ogImage,
        publishStatus: album.publishStatus,
        // V4.17: noindex=true for any album not yet admin-approved
        noindex: album.publishStatus !== "published",
      };
    }),
});
