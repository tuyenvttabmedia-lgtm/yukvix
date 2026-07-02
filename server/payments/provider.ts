/**
 * Payment Provider Abstraction Layer
 *
 * All payment providers must implement this interface.
 * This allows swapping between Stripe, Paddle, or any future provider
 * without changing the subscription logic or VIP activation flow.
 */

export interface CheckoutInput {
  planId: number;
  planName: string;
  planDescription: string | null;
  /** Price in the smallest unit (e.g. cents for USD) */
  priceInCents: number;
  currency: string;
  intervalDays: number;
  userId: number;
  userEmail: string | null;
  successUrl: string;
  cancelUrl: string;
}

export interface CheckoutResult {
  /** The provider-specific session/order ID — stored as stripeSessionId in DB */
  sessionId: string;
  /** The hosted checkout URL to redirect the user to */
  url: string;
}

export interface VerifyPaymentInput {
  sessionId: string;
}

export interface VerifyPaymentResult {
  success: boolean;
  message?: string;
  intervalDays?: number;
}

export interface WebhookHandlerInput {
  rawBody: Buffer;
  headers: Record<string, string | string[] | undefined>;
  /** Optional pre-parsed body (for form-encoded or JSON payloads already parsed by Express) */
  body?: Record<string, unknown>;
}

export interface WebhookHandlerResult {
  /** The provider event ID (used as providerEventId in DB) */
  eventId: string;
  eventType: string;
  status: "success" | "failed" | "skipped";
  sessionId?: string;
  userId?: number;
  intervalDays?: number;
  /** If set, the subscription should be activated with this expiry */
  activateWithExpiry?: Date;
  errorMessage?: string;
}

export interface PaymentProvider {
  readonly name: string;
  createCheckout(input: CheckoutInput): Promise<CheckoutResult>;
  verifyPayment(input: VerifyPaymentInput): Promise<VerifyPaymentResult>;
  parseWebhook(input: WebhookHandlerInput): Promise<WebhookHandlerResult>;
}
