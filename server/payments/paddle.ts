/**
 * PaddleProvider — implements PaymentProvider using Paddle Billing (v2).
 *
 * Paddle Billing uses a hosted overlay checkout (Paddle.js) or a direct
 * checkout link. This provider uses the Paddle Transactions API to create
 * a checkout link that opens Paddle's hosted payment page.
 *
 * Required env vars:
 *   PADDLE_API_KEY      — Paddle API key (from Paddle Dashboard → Developer Tools → Authentication)
 *   PADDLE_WEBHOOK_SECRET — Paddle webhook secret key for signature verification
 *   PADDLE_ENVIRONMENT  — "sandbox" | "production" (default: "sandbox")
 *
 * Paddle Billing docs: https://developer.paddle.com/api-reference/overview
 */
import crypto from "crypto";
import type {
  CheckoutInput,
  CheckoutResult,
  PaymentProvider,
  VerifyPaymentInput,
  VerifyPaymentResult,
  WebhookHandlerInput,
  WebhookHandlerResult,
} from "./provider";

interface PaddleTransactionResponse {
  data: {
    id: string;
    status: string;
    checkout: {
      url: string;
    };
    custom_data?: Record<string, string>;
    details?: {
      totals?: {
        subtotal: string;
      };
    };
  };
}

export class PaddleProvider implements PaymentProvider {
  readonly name = "paddle";
  private apiKey: string;
  private webhookSecret: string;
  private baseUrl: string;

  constructor(apiKey: string, webhookSecret: string, environment: "sandbox" | "production" = "sandbox") {
    this.apiKey = apiKey;
    this.webhookSecret = webhookSecret;
    this.baseUrl =
      environment === "production"
        ? "https://api.paddle.com"
        : "https://sandbox-api.paddle.com";
  }

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Paddle API error ${res.status}: ${text}`);
    }
    return res.json() as Promise<T>;
  }

  async createCheckout(input: CheckoutInput): Promise<CheckoutResult> {
    /**
     * Create a Paddle transaction with a checkout URL.
     * We use price_data (inline price) so no pre-created Paddle Price ID is needed.
     * The transaction ID becomes our sessionId stored in the DB.
     */
    const body = {
      items: [
        {
          price: {
            description: input.planDescription || input.planName,
            name: input.planName,
            billing_cycle: null, // one-time payment
            trial_period: null,
            tax_mode: "account_setting",
            unit_price: {
              amount: input.priceInCents.toString(),
              currency_code: input.currency.toUpperCase(),
            },
            quantity: {
              minimum: 1,
              maximum: 1,
            },
            product: {
              name: input.planName,
              description: input.planDescription || input.planName,
              tax_category: "digital-goods",
            },
          },
          quantity: 1,
        },
      ],
      customer: input.userEmail
        ? { email: input.userEmail }
        : undefined,
      custom_data: {
        userId: input.userId.toString(),
        planId: input.planId.toString(),
        intervalDays: input.intervalDays.toString(),
      },
      checkout: {
        url: input.successUrl,
      },
    };

    const result = await this.request<PaddleTransactionResponse>(
      "POST",
      "/transactions",
      body
    );

    const transactionId = result.data.id;
    const checkoutUrl = result.data.checkout?.url;

    if (!checkoutUrl) {
      throw new Error("Paddle did not return a checkout URL");
    }

    return { sessionId: transactionId, url: checkoutUrl };
  }

  async verifyPayment(input: VerifyPaymentInput): Promise<VerifyPaymentResult> {
    /**
     * Retrieve a Paddle transaction by ID and check its status.
     * Paddle transaction statuses: draft, ready, billed, paid, completed, canceled
     */
    const result = await this.request<PaddleTransactionResponse>(
      "GET",
      `/transactions/${input.sessionId}`
    );

    const status = result.data.status;
    const isPaid = status === "paid" || status === "completed" || status === "billed";

    if (!isPaid) {
      return { success: false, message: `Transaction status: ${status}` };
    }

    const intervalDays = result.data.custom_data?.intervalDays
      ? parseInt(result.data.custom_data.intervalDays)
      : 30;

    return { success: true, intervalDays };
  }

  async parseWebhook(input: WebhookHandlerInput): Promise<WebhookHandlerResult> {
    /**
     * Paddle webhook signature verification.
     * Paddle sends: Paddle-Signature: ts=TIMESTAMP;h1=HMAC_SHA256
     * Signed payload: "ts:rawBody"
     * Docs: https://developer.paddle.com/webhooks/signature-verification
     */
    const signatureHeader = input.headers["paddle-signature"] as string | undefined;

    if (signatureHeader && this.webhookSecret) {
      try {
        const parts = Object.fromEntries(
          signatureHeader.split(";").map((p) => p.split("=", 2) as [string, string])
        );
        const ts = parts["ts"];
        const h1 = parts["h1"];
        const signedPayload = `${ts}:${input.rawBody.toString()}`;
        const expected = crypto
          .createHmac("sha256", this.webhookSecret)
          .update(signedPayload)
          .digest("hex");

        if (expected !== h1) {
          return {
            eventId: `paddle_sig_error_${Date.now()}`,
            eventType: "signature_error",
            status: "failed",
            errorMessage: "Paddle webhook signature verification failed",
          };
        }
      } catch (err: any) {
        return {
          eventId: `paddle_parse_error_${Date.now()}`,
          eventType: "parse_error",
          status: "failed",
          errorMessage: err.message,
        };
      }
    }

    let payload: any;
    try {
      payload = JSON.parse(input.rawBody.toString());
    } catch (err: any) {
      return {
        eventId: `paddle_json_error_${Date.now()}`,
        eventType: "parse_error",
        status: "failed",
        errorMessage: "Invalid JSON in Paddle webhook",
      };
    }

    const eventId: string = payload.notification_id || `paddle_${Date.now()}`;
    const eventType: string = payload.event_type || "unknown";
    const data = payload.data || {};

    // transaction.completed — main event for one-time payments
    if (
      eventType === "transaction.completed" ||
      eventType === "transaction.paid" ||
      eventType === "transaction.billed"
    ) {
      const transactionId: string = data.id;
      const customData = data.custom_data || {};
      const userId = customData.userId ? parseInt(customData.userId) : undefined;
      const intervalDays = customData.intervalDays ? parseInt(customData.intervalDays) : 30;

      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + intervalDays);

      return {
        eventId,
        eventType,
        status: "success",
        sessionId: transactionId,
        userId,
        intervalDays,
        activateWithExpiry: expiresAt,
      };
    }

    // subscription.activated — for recurring subscriptions (future use)
    if (eventType === "subscription.activated" || eventType === "subscription.updated") {
      return {
        eventId,
        eventType,
        status: "skipped",
      };
    }

    return {
      eventId,
      eventType,
      status: "skipped",
    };
  }
}
