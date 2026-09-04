import { z } from "zod";
import { adminProcedure, router } from "../_core/trpc";
import {
  backfillAlbumCosplayerFromCreator,
  countCosplayerQueue,
  createAndLinkAlbums,
  createQuickFromName,
  linkAlbumsToCreator,
  linkExactMatches,
  listCosplayerQueue,
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
      })
    )
    .query(({ input }) =>
      listCosplayerQueue({
        bucket: input.bucket as CosplayerQueueBucket,
        page: input.page,
        limit: input.limit,
        search: input.search,
      })
    ),

  backfill: adminProcedure.mutation(() => backfillAlbumCosplayerFromCreator()),

  link: adminProcedure
    .input(
      z.object({
        albumIds: z.array(z.number()).min(1).max(100),
        creatorId: z.number(),
      })
    )
    .mutation(({ input }) =>
      linkAlbumsToCreator(input.albumIds, input.creatorId)
    ),

  createAndLink: adminProcedure
    .input(z.object({ albumIds: z.array(z.number()).min(1).max(100) }))
    .mutation(({ input }) => createAndLinkAlbums(input.albumIds)),

  createQuick: adminProcedure
    .input(
      z.object({
        name: z.string().min(1).max(128),
        albumIds: z.array(z.number()).max(100).default([]),
      })
    )
    .mutation(({ input }) =>
      createQuickFromName({ name: input.name, albumIds: input.albumIds })
    ),

  linkMatches: adminProcedure
    .input(z.object({ albumIds: z.array(z.number()).max(100).optional() }))
    .mutation(({ input }) => linkExactMatches(input.albumIds)),

  skip: adminProcedure
    .input(z.object({ albumIds: z.array(z.number()).min(1).max(100) }))
    .mutation(({ input }) => skipAlbums(input.albumIds)),

  unskip: adminProcedure
    .input(z.object({ albumIds: z.array(z.number()).min(1).max(100) }))
    .mutation(({ input }) => unskipAlbums(input.albumIds)),
});
