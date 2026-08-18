/**
 * Account router — procedures dành cho người dùng tự quản lý tài khoản cá nhân.
 * Tất cả đều là protectedProcedure (yêu cầu đăng nhập).
 */
import { TRPCError } from "@trpc/server";
import { and, desc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { hashPassword, verifyPassword } from "../auth-local";
import { getDb, getUserById } from "../db";
import { protectedProcedure, router } from "../_core/trpc";
import { subscriptionPlans, subscriptions, users } from "../../drizzle/schema";
import { createSubscription, getSubscriptionPlans } from "../db";
import { getPaymentProvider, isPaymentConfigured } from "../payments/index";

export const accountRouter = router({
  // --- Hồ sơ cá nhân ---------------------------------------------------------
  myProfile: protectedProcedure.query(async ({ ctx }) => {
    const user = await getUserById(ctx.user.id);
    if (!user) throw new TRPCError({ code: "NOT_FOUND", message: "User not found" });
    return {
      id: user.id,
      name: user.name,
      email: user.email,
      emailVerified: user.emailVerified,
      avatarUrl: user.avatarUrl,
      role: user.role,
      createdAt: user.createdAt,
    };
  }),

  // --- Cập nhật hồ sơ --------------------------------------------------------
  updateProfile: protectedProcedure
    .input(
      z.object({
        name: z.string().min(1).max(100).optional(),
        email: z.string().email().optional(),
        avatarUrl: z.string().url().optional().or(z.literal("")),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      // Kiểm tra email trùng (nếu đổi email)
      if (input.email) {
        const existing = await db
          .select({ id: users.id })
          .from(users)
          .where(eq(users.email, input.email.toLowerCase().trim()))
          .limit(1);
        if (existing.length > 0 && existing[0].id !== ctx.user.id) {
          throw new TRPCError({
            code: "CONFLICT",
            message: "This email is already in use by another account.",
          });
        }
      }

      const updateData: Record<string, unknown> = {};
      if (input.name !== undefined) updateData.name = input.name.trim();
      if (input.email !== undefined) {
        updateData.email = input.email.toLowerCase().trim();
        // Reset verification when email changes
        const currentUser = await getUserById(ctx.user.id);
        if (currentUser && currentUser.email?.toLowerCase() !== input.email.toLowerCase().trim()) {
          updateData.emailVerified = false;
        }
      }
      if (input.avatarUrl !== undefined) updateData.avatarUrl = input.avatarUrl || null;

      await db.update(users).set(updateData).where(eq(users.id, ctx.user.id));
      return { success: true };
    }),

  // --- Đổi mật khẩu ----------------------------------------------------------
  changePassword: protectedProcedure
    .input(
      z.object({
        currentPassword: z.string().min(1),
        newPassword: z.string().min(8, "New password must be at least 8 characters"),
        confirmPassword: z.string(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      if (input.newPassword !== input.confirmPassword) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Passwords do not match.",
        });
      }

      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const [user] = await db
        .select({ id: users.id, passwordHash: users.passwordHash })
        .from(users)
        .where(eq(users.id, ctx.user.id))
        .limit(1);

      if (!user) throw new TRPCError({ code: "NOT_FOUND" });

      // Nếu tài khoản chưa có mật khẩu (đăng nhập OAuth), không cho đổi
      if (!user.passwordHash) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "This account has no password set. Please use the password reset feature.",
        });
      }

      const valid = await verifyPassword(input.currentPassword, user.passwordHash);
      if (!valid) {
        throw new TRPCError({
          code: "UNAUTHORIZED",
          message: "Current password is incorrect.",
        });
      }

      const newHash = await hashPassword(input.newPassword);
      await db
        .update(users)
        .set({ passwordHash: newHash, sessionInvalidBefore: new Date(), updatedAt: new Date() })
        .where(eq(users.id, ctx.user.id));

      return { success: true };
    }),

  // --- Trạng thái VIP ---------------------------------------------------------
  myVipStatus: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) return { isVip: false, subscription: null };

    const now = new Date();

    // Lấy subscription active mới nhất
    const [activeSub] = await db
      .select({
        id: subscriptions.id,
        status: subscriptions.status,
        startedAt: subscriptions.startedAt,
        expiresAt: subscriptions.expiresAt,
        planId: subscriptions.planId,
        planName: subscriptionPlans.name,
        planPrice: subscriptionPlans.price,
        planCurrency: subscriptionPlans.currency,
        planIntervalDays: subscriptionPlans.intervalDays,
        planBadge: subscriptionPlans.badge,
      })
      .from(subscriptions)
      .leftJoin(subscriptionPlans, eq(subscriptions.planId, subscriptionPlans.id))
      .where(
        and(
          eq(subscriptions.userId, ctx.user.id),
          eq(subscriptions.status, "active"),
          sql`${subscriptions.expiresAt} > ${now}`
        )
      )
      .orderBy(desc(subscriptions.expiresAt))
      .limit(1);

    if (!activeSub) {
      // Kiểm tra subscription đã hết hạn gần nhất
      const [lastSub] = await db
        .select({
          id: subscriptions.id,
          status: subscriptions.status,
          expiresAt: subscriptions.expiresAt,
          planName: subscriptionPlans.name,
        })
        .from(subscriptions)
        .leftJoin(subscriptionPlans, eq(subscriptions.planId, subscriptionPlans.id))
        .where(eq(subscriptions.userId, ctx.user.id))
        .orderBy(desc(subscriptions.createdAt))
        .limit(1);

      return {
        isVip: false,
        subscription: lastSub
          ? {
              ...lastSub,
              isExpired: true,
              daysLeft: 0,
              progressPercent: 0,
            }
          : null,
      };
    }

    const expiresAt = new Date(activeSub.expiresAt!);
    const startedAt = new Date(activeSub.startedAt!);
    const totalMs = expiresAt.getTime() - startedAt.getTime();
    const remainingMs = expiresAt.getTime() - now.getTime();
    const daysLeft = Math.ceil(remainingMs / 86400000);
    const progressPercent =
      totalMs > 0 ? Math.max(0, Math.min(100, (remainingMs / totalMs) * 100)) : 0;

    return {
      isVip: true,
      subscription: {
        ...activeSub,
        isExpired: false,
        daysLeft,
        progressPercent: Math.round(progressPercent),
      },
    };
  }),

  // --- Gia hạn VIP nhanh ------------------------------------------------------
  renewVip: protectedProcedure
    .input(
      z.object({
        planId: z.number().int().positive().optional(),
        successUrl: z.string().url(),
        cancelUrl: z.string().url(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      if (!isPaymentConfigured()) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "Payment system is not configured.",
        });
      }

      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      // Xác định plan: dùng planId truyền vào, hoặc lấy plan từ subscription gần nhất
      let targetPlanId = input.planId;
      if (!targetPlanId) {
        const [lastSub] = await db
          .select({ planId: subscriptions.planId })
          .from(subscriptions)
          .where(eq(subscriptions.userId, ctx.user.id))
          .orderBy(desc(subscriptions.createdAt))
          .limit(1);
        targetPlanId = lastSub?.planId ?? undefined;
      }

      // Nếu vẫn không có plan, lấy plan active rẻ nhất
      const plans = await getSubscriptionPlans();
      const activePlans = plans.filter((p) => p.isActive);
      if (activePlans.length === 0) {
        throw new TRPCError({ code: "NOT_FOUND", message: "No VIP plans available." });
      }

      const plan = targetPlanId
        ? activePlans.find((p) => p.id === targetPlanId) ?? activePlans[0]
        : activePlans[0];

      const provider = await getPaymentProvider();

      const { sessionId, url, orderId } = await provider.createCheckout({
        planId: plan.id,
        planName: `Renew ${plan.name}`,
        planDescription: plan.description,
        priceInCents: Math.round(Number(plan.price) * 100),
        currency: plan.currency,
        intervalDays: plan.intervalDays,
        userId: ctx.user.id,
        userEmail: ctx.user.email,
        successUrl: input.successUrl,
        cancelUrl: input.cancelUrl,
      });

      // Tạo bản ghi subscription pending
      await createSubscription({
        userId: ctx.user.id,
        planId: plan.id,
        sessionId,
        orderId,
        provider: provider.name,
      });

      return { sessionId, url, planName: plan.name };
    }),

  // --- Lịch sử thanh toán -----------------------------------------------------
  myPaymentHistory: protectedProcedure
    .input(
      z.object({
        page: z.number().int().min(1).default(1),
        limit: z.number().int().min(1).max(50).default(10),
      })
    )
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) return { items: [], total: 0 };

      const offset = (input.page - 1) * input.limit;

      const items = await db
        .select({
          id: subscriptions.id,
          status: subscriptions.status,
          startedAt: subscriptions.startedAt,
          expiresAt: subscriptions.expiresAt,
          createdAt: subscriptions.createdAt,
          stripeSessionId: subscriptions.stripeSessionId,
          planName: subscriptionPlans.name,
          planPrice: subscriptionPlans.price,
          planCurrency: subscriptionPlans.currency,
          planIntervalDays: subscriptionPlans.intervalDays,
          planBadge: subscriptionPlans.badge,
        })
        .from(subscriptions)
        .leftJoin(subscriptionPlans, eq(subscriptions.planId, subscriptionPlans.id))
        .where(eq(subscriptions.userId, ctx.user.id))
        .orderBy(desc(subscriptions.createdAt))
        .limit(input.limit)
        .offset(offset);

      const [{ total }] = await db
        .select({ total: sql<number>`count(*)` })
        .from(subscriptions)
        .where(eq(subscriptions.userId, ctx.user.id));

      return { items, total };
    }),
});
