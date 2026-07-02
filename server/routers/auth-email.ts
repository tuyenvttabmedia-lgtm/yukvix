/**
 * Email Verification Router
 * Handles: send verification email on register, verify email token, resend verification.
 */
import { TRPCError } from "@trpc/server";
import { nanoid } from "nanoid";
import { z } from "zod";
import { publicProcedure, protectedProcedure, router } from "../_core/trpc";
import * as db from "../db";
import { sendVerificationEmail } from "../email";

// Verification token TTL: 24 hours
const VERIFY_TOKEN_TTL_MS = 24 * 60 * 60 * 1000;
// Rate limit: max 3 sends per hour
const RATE_LIMIT_MAX = 3;
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000; // 1 hour

export const authEmailRouter = router({
  /**
   * Send (or resend) a verification email to the current user.
   * Requires the user to be logged in.
   */
  sendVerification: protectedProcedure
    .input(
      z.object({
        origin: z.string().url().optional(),
      }).optional()
    )
    .mutation(async ({ input, ctx }) => {
      const user = await db.getUserByOpenId(ctx.user.openId);
      if (!user) {
        throw new TRPCError({ code: "NOT_FOUND", message: "User not found" });
      }

      if (user.emailVerified) {
        return { success: true, message: "Email already verified" };
      }

      if (!user.email) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "No email address on file" });
      }

      // --- Rate limit check ---
      const { count, oldestCreatedAt } = await db.countRecentEmailVerificationTokens(
        user.id,
        RATE_LIMIT_WINDOW_MS
      );
      if (count >= RATE_LIMIT_MAX) {
        // nextAllowedAt = when the oldest token in the window expires from the window
        const nextAllowedAt = oldestCreatedAt
          ? new Date(oldestCreatedAt.getTime() + RATE_LIMIT_WINDOW_MS)
          : new Date(Date.now() + RATE_LIMIT_WINDOW_MS);
        throw new TRPCError({
          code: "TOO_MANY_REQUESTS",
          message: JSON.stringify({
            type: "RATE_LIMITED",
            nextAllowedAt: nextAllowedAt.toISOString(),
            message: `You have exceeded the limit of ${RATE_LIMIT_MAX} requests per hour. Please try again later.`,
          }),
        });
      }

      // Invalidate existing tokens
      await db.invalidateUserEmailVerificationTokens(user.id);

      // Generate new token
      const token = nanoid(64);
      const expiresAt = new Date(Date.now() + VERIFY_TOKEN_TTL_MS);
      await db.createEmailVerificationToken(user.id, token, expiresAt);

      // Build verify URL
      const origin =
        input?.origin ??
        (ctx.req.headers.origin as string | undefined) ??
        "http://localhost:3000";
      const verifyUrl = `${origin}/verify-email?token=${encodeURIComponent(token)}`;

      // Send email
      const emailResult = await sendVerificationEmail(
        user.email,
        user.name ?? "there",
        verifyUrl
      );

      if (!emailResult.success) {
        console.error("[AuthEmail] Failed to send verification:", emailResult.error);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to send verification email. Please try again later.",
        });
      }

      return {
        success: true,
        message: "Verification email sent. Check your inbox.",
        ...(process.env.NODE_ENV !== "production" && emailResult.success && emailResult.previewUrl
          ? { _devPreviewUrl: emailResult.previewUrl }
          : {}),
      };
    }),

  /**
   * Verify email using the token from the email link.
   * Public procedure (user may not be logged in when clicking link).
   */
  verifyEmail: publicProcedure
    .input(z.object({ token: z.string().min(1) }))
    .mutation(async ({ input }) => {
      const record = await db.getEmailVerificationToken(input.token);

      if (!record) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Invalid verification link. Please request a new one.",
        });
      }

      if (record.usedAt) {
        // Already verified — not an error, just inform
        return { success: true, message: "Email already verified." };
      }

      if (record.expiresAt < new Date()) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Verification link has expired. Please request a new one.",
        });
      }

      // Mark token as used
      await db.markEmailVerificationTokenUsed(record.id);

      // Set user as verified
      await db.setUserEmailVerified(record.userId);

      return { success: true, message: "Email verified successfully!" };
    }),

  /**
   * Check verification status for current user.
   */
  status: protectedProcedure.query(async ({ ctx }) => {
    const user = await db.getUserByOpenId(ctx.user.openId);
    if (!user) return { verified: false, email: null };
    return {
      verified: user.emailVerified,
      email: user.email,
    };
  }),
});
