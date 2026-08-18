import { TRPCError } from "@trpc/server";
import { nanoid } from "nanoid";
import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import {
  banUser,
  deleteUserById,
  getAlbumById,
  getBookmarksByUser,
  getUserDetail,
  isBookmarked,
  listAlbums,
  listUsers,
  toggleBookmark,
  unbanUser,
  updateUserPassword,
  updateUserRole,
  invalidateUserPasswordResetTokens,
  getSubscriptionPlans,
  createSubscription,
  activateSubscription,
} from "../db";
import { hashPassword } from "../auth-local";
import { sendTempPasswordEmail } from "../email";
import { isAdmin } from '@shared/const';

// --- Admin guard helper -------------------------------------------------------
function requireAdmin(role: string) {
  if (!isAdmin(role)) throw new TRPCError({ code: "FORBIDDEN" });
}

export const usersRouter = router({
  // --- Bookmarks --------------------------------------------------------------
  toggleBookmark: protectedProcedure
    .input(z.object({ albumId: z.number() }))
    .mutation(async ({ input, ctx }) => {
      return toggleBookmark(ctx.user.id, input.albumId);
    }),

  myBookmarks: protectedProcedure.query(async ({ ctx }) => {
    const bookmarkList = await getBookmarksByUser(ctx.user.id);
    if (bookmarkList.length === 0) return [];
    const albumIds = bookmarkList.map((b) => b.albumId);
    const result = await listAlbums({ status: "published", limit: 100 });
    const albumMap = new Map(result.items.map((a) => [a.id, a]));
    return bookmarkList
      .map((b) => ({ ...b, album: albumMap.get(b.albumId) || null }))
      .filter((b) => b.album !== null);
  }),

  isBookmarked: protectedProcedure
    .input(z.object({ albumId: z.number() }))
    .query(async ({ input, ctx }) => {
      return isBookmarked(ctx.user.id, input.albumId);
    }),

  // --- Admin: List users ------------------------------------------------------
  adminList: protectedProcedure
    .input(
      z.object({
        page: z.number().min(1).default(1),
        limit: z.number().min(1).max(100).default(20),
        search: z.string().optional(),
        role: z.enum(["admin", "vip", "user"]).optional(),
        emailVerified: z.boolean().optional(),
      })
    )
    .query(async ({ input, ctx }) => {
      requireAdmin(ctx.user.role);
      return listUsers(input.page, input.limit, input.search, input.role, input.emailVerified);
    }),

  // --- Admin: Get user detail -------------------------------------------------
  adminGetDetail: protectedProcedure
    .input(z.object({ userId: z.number() }))
    .query(async ({ input, ctx }) => {
      requireAdmin(ctx.user.role);
      const detail = await getUserDetail(input.userId);
      if (!detail) throw new TRPCError({ code: "NOT_FOUND", message: "User not found" });
      // Never expose passwordHash to frontend
      const { passwordHash: _ph, ...safe } = detail;
      return safe;
    }),

  // --- Admin: Change user role ------------------------------------------------
  setRole: protectedProcedure
    .input(z.object({ userId: z.number(), role: z.enum(["user", "vip", "admin"]) }))
    .mutation(async ({ input, ctx }) => {
      requireAdmin(ctx.user.role);
      if (input.userId === ctx.user.id) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Cannot change your own role" });
      }
      await updateUserRole(input.userId, input.role);
      return { success: true };
    }),

  // --- Admin: Grant VIP -------------------------------------------------------
  grantVip: protectedProcedure
    .input(z.object({ userId: z.number(), days: z.number().min(1).max(3650).default(30) }))
    .mutation(async ({ input, ctx }) => {
      requireAdmin(ctx.user.role);

      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + input.days);

      const plans = await getSubscriptionPlans();
      const plan = plans[0];
      if (!plan) throw new TRPCError({ code: "NOT_FOUND", message: "No plans configured" });

      const manualId = `manual_${Date.now()}`;
      await createSubscription({
        userId: input.userId,
        planId: plan.id,
        sessionId: manualId,
        provider: "manual",
        paymentMethod: "manual",
      });

      await activateSubscription(manualId, expiresAt);
      await updateUserRole(input.userId, "vip");
      console.log(`[GrantVIP] users.grantVip: userId=${input.userId}, days=${input.days}`);

      return { success: true };
    }),

  // --- Admin: Remove VIP ------------------------------------------------------
  removeVip: protectedProcedure
    .input(z.object({ userId: z.number() }))
    .mutation(async ({ input, ctx }) => {
      requireAdmin(ctx.user.role);
      await updateUserRole(input.userId, "user");
      return { success: true };
    }),

  // --- Admin: Ban user --------------------------------------------------------
  ban: protectedProcedure
    .input(z.object({ userId: z.number() }))
    .mutation(async ({ input, ctx }) => {
      requireAdmin(ctx.user.role);
      if (input.userId === ctx.user.id) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Cannot ban yourself" });
      }
      await banUser(input.userId);
      return { success: true };
    }),

  // --- Admin: Unban user ------------------------------------------------------
  unban: protectedProcedure
    .input(z.object({ userId: z.number() }))
    .mutation(async ({ input, ctx }) => {
      requireAdmin(ctx.user.role);
      await unbanUser(input.userId);
      return { success: true };
    }),

  // --- Admin: Reset user password ---------------------------------------------
  adminResetPassword: protectedProcedure
    .input(z.object({ userId: z.number() }))
    .mutation(async ({ input, ctx }) => {
      requireAdmin(ctx.user.role);
      const detail = await getUserDetail(input.userId);
      if (!detail) throw new TRPCError({ code: "NOT_FOUND", message: "User not found" });

      // Generate a random temp password
      const tempPassword = nanoid(12);
      const hashed = await hashPassword(tempPassword);
      await invalidateUserPasswordResetTokens(input.userId);
      await updateUserPassword(input.userId, hashed);

      // Send email if user has email
      let emailSent = false;
      let devPreview: string | undefined;
      if (detail.email) {
        try {
          const result = await sendTempPasswordEmail(detail.email, detail.name ?? "User", tempPassword);
          emailSent = true;
          devPreview = (result as any)?._devPreviewUrl;
        } catch {
          // Email failed, still return temp password for admin to share manually
        }
      }

      return {
        success: true,
        tempPassword,
        emailSent,
        _devPreviewUrl: devPreview,
      };
    }),

  // --- Admin: Delete user -----------------------------------------------------
  adminDelete: protectedProcedure
    .input(z.object({ userId: z.number() }))
    .mutation(async ({ input, ctx }) => {
      requireAdmin(ctx.user.role);
      if (input.userId === ctx.user.id) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Cannot delete your own account" });
      }
      await deleteUserById(input.userId);
      return { success: true };
    }),
});
