import { z } from "zod";
import { adminProcedure, router } from "../_core/trpc";
import {
  backfillAlbumCosplayerFromCreator,
  COSPLAYER_LINK_BULK_MAX,
  countCosplayerQueue,
  createAndLinkAlbums,
  createQuickFromName,
  linkAlbumsMatchingFilter,
  linkAlbumsToCreator,
  linkExactMatches,
  listCosplayerQueue,
  listCosplayerQueueIds,
  skipAlbums,
  unskipAlbums,
  type CosplayerQueueBucket,
} from "../services/cosplayer-link";

const bucketEnum = z.enum(["named", "empty", "skipped"]);

export const cosplayerLinkRouter = router({
  counts: adminProcedure.query(() => countCosplayerQueue()),

  list: adminProcedure
    .input(
      z.object({
        bucket: bucketEnum.default("named"),
        page: z.number().min(1).default(1),
        limit: z.number().min(1).max(100).default(30),
        search: z.string().optional(),
        includeLinked: z.boolean().optional(),
      })
    )
    .query(({ input }) =>
      listCosplayerQueue({
        bucket: input.bucket as CosplayerQueueBucket,
        page: input.page,
        limit: input.limit,
        search: input.search,
        includeLinked: input.includeLinked,
      })
    ),

  listIds: adminProcedure
    .input(
      z.object({
        bucket: bucketEnum.default("named"),
        search: z.string().optional(),
        includeLinked: z.boolean().optional(),
      })
    )
    .query(({ input }) =>
      listCosplayerQueueIds({
        bucket: input.bucket as CosplayerQueueBucket,
        search: input.search,
        includeLinked: input.includeLinked,
      })
    ),

  backfill: adminProcedure.mutation(() => backfillAlbumCosplayerFromCreator()),

  link: adminProcedure
    .input(
      z.object({
        albumIds: z.array(z.number()).min(1).max(COSPLAYER_LINK_BULK_MAX),
        creatorId: z.number(),
      })
    )
    .mutation(({ input }) =>
      linkAlbumsToCreator(input.albumIds, input.creatorId)
    ),

  linkMatching: adminProcedure
    .input(
      z.object({
        creatorId: z.number(),
        bucket: bucketEnum.default("named"),
        search: z.string().optional(),
        includeLinked: z.boolean().optional(),
        albumIds: z.array(z.number()).max(COSPLAYER_LINK_BULK_MAX).optional(),
      })
    )
    .mutation(({ input }) =>
      linkAlbumsMatchingFilter({
        creatorId: input.creatorId,
        bucket: input.bucket as CosplayerQueueBucket,
        search: input.search,
        includeLinked: input.includeLinked,
        albumIds: input.albumIds,
      })
    ),

  createAndLink: adminProcedure
    .input(z.object({ albumIds: z.array(z.number()).min(1).max(COSPLAYER_LINK_BULK_MAX) }))
    .mutation(({ input }) => createAndLinkAlbums(input.albumIds)),

  createQuick: adminProcedure
    .input(
      z.object({
        name: z.string().min(1).max(128),
        albumIds: z.array(z.number()).max(COSPLAYER_LINK_BULK_MAX).default([]),
      })
    )
    .mutation(({ input }) =>
      createQuickFromName({ name: input.name, albumIds: input.albumIds })
    ),

  linkMatches: adminProcedure
    .input(z.object({ albumIds: z.array(z.number()).max(COSPLAYER_LINK_BULK_MAX).optional() }))
    .mutation(({ input }) => linkExactMatches(input.albumIds)),

  skip: adminProcedure
    .input(z.object({ albumIds: z.array(z.number()).min(1).max(COSPLAYER_LINK_BULK_MAX) }))
    .mutation(({ input }) => skipAlbums(input.albumIds)),

  unskip: adminProcedure
    .input(z.object({ albumIds: z.array(z.number()).min(1).max(COSPLAYER_LINK_BULK_MAX) }))
    .mutation(({ input }) => unskipAlbums(input.albumIds)),
});
