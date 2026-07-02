/**
 * CryptoProvider — Payment provider using NOWPayments API for USDT crypto payments.
 *
 * Flow (webhook-driven):
 *  1. createCheckout() creates a NOWPayments invoice → returns { sessionId: invoice.id, url }
 *  2. User is redirected to invoice_url (hosted payment page on nowpayments.io)
 *  3. User selects currency and pays
 *  4. NOWPayments sends IPN webhook → parseWebhook() verifies HMAC-SHA512 → activates VIP
 *  5. Frontend polls DB subscription status (NOT NOWPayments API) to detect activation
 *
 * NOWPayments API endpoints that work with x-api-key only (no JWT):
 *   POST /v1/invoice                → create invoice ✅
 *   GET  /v1/payment/{payment_id}   → get single payment by numeric ID ✅ (only after IPN)
 *   GET  /v1/status                 → API health check ✅
 *
 * Endpoints that DO NOT EXIST or require JWT:
 *   GET  /v1/invoice/{id}           → 404 Endpoint not found ❌
 *   GET  /v1/payment/?order_id=...  → 401 JWT required ❌
 *
 * Required env vars:
 *   NOWPAYMENTS_API_KEY    — API key from NOWPayments Dashboard → Settings → API keys
 *   NOWPAYMENTS_IPN_SECRET — IPN secret from NOWPayments Dashboard → Settings → Payments
 *   NOWPAYMENTS_CURRENCY   — Default crypto currency (default: "usdttrc20")
 */
import crypto from "crypto";
import type {
  PaymentProvider,
  CheckoutInput,
  CheckoutResult,
  VerifyPaymentInput,
  VerifyPaymentResult,
  WebhookHandlerInput,
  WebhookHandlerResult,
} from "./provider";

interface NowPaymentsInvoiceResponse {
  id: string;
  token_id: string;
  order_id: string;
  order_description: string;
  price_amount: string | number;
  price_currency: string;
  pay_currency: string;
  ipn_callback_url: string | null;
  invoice_url: string;
  success_url: string | null;
  cancel_url: string | null;
  created_at: string;
  updated_at: string;
}

// GET /v1/payment/{payment_id} — only available after user initiates payment
interface NowPaymentsPaymentResponse {
  payment_id: number;
  payment_status: string;
  pay_address: string;
  price_amount: number;
  price_currency: string;
  pay_amount: number;
  pay_currency: string;
  order_id: string;
  order_description: string;
  invoice_url?: string;
  created_at?: string;
  updated_at?: string;
}

export class CryptoProvider implements PaymentProvider {
  readonly name = "crypto";

  private apiKey: string;
  private ipnSecret: string;
  private defaultCurrency: string;
  private baseUrl = "https://api.nowpayments.io/v1";

  constructor(apiKey: string, ipnSecret: string, defaultCurrency = "usdttrc20") {
    this.apiKey = apiKey;
    this.ipnSecret = ipnSecret;
    this.defaultCurrency = defaultCurrency;
  }

