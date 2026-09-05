/**
 * CCBillProvider — Payment provider using CCBill FlexForms Dynamic Pricing.
 *
 * Flow:
 *  1. createCheckout() builds a signed FlexForms URL with MD5 formDigest
 *  2. CCBill redirects to success/cancel URL after payment
 *  3. parseWebhook() handles CCBill Webhook POST (NewSaleSuccess, Cancellation, etc.)
 *
 * Required env vars:
 *   CCBILL_ACCOUNT_NUM   — 6-digit merchant account number (e.g. "900000")
 *   CCBILL_SUBACC_NUM    — 4-digit sub-account number (e.g. "0000")
 *   CCBILL_FLEX_ID       — FlexForms Flex ID (UUID from CCBill Admin)
 *   CCBILL_SALT          — Encryption/Salt key from CCBill Admin (for formDigest)
 *   CCBILL_CURRENCY_CODE — ISO 4217 numeric code (default "840" = USD)
 *
 * Docs:
 *   https://ccbill.com/doc/dynamic-pricing-user-guide
 *   https://ccbill.com/doc/webhooks-user-guide
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

export class CCBillProvider implements PaymentProvider {
  readonly name = "ccbill";

  private accountNum: string;
  private subaccNum: string;
  private flexId: string;
  private salt: string;
  private currencyCode: string;

  constructor(
    accountNum: string,
    subaccNum: string,
    flexId: string,
    salt: string,
    currencyCode = "840"
  ) {
    this.accountNum = accountNum;
    this.subaccNum = subaccNum;
    this.flexId = flexId;
    this.salt = salt;
    this.currencyCode = currencyCode;
  }

  /**
   * Build a CCBill FlexForms Dynamic Pricing URL.
   * Supports both single-billing and recurring (when intervalDays > 0).
   */
  async createCheckout(input: CheckoutInput): Promise<CheckoutResult> {
    const { planId, planName, priceInCents, intervalDays, userId, successUrl, cancelUrl } = input;

    // Convert cents to dollars with 2 decimal places
    const initialPrice = (priceInCents / 100).toFixed(2);
    const initialPeriod = String(intervalDays > 0 ? intervalDays : 30);
    const isRecurring = intervalDays > 0;

    // Custom pass-through variables (prefixed X- per CCBill convention)
    const customVars: Record<string, string> = {
      "X-userId": String(userId),
      "X-planId": String(planId),
      "X-planName": planName,
      "X-intervalDays": String(intervalDays),
    };

    let params: Record<string, string>;
    let digestInput: string;

    if (isRecurring) {
      // Recurring: formDigest = MD5(initialPrice + initialPeriod + recurringPrice + recurringPeriod + numRebills + currencyCode + salt)
      params = {
        clientSubacc: this.subaccNum,
        initialPrice,
        initialPeriod,
        recurringPrice: initialPrice,
        recurringPeriod: initialPeriod,
        numRebills: "99",
        currencyCode: this.currencyCode,
        ...customVars,
      };
      digestInput = `${initialPrice}${initialPeriod}${initialPrice}${initialPeriod}99${this.currencyCode}${this.salt}`;
    } else {
      // Single billing: formDigest = MD5(initialPrice + initialPeriod + currencyCode + salt)
      params = {
        clientSubacc: this.subaccNum,
        initialPrice,
        initialPeriod,
        currencyCode: this.currencyCode,
        ...customVars,
      };
      digestInput = `${initialPrice}${initialPeriod}${this.currencyCode}${this.salt}`;
    }

    const formDigest = crypto.createHash("md5").update(digestInput).digest("hex");
    params.formDigest = formDigest;

    // Approval/denial post URLs (CCBill redirects here after payment)
    if (successUrl) params.approvedUrl = successUrl;
    if (cancelUrl) params.deniedUrl = cancelUrl;

    const baseUrl = `https://api.ccbill.com/wap-frontflex/flexforms/${this.flexId}`;
    const queryString = new URLSearchParams(params).toString();
    const url = `${baseUrl}?${queryString}`;

    // sessionId is not known until CCBill completes — use a placeholder
    // The real subscriptionId comes back via webhook
    const sessionId = `ccbill_pending_${userId}_${planId}_${Date.now()}`;

    return { sessionId, url };
  }

  /**
   * Verify a payment after redirect using the dynamicPricingValidationDigest.
   * CCBill appends subscriptionId and dynamicPricingValidationDigest to the success URL.
   */
  async verifyPayment(input: VerifyPaymentInput): Promise<VerifyPaymentResult> {
    const { sessionId } = input;

    if (sessionId.startsWith("ccbill_pending_")) {
      return {
        success: false,
        message: "pending_webhook",
      };
    }

    return {
      success: false,
      message: "CCBill activation is webhook-only",
    };
  }

  /**
   * Parse CCBill webhook POST (URL-encoded or JSON).
   * Handles: NewSaleSuccess, Cancellation, Expiration, RenewalSuccess, RenewalFailure.
   *
   * CCBill does NOT sign webhooks with HMAC — instead we verify the
   * dynamicPricingValidationDigest field if present.
   */
  async parseWebhook(input: WebhookHandlerInput): Promise<WebhookHandlerResult> {
    const { rawBody, headers, body } = input;

    let payload: Record<string, string>;
    const contentType = (headers["content-type"] as string) || "";

    try {
      if (body && typeof body === "object" && Object.keys(body).length > 0) {
        payload = Object.fromEntries(
          Object.entries(body).map(([k, v]) => [k, v == null ? "" : String(v)])
        );
      } else if (contentType.includes("application/json")) {
        payload = JSON.parse(rawBody.toString());
      } else {
        const decoded = new URLSearchParams(rawBody.toString());
        payload = Object.fromEntries(decoded.entries());
      }
    } catch {
      return {
        status: "failed",
        eventId: `ccbill_parse_error_${Date.now()}`,
        eventType: "parse_error",
        errorMessage: "Failed to parse CCBill webhook body",
      };
    }

    const eventType = payload.eventType || "unknown";
    const subscriptionId = payload.subscriptionId || `ccbill_${Date.now()}`;
    const clientAccnum = payload.clientAccnum || "";

    // Verify account numbers match our config (if provided)
    if (clientAccnum && clientAccnum !== this.accountNum) {
      return {
        status: "failed",
        eventId: subscriptionId,
        eventType,
        errorMessage: `Account mismatch: received ${clientAccnum}, expected ${this.accountNum}`,
      };
    }

    // Extract custom pass-through variables
    const userId = payload["X-userId"] ? parseInt(payload["X-userId"]) : undefined;
    const intervalDays = payload["X-intervalDays"] ? parseInt(payload["X-intervalDays"]) : 30;

    // Require digest on sale/renewal events — unsigned posts must not activate VIP.
    const validationDigest = payload.dynamicPricingValidationDigest;
    const isSaleEvent =
      eventType === "NewSaleSuccess" ||
      eventType === "RenewalSuccess" ||
      eventType === "UpSaleSuccess";
    if (isSaleEvent) {
      if (!validationDigest || !payload.subscriptionId) {
        return {
          status: "failed",
          eventId: subscriptionId,
          eventType,
          errorMessage: "CCBill digest missing on sale event",
        };
      }
      const expectedApproved = crypto
        .createHash("md5")
        .update(`${payload.subscriptionId}1${this.salt}`)
        .digest("hex");
      const expectedDenied = crypto
        .createHash("md5")
        .update(`${payload.subscriptionId}0${this.salt}`)
        .digest("hex");

      if (validationDigest !== expectedApproved && validationDigest !== expectedDenied) {
        return {
          status: "failed",
          eventId: subscriptionId,
          eventType,
          errorMessage: "CCBill digest verification failed",
        };
      }
    }

    // Handle event types
    switch (eventType) {
      case "NewSaleSuccess":
      case "RenewalSuccess":
      case "UpSaleSuccess": {
        const expiry = new Date(Date.now() + intervalDays * 24 * 60 * 60 * 1000);
        return {
          status: "success",
          eventId: subscriptionId,
          eventType,
          sessionId: subscriptionId,
          userId,
          intervalDays,
          activateWithExpiry: expiry,
        };
      }

      case "NewSaleFailure":
      case "RenewalFailure":
      case "UpSaleFailure": {
        return {
          status: "failed",
          eventId: subscriptionId,
          eventType,
          sessionId: subscriptionId,
          userId,
          errorMessage: payload.reasonForDecline || "Payment declined",
        };
      }

      case "Cancellation":
      case "Expiration":
        // These are handled as "skipped" — VIP expiry is managed by our own scheduler
        return {
          status: "skipped",
          eventId: subscriptionId,
          eventType,
          sessionId: subscriptionId,
          userId,
        };

      default:
        return {
          status: "skipped",
          eventId: subscriptionId,
          eventType,
        };
    }
  }
}
