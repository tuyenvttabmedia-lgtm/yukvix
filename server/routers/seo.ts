import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { buildStoredScheduleConfig, normalizeScheduleConfig } from "../services/schedule-config";
import { router, protectedProcedure, publicProcedure } from "../_core/trpc";
import { isAdmin } from "@shared/const";
import { invalidateSeoSettingsCache } from "../_core/vite.js";
import {
  auditTagSeoGaps,
  cancelTagSeoJob,
  getActiveTagSeoJob,
  getTagSeoJobSummary,
  listTagsMissingSeo,
  startTagSeoBulkJob,
} from "../services/tag-seo-bulk.js";

import { callAi } from "../services/ai-provider";
// ─── In-memory Bulk Job Store ─────────────────────────────────────────────────
// Tracks one active bulk job at a time (albums or creators).
// Resets on server restart — acceptable for admin-only background tasks.

export type BulkJobItem = {
  id: number;
  name: string;
  status: "pending" | "processing" | "done" | "failed";
  error?: string;
  // SEO fields
  focusKeyword?: string;
  metaTitle?: string;
  metaDescription?: string;
  // Tag fields
  suggestedTags?: string[]; // tags suggested by AI
  appliedTagCount?: number; // how many tags were saved
};

export type BulkJob = {
  id: string;
  type: "albums" | "creators" | "tags";
  items: BulkJobItem[];
  cancelled: boolean;
  startedAt: number;
  finishedAt?: number;
};

// Single global slot — admin-only, no concurrency needed
let activeJob: BulkJob | null = null;

function getJobSummary(job: BulkJob) {
  const total = job.items.length;
  const done = job.items.filter((i) => i.status === "done").length;
  const failed = job.items.filter((i) => i.status === "failed").length;
  const processing = job.items.filter((i) => i.status === "processing").length;
  const pending = job.items.filter((i) => i.status === "pending").length;
  const finished = !job.cancelled && pending === 0 && processing === 0;
  return { total, done, failed, processing, pending, finished, cancelled: job.cancelled };
}

// ─── LLM helpers (shared with suggestAlbum / suggestCreator) ─────────────────

async function generateAlbumSeo(album: {
  id: number;
  title: string;
  cosplayer?: string | null;
  character?: string | null;
  series?: string | null;
  isVip?: boolean;
}, tagNames: string) {
  const contextParts: string[] = [];
  if (album.title) contextParts.push(`Title: ${album.title}`);
  if (album.cosplayer) contextParts.push(`Cosplayer: ${album.cosplayer}`);
  if (album.character) contextParts.push(`Character: ${album.character}`);
  if (album.series) contextParts.push(`Series/Franchise: ${album.series}`);
  if (tagNames) contextParts.push(`Tags: ${tagNames}`);
  if (album.isVip) contextParts.push(`Type: VIP/Premium content`);

  const result = await callAi({
    messages: [
      {
        role: "system",
        content: `You are an SEO expert specializing in cosplay and anime content. 
Generate SEO metadata for a cosplay photo album. 
Rules:
- focusKeyword: 2-4 words, most important search term (e.g. "Rem Re:Zero cosplay")
- metaTitle: 50-60 characters, include character/cosplayer name and "cosplay"
- metaDescription: 140-160 characters, engaging, include character, series, and call-to-action
- Use English for all output
- Do NOT include the word "premium" or "VIP" in public-facing SEO text
- Return valid JSON only`,
      },
      {
        role: "user",
        content: `Generate SEO metadata for this cosplay album:\n\n${contextParts.join("\n")}`,
      },
    ],
    responseFormat: {
      type: "json_schema",
      json_schema: {
        name: "album_seo",
        strict: true,
        schema: {
          type: "object",
          properties: {
            focusKeyword: { type: "string", description: "Primary SEO keyword phrase (2-4 words)" },
            metaTitle: { type: "string", description: "SEO page title (50-60 chars)" },
            metaDescription: { type: "string", description: "SEO meta description (140-160 chars)" },
          },
          required: ["focusKeyword", "metaTitle", "metaDescription"],
          additionalProperties: false,
        },
      },
    },
  });

  const raw = result.content;
  if (!raw) throw new Error("Empty AI response");
  return JSON.parse(raw) as { focusKeyword: string; metaTitle: string; metaDescription: string };
}

