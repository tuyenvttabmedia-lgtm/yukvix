/**
 * Admin Email Logs & Queue Router
 */
import { z } from "zod";
import { router, adminProcedure } from "../_core/trpc";
import {
  getEmailLogs,
  getEmailQueue,
  retryQueueItem,
} from "../db";

export const emailLogsRouter = router({
  /**
   * Get paginated email logs with optional filters.
   */
  getLogs: adminProcedure
    .input(
      z.object({
        page: z.number().int().min(1).default(1),
        limit: z.number().int().min(1).max(200).default(50),
        status: z.enum(["sent", "failed"]).optional(),
        type: z.string().optional(),
        recipient: z.string().optional(),
      })
    )
    .query(async ({ input }) => {
      return getEmailLogs(input);
    }),

  /**
   * Get paginated email queue with optional status filter.
   */
  getQueue: adminProcedure
    .input(
      z.object({
        page: z.number().int().min(1).default(1),
        limit: z.number().int().min(1).max(200).default(50),
        status: z.enum(["pending", "processing", "sent", "failed"]).optional(),
      })
    )
    .query(async ({ input }) => {
      return getEmailQueue(input);
    }),

  /**
   * Retry a failed queue item immediately.
   */
  retryQueueItem: adminProcedure
    .input(z.object({ id: z.number().int() }))
    .mutation(async ({ input }) => {
      await retryQueueItem(input.id);
      return { success: true };
    }),
});
