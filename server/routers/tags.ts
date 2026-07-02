import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { protectedProcedure, publicProcedure, router } from "../_core/trpc";
import {
  deleteTag,
  getTagBySlug,
  listAlbums,
  listTagsWithCount,
  mergeTag,
  updateTag,
  upsertTag,
} from "../db";
import { isAdmin, isVipOrAdmin } from '@shared/const';

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .trim();
}

export const tagsRouter = router({
  // --- Public: get tag by slug + albums --------------------------------------
  bySlug: publicProcedure
    .input(z.object({
      slug: z.string(),
      page: z.number().min(1).default(1),
      limit: z.number().min(1).max(50).default(20),
      sortBy: z.enum(["newest", "oldest", "popular"]).default("newest"),
    }))
    .query(async ({ input }) => {
      const tag = await getTagBySlug(input.slug);
      if (!tag) throw new TRPCError({ code: "NOT_FOUND", message: "Tag not found" });

      const albumsResult = await listAlbums({
        page: input.page,
        limit: input.limit,
        status: "published",
        tagIds: [tag.id],
        sortBy: input.sortBy,
      });

      return { tag, albums: albumsResult.items, total: albumsResult.total };
    }),

  // --- Public: list tags with album count ------------------------------------
  listWithCount: publicProcedure
    .input(z.object({
      search: z.string().optional(),
      sortBy: z.enum(["popular", "name", "newest"]).default("popular"),
      minAlbums: z.number().min(0).default(0),
    }).optional())
    .query(({ input }) => listTagsWithCount(input ?? {})),

  // --- Admin: list tags with count --------------------------------------------
  adminList: protectedProcedure
    .query(async ({ ctx }) => {
      if (!isAdmin(ctx.user.role)) throw new TRPCError({ code: "FORBIDDEN" });
      return listTagsWithCount();
    }),

  // --- Admin: create tag ------------------------------------------------------
  adminCreate: protectedProcedure
    .input(z.object({
      name: z.string().min(1).max(64),
      slug: z.string().optional(),
      seoTitle: z.string().optional(),
      seoDescription: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      if (!isAdmin(ctx.user.role)) throw new TRPCError({ code: "FORBIDDEN" });
      const slug = input.slug || slugify(input.name);
      const tag = await upsertTag(input.name, slug);
      if (tag && (input.seoTitle || input.seoDescription)) {
        await updateTag(tag.id, { seoTitle: input.seoTitle, seoDescription: input.seoDescription });
      }
      return tag;
    }),

  // --- Admin: update tag ------------------------------------------------------
  adminUpdate: protectedProcedure
    .input(z.object({
      id: z.number(),
      name: z.string().min(1).max(64).optional(),
      slug: z.string().optional(),
      seoTitle: z.string().optional(),
      seoDescription: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      if (!isAdmin(ctx.user.role)) throw new TRPCError({ code: "FORBIDDEN" });
      const { id, ...data } = input;
      await updateTag(id, data);
      return { success: true };
    }),

  // --- Admin: delete tag ------------------------------------------------------
  adminDelete: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input, ctx }) => {
      if (!isAdmin(ctx.user.role)) throw new TRPCError({ code: "FORBIDDEN" });
      await deleteTag(input.id);
      return { success: true };
    }),

  // --- Admin: merge tag (sourceId → targetId) ---------------------------------
  adminMerge: protectedProcedure
    .input(z.object({ sourceId: z.number(), targetId: z.number() }))
    .mutation(async ({ input, ctx }) => {
      if (!isAdmin(ctx.user.role)) throw new TRPCError({ code: "FORBIDDEN" });
      if (input.sourceId === input.targetId) throw new TRPCError({ code: "BAD_REQUEST", message: "Cannot merge a tag with itself" });
      await mergeTag(input.sourceId, input.targetId);
      return { success: true };
    }),
});
