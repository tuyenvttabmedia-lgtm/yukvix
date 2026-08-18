/**
 * Self-hostable authentication router.
 * Provides email/password register, login, me, logout,
 * forgot-password, validate-reset-token, and reset-password procedures.
 * No dependency on Manus OAuth platform — works on any Node.js host.
 *
 * Session mechanism: HttpOnly cookie containing a signed JWT (HS256, JWT_SECRET).
 */
import { TRPCError } from "@trpc/server";
import { nanoid } from "nanoid";
import { z } from "zod";
import { publicProcedure, protectedProcedure, router } from "../_core/trpc";
import {
  registerLocal,
  loginLocal,
  setAuthCookie,
  clearAuthCookie,
  hashPassword,
  verifyPassword,
} from "../auth-local";
import * as db from "../db";
import {
  sendPasswordResetEmail,
  sendPasswordChangedEmail,
} from "../email";
import { getPublicSiteUrl } from "../_core/site-url";

// Reset token TTL: 1 hour
const RESET_TOKEN_TTL_MS = 60 * 60 * 1000;

export const authRouter = router({
  /**
   * Register a new local account.
   */
  register: publicProcedure
    .input(
      z.object({
        email: z.string().email("Invalid email address"),
        password: z.string().min(8, "Password must be at least 8 characters"),
        name: z.string().min(2, "Name must be at least 2 characters").max(64),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const result = await registerLocal(input);
      if (!result.success) {
        throw new TRPCError({ code: "BAD_REQUEST", message: result.error });
      }
      setAuthCookie(ctx.res, ctx.req, result.token);
      return {
        success: true as const,
        user: {
          id: result.user!.id,
          name: result.user!.name,
          email: result.user!.email,
          role: result.user!.role,
          createdAt: result.user!.createdAt,
        },
      };
    }),

  /**
   * Login with email and password.
   */
  login: publicProcedure
    .input(
      z.object({
        email: z.string().email("Invalid email address"),
        password: z.string().min(1, "Password is required"),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const result = await loginLocal(input);
      if (!result.success) {
        throw new TRPCError({ code: "UNAUTHORIZED", message: result.error });
      }
      setAuthCookie(ctx.res, ctx.req, result.token);
      return {
        success: true as const,
        user: {
          id: result.user!.id,
          name: result.user!.name,
          email: result.user!.email,
          role: result.user!.role,
          createdAt: result.user!.createdAt,
        },
      };
    }),

  /** Get current authenticated user. */
  me: publicProcedure.query(({ ctx }) => ctx.user ?? null),

  /** Logout — clears the session cookie. */
  logout: publicProcedure.mutation(async ({ ctx }) => {
    if (ctx.user) {
      await db.invalidateUserSessions(ctx.user.id);
    }
    clearAuthCookie(ctx.res, ctx.req);
    return { success: true as const };
  }),

  /**
   * Update profile (name, avatarUrl) for the current user.
   */
  updateProfile: protectedProcedure
    .input(
      z.object({
        name: z.string().min(2).max(64).optional(),
        avatarUrl: z.string().url().optional().nullable(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      await db.upsertUser({
        openId: ctx.user.openId,
        ...(input.name !== undefined && { name: input.name }),
        ...(input.avatarUrl !== undefined && { avatarUrl: input.avatarUrl }),
      });
      const updated = await db.getUserByOpenId(ctx.user.openId);
      return updated;
    }),

  /**
   * Change password for the currently logged-in user.
   * Requires the current password for verification.
   */
  changePassword: protectedProcedure
    .input(
      z.object({
        currentPassword: z.string().min(1),
        newPassword: z.string().min(8, "New password must be at least 8 characters"),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const user = await db.getUserByOpenId(ctx.user.openId);
      if (!user) throw new Error("User not found");

      if (!user.passwordHash) {
        throw new Error(
          "This account uses OAuth login. Password change is not available."
        );
      }

      const valid = await verifyPassword(input.currentPassword, user.passwordHash);
      if (!valid) throw new Error("Current password is incorrect");

      const newHash = await hashPassword(input.newPassword);
      await db.updateUserPassword(user.id, newHash);

      return { success: true as const };
    }),

  // --- Password Reset Flow ----------------------------------------------------

  /**
   * Step 1 — Request a password reset email.
   * Always returns success to prevent user enumeration.
   * Sends an email with a signed reset link if the account exists.
   */
  forgotPassword: publicProcedure
    .input(
      z.object({
        email: z.string().email("Invalid email address"),
        /** Frontend origin for building the reset URL (e.g. https://yukvix.com) */
        origin: z.string().url().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      // Always respond with success to prevent user enumeration
      const genericResponse = {
        success: true as const,
        message: "If an account with that email exists, a reset link has been sent.",
      };

      const user = await db.getUserByEmail(input.email.toLowerCase().trim());
      if (!user) return genericResponse;

      // Only local accounts have passwords to reset
      if (!user.passwordHash) return genericResponse;

      // Invalidate any existing tokens for this user
      await db.invalidateUserPasswordResetTokens(user.id);

      // Generate a cryptographically random token
      const token = nanoid(64);
      const expiresAt = new Date(Date.now() + RESET_TOKEN_TTL_MS);
      await db.createPasswordResetToken(user.id, token, expiresAt);

      const origin = getPublicSiteUrl(ctx.req);
      const resetUrl = `${origin}/reset-password?token=${encodeURIComponent(token)}`;

      // Send email (non-blocking — don't fail the request if email fails)
      const emailResult = await sendPasswordResetEmail(
        user.email ?? input.email,
        user.name ?? "there",
        resetUrl
      );

      // In development, return the preview URL so devs can test without SMTP
      if (emailResult.success && emailResult.previewUrl) {
        console.log(`[Auth] Password reset preview: ${emailResult.previewUrl}`);
        return {
          ...genericResponse,
          // Only expose previewUrl in non-production for testing
          ...(process.env.NODE_ENV !== "production" && {
            _devPreviewUrl: emailResult.previewUrl,
            _devResetUrl: resetUrl,
          }),
        };
      }

      return genericResponse;
    }),

  /**
   * Step 2 — Validate a reset token before showing the new-password form.
   * Returns token validity and masked email so the UI can confirm identity.
   */
  validateResetToken: publicProcedure
    .input(z.object({ token: z.string().min(1) }))
    .query(async ({ input }) => {
      const record = await db.getPasswordResetToken(input.token);

      if (!record) {
        return { valid: false, reason: "Token not found" as const };
      }
      if (record.usedAt) {
        return { valid: false, reason: "Token already used" as const };
      }
      if (record.expiresAt < new Date()) {
        return { valid: false, reason: "Token expired" as const };
      }

      // Fetch user to show masked email
      const user = await db.getUserById(record.userId);
      if (!user) {
        return { valid: false, reason: "User not found" as const };
      }

      // Mask email: john.doe@example.com → j*****e@example.com
      const maskedEmail = maskEmail(user.email ?? "");

      return {
        valid: true as const,
        maskedEmail,
        expiresAt: record.expiresAt,
      };
    }),

  /**
   * Step 3 — Reset the password using a valid token.
   * Marks the token as used and updates the password hash.
   */
  resetPassword: publicProcedure
    .input(
      z.object({
        token: z.string().min(1),
        newPassword: z.string().min(8, "Password must be at least 8 characters"),
      })
    )
    .mutation(async ({ input }) => {
      const record = await db.getPasswordResetToken(input.token);

      if (!record) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Invalid or expired reset token." });
      }
      if (record.usedAt) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "This reset link has already been used. Please request a new one." });
      }
      if (record.expiresAt < new Date()) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "This reset link has expired. Please request a new one." });
      }

      const user = await db.getUserById(record.userId);
      if (!user) {
        throw new TRPCError({ code: "NOT_FOUND", message: "User not found." });
      }

      // Hash new password and update
      const newHash = await hashPassword(input.newPassword);
      await db.updateUserPassword(user.id, newHash);

      // Mark token as used (and invalidate all others for this user)
      await db.invalidateUserPasswordResetTokens(user.id);

      // Send confirmation email (fire-and-forget)
      sendPasswordChangedEmail(user.email ?? "", user.name ?? "there").catch(
        (err) => console.error("[Auth] Failed to send password changed email:", err)
      );

      return {
        success: true as const,
        message: "Password has been reset successfully. You can now log in.",
      };
    }),
});

// --- Helpers -----------------------------------------------------------------

function maskEmail(email: string): string {
  const [local, domain] = email.split("@");
  if (!local || !domain) return email;
  if (local.length <= 2) return `${local[0]}*@${domain}`;
  return `${local[0]}${"*".repeat(Math.min(local.length - 2, 5))}${local[local.length - 1]}@${domain}`;
}