async function generateCreatorSeo(creator: {
  id: number;
  name: string;
  bio?: string | null;
  country?: string | null;
}) {
  const contextParts: string[] = [];
  if (creator.name) contextParts.push(`Name: ${creator.name}`);
  if (creator.bio) contextParts.push(`Bio: ${creator.bio}`);
  if (creator.country) contextParts.push(`Country: ${creator.country}`);

  const result = await callAi({
    messages: [
      {
        role: "system",
        content: `You are an SEO expert specializing in cosplay content creators.
Generate SEO metadata for a cosplay creator/model profile page.
Rules:
- focusKeyword: 2-4 words, most important search term (e.g. "Sakura cosplay model")
- metaTitle: 50-60 characters, include creator name and "cosplay"
- metaDescription: 140-160 characters, engaging description of the creator
- Use English for all output
- Return valid JSON only`,
      },
      {
        role: "user",
        content: `Generate SEO metadata for this cosplay creator:\n\n${contextParts.join("\n")}`,
      },
    ],
    responseFormat: {
      type: "json_schema",
      json_schema: {
        name: "creator_seo",
        strict: true,
        schema: {
          type: "object",
          properties: {
            focusKeyword: { type: "string", description: "Primary SEO keyword phrase (2-4 words)" },
            metaTitle: { type: "string", description: "SEO page title (50-60 chars)" },
            metaDescription: { type: "string", description: "SEO meta description (140-160 chars)" },
          },
          required: ["focusKeyword", "metaTitle", "metaDescription"],
          additionalProperties: false,
        },
      },
    },
  });

  const raw = result.content;
  if (!raw) throw new Error("Empty AI response");
  return JSON.parse(raw) as { focusKeyword: string; metaTitle: string; metaDescription: string };
}

