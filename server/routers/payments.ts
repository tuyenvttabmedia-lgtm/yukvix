/**
 * Admin Payments Router
 * Covers: Stripe status, plan CRUD, payment history, VIP management, webhook monitoring.
 * Secret keys are NEVER returned to the frontend — only masked status indicators.
 */
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { desc, eq, and, sql, inArray, like, or } from "drizzle-orm";
import { protectedProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import {
  subscriptionPlans,
  subscriptions,
  webhookEvents,
  users,
} from "../../drizzle/schema";
import { isPaymentConfigured, getActiveProviderName, resetProviderCache } from "../payments/index";
import { getPaymentSettings, setSetting, deleteSetting } from "../settings-service";
import { isAdmin, isVipOrAdmin } from '@shared/const';

// -- Helpers ----------------------------------------------------------------------------------
function requireAdmin(role: string) {
  if (!isAdmin(role)) throw new TRPCError({ code: "FORBIDDEN" });
}

function maskKey(key: string | undefined): string {
  if (!key) return "not_set";
  if (key.length < 12) return "***";
  return `${key.slice(0, 7)}...${key.slice(-4)}`;
}

// -- Router --------------------------------------------------------------------
export const paymentsRouter = router({
  // -- Payment Status (provider-agnostic) -------------------------------------
  stripeStatus: protectedProcedure.query(async ({ ctx }) => {
    requireAdmin(ctx.user.role);

    const activeProvider = await getActiveProviderName();
    const configured = await isPaymentConfigured();
    const paymentSettings = await getPaymentSettings();

    // Fetch default currency from plans
    const db = await getDb();
    let currency = "usd";
    if (db) {
      const row = await db.select().from(subscriptionPlans).limit(1);
      if (row[0]?.currency) currency = row[0].currency;
    }

    // Count webhook events
    let webhookEventCount = 0;
    let failedWebhookCount = 0;
    if (db) {
      const [total] = await db.select({ count: sql<number>`count(*)` }).from(webhookEvents);
      const [failed] = await db
        .select({ count: sql<number>`count(*)` })
        .from(webhookEvents)
        .where(eq(webhookEvents.status, "failed"));
      webhookEventCount = Number(total?.count ?? 0);
      failedWebhookCount = Number(failed?.count ?? 0);
    }

    return {
      provider: activeProvider,
      configured,
      mode: "live" as const,
      secretKeyMasked: "n/a",
      publishableKeyMasked: "n/a",
      webhookConfigured: paymentSettings.ccbill.configured || paymentSettings.nowpayments.configured,
      webhookSecretMasked: "n/a",
      currency,
      webhookEventCount,
      failedWebhookCount,
      // Extended payment settings for admin UI
      paymentSettings,
    };
  }),

  // -- Get Payment Config (for admin settings form) -----------------------------
  getPaymentConfig: protectedProcedure.query(async ({ ctx }) => {
    requireAdmin(ctx.user.role);
    return getPaymentSettings();
  }),

  // -- Save Payment Config (writes to DB, invalidates provider cache) ------------
  savePaymentConfig: protectedProcedure
    .input(
      z.object({
        activeProvider: z.enum(["ccbill", "crypto"]).optional(),
        // CCBill toggle
        ccbillEnabled: z.boolean().optional(),
        // CCBill fields
        ccbillAccountNum: z.string().optional(),
        ccbillSubAccountNum: z.string().optional(),
        ccbillFlexId: z.string().optional(),
        ccbillSalt: z.string().optional(),
        ccbillCurrencyCode: z.string().optional(),
        // NOWPayments fields
        nowApiKey: z.string().optional(),
        nowIpnSecret: z.string().optional(),
        nowCurrency: z.string().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      requireAdmin(ctx.user.role);

      const saves: Promise<void>[] = [];

      if (input.activeProvider !== undefined)
        saves.push(setSetting("payment.active_provider", input.activeProvider));

      // CCBill toggle
      if (input.ccbillEnabled !== undefined)
        saves.push(setSetting("payment.ccbill.enabled", input.ccbillEnabled ? "true" : "false"));

      // CCBill
      if (input.ccbillAccountNum !== undefined)
        saves.push(setSetting("payment.ccbill.account_num", input.ccbillAccountNum));
      if (input.ccbillSubAccountNum !== undefined)
        saves.push(setSetting("payment.ccbill.sub_account_num", input.ccbillSubAccountNum));
      if (input.ccbillFlexId !== undefined)
        saves.push(setSetting("payment.ccbill.flex_id", input.ccbillFlexId));
      if (input.ccbillSalt !== undefined && !input.ccbillSalt.includes("••••"))
        saves.push(setSetting("payment.ccbill.salt", input.ccbillSalt));
      if (input.ccbillCurrencyCode !== undefined)
        saves.push(setSetting("payment.ccbill.currency_code", input.ccbillCurrencyCode));

      // NOWPayments
      if (input.nowApiKey !== undefined && !input.nowApiKey.includes("••••"))
        saves.push(setSetting("payment.nowpayments.api_key", input.nowApiKey));
      if (input.nowIpnSecret !== undefined && !input.nowIpnSecret.includes("••••"))
        saves.push(setSetting("payment.nowpayments.ipn_secret", input.nowIpnSecret));
      if (input.nowCurrency !== undefined)
        saves.push(setSetting("payment.nowpayments.currency", input.nowCurrency));

      await Promise.all(saves);

      // Invalidate provider cache so next request uses new settings
      resetProviderCache();

      return { success: true };
    }),

  // -- Plan Management ---------------------------------------------------------
  adminListPlans: protectedProcedure.query(async ({ ctx }) => {
    requireAdmin(ctx.user.role);
    const db = await getDb();
    if (!db) return [];
    const plans = await db
      .select()
      .from(subscriptionPlans)
      .orderBy(subscriptionPlans.sortOrder, subscriptionPlans.createdAt);
    return plans.map((p) => ({
      ...p,
      features: p.features ? JSON.parse(p.features) : [],
    }));
  }),

  adminSavePlan: protectedProcedure
    .input(
      z.object({
        id: z.number().optional(),
        name: z.string().min(1).max(64),
        slug: z.string().min(1).max(64),
        description: z.string().optional(),
        price: z.number().min(0),
        currency: z.string().length(3).default("usd"),
        intervalDays: z.number().min(1),
        stripePriceId: z.string().optional(),
        badge: z.string().max(32).optional(),
        sortOrder: z.number().default(0),
        isActive: z.boolean().default(true),
        features: z.array(z.string()).default([]),
      })
    )
    .mutation(async ({ input, ctx }) => {
      requireAdmin(ctx.user.role);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const data = {
        name: input.name,
        slug: input.slug,
        description: input.description ?? null,
        price: input.price.toFixed(2),
        currency: input.currency,
        intervalDays: input.intervalDays,
        stripePriceId: input.stripePriceId ?? null,
        badge: input.badge ?? null,
        sortOrder: input.sortOrder,
        isActive: input.isActive,
        features: JSON.stringify(input.features),
      };

      if (input.id) {
        await db.update(subscriptionPlans).set(data).where(eq(subscriptionPlans.id, input.id));
        return { id: input.id };
      } else {
        const result = await db.insert(subscriptionPlans).values(data as any);
        return { id: (result as any).insertId };
      }
    }),

  adminTogglePlan: protectedProcedure
    .input(z.object({ id: z.number(), isActive: z.boolean() }))
    .mutation(async ({ input, ctx }) => {
      requireAdmin(ctx.user.role);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      await db
        .update(subscriptionPlans)
        .set({ isActive: input.isActive })
        .where(eq(subscriptionPlans.id, input.id));
      return { success: true };
    }),

  adminDeletePlan: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input, ctx }) => {
      requireAdmin(ctx.user.role);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      // Soft delete — deactivate only (preserve history)
      await db
        .update(subscriptionPlans)
        .set({ isActive: false })
        .where(eq(subscriptionPlans.id, input.id));
      return { success: true };
    }),

  // -- Payment History ---------------------------------------------------------
  adminListPayments: protectedProcedure
    .input(
      z.object({
        page: z.number().min(1).default(1),
        limit: z.number().min(1).max(100).default(20),
        status: z.enum(["active", "expired", "cancelled", "pending", "all"]).default("all"),
      })
    )
    .query(async ({ input, ctx }) => {
      requireAdmin(ctx.user.role);
      const db = await getDb();
      if (!db) return { items: [], total: 0 };

      const offset = (input.page - 1) * input.limit;
      const whereClause =
        input.status !== "all"
          ? eq(subscriptions.status, input.status as any)
          : undefined;

      const query = db
        .select({
          id: subscriptions.id,
          userId: subscriptions.userId,
          planId: subscriptions.planId,
          status: subscriptions.status,
          stripeSessionId: subscriptions.stripeSessionId,
          stripeCustomerId: subscriptions.stripeCustomerId,
          startedAt: subscriptions.startedAt,
          expiresAt: subscriptions.expiresAt,
          cancelledAt: subscriptions.cancelledAt,
          createdAt: subscriptions.createdAt,
          userName: users.name,
          userEmail: users.email,
          planName: subscriptionPlans.name,
          planPrice: subscriptionPlans.price,
          planCurrency: subscriptionPlans.currency,
        })
        .from(subscriptions)
        .leftJoin(users, eq(subscriptions.userId, users.id))
        .leftJoin(subscriptionPlans, eq(subscriptions.planId, subscriptionPlans.id))
        .orderBy(desc(subscriptions.createdAt))
        .limit(input.limit)
        .offset(offset);

      const items = whereClause
        ? await query.where(whereClause)
        : await query;

      const countQuery = db.select({ count: sql<number>`count(*)` }).from(subscriptions);
      const [{ count }] = whereClause
        ? await countQuery.where(whereClause)
        : await countQuery;

      return { items, total: Number(count) };
    }),

  adminPaymentStats: protectedProcedure.query(async ({ ctx }) => {
    requireAdmin(ctx.user.role);
    const db = await getDb();
    if (!db) return { total: 0, active: 0, expired: 0, cancelled: 0, pending: 0, revenue: "0.00" };

    const [totals] = await db
      .select({ count: sql<number>`count(*)` })
      .from(subscriptions);

    const statusCounts = await db
      .select({
        status: subscriptions.status,
        count: sql<number>`count(*)`,
      })
      .from(subscriptions)
      .groupBy(subscriptions.status);

    const byStatus: Record<string, number> = {};
    for (const row of statusCounts) {
      byStatus[row.status] = Number(row.count);
    }

    // Approximate revenue from active + expired paid subscriptions
    const revenueRows = await db
      .select({
        price: subscriptionPlans.price,
        count: sql<number>`count(*)`,
      })
      .from(subscriptions)
      .leftJoin(subscriptionPlans, eq(subscriptions.planId, subscriptionPlans.id))
      .where(inArray(subscriptions.status, ["active", "expired"]))
      .groupBy(subscriptionPlans.price);

    let revenue = 0;
    for (const r of revenueRows) {
      revenue += Number(r.price ?? 0) * Number(r.count ?? 0);
    }

    return {
      total: Number(totals?.count ?? 0),
      active: byStatus["active"] ?? 0,
      expired: byStatus["expired"] ?? 0,
      cancelled: byStatus["cancelled"] ?? 0,
      pending: byStatus["pending"] ?? 0,
      revenue: revenue.toFixed(2),
    };
  }),

  // -- VIP Management ----------------------------------------------------------
  adminListActiveVips: protectedProcedure
    .input(
      z.object({
        page: z.number().min(1).default(1),
        limit: z.number().min(1).max(100).default(20),
        includeExpired: z.boolean().default(false),
        search: z.string().optional(),
      })
    )
    .query(async ({ input, ctx }) => {
      requireAdmin(ctx.user.role);
      const db = await getDb();
      if (!db) return { items: [], total: 0 };

      const offset = (input.page - 1) * input.limit;
      const now = new Date();

      const statusClause = input.includeExpired
        ? eq(subscriptions.status, "expired")
        : and(
            eq(subscriptions.status, "active"),
            sql`${subscriptions.expiresAt} > ${now}`
          );

      const searchClause = input.search
        ? or(
            like(users.name, `%${input.search}%`),
            like(users.email, `%${input.search}%`)
          )
        : undefined;

      const whereClause = searchClause ? and(statusClause, searchClause) : statusClause;

      const items = await db
        .select({
          subId: subscriptions.id,
          userId: subscriptions.userId,
          status: subscriptions.status,
          startedAt: subscriptions.startedAt,
          expiresAt: subscriptions.expiresAt,
          stripeSessionId: subscriptions.stripeSessionId,
          userName: users.name,
          userEmail: users.email,
          planName: subscriptionPlans.name,
          planPrice: subscriptionPlans.price,
          planCurrency: subscriptionPlans.currency,
        })
        .from(subscriptions)
        .leftJoin(users, eq(subscriptions.userId, users.id))
        .leftJoin(subscriptionPlans, eq(subscriptions.planId, subscriptionPlans.id))
        .where(whereClause)
        .orderBy(desc(subscriptions.expiresAt))
        .limit(input.limit)
        .offset(offset);

      const [{ count }] = await db
        .select({ count: sql<number>`count(*)` })
        .from(subscriptions)
        .leftJoin(users, eq(subscriptions.userId, users.id))
        .where(whereClause);

      return { items, total: Number(count) };
    }),

  adminExtendVip: protectedProcedure
    .input(
      z.object({
        subscriptionId: z.number(),
        days: z.number().min(1).max(3650),
      })
    )
    .mutation(async ({ input, ctx }) => {
      requireAdmin(ctx.user.role);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const [sub] = await db
        .select()
        .from(subscriptions)
        .where(eq(subscriptions.id, input.subscriptionId))
        .limit(1);
      if (!sub) throw new TRPCError({ code: "NOT_FOUND", message: "Subscription not found" });

      // Extend from current expiry or now, whichever is later
      const base = sub.expiresAt && sub.expiresAt > new Date() ? sub.expiresAt : new Date();
      const newExpiry = new Date(base);
      newExpiry.setDate(newExpiry.getDate() + input.days);

      await db
        .update(subscriptions)
        .set({ expiresAt: newExpiry, status: "active" })
        .where(eq(subscriptions.id, input.subscriptionId));

      // Ensure user role is vip
      await db
        .update(users)
        .set({ role: "vip" })
        .where(eq(users.id, sub.userId));

      return { success: true, newExpiry };
    }),

  adminCancelVip: protectedProcedure
    .input(z.object({ subscriptionId: z.number() }))
    .mutation(async ({ input, ctx }) => {
      requireAdmin(ctx.user.role);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const [sub] = await db
        .select()
        .from(subscriptions)
        .where(eq(subscriptions.id, input.subscriptionId))
        .limit(1);
      if (!sub) throw new TRPCError({ code: "NOT_FOUND", message: "Subscription not found" });

      await db
        .update(subscriptions)
        .set({ status: "cancelled", cancelledAt: new Date() })
        .where(eq(subscriptions.id, input.subscriptionId));

      // Downgrade user role to regular user
      await db
        .update(users)
        .set({ role: "user" })
        .where(eq(users.id, sub.userId));

      return { success: true };
    }),

  // -- Test Connection ------------------------------------------------------
  testNowpaymentsConnection: protectedProcedure
    .input(
      z.object({
        apiKey: z.string().optional(), // if provided, test with this key instead of stored
      })
    )
    .mutation(async ({ input, ctx }) => {
      requireAdmin(ctx.user.role);
      const { getSetting } = await import("../settings-service");
      // Use provided key or fall back to stored key from DB/env
      const rawKey = (input.apiKey?.trim() && !input.apiKey.includes("••••"))
        ? input.apiKey.trim()
        : await getSetting("payment.nowpayments.api_key", "NOWPAYMENTS_API_KEY", "");
      if (!rawKey) {
        return { success: false, message: "API Key is not configured.", details: null };
      }
      try {
        const res = await fetch("https://api.nowpayments.io/v1/status", {
          headers: { "x-api-key": rawKey },
          signal: AbortSignal.timeout(10000),
        });
        const data = await res.json() as any;
        if (res.ok && data?.message === "OK") {
          return {
            success: true,
            message: "NOWPayments connection successful!",
            details: { status: data.message, httpStatus: res.status },
          };
        }
        return {
          success: false,
            message: `NOWPayments returned an error: ${data?.message ?? res.statusText}`,
          details: { httpStatus: res.status, body: data },
        };
      } catch (err: any) {
        return {
          success: false,
            message: `Unable to connect to NOWPayments: ${err?.message ?? "Network error"}`,
          details: null,
        };
      }
    }),

  testCcbillConnection: protectedProcedure
    .input(
      z.object({
        accountNum: z.string().optional(),
        subAccountNum: z.string().optional(),
        datalinkUsername: z.string().optional(),
        datalinkPassword: z.string().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      requireAdmin(ctx.user.role);
      const { getSetting } = await import("../settings-service");
      const accountNum = (input.accountNum?.trim() && !input.accountNum.includes("••••"))
        ? input.accountNum.trim()
        : await getSetting("payment.ccbill.account_num", "CCBILL_ACCOUNT_NUM", "");
      const subAccountNum = (input.subAccountNum?.trim() && !input.subAccountNum.includes("••••"))
        ? input.subAccountNum.trim()
        : await getSetting("payment.ccbill.sub_account_num", "CCBILL_SUB_ACCOUNT_NUM", "0000");
      const datalinkUser = (input.datalinkUsername?.trim() && !input.datalinkUsername.includes("••••"))
        ? input.datalinkUsername.trim()
        : await getSetting("payment.ccbill.datalink_username", "CCBILL_DATALINK_USERNAME", "");
      const datalinkPass = (input.datalinkPassword?.trim() && !input.datalinkPassword.includes("••••"))
        ? input.datalinkPassword.trim()
        : await getSetting("payment.ccbill.datalink_password", "CCBILL_DATALINK_PASSWORD", "");

      if (!accountNum) {
        return { success: false, message: "Account Number is not configured.", details: null };
      }
      if (!datalinkUser || !datalinkPass) {
        return {
          success: false,
          message: "Datalink Username/Password is not configured. Fill in the form and try again.",
          details: null,
        };
      }

      try {
        // CCBill Datalink API — lightweight auth check via listActiveMemberships with empty date range
        const url = new URL("https://datalink.ccbill.com/utils/subscriptionManagement.cgi");
        url.searchParams.set("clientAccnum", accountNum);
        url.searchParams.set("clientSubacc", subAccountNum || "0000");
        url.searchParams.set("username", datalinkUser);
        url.searchParams.set("password", datalinkPass);
        url.searchParams.set("action", "listActiveMemberships");
        url.searchParams.set("startDate", "01/01/2025");
        url.searchParams.set("endDate", "01/01/2025"); // empty range — just auth check

        const res = await fetch(url.toString(), {
          signal: AbortSignal.timeout(12000),
        });
        const text = await res.text();

        // CCBill returns 200 with XML; auth failure returns error code in XML
        if (res.ok && !text.toLowerCase().includes("authentication") && !text.includes("<Error>")) {
          return {
            success: true,
            message: "CCBill Datalink connection successful!",
            details: { httpStatus: res.status, accountNum },
          };
        }
        const errMatch = text.match(/<Error>([^<]+)<\/Error>/);
        const errMsg = errMatch ? errMatch[1] : text.slice(0, 300);
        return {
          success: false,
            message: `CCBill Datalink error: ${errMsg}`,
          details: { httpStatus: res.status },
        };
      } catch (err: any) {
        return {
          success: false,
            message: `Unable to connect to CCBill: ${err?.message ?? "Network error"}`,
          details: null,
        };
      }
    }),

  // -- Webhook Monitoring ------------------------------------------------------
  adminWebhookEvents: protectedProcedure
    .input(
      z.object({
        limit: z.number().min(1).max(100).default(20),
        status: z.enum(["success", "failed", "skipped", "all"]).default("all"),
      })
    )
    .query(async ({ input, ctx }) => {
      requireAdmin(ctx.user.role);
      const db = await getDb();
      if (!db) return { events: [], failedCount: 0, totalCount: 0 };

      const whereClause =
        input.status !== "all"
          ? eq(webhookEvents.status, input.status as any)
          : undefined;

      const query = db
        .select()
        .from(webhookEvents)
        .orderBy(desc(webhookEvents.processedAt))
            .limit(input.limit);
      const events = whereClause ? await query.where(whereClause) : await query;
      const [{ total }] = await db
        .select({ total: sql<number>`count(*)` })
        .from(webhookEvents);
      const [{ failed }] = await db
        .select({ failed: sql<number>`count(*)` })
        .from(webhookEvents)
        .where(eq(webhookEvents.status, "failed"));
      return {
        events,
        failedCount: Number(failed ?? 0),
        totalCount: Number(total ?? 0),
      };
    }),

  // -- Send Test Webhook --------------------------------------------------------
  sendTestWebhook: protectedProcedure
    .input(
      z.object({
        provider: z.enum(["nowpayments", "ccbill"]),
        // Optional: override origin for webhook URL (defaults to server-side env)
        origin: z.string().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      requireAdmin(ctx.user.role);
      const { getSetting } = await import("../settings-service");

      const origin = input.origin ?? process.env.VITE_OAUTH_PORTAL_URL?.replace("/oauth", "") ?? "http://localhost:3000";
      const baseUrl = origin.replace(/\/+$/, "");

      if (input.provider === "nowpayments") {
        // -- NOWPayments test IPN ----------------------------------------------
        const ipnSecret = await getSetting("payment.nowpayments.ipn_secret", "NOWPAYMENTS_IPN_SECRET", "");
        if (!ipnSecret) {
          return { success: false, message: "IPN Secret is not configured.", logged: false };
        }

        // Build a realistic NOWPayments IPN payload (payment_status: finished)
        const testPayload = {
          payment_id: `test_${Date.now()}`,
          payment_status: "finished",
          pay_address: "TTestWalletAddress123456789",
          price_amount: 9.99,
          price_currency: "usd",
          pay_amount: 9.99,
          actually_paid: 9.99,
          pay_currency: "usdttrc20",
          order_id: `test_order_${Date.now()}`,
          order_description: "Test webhook — admin triggered",
          purchase_id: `test_purchase_${Date.now()}`,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          outcome_amount: 9.99,
          outcome_currency: "usd",
        };

        // Generate HMAC-SHA512 signature (same as NOWPayments real IPN)
        const crypto = await import("crypto");
        const sortedPayload = JSON.stringify(
          Object.keys(testPayload)
            .sort()
            .reduce((acc: Record<string, unknown>, k) => { acc[k] = (testPayload as Record<string, unknown>)[k]; return acc; }, {})
        );
        const hmac = crypto.createHmac("sha512", ipnSecret).update(sortedPayload).digest("hex");

        try {
          const webhookUrl = `${baseUrl}/api/crypto/webhook`;
          console.log(`[Test Webhook] Sending NOWPayments test IPN to: ${webhookUrl}`);
          const res = await fetch(webhookUrl, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "x-nowpayments-sig": hmac,
            },
            body: JSON.stringify(testPayload),
            signal: AbortSignal.timeout(15000),
          });
          const responseText = await res.text();
          console.log(`[Test Webhook] NOWPayments response: ${res.status} — ${responseText}`);
          if (res.ok) {
            return {
              success: true,
              message: `Test IPN sent successfully (HTTP ${res.status}). Webhook pipeline is working. Check Webhook Monitor to see the logged event.`,
              logged: true,
              details: { status: res.status, response: responseText.slice(0, 200) },
            };
          }
          return {
            success: false,
            message: `Webhook endpoint returned HTTP ${res.status}: ${responseText.slice(0, 200)}`,
            logged: false,
            details: { status: res.status, response: responseText.slice(0, 200) },
          };
        } catch (err: any) {
          console.error("[Test Webhook] NOWPayments error:", err.message);
          return { success: false, message: `Connection error: ${err.message}`, logged: false };
        }

      } else {
        // -- CCBill test Background Post ---------------------------------------
        const salt = await getSetting("payment.ccbill.salt", "CCBILL_SALT", "");
        const accountNum = await getSetting("payment.ccbill.account_num", "CCBILL_ACCOUNT_NUM", "");
        const flexId = await getSetting("payment.ccbill.flex_id", "CCBILL_FLEX_ID", "");

        if (!salt || !accountNum || !flexId) {
          return {
            success: false,
            message: "CCBill is not fully configured (requires Account Number, Flex ID and Salt).",
            logged: false,
          };
        }

        // Build a realistic CCBill NewSaleSuccess background post
        const crypto = await import("crypto");
        const testSubscriptionId = `TEST${Date.now()}`;
        const testTimestamp = new Date().toISOString().replace("T", " ").slice(0, 19);
        // CCBill MD5 hash = MD5(subscriptionId + transactionId + clientAccnum + clientSubacc + timestamp + salt)
        const testTransactionId = `TEST_TXN_${Date.now()}`;
        const hashInput = `${testSubscriptionId}${testTransactionId}${accountNum}0000${testTimestamp}${salt}`;
        const md5Hash = crypto.createHash("md5").update(hashInput).digest("hex");

        const testPayload = new URLSearchParams({
          action: "NewSaleSuccess",
          clientAccnum: accountNum,
          clientSubacc: "0000",
          subscriptionId: testSubscriptionId,
          transactionId: testTransactionId,
          billedAmount: "9.99",
          billedCurrencyCode: "840",
          accountingAmount: "9.99",
          accountingCurrencyCode: "840",
          subscriptionTypeId: flexId,
          initialPeriod: "30",
          recurringPeriod: "30",
          rebills: "99",
          nextRenewalDate: new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10),
          timestamp: testTimestamp,
          md5Hash,
          // Mark as test so webhook handler can detect
          testMode: "1",
        });

        try {
          const webhookUrl = `${baseUrl}/api/ccbill/webhook`;
          console.log(`[Test Webhook] Sending CCBill test post to: ${webhookUrl}`);
          const res = await fetch(webhookUrl, {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: testPayload.toString(),
            signal: AbortSignal.timeout(15000),
          });
          const responseText = await res.text();
          console.log(`[Test Webhook] CCBill response: ${res.status} — ${responseText}`);
          if (res.ok) {
            return {
              success: true,
              message: `Test Background Post sent successfully (HTTP ${res.status}). Webhook pipeline is working. Check Webhook Monitor to see the logged event.`,
              logged: true,
              details: { status: res.status, response: responseText.slice(0, 200) },
            };
          }
          return {
            success: false,
            message: `Webhook endpoint returned HTTP ${res.status}: ${responseText.slice(0, 200)}`,
            logged: false,
            details: { status: res.status, response: responseText.slice(0, 200) },
          };
        } catch (err: any) {
          console.error("[Test Webhook] CCBill error:", err.message);
          return { success: false, message: `Connection error: ${err.message}`, logged: false };
        }
      }
    }),

  // --- Admin: Delete a single pending/cancelled subscription ----------------------
  adminDeleteSubscription: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input, ctx }) => {
      requireAdmin(ctx.user.role);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const [sub] = await db.select({ id: subscriptions.id, status: subscriptions.status })
        .from(subscriptions).where(eq(subscriptions.id, input.id)).limit(1);
      if (!sub) throw new TRPCError({ code: "NOT_FOUND" });
      if (!['pending', 'cancelled'].includes(sub.status)) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Only pending or cancelled subscriptions can be deleted" });
      }
      await db.delete(subscriptions).where(eq(subscriptions.id, input.id));
      return { success: true };
    }),

  // --- Admin: Bulk expire all pending sessions older than N hours ----------------
  adminExpirePendingSessions: protectedProcedure
    .input(z.object({ olderThanHours: z.number().min(1).max(168).default(24) }))
    .mutation(async ({ input, ctx }) => {
      requireAdmin(ctx.user.role);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const cutoff = new Date(Date.now() - input.olderThanHours * 3600 * 1000);
      const result = await db.update(subscriptions)
        .set({ status: 'cancelled', updatedAt: new Date() })
        .where(and(
          eq(subscriptions.status, 'pending'),
          sql`${subscriptions.createdAt} < ${cutoff}`
        ));
      const affected = (result as any).rowsAffected ?? 0;
      return { success: true, affected };
    }),

  // --- Admin: Manually trigger VIP expiry reminder emails (3-day window) --------
  adminTriggerVipExpiryNotification: protectedProcedure
    .input(z.object({
      dryRun: z.boolean().default(false), // if true, count only — don't send
    }))
    .mutation(async ({ input, ctx }) => {
      requireAdmin(ctx.user.role);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });

      const { sendVipExpiryReminderEmail } = await import("../email");

      const now = new Date();
      const windowEnd = new Date(now.getTime() + 3 * 24 * 3600 * 1000);
      const dedupCutoff = now.getTime() - 20 * 3600 * 1000;

      const expiringSubs = await db
        .select({
          subId: subscriptions.id,
          userId: subscriptions.userId,
          expiresAt: subscriptions.expiresAt,
          vipExpiryNotifiedAt: subscriptions.vipExpiryNotifiedAt,
          userName: users.name,
          userEmail: users.email,
        })
        .from(subscriptions)
        .leftJoin(users, eq(subscriptions.userId, users.id))
        .where(
          and(
            eq(subscriptions.status, "active"),
            sql`${subscriptions.expiresAt} > ${now}`,
            sql`${subscriptions.expiresAt} <= ${windowEnd}`,
            sql`${users.email} IS NOT NULL`,
            sql`(${subscriptions.vipExpiryNotifiedAt} IS NULL OR ${subscriptions.vipExpiryNotifiedAt} < ${dedupCutoff})`
          )
        )
        .limit(200);

      if (input.dryRun) {
        return { success: true, notified: 0, skipped: 0, errors: 0, total: expiringSubs.length, dryRun: true };
      }

      const baseUrl = process.env.VITE_APP_URL || "https://yukvix.manus.space";
      const renewUrl = `${baseUrl}/vip`;
      let notified = 0, skipped = 0, errors = 0;

      for (const sub of expiringSubs) {
        if (!sub.userEmail) { skipped++; continue; }
        const expiresAt = sub.expiresAt!;
        const daysLeft = Math.ceil((expiresAt.getTime() - now.getTime()) / (24 * 3600 * 1000));
        const result = await sendVipExpiryReminderEmail(
          sub.userEmail,
          sub.userName || "Member",
          expiresAt,
          daysLeft,
          renewUrl
        );
        if (result.success) {
          await db.update(subscriptions)
            .set({ vipExpiryNotifiedAt: Date.now() })
            .where(eq(subscriptions.id, sub.subId));
          notified++;
        } else {
          errors++;
        }
      }

      return { success: true, notified, skipped, errors, total: expiringSubs.length, dryRun: false };
    }),
});
