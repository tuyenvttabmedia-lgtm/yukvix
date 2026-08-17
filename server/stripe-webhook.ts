/**
 * Payment webhook handler — provider-agnostic.
 *
 * Routes:
 *   POST /api/ccbill/webhook    — CCBill background post (HTTP POST)
 *   POST /api/crypto/webhook    — NOWPayments IPN (HMAC-SHA512)
 *   POST /api/stripe/webhook    — Stripe (legacy, kept for compatibility)
 *   POST /api/paddle/webhook    — Paddle (legacy, kept for compatibility)
 *
 * All events are logged to webhook_events table for admin monitoring.
 * Legacy export name `registerStripeWebhook` is kept for backward compat.
 */
import express from "express";
import type { Express, Request, Response } from "express";
import { activateSubscription, getDb } from "./db";
import { webhookEvents } from "../drizzle/schema";
import { CCBillProvider } from "./payments/ccbill";
import { CryptoProvider } from "./payments/crypto";
import { StripeProvider } from "./payments/stripe";
import { PaddleProvider } from "./payments/paddle";
import type { WebhookHandlerResult } from "./payments/provider";

async function handleWebhookResult(
  result: WebhookHandlerResult,
  provider: string
): Promise<void> {
  if (result.status === "success" && result.activateWithExpiry) {
    await activateSubscription(result.sessionId || "", result.activateWithExpiry, {
      userId: result.userId,
    });
    console.log(
      `[${provider} Webhook] Subscription activated for session ${result.sessionId}`
    );
  }
}

async function logWebhookEvent(
  result: WebhookHandlerResult,
  provider: string
): Promise<void> {
  try {
    const db = await getDb();
    if (!db) return;
    await db
      .insert(webhookEvents)
      .values({
        providerEventId: result.eventId,
        provider,
        type: result.eventType,
        status: result.status,
        relatedUserId: result.userId ?? null,
        relatedSessionId: result.sessionId ?? null,
        errorMessage: result.errorMessage ?? null,
      })
      .onDuplicateKeyUpdate({
        set: { status: result.status, errorMessage: result.errorMessage ?? null },
      });
  } catch (logErr: any) {
    console.error(`[${provider} Webhook] Failed to log event:`, logErr.message);
  }
}