// ─── SEO Settings Router ──────────────────────────────────────────────────────
export const seoRouter = router({
  // --- Public: get SEO settings (GTM, GSC meta) --------------------------------
  getSettings: publicProcedure.query(async () => {
    const { getDb } = await import("../db");
    const { seoSettings } = await import("../../drizzle/schema");
    const db = await getDb();
    if (!db) return null;
    const rows = await db.select().from(seoSettings).limit(1);
    return rows[0] ?? null;
  }),

  // --- Admin: update SEO settings (GTM + GSC) ----------------------------------
  updateSettings: protectedProcedure
    .input(
      z.object({
        gtmContainerId: z.string().max(50).optional().nullable(),
        gscVerificationMeta: z.string().max(500).optional().nullable(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      if (!isAdmin(ctx.user.role)) throw new TRPCError({ code: "FORBIDDEN" });
      const { getDb } = await import("../db");
      const { seoSettings } = await import("../../drizzle/schema");
      const { eq } = await import("drizzle-orm");
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const existing = await db.select({ id: seoSettings.id }).from(seoSettings).where(eq(seoSettings.id, 1)).limit(1);
      if (existing.length > 0) {
        await db.update(seoSettings).set({
          gtmContainerId: input.gtmContainerId ?? null,
          gscVerificationMeta: input.gscVerificationMeta ?? null,
        }).where(eq(seoSettings.id, 1));
      } else {
        await db.insert(seoSettings).values({
          id: 1,
          gtmContainerId: input.gtmContainerId ?? null,
          gscVerificationMeta: input.gscVerificationMeta ?? null,
        });
      }
      // Invalidate server-side HTML cache so next page load has fresh meta tags
      invalidateSeoSettingsCache();
      return { success: true };
    }),

  // --- Admin: AI suggest SEO for Album ----------------------------------------
  suggestAlbum: protectedProcedure
    .input(z.object({ albumId: z.number().int().positive() }))
    .mutation(async ({ input, ctx }) => {
      if (!isAdmin(ctx.user.role)) throw new TRPCError({ code: "FORBIDDEN" });

      const { getAlbumById, getTagsByAlbumId } = await import("../db");

      const album = await getAlbumById(input.albumId);
      if (!album) throw new TRPCError({ code: "NOT_FOUND", message: "Album not found" });

      const albumTags = await getTagsByAlbumId(input.albumId);
      const tagNames = albumTags.map((t) => t.name).join(", ");

      try {
        const result = await generateAlbumSeo(album, tagNames);
        return {
          focusKeyword: result.focusKeyword ?? "",
          metaTitle: result.metaTitle ?? "",
          metaDescription: result.metaDescription ?? "",
        };
      } catch {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Failed to generate SEO" });
      }
    }),

  // --- Admin: AI suggest SEO for Creator --------------------------------------
  suggestCreator: protectedProcedure
    .input(z.object({ creatorId: z.number().int().positive() }))
    .mutation(async ({ input, ctx }) => {
      if (!isAdmin(ctx.user.role)) throw new TRPCError({ code: "FORBIDDEN" });

      const { getCreatorById } = await import("../db");

      const creator = await getCreatorById(input.creatorId);
      if (!creator) throw new TRPCError({ code: "NOT_FOUND", message: "Creator not found" });

      try {
        const result = await generateCreatorSeo(creator);
        return {
          focusKeyword: result.focusKeyword ?? "",
          metaTitle: result.metaTitle ?? "",
          metaDescription: result.metaDescription ?? "",
        };
      } catch {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Failed to generate SEO" });
      }
    }),

  // --- Admin: AI suggest tags from album images (vision) ----------------------
  suggestTagsFromImages: protectedProcedure
    .input(z.object({ albumId: z.number().int().positive() }))
    .mutation(async ({ input, ctx }) => {
      if (!isAdmin(ctx.user.role)) throw new TRPCError({ code: "FORBIDDEN" });

      const { getAlbumById, getTagsByAlbumId, getPhotosByAlbumId } = await import("../db");
      const { listTags } = await import("../db");

      const album = await getAlbumById(input.albumId);
      if (!album) throw new TRPCError({ code: "NOT_FOUND", message: "Album not found" });

      // Get existing tags of this album
      const existingTags = await getTagsByAlbumId(input.albumId);
      const existingTagNames = existingTags.map((t) => t.name.toLowerCase());

      // Get all tags in DB for prioritization
      const allDbTags = await listTags();
      const allDbTagNames = allDbTags.map((t) => t.name);

      // Collect sample images: coverUrl + up to 3 first photos
      const sampleImageUrls: string[] = [];
      if (album.coverUrl) sampleImageUrls.push(album.coverUrl);

      const albumPhotos = await getPhotosByAlbumId(input.albumId);
      for (const photo of albumPhotos.slice(0, 4)) {
        const url = photo.thumbUrl || photo.webpUrl || photo.originalUrl;
        if (url && !sampleImageUrls.includes(url)) {
          sampleImageUrls.push(url);
          if (sampleImageUrls.length >= 4) break;
        }
      }

      if (sampleImageUrls.length === 0) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Album has no images to analyze" });
      }

      // Build text context
      const contextParts: string[] = [];
      if (album.title) contextParts.push(`Album title: ${album.title}`);
      if (album.cosplayer) contextParts.push(`Cosplayer: ${album.cosplayer}`);
      if (album.character) contextParts.push(`Character: ${album.character}`);
      if (album.series) contextParts.push(`Series/Franchise: ${album.series}`);
      if (existingTagNames.length > 0) contextParts.push(`Existing tags: ${existingTagNames.join(", ")}`);
      if (allDbTagNames.length > 0) contextParts.push(`Preferred tags from our database (use these if relevant): ${allDbTagNames.slice(0, 60).join(", ")}`);

      // Build multi-part message with images + text
      const userContent: Array<{ type: string; text?: string; image_url?: { url: string; detail: string } }> = [
        {
          type: "text",
          text: `Analyze these cosplay photos and suggest 10-15 relevant tags.\n\nContext:\n${contextParts.join("\n")}\n\nInstructions:\n- Suggest tags for: character name, series/franchise, cosplayer style, costume elements, setting/background, mood/aesthetic\n- Prefer tags that already exist in our database when relevant\n- Do NOT include tags already in existing tags\n- Use lowercase, 1-3 words per tag\n- Return JSON only`,
        },
        ...sampleImageUrls.map((url) => ({
          type: "image_url" as const,
          image_url: { url, detail: "low" as const },
        })),
      ];

      try {
        const response = await callAi({
          messages: [
            {
              role: "system",
              content: `You are a cosplay content tagging expert. Analyze cosplay photos and generate relevant tags for SEO and content discovery. Return only valid JSON.`,
            },
            {
              role: "user",
              content: userContent as any,
            },
          ],
          responseFormat: {
            type: "json_schema",
            json_schema: {
              name: "tag_suggestions",
              strict: true,
              schema: {
                type: "object",
                properties: {
                  tags: {
                    type: "array",
                    items: { type: "string" },
                    description: "Array of 10-15 suggested tag names (lowercase, 1-3 words each)",
                  },
                  reasoning: {
                    type: "string",
                    description: "Brief explanation of why these tags were chosen",
                  },
                },
                required: ["tags", "reasoning"],
                additionalProperties: false,
              },
            },
          },
        });
        const raw = response.content;
        if (!raw || typeof raw !== "string") throw new Error("Empty AI response");
        const parsed = JSON.parse(raw) as { tags: string[]; reasoning: string };

        // Filter out existing tags and normalize
        const suggestions = parsed.tags
          .map((t: string) => t.toLowerCase().trim())
          .filter((t: string) => t.length > 0 && !existingTagNames.includes(t))
          .slice(0, 15);

        // Mark which suggestions already exist in DB
        const dbTagSet = new Set(allDbTagNames.map((n) => n.toLowerCase()));
        const suggestionsWithMeta = suggestions.map((tag: string) => ({
          name: tag,
          existsInDb: dbTagSet.has(tag),
        }));

        return {
          suggestions: suggestionsWithMeta,
          reasoning: parsed.reasoning ?? "",
          imagesAnalyzed: sampleImageUrls.length,
        };
      } catch {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Failed to analyze images" });
      }
    }),

  // ─── Bulk Generate SEO ───────────────────────────────────────────────────────

  // --- Admin: get count of items missing SEO (for display before starting) ----
  getBulkStats: protectedProcedure
    .input(z.object({ categoryId: z.number().optional(), tagId: z.number().optional() }).optional())
    .query(async ({ ctx, input }) => {
    if (!isAdmin(ctx.user.role)) throw new TRPCError({ code: "FORBIDDEN" });
    const { getDb } = await import("../db");
    const { albums, creators, albumTags } = await import("../../drizzle/schema");
    const { isNull, or, count, eq, and, inArray } = await import("drizzle-orm");
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

    // Build album filter conditions
    // Count albums missing tags (no entries in album_tags)
    const { albumTags: albumTagsTable } = await import("../../drizzle/schema");
    const { notExists } = await import("drizzle-orm");
    const taggedSubquery = db
      .select({ albumId: albumTagsTable.albumId })
      .from(albumTagsTable)
      .where(eq(albumTagsTable.albumId, albums.id));
    const albumsMissingTagsRows = await db
      .select({ count: count() })
      .from(albums)
      .where(notExists(taggedSubquery));
    const albumsMissingTags = Array.isArray(albumsMissingTagsRows) ? albumsMissingTagsRows[0] : undefined;
    const albumsTotalForTagsRows = await db.select({ count: count() }).from(albums);
    const albumsTotalForTags = Array.isArray(albumsTotalForTagsRows) ? albumsTotalForTagsRows[0] : undefined;

    const missingSeoCond = or(isNull(albums.focusKeyword), isNull(albums.seoTitle), isNull(albums.seoDescription));
    let albumWhere = missingSeoCond;
    let albumTotalWhere = undefined as ReturnType<typeof eq> | undefined;

    if (input?.categoryId) {
      albumWhere = and(missingSeoCond, eq(albums.categoryId, input.categoryId));
      albumTotalWhere = eq(albums.categoryId, input.categoryId);
    }
    if (input?.tagId) {
      // Get album IDs with this tag
      const taggedAlbumIds = await db
        .select({ albumId: albumTags.albumId })
        .from(albumTags)
        .where(eq(albumTags.tagId, input.tagId));
      const ids = taggedAlbumIds.map((r) => r.albumId);
      if (ids.length === 0) {
        const [albumTotal] = albumTotalWhere
          ? await db.select({ count: count() }).from(albums).where(albumTotalWhere)
          : await db.select({ count: count() }).from(albums);
        return {
          albums: { missing: 0, total: albumTotal?.count ?? 0 },
          creators: { missing: 0, total: 0 },
        };
      }
      const tagCond = inArray(albums.id, ids);
      albumWhere = and(missingSeoCond, tagCond);
      albumTotalWhere = tagCond;
    }

    const albumMissingRows = await db.select({ count: count() }).from(albums).where(albumWhere);
    const albumMissing = Array.isArray(albumMissingRows) ? albumMissingRows[0] : undefined;
    const albumTotalRaw = albumTotalWhere
      ? await db.select({ count: count() }).from(albums).where(albumTotalWhere)
      : await db.select({ count: count() }).from(albums);
    const albumTotal = Array.isArray(albumTotalRaw) ? albumTotalRaw[0] : undefined;

    // Creators are not filtered by category/tag
    const creatorMissingRows = await db
      .select({ count: count() })
      .from(creators)
      .where(or(isNull(creators.focusKeyword), isNull(creators.seoTitle), isNull(creators.seoDescription)));
    const creatorMissing = Array.isArray(creatorMissingRows) ? creatorMissingRows[0] : undefined;
    const creatorTotalRows = await db.select({ count: count() }).from(creators);
    const creatorTotal = Array.isArray(creatorTotalRows) ? creatorTotalRows[0] : undefined;

    return {
      albums: { missing: albumMissing?.count ?? 0, total: albumTotal?.count ?? 0 },
      creators: { missing: creatorMissing?.count ?? 0, total: creatorTotal?.count ?? 0 },
      tags: { missing: albumsMissingTags?.count ?? 0, total: albumsTotalForTags?.count ?? 0 },
    };
  }),

  // --- Admin: start bulk SEO generation for albums or creators ----------------
  startBulkJob: protectedProcedure
    .input(z.object({
      type: z.enum(["albums", "creators", "tags"]),
      forceAll: z.boolean().optional().default(false),
      categoryId: z.number().optional(),
      tagId: z.number().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      if (!isAdmin(ctx.user.role)) throw new TRPCError({ code: "FORBIDDEN" });

      // Prevent starting a new job if one is already running
      if (activeJob && !activeJob.cancelled) {
        const summary = getJobSummary(activeJob);
        if (!summary.finished) {
          throw new TRPCError({ code: "CONFLICT", message: "A bulk job is already running. Cancel it first." });
        }
      }

      const { getDb } = await import("../db");
      const { albums, creators, albumTags } = await import("../../drizzle/schema");
      const { isNull, or, eq, and, inArray } = await import("drizzle-orm");
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      let items: BulkJobItem[] = [];

      if (input.type === "albums") {
        const missingCond = or(isNull(albums.focusKeyword), isNull(albums.seoTitle), isNull(albums.seoDescription));

        // Build filter condition
        let filterCond = input.forceAll ? undefined : missingCond;

        if (input.categoryId) {
          const catCond = eq(albums.categoryId, input.categoryId);
          filterCond = filterCond ? and(filterCond, catCond) : catCond;
        }
        if (input.tagId) {
          const taggedRows = await db
            .select({ albumId: albumTags.albumId })
            .from(albumTags)
            .where(eq(albumTags.tagId, input.tagId));
          const ids = taggedRows.map((r) => r.albumId);
          if (ids.length === 0) {
            return { jobId: null, total: 0, message: "No albums found with this tag." };
          }
          const tagCond = inArray(albums.id, ids);
          filterCond = filterCond ? and(filterCond, tagCond) : tagCond;
        }

        const query = db
          .select({ id: albums.id, title: albums.title, cosplayer: albums.cosplayer, character: albums.character, series: albums.series, isVip: albums.isVip })
          .from(albums);
        const rows = filterCond ? await query.where(filterCond) : await query;
        items = rows.map((r) => ({
          id: r.id,
          name: r.title,
          status: "pending" as const,
        }));
      } else {
        const query = db
          .select({ id: creators.id, name: creators.name, bio: creators.bio, country: creators.country })
          .from(creators);
        const rows = input.forceAll
          ? await query
          : await query.where(or(isNull(creators.focusKeyword), isNull(creators.seoTitle), isNull(creators.seoDescription)));
        items = rows.map((r) => ({
          id: r.id,
          name: r.name,
          status: "pending" as const,
        }));
      }

      if (input.type === "tags") {
        // Albums with no tags at all
        const { albumTags: albumTagsTable } = await import("../../drizzle/schema");
        const { notExists } = await import("drizzle-orm");
        const taggedSubquery = db
          .select({ albumId: albumTagsTable.albumId })
          .from(albumTagsTable)
          .where(eq(albumTagsTable.albumId, albums.id));

        let tagFilterCond = input.forceAll ? undefined : notExists(taggedSubquery);

        if (input.categoryId) {
          const catCond = eq(albums.categoryId, input.categoryId);
          tagFilterCond = tagFilterCond ? and(tagFilterCond, catCond) : catCond;
        }

        const tagQuery = db
          .select({ id: albums.id, title: albums.title, cosplayer: albums.cosplayer, character: albums.character, series: albums.series, coverUrl: albums.coverUrl })
          .from(albums);
        const tagRows = tagFilterCond ? await tagQuery.where(tagFilterCond) : await tagQuery;
        items = tagRows.map((r) => ({
          id: r.id,
          name: r.title,
          status: "pending" as const,
        }));
      }

      if (items.length === 0) {
        return { jobId: null, total: 0, message: input.type === "tags" ? "All albums already have tags." : "All items already have SEO data." };
      }

      const jobId = `bulk-${input.type}-${Date.now()}`;
      activeJob = {
        id: jobId,
        type: input.type,
        items,
        cancelled: false,
        startedAt: Date.now(),
      };

      // Run the job asynchronously (fire-and-forget, progress tracked in memory)
      if (input.type === "tags") {
        void runBulkTagsJob(activeJob);
      } else {
        void runBulkJob(activeJob);
      }

      const jobLabel = input.type === "tags" ? "tag generation" : "SEO generation";
      return { jobId, total: items.length, message: `Started bulk ${jobLabel} for ${items.length} albums.` };
    }),

  // --- Admin: get bulk job status (polling) ------------------------------------
  getBulkJobStatus: protectedProcedure.query(({ ctx }) => {
    if (!isAdmin(ctx.user.role)) throw new TRPCError({ code: "FORBIDDEN" });
    if (!activeJob) return null;

    const summary = getJobSummary(activeJob);
    return {
      jobId: activeJob.id,
      type: activeJob.type,
      ...summary,
      items: activeJob.items.map((item) => ({
        id: item.id,
        name: item.name,
        status: item.status,
        error: item.error,
        focusKeyword: item.focusKeyword,
        metaTitle: item.metaTitle,
        metaDescription: item.metaDescription,
        suggestedTags: item.suggestedTags,
        appliedTagCount: item.appliedTagCount,
      })),
    };
  }),

  // --- Admin: cancel active bulk job -------------------------------------------
  cancelBulkJob: protectedProcedure.mutation(({ ctx }) => {
    if (!isAdmin(ctx.user.role)) throw new TRPCError({ code: "FORBIDDEN" });
    if (!activeJob) throw new TRPCError({ code: "NOT_FOUND", message: "No active job to cancel." });
    activeJob.cancelled = true;
    return { success: true };
  }),

  // --- Admin: clear finished/cancelled job from memory -------------------------
  clearBulkJob: protectedProcedure.mutation(({ ctx }) => {
    if (!isAdmin(ctx.user.role)) throw new TRPCError({ code: "FORBIDDEN" });
    activeJob = null;
    return { success: true };
  }),

  // --- Admin: inline-edit SEO for a single item in the finished job result -----
  updateBulkItem: protectedProcedure
    .input(z.object({
      type: z.enum(["albums", "creators", "tags"]),
      id: z.number(),
      focusKeyword: z.string().optional(),
      metaTitle: z.string().optional(),
      metaDescription: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      if (!isAdmin(ctx.user.role)) throw new TRPCError({ code: "FORBIDDEN" });
      const { updateAlbum, updateCreator } = await import("../db");

      const payload = {
        ...(input.focusKeyword !== undefined && { focusKeyword: input.focusKeyword }),
        ...(input.metaTitle !== undefined && { seoTitle: input.metaTitle }),
        ...(input.metaDescription !== undefined && { seoDescription: input.metaDescription }),
      };

      if (input.type === "albums") {
        await updateAlbum(input.id, payload);
      } else {
        await updateCreator(input.id, payload);
      }

      // Also update in-memory job item if it exists
      if (activeJob) {
        const item = activeJob.items.find((i) => i.id === input.id);
        if (item) {
          if (input.focusKeyword !== undefined) item.focusKeyword = input.focusKeyword;
          if (input.metaTitle !== undefined) item.metaTitle = input.metaTitle;
          if (input.metaDescription !== undefined) item.metaDescription = input.metaDescription;
        }
      }

      return { success: true };
    }),

  // --- Admin: get auto-bulk-seo schedule config --------------------------------
  getAutoSeoConfig: protectedProcedure.query(async ({ ctx }) => {
    if (!isAdmin(ctx.user)) throw new TRPCError({ code: "FORBIDDEN" });
    const { getDb } = await import("../db");
    const { adminSettings } = await import("../../drizzle/schema");
    const { eq } = await import("drizzle-orm");
    const db = await getDb();
    const defaults = { enabled: false, cronHour: 2, maxAlbums: 20, maxCreators: 10, maxTags: 10, localHour: 9, cronHourUtc: 2, timezone: "Asia/Ho_Chi_Minh" };
    if (!db) return defaults;
    const rows = await db.select().from(adminSettings).where(eq(adminSettings.key, "auto_seo_config")).limit(1);
    if (!rows[0]) return defaults;
    try {
      const raw = JSON.parse(rows[0].value);
      const view = await normalizeScheduleConfig(
        { enabled: raw.enabled ?? false, cronHour: raw.cronHour, localHour: raw.localHour, timezone: raw.timezone, maxAlbums: raw.maxAlbums, maxCreators: raw.maxCreators, maxTags: raw.maxTags },
        { localHour: 9 }
      );
      return { enabled: view.enabled, localHour: view.localHour, cronHour: view.cronHourUtc, cronHourUtc: view.cronHourUtc, timezone: view.timezone, maxAlbums: raw.maxAlbums ?? 20, maxCreators: raw.maxCreators ?? 10, maxTags: raw.maxTags ?? 10 };
    } catch {
      return defaults;
    }
  }),

  // --- Admin: save auto-bulk-seo schedule config --------------------------------
  saveAutoSeoConfig: protectedProcedure
    .input(z.object({
      enabled: z.boolean(),
      localHour: z.number().int().min(0).max(23),
      maxAlbums: z.number().int().min(1).max(100),
      maxCreators: z.number().int().min(1).max(100),
      maxTags: z.number().int().min(1).max(100),
    }))
    .mutation(async ({ ctx, input }) => {
      if (!isAdmin(ctx.user)) throw new TRPCError({ code: "FORBIDDEN" });
      const { getDb } = await import("../db");
      const { adminSettings } = await import("../../drizzle/schema");
      const { eq } = await import("drizzle-orm");
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const stored = await buildStoredScheduleConfig(input);
      const value = JSON.stringify(stored);
      await db.insert(adminSettings).values({ key: "auto_seo_config", value })
        .onDuplicateKeyUpdate({ set: { value, updatedAt: new Date() } });
      return { success: true };
    }),

  // --- Admin: trigger auto-bulk-seo manually -----------------------------------
  runAutoSeoNow: protectedProcedure.mutation(async ({ ctx }) => {
    if (!isAdmin(ctx.user)) throw new TRPCError({ code: "FORBIDDEN" });
    const cronSecret = process.env.CRON_SECRET;
    if (!cronSecret) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "CRON_SECRET not configured" });
    // Call the scheduled endpoint internally
    const fetch = (await import("node-fetch")).default;
    const res = await fetch("http://localhost:" + (process.env.PORT || 3000) + "/api/scheduled/auto-bulk-seo", {
      method: "POST",
      headers: { "X-Cron-Secret": cronSecret, "Content-Type": "application/json", "x-manual-run": "1" },
      signal: AbortSignal.timeout(280000),
    });
    const data = await res.json() as any;
    return data;
  }),
  // --- Tag entity SEO audit (Phase C — tool only) ------------------------------
  getTagSeoAudit: protectedProcedure.query(async ({ ctx }) => {
    if (!isAdmin(ctx.user.role)) throw new TRPCError({ code: "FORBIDDEN" });
    return auditTagSeoGaps();
  }),

  startTagSeoBulk: protectedProcedure
    .input(z.object({ forceAll: z.boolean().optional() }).optional())
    .mutation(async ({ ctx, input }) => {
      if (!isAdmin(ctx.user.role)) throw new TRPCError({ code: "FORBIDDEN" });
      const active = getActiveTagSeoJob();
      if (active && !getTagSeoJobSummary(active).finished) {
        throw new TRPCError({ code: "CONFLICT", message: "A tag SEO bulk job is already running." });
      }
      const { getDb } = await import("../db.js");
      const { tags } = await import("../../drizzle/schema.js");
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      let rows;
      if (input?.forceAll) {
        rows = await db.select({ id: tags.id, name: tags.name, slug: tags.slug }).from(tags);
      } else {
        rows = await listTagsMissingSeo(500);
      }
      if (rows.length === 0) {
        return { jobId: null, total: 0, message: "All tags already have SEO title and description." };
      }
      const job = startTagSeoBulkJob(rows);
      if (!job) throw new TRPCError({ code: "CONFLICT", message: "Could not start job." });
      return { jobId: job.id, total: job.items.length, message: `Started tag SEO bulk for ${job.items.length} tags.` };
    }),

  getTagSeoBulkStatus: protectedProcedure.query(async ({ ctx }) => {
    if (!isAdmin(ctx.user.role)) throw new TRPCError({ code: "FORBIDDEN" });
    const job = getActiveTagSeoJob();
    if (!job) return null;
    return { id: job.id, ...getTagSeoJobSummary(job), items: job.items.slice(0, 50) };
  }),

  cancelTagSeoBulk: protectedProcedure.mutation(async ({ ctx }) => {
    if (!isAdmin(ctx.user.role)) throw new TRPCError({ code: "FORBIDDEN" });
    cancelTagSeoJob();
    return { success: true };
  }),


});

// ─── Async job runner ─────────────────────────────────────────────────────────

async function runBulkJob(job: BulkJob) {
  const { getDb, getTagsByAlbumId, updateAlbum, updateCreator } = await import("../db");
  const db = await getDb();
  if (!db) return;

  for (const item of job.items) {
    if (job.cancelled) break;

    item.status = "processing";

    try {
      if (job.type === "albums") {
        const { albums } = await import("../../drizzle/schema");
        const { eq } = await import("drizzle-orm");
        // Re-fetch album for full context
        const rows = await db
          .select({ id: albums.id, title: albums.title, cosplayer: albums.cosplayer, character: albums.character, series: albums.series, isVip: albums.isVip })
          .from(albums)
          .where(eq(albums.id, item.id))
          .limit(1);
        const album = rows[0];
        if (!album) throw new Error("Album not found");

        const albumTags = await getTagsByAlbumId(item.id);
        const tagNames = albumTags.map((t) => t.name).join(", ");

        const seo = await generateAlbumSeo(album, tagNames);

        // Save to DB
        await updateAlbum(item.id, {
          focusKeyword: seo.focusKeyword,
          seoTitle: seo.metaTitle,
          seoDescription: seo.metaDescription,
        });

        item.focusKeyword = seo.focusKeyword;
        item.metaTitle = seo.metaTitle;
        item.metaDescription = seo.metaDescription;
        item.status = "done";
      } else {
        const { creators } = await import("../../drizzle/schema");
        const { eq } = await import("drizzle-orm");
        const rows = await db
          .select({ id: creators.id, name: creators.name, bio: creators.bio, country: creators.country })
          .from(creators)
          .where(eq(creators.id, item.id))
          .limit(1);
        const creator = rows[0];
        if (!creator) throw new Error("Creator not found");

        const seo = await generateCreatorSeo(creator);

        await updateCreator(item.id, {
          focusKeyword: seo.focusKeyword,
          seoTitle: seo.metaTitle,
          seoDescription: seo.metaDescription,
        });

        item.focusKeyword = seo.focusKeyword;
        item.metaTitle = seo.metaTitle;
        item.metaDescription = seo.metaDescription;
        item.status = "done";
      }
    } catch (err: unknown) {
      item.status = "failed";
      item.error = err instanceof Error ? err.message : "Unknown error";
    }

    // Small delay to avoid hammering the LLM API
    await new Promise((resolve) => setTimeout(resolve, 300));
  }

  job.finishedAt = Date.now();
}

async function runBulkTagsJob(job: BulkJob) {
  const { getTagsByAlbumId, getPhotosByAlbumId, listTags } = await import("../db");
  const { getDb } = await import("../db");
  const db = await getDb();
  if (!db) return;

  // Load all DB tags once for the whole job
  const allDbTags = await listTags();
  const allDbTagNames = allDbTags.map((t) => t.name);
  const dbTagSet = new Set(allDbTagNames.map((n) => n.toLowerCase()));

  for (const item of job.items) {
    if (job.cancelled) break;
    item.status = "processing";

    try {
      const { albums } = await import("../../drizzle/schema");
      const { eq } = await import("drizzle-orm");
            // Re-fetch album
      const rows = await db
        .select({ id: albums.id, title: albums.title, cosplayer: albums.cosplayer, character: albums.character, series: albums.series, coverUrl: albums.coverUrl })
        .from(albums)
        .where(eq(albums.id, item.id))
        .limit(1);
      const album = rows[0];
      if (!album) throw new Error("Album not found");

      // Get existing tags
      const existingTags = await getTagsByAlbumId(item.id);
      const existingTagNames = existingTags.map((t) => t.name.toLowerCase());

      // Collect sample images
      const sampleImageUrls: string[] = [];
      if (album.coverUrl) sampleImageUrls.push(album.coverUrl);
      const albumPhotos = await getPhotosByAlbumId(item.id);
      for (const photo of albumPhotos.slice(0, 4)) {
        const url = photo.thumbUrl || photo.webpUrl || photo.originalUrl;
        if (url && !sampleImageUrls.includes(url)) {
          sampleImageUrls.push(url);
          if (sampleImageUrls.length >= 4) break;
        }
      }

      if (sampleImageUrls.length === 0) throw new Error("No images to analyze");

      // Build prompt
      const contextParts: string[] = [];
      if (album.title) contextParts.push(`Album title: ${album.title}`);
      if (album.cosplayer) contextParts.push(`Cosplayer: ${album.cosplayer}`);
      if (album.character) contextParts.push(`Character: ${album.character}`);
      if (album.series) contextParts.push(`Series/Franchise: ${album.series}`);
      if (existingTagNames.length > 0) contextParts.push(`Existing tags (skip these): ${existingTagNames.join(", ")}`);
      contextParts.push(`Preferred tags from our database: ${allDbTagNames.slice(0, 60).join(", ")}`);

      const userContent: Array<{ type: string; text?: string; image_url?: { url: string; detail: string } }> = [
        {
          type: "text",
          text: `Analyze these cosplay photos and suggest 8-12 relevant tags.\n\nContext:\n${contextParts.join("\n")}\n\nInstructions:\n- Prefer tags from our database when relevant\n- Do NOT include existing tags\n- Use lowercase, 1-3 words per tag\n- Return JSON only`,
        },
        ...sampleImageUrls.map((url) => ({
          type: "image_url" as const,
          image_url: { url, detail: "low" as const },
        })),
      ];

            const tagResult = await callAi({
        messages: [
          { role: "system", content: "You are a cosplay content tagging expert. Return only valid JSON." },
          { role: "user", content: userContent as any },
        ],
        responseFormat: {
          type: "json_schema",
          json_schema: {
            name: "tag_suggestions",
            strict: true,
            schema: {
              type: "object",
              properties: {
                tags: { type: "array", items: { type: "string" } },
              },
              required: ["tags"],
              additionalProperties: false,
            },
          },
        },
      });
      const raw = tagResult.content;
      if (!raw) throw new Error("Empty AI response");
      const parsed = JSON.parse(raw) as { tags: string[] };

      // Normalize and filter
      const newTags = parsed.tags
        .map((t: string) => t.toLowerCase().trim())
        .filter((t: string) => t.length > 0 && !existingTagNames.includes(t))
        .slice(0, 12);

      if (newTags.length > 0) {
        // Upsert tags and link to album
        const { upsertTag, setAlbumTags } = await import("../db");
        const tagIds: number[] = [];
        for (const tagName of newTags) {
          const slug = tagName.replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
          const tag = await upsertTag(tagName, slug);
          if (tag?.id) tagIds.push(tag.id);
        }
        // Merge with existing tag IDs
        const existingTagIds = existingTags.map((t) => t.id);
        await setAlbumTags(item.id, [...existingTagIds, ...tagIds]);
      }

      item.suggestedTags = newTags;
      item.appliedTagCount = newTags.length;
      item.status = "done";
    } catch (err: unknown) {
      item.status = "failed";
      item.error = err instanceof Error ? err.message : "Unknown error";
    }

    await new Promise((resolve) => setTimeout(resolve, 400));
  }

  job.finishedAt = Date.now();
}
