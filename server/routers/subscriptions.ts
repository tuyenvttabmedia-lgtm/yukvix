import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { protectedProcedure, publicProcedure, router } from "../_core/trpc";
import {
  activateSubscription,
  createSubscription,
  getActiveSubscription,
  getDb,
  getSubscriptionBySessionId,
  getSubscriptionPlans,
  listSubscriptions,
  updateUserRole,
} from "../db";
import { subscriptions } from "../../drizzle/schema";
import {
  getPaymentProvider,
  getPaymentProviderByName,
  isPaymentConfigured,
  isProviderConfigured,
  type ProviderName,
} from "../payments/index";
import { isAdmin, isVipOrAdmin } from '@shared/const';
import { getPaymentSettings } from '../settings-service';

export const subscriptionsRouter = router({
  // --- Public: List plans -----------------------------------------------------
  plans: publicProcedure.query(async () => {
    const plans = await getSubscriptionPlans();
    return plans.map((p) => ({
      ...p,
      features: p.features ? JSON.parse(p.features) : [],
    }));
  }),

  // --- Public: Available payment methods --------------------------------------
  availablePaymentMethods: publicProcedure.query(async () => {
    const methods: { id: string; label: string; description: string; icon: string }[] = [];
    const settings = await getPaymentSettings();

    if (settings.ccbill.enabled && await isProviderConfigured("ccbill")) {
      methods.push({
        id: "ccbill",
        label: "Credit / Debit Card",
        description: "Visa, Mastercard, Discover via CCBill",
        icon: "credit-card",
      });
    }

    if (await isProviderConfigured("crypto")) {
      methods.push({
        id: "crypto",
        label: "Crypto (USDT)",
        description: "USDT TRC20 or BEP20 via NOWPayments",
        icon: "bitcoin",
      });
    }

    // Fallback: if nothing configured, show crypto only (CCBill off by default)
    if (methods.length === 0) {
      methods.push(
        { id: "crypto", label: "Crypto (USDT)", description: "USDT TRC20 or BEP20", icon: "bitcoin" }
      );
    }

    return methods;
  }),

  // --- Protected: Get current user's subscription -----------------------------
  mySubscription: protectedProcedure.query(async ({ ctx }) => {
    const sub = await getActiveSubscription(ctx.user.id);
    return sub || null;
  }),

  // --- Protected: Create checkout session (provider-agnostic) -----------------
  createCheckout: protectedProcedure
    .input(
      z.object({
        planId: z.number(),
        successUrl: z.string().url(),
        cancelUrl: z.string().url(),
        paymentMethod: z.enum(["ccbill", "crypto"]).optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      if (!(await isPaymentConfigured())) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message:
            "Payment system not configured. Configure CCBill or NOWPayments in Admin → Payment Settings.",
        });
      }

      const plans = await getSubscriptionPlans();
      const plan = plans.find((p) => p.id === input.planId);
      if (!plan) throw new TRPCError({ code: "NOT_FOUND", message: "Plan not found" });

      // Select provider: use specified paymentMethod, or fall back to default
      let provider;
      if (input.paymentMethod) {
        try {
          provider = await getPaymentProviderByName(input.paymentMethod as ProviderName);
        } catch {
          throw new TRPCError({
            code: "PRECONDITION_FAILED",
            message: `Payment method "${input.paymentMethod}" is not configured.`,
          });
        }
      } else {
        provider = await getPaymentProvider();
      }

      const { sessionId, url, orderId } = await provider.createCheckout({
        planId: plan.id,
        planName: plan.name,
        planDescription: plan.description,
        priceInCents: Math.round(Number(plan.price) * 100),
        currency: plan.currency,
        intervalDays: plan.intervalDays,
        userId: ctx.user.id,
        userEmail: ctx.user.email,
        successUrl: input.successUrl,
        cancelUrl: input.cancelUrl,
      });

      const paymentMethodLabel = input.paymentMethod || provider.name;

      await createSubscription({
        userId: ctx.user.id,
        planId: plan.id,
        sessionId,
        orderId,
        provider: provider.name,
        paymentMethod: paymentMethodLabel,
      });

      console.log(`[Checkout] Created: provider=${provider.name}, sessionId=${sessionId}, userId=${ctx.user.id}`);
      return { sessionId, url, provider: provider.name };
    }),

  // --- Protected: Verify payment after redirect -------------------------------
  // For CCBill: verifies via Datalink API
  // For NOWPayments/crypto: checks DB subscription status (IPN-driven)
  verifyPayment: protectedProcedure
    .input(z.object({
      sessionId: z.string(),
      paymentMethod: z.enum(["ccbill", "crypto"]).optional(),
    }))
    .mutation(async ({ input }) => {
      if (!(await isPaymentConfigured())) {
        throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Payment system not configured" });
      }

      // For crypto/NOWPayments: check DB directly (IPN webhook activates VIP)
      if (input.paymentMethod === "crypto") {
        const sub = await getSubscriptionBySessionId(input.sessionId);
        if (sub?.status === "active") {
          return { success: true, expiresAt: sub.expiresAt, message: "VIP activated via crypto payment." };
        }
        return { success: false, message: "pending_ipn" };
      }

      // For CCBill: use provider verifyPayment
      let provider;
      if (input.paymentMethod) {
        try {
          provider = await getPaymentProviderByName(input.paymentMethod as ProviderName);
        } catch {
          provider = await getPaymentProvider();
        }
      } else {
        provider = await getPaymentProvider();
      }

      const result = await provider.verifyPayment({ sessionId: input.sessionId });

      if (!result.success) {
        return { success: false, message: result.message };
      }

      // Never activate from a client-side verify of a pending CCBill session.
      if (input.sessionId.startsWith("ccbill_pending_")) {
        return { success: false, message: result.message || "pending_webhook" };
      }

      const intervalDays = result.intervalDays || 30;
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + intervalDays);

      await activateSubscription(input.sessionId, expiresAt);
      console.log(`[Verify] Activated: sessionId=${input.sessionId}, expiresAt=${expiresAt.toISOString()}`);

      return { success: true, expiresAt };
    }),

  // --- Admin: List all subscriptions -----------------------------------------
  adminList: protectedProcedure
    .input(
      z.object({
        page: z.number().min(1).default(1),
        limit: z.number().min(1).max(100).default(20),
        search: z.string().optional(),
        status: z.enum(["active", "pending", "expired", "cancelled"]).optional(),
      })
    )
    .query(async ({ input, ctx }) => {
      if (!isAdmin(ctx.user.role)) {
        throw new TRPCError({ code: "FORBIDDEN" });
      }
      return listSubscriptions(input.page, input.limit, input.search, input.status);
    }),

  // --- Protected: Get crypto payment status (DB-driven, webhook-activated) ----
  // NOWPayments does NOT expose an endpoint to check invoice status by invoice_id
  // without JWT authentication. Status is determined by IPN webhook → DB.
  // Frontend should poll this endpoint every 10s until status = "finished".
  getCryptoPaymentStatus: protectedProcedure
    .input(z.object({
      sessionId: z.string(),   // invoice.id returned from createCheckout
      orderId: z.string().optional(), // legacy compat — same as sessionId
    }))
    .query(async ({ input, ctx }) => {
      const lookupId = input.sessionId || input.orderId || "";
      console.log(`[CryptoStatus] Checking: sessionId=${lookupId}, userId=${ctx.user.id}`);

      // Source of truth: DB subscription record
      const sub = await getSubscriptionBySessionId(lookupId);

      if (!sub) {
        console.warn(`[CryptoStatus] No subscription found for sessionId=${lookupId}`);
        return {
          status: "not_found",
          dbStatus: null as string | null,
          expiresAt: null as Date | null,
          invoiceUrl: `https://nowpayments.io/payment/?iid=${lookupId}`,
          message: "Payment session not found. Please contact support if you have already paid.",
        };
      }

      console.log(`[CryptoStatus] Found: status=${sub.status}, expiresAt=${sub.expiresAt}`);

      if (sub.status === "active") {
        return {
          status: "finished",
          dbStatus: "active",
          expiresAt: sub.expiresAt,
          invoiceUrl: null as string | null,
          message: "Payment confirmed. VIP activated.",
        };
      }

      // pending = IPN not yet received
      return {
        status: "waiting",
        dbStatus: sub.status,
        expiresAt: null as Date | null,
        invoiceUrl: `https://nowpayments.io/payment/?iid=${lookupId}`,
        message: "Waiting for payment confirmation. This page will update automatically.",
      };
    }),

  // --- Admin: Cancel a subscription -------------------------------------------
  adminCancel: protectedProcedure
    .input(z.object({ subscriptionId: z.number() }))
    .mutation(async ({ input, ctx }) => {
      if (!isAdmin(ctx.user.role)) throw new TRPCError({ code: "FORBIDDEN" });
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const [sub] = await db.select().from(subscriptions).where(eq(subscriptions.id, input.subscriptionId)).limit(1);
      if (!sub) throw new TRPCError({ code: "NOT_FOUND" });
      await db.update(subscriptions).set({ status: "cancelled", updatedAt: new Date() }).where(eq(subscriptions.id, input.subscriptionId));
      // Downgrade user role if no other active sub
      const active = await db.select().from(subscriptions)
        .where(and(eq(subscriptions.userId, sub.userId), eq(subscriptions.status, "active")))
        .limit(1);
      if (active.length === 0) await updateUserRole(sub.userId, "user");
      return { success: true };
    }),

  // --- Admin: Extend a subscription by N days ----------------------------------
  adminExtend: protectedProcedure
    .input(z.object({ subscriptionId: z.number(), days: z.number().min(1).max(3650) }))
    .mutation(async ({ input, ctx }) => {
      if (!isAdmin(ctx.user.role)) throw new TRPCError({ code: "FORBIDDEN" });
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const [sub] = await db.select().from(subscriptions).where(eq(subscriptions.id, input.subscriptionId)).limit(1);
      if (!sub) throw new TRPCError({ code: "NOT_FOUND" });
      const base = sub.expiresAt && sub.expiresAt > new Date() ? sub.expiresAt : new Date();
      const newExpiry = new Date(base);
      newExpiry.setDate(newExpiry.getDate() + input.days);
      await db.update(subscriptions).set({ expiresAt: newExpiry, status: "active", updatedAt: new Date() }).where(eq(subscriptions.id, input.subscriptionId));
      await updateUserRole(sub.userId, "vip");
      return { success: true, newExpiry };
    }),

  // --- Admin: Manually grant VIP ----------------------------------------------
  grantVip: protectedProcedure
    .input(z.object({ userId: z.number(), days: z.number().min(1).max(3650) }))
    .mutation(async ({ input, ctx }) => {
      if (!isAdmin(ctx.user.role)) {
        throw new TRPCError({ code: "FORBIDDEN" });
      }

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
      console.log(`[GrantVIP] Manual grant: userId=${input.userId}, days=${input.days}`);

      return { success: true };
    }),
});