/** Legacy export name — kept for backward compat with server/_core/index.ts */
export function registerStripeWebhook(app: Express) {

  // --- CCBill webhook ----------------------------------------------------------
  // CCBill sends form-encoded POST (not JSON), so use urlencoded parser
  app.post(
    "/api/ccbill/webhook",
    express.urlencoded({ extended: true }),
    async (req: Request, res: Response) => {
      const accountNum = process.env.CCBILL_ACCOUNT_NUM;
      const flexId = process.env.CCBILL_FLEX_ID;
      const salt = process.env.CCBILL_SALT;

      if (!accountNum || !flexId || !salt) {
        // CCBill not configured — return 200 to prevent CCBill retries
        res.status(200).send("OK");
        return;
      }

      const subaccNum = process.env.CCBILL_SUBACC_NUM || "0000";
      const currencyCode = process.env.CCBILL_CURRENCY_CODE || "840";
      const provider = new CCBillProvider(accountNum, subaccNum, flexId, salt, currencyCode);

      let result: WebhookHandlerResult;

      try {
        result = await provider.parseWebhook({
          rawBody: Buffer.from(JSON.stringify(req.body)),
          headers: req.headers as Record<string, string | string[] | undefined>,
          body: req.body,
        });
      } catch (err: any) {
        console.error("[CCBill Webhook] Parse error:", err.message);
        res.status(400).send("Webhook parse failed");
        return;
      }

      console.log(`[CCBill Webhook] Event: ${result.eventType} | ID: ${result.eventId}`);

      try {
        await handleWebhookResult(result, "ccbill");
        res.status(200).send("OK");
      } catch (err: any) {
        console.error("[CCBill Webhook] Processing error:", err.message);
        result = { ...result, status: "failed", errorMessage: err.message };
        res.status(500).send("Processing failed");
      } finally {
        await logWebhookEvent(result, "ccbill");
      }
    }
  );

  // --- NOWPayments IPN webhook -------------------------------------------------
  app.post(
    "/api/crypto/webhook",
    express.json(),
    async (req: Request, res: Response) => {
      const apiKey = process.env.NOWPAYMENTS_API_KEY;
      const ipnSecret = process.env.NOWPAYMENTS_IPN_SECRET;

      if (!apiKey || !ipnSecret) {
        // Crypto not configured — return 200 to prevent retries
        res.status(200).json({ received: true, note: "Crypto not configured" });
        return;
      }

      const currency = process.env.NOWPAYMENTS_CURRENCY || "usdttrc20";
      const provider = new CryptoProvider(apiKey, ipnSecret, currency);

      let result: WebhookHandlerResult;

      try {
        result = await provider.parseWebhook({
          rawBody: Buffer.from(JSON.stringify(req.body)),
          headers: req.headers as Record<string, string | string[] | undefined>,
          body: req.body,
        });
      } catch (err: any) {
        console.error("[Crypto Webhook] Parse error:", err.message);
        res.status(400).json({ error: "Webhook parse failed" });
        return;
      }

      console.log(`[Crypto Webhook] Event: ${result.eventType} | ID: ${result.eventId}`);

      try {
        await handleWebhookResult(result, "crypto");
        res.status(200).json({ received: true });
      } catch (err: any) {
        console.error("[Crypto Webhook] Processing error:", err.message);
        result = { ...result, status: "failed", errorMessage: err.message };
        res.status(500).json({ error: "Processing failed" });
      } finally {
        await logWebhookEvent(result, "crypto");
      }
    }
  );

  // --- Stripe webhook (legacy) -------------------------------------------------
  app.post(
    "/api/stripe/webhook",
    express.raw({ type: "application/json" }),
    async (req: Request, res: Response) => {
      const stripeKey = process.env.STRIPE_SECRET_KEY;
      if (!stripeKey) {
        res.status(400).json({ error: "Stripe not configured" });
        return;
      }

      const provider = new StripeProvider(stripeKey);
      let result: WebhookHandlerResult;

      try {
        result = await provider.parseWebhook({
          rawBody: req.body as Buffer,
          headers: req.headers as Record<string, string | string[] | undefined>,
        });
      } catch (err: any) {
        console.error("[Stripe Webhook] Parse error:", err.message);
        res.status(400).json({ error: "Webhook parse failed" });
        return;
      }

      // Test event passthrough
      if (result.status === "skipped" && result.eventId.startsWith("evt_test_")) {
        console.log("[Stripe Webhook] Test event detected, returning verification response");
        return res.json({ verified: true });
      }

      console.log(`[Stripe Webhook] Event: ${result.eventType} | ID: ${result.eventId}`);

      try {
        await handleWebhookResult(result, "stripe");
        res.json({ received: true });
      } catch (err: any) {
        console.error("[Stripe Webhook] Processing error:", err.message);
        result = { ...result, status: "failed", errorMessage: err.message };
        res.status(500).json({ error: "Webhook processing failed" });
      } finally {
        await logWebhookEvent(result, "stripe");
      }
    }
  );

  // --- Paddle webhook (legacy) -------------------------------------------------
  app.post(
    "/api/paddle/webhook",
    express.raw({ type: "application/json" }),
    async (req: Request, res: Response) => {
      const paddleKey = process.env.PADDLE_API_KEY;
      if (!paddleKey) {
        res.json({ received: true, note: "Paddle not configured" });
        return;
      }

      const paddleWebhookSecret = process.env.PADDLE_WEBHOOK_SECRET || "";
      const paddleEnv = (process.env.PADDLE_ENVIRONMENT || "sandbox") as "sandbox" | "production";
      const provider = new PaddleProvider(paddleKey, paddleWebhookSecret, paddleEnv);

      let result: WebhookHandlerResult;

      try {
        result = await provider.parseWebhook({
          rawBody: req.body as Buffer,
          headers: req.headers as Record<string, string | string[] | undefined>,
        });
      } catch (err: any) {
        console.error("[Paddle Webhook] Parse error:", err.message);
        res.status(400).json({ error: "Webhook parse failed" });
        return;
      }

      console.log(`[Paddle Webhook] Event: ${result.eventType} | ID: ${result.eventId}`);

      try {
        await handleWebhookResult(result, "paddle");
        res.json({ received: true });
      } catch (err: any) {
        console.error("[Paddle Webhook] Processing error:", err.message);
        result = { ...result, status: "failed", errorMessage: err.message };
        res.status(500).json({ error: "Webhook processing failed" });
      } finally {
        await logWebhookEvent(result, "paddle");
      }
    }
  );
}