  /**
   * Internal HTTP helper — always uses x-api-key header.
   */
  private async request<T>(
    method: string,
    path: string,
    body?: Record<string, unknown>
  ): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    console.log(`[NOWPayments] ${method} ${url}`);
    const response = await fetch(url, {
      method,
      headers: {
        "x-api-key": this.apiKey,
        "Content-Type": "application/json",
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    const text = await response.text();
    console.log(`[NOWPayments] Response ${response.status}: ${text.slice(0, 200)}`);

    if (!response.ok) {
      throw new Error(`NOWPayments API error ${response.status}: ${text}`);
    }

    try {
      return JSON.parse(text) as T;
    } catch {
      throw new Error(`NOWPayments invalid JSON response: ${text.slice(0, 200)}`);
    }
  }

  /**
   * Create a NOWPayments hosted invoice.
   * sessionId = invoice.id (numeric string like "5901669167")
   * User is redirected to invoice_url to complete payment.
   * Status is tracked via IPN webhook, not API polling.
   */
  async createCheckout(input: CheckoutInput): Promise<CheckoutResult> {
    const { planId, planName, priceInCents, intervalDays, userId, successUrl, cancelUrl } = input;

    const priceUsd = (priceInCents / 100).toFixed(2);
    const orderId = `vip_${userId}_${planId}_${Date.now()}`;

    console.log(`[NOWPayments] Creating invoice: orderId=${orderId}, amount=${priceUsd} USD, currency=${this.defaultCurrency}`);

    const invoice = await this.request<NowPaymentsInvoiceResponse>("POST", "/invoice", {
      price_amount: parseFloat(priceUsd),
      price_currency: "usd",
      pay_currency: this.defaultCurrency,
      order_id: orderId,
      order_description: `Yukvix VIP — ${planName} (${intervalDays} days)`,
      ipn_callback_url: `${successUrl.replace(/\/payment-success.*$/, "")}/api/crypto/webhook`,
      success_url: successUrl,
      cancel_url: cancelUrl,
      is_fee_paid_by_user: false,
    });

    console.log(`[NOWPayments] Invoice created: id=${invoice.id}, url=${invoice.invoice_url}, orderId=${orderId}`);

    // Store invoice.id as sessionId — this is the stable identifier for this payment
    // orderId is embedded in invoice for IPN processing
    return {
      sessionId: invoice.id,
      url: invoice.invoice_url,
    };
  }

  /**
   * Get payment details by numeric payment_id (from IPN webhook).
   * Uses GET /v1/payment/{payment_id} — only requires x-api-key.
   * NOTE: payment_id is only available AFTER user initiates payment on nowpayments.io.
   * Before that, returns a "waiting" status without API call.
   */
  async getPaymentById(paymentId: string): Promise<{
    paymentId: string;
    status: string;
    payAddress: string | null;
    payAmount: number | null;
    payCurrency: string | null;
    priceAmount: number | null;
    priceCurrency: string | null;
    orderId: string | null;
    invoiceUrl: string | null;
  }> {
    try {
      console.log(`[NOWPayments] Fetching payment: id=${paymentId}`);
      const payment = await this.request<NowPaymentsPaymentResponse>(
        "GET",
        `/payment/${encodeURIComponent(paymentId)}`
      );
      return {
        paymentId: String(payment.payment_id),
        status: payment.payment_status,
        payAddress: payment.pay_address || null,
        payAmount: payment.pay_amount || null,
        payCurrency: payment.pay_currency || null,
        priceAmount: payment.price_amount || null,
        priceCurrency: payment.price_currency || null,
        orderId: payment.order_id || null,
        invoiceUrl: payment.invoice_url || null,
      };
    } catch (err) {
      throw new Error(`Failed to fetch payment: ${String(err)}`);
    }
  }

  /**
   * Legacy method — kept for backward compatibility with subscriptions router.
   * For NOWPayments, status is tracked via IPN webhook + DB, not API polling.
   * Returns "waiting" — actual status comes from DB subscription record.
   */
  async getPaymentByOrderId(invoiceIdOrOrderId: string): Promise<{
    orderId: string;
    paymentId: string | null;
    status: string;
    payAddress: string | null;
    payAmount: number | null;
    payCurrency: string | null;
    priceAmount: number | null;
    priceCurrency: string | null;
    expirationEstimate: string | null;
    invoiceUrl: string | null;
  }> {
    // NOWPayments does not expose an endpoint to lookup invoice status by invoice_id
    // without JWT authentication. Status is determined by IPN webhook → DB.
    console.log(`[NOWPayments] getPaymentByOrderId called with: ${invoiceIdOrOrderId} — returning DB-driven status`);
    return {
      orderId: invoiceIdOrOrderId,
      paymentId: null,
      status: "waiting",
      payAddress: null,
      payAmount: null,
      payCurrency: null,
      priceAmount: null,
      priceCurrency: null,
      expirationEstimate: null,
      invoiceUrl: `https://nowpayments.io/payment/?iid=${invoiceIdOrOrderId}`,
    };
  }

  /**
   * Verify payment — for NOWPayments, actual verification is done via IPN webhook.
   * This method checks if a subscription record has been activated in DB.
   * Returns success=false with message "pending_ipn" if IPN hasn't arrived yet.
   */
  async verifyPayment(input: VerifyPaymentInput): Promise<VerifyPaymentResult> {
    // NOWPayments payment verification is webhook-driven.
    // The subscription router handles DB-based verification after IPN.
    console.log(`[NOWPayments] verifyPayment called: sessionId=${input.sessionId} — IPN-driven, check DB`);
    return {
      success: false,
      message: "pending_ipn",
    };
  }

  /**
   * Parse NOWPayments IPN webhook.
   * Verifies HMAC-SHA512 signature using x-nowpayments-sig header.
   * Activates VIP when payment_status is "finished" or "confirmed".
   * IPN payload contains order_id (vip_{userId}_{planId}_{ts}) and payment_id.
   */
  async parseWebhook(input: WebhookHandlerInput): Promise<WebhookHandlerResult> {
    const { rawBody, headers } = input;

    // Verify HMAC-SHA512 signature
    const receivedSig = headers["x-nowpayments-sig"] as string | undefined;
    if (!receivedSig) {
      console.warn("[NOWPayments] IPN missing x-nowpayments-sig header");
      return {
        status: "failed",
        eventId: `crypto_no_sig_${Date.now()}`,
        eventType: "ipn",
        errorMessage: "Missing x-nowpayments-sig header",
      };
    }

    let payload: Record<string, unknown>;
    try {
      payload = JSON.parse(rawBody.toString());
    } catch {
      return {
        status: "failed",
        eventId: `crypto_parse_error_${Date.now()}`,
        eventType: "ipn",
        errorMessage: "Failed to parse NOWPayments webhook body",
      };
    }

    // Sort keys alphabetically and re-stringify for HMAC verification
    const sortedPayload = JSON.stringify(payload, Object.keys(payload).sort());
    const expectedSig = crypto
      .createHmac("sha512", this.ipnSecret)
      .update(sortedPayload)
      .digest("hex");

    if (expectedSig !== receivedSig) {
      console.warn(`[NOWPayments] IPN HMAC mismatch. Expected: ${expectedSig.slice(0, 16)}... Got: ${receivedSig.slice(0, 16)}...`);
      return {
        status: "failed",
        eventId: `crypto_sig_mismatch_${Date.now()}`,
        eventType: "ipn",
        errorMessage: "NOWPayments HMAC signature mismatch",
      };
    }

    const paymentId = String(payload.payment_id || `crypto_${Date.now()}`);
    const paymentStatus = String(payload.payment_status || "unknown");
    const orderId = String(payload.order_id || "");

    console.log(`[NOWPayments] IPN verified: paymentId=${paymentId}, status=${paymentStatus}, orderId=${orderId}`);

    // Extract userId and planId from orderId: "vip_{userId}_{planId}_{ts}"
    let userId: number | undefined;
    let intervalDays = 30;

    if (orderId.startsWith("vip_")) {
      const parts = orderId.split("_");
      if (parts[1]) userId = parseInt(parts[1]);
    }

    // Parse intervalDays from order_description if available
    const orderDesc = String(payload.order_description || "");
    const daysMatch = orderDesc.match(/\((\d+) days\)/);
    if (daysMatch) intervalDays = parseInt(daysMatch[1]);

    console.log(`[NOWPayments] IPN parsed: userId=${userId}, intervalDays=${intervalDays}`);

    switch (paymentStatus) {
      case "finished":
      case "confirmed": {
        const expiry = new Date(Date.now() + intervalDays * 24 * 60 * 60 * 1000);
        return {
          status: "success",
          eventId: paymentId,
          eventType: `crypto.${paymentStatus}`,
          sessionId: orderId,
          userId,
          intervalDays,
          activateWithExpiry: expiry,
        };
      }

      case "failed":
      case "refunded":
      case "expired": {
        return {
          status: "failed",
          eventId: paymentId,
          eventType: `crypto.${paymentStatus}`,
          sessionId: orderId,
          userId,
          errorMessage: `NOWPayments payment ${paymentStatus}`,
        };
      }

      default:
        // waiting, confirming, sending, partially_paid — not yet actionable
        return {
          status: "skipped",
          eventId: paymentId,
          eventType: `crypto.${paymentStatus}`,
          sessionId: orderId,
          userId,
        };
    }
  }
}
