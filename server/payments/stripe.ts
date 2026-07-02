/**
 * StripeProvider — wraps existing Stripe Checkout logic into the PaymentProvider interface.
 * Keeps all existing Stripe behaviour intact.
 */
import Stripe from "stripe";
import type {
  CheckoutInput,
  CheckoutResult,
  PaymentProvider,
  VerifyPaymentInput,
  VerifyPaymentResult,
  WebhookHandlerInput,
  WebhookHandlerResult,
} from "./provider";

export class StripeProvider implements PaymentProvider {
  readonly name = "stripe";
  private stripe: Stripe;

  constructor(secretKey: string) {
    this.stripe = new Stripe(secretKey);
  }

  async createCheckout(input: CheckoutInput): Promise<CheckoutResult> {
    const session = await this.stripe.checkout.sessions.create({
      payment_method_types: ["card"],
      mode: "payment",
      customer_email: input.userEmail || undefined,
      line_items: [
        {
          price_data: {
            currency: input.currency,
            product_data: {
              name: input.planName,
              description: input.planDescription || undefined,
            },
            unit_amount: input.priceInCents,
          },
          quantity: 1,
        },
      ],
      metadata: {
        userId: input.userId.toString(),
        planId: input.planId.toString(),
        intervalDays: input.intervalDays.toString(),
      },
      success_url: input.successUrl + "?session_id={CHECKOUT_SESSION_ID}",
      cancel_url: input.cancelUrl,
    });

    return { sessionId: session.id, url: session.url! };
  }

  async verifyPayment(input: VerifyPaymentInput): Promise<VerifyPaymentResult> {
    const session = await this.stripe.checkout.sessions.retrieve(input.sessionId);
    if (session.payment_status !== "paid") {
      return { success: false, message: "Payment not completed" };
    }
    const intervalDays = parseInt(session.metadata?.intervalDays || "30");
    return { success: true, intervalDays };
  }

  async parseWebhook(input: WebhookHandlerInput): Promise<WebhookHandlerResult> {
    const sig = input.headers["stripe-signature"];
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
    let event: Stripe.Event;

    try {
      if (webhookSecret && sig) {
        event = this.stripe.webhooks.constructEvent(
          input.rawBody,
          sig as string,
          webhookSecret
        );
      } else {
        event = JSON.parse(input.rawBody.toString());
      }
    } catch (err: any) {
      return {
        eventId: `stripe_parse_error_${Date.now()}`,
        eventType: "parse_error",
        status: "failed",
        errorMessage: err.message,
      };
    }

    // Test event passthrough
    if (event.id.startsWith("evt_test_")) {
      return {
        eventId: event.id,
        eventType: event.type,
        status: "skipped",
      };
    }

    if (event.type === "checkout.session.completed") {
      const session = event.data.object as Stripe.Checkout.Session;
      const intervalDays = parseInt(session.metadata?.intervalDays || "30");
      const userId = session.metadata?.userId
        ? parseInt(session.metadata.userId)
        : undefined;

      if (session.payment_status === "paid" && session.id) {
        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + intervalDays);
        return {
          eventId: event.id,
          eventType: event.type,
          status: "success",
          sessionId: session.id,
          userId,
          intervalDays,
          activateWithExpiry: expiresAt,
        };
      }
      return {
        eventId: event.id,
        eventType: event.type,
        status: "skipped",
        sessionId: session.id,
        userId,
      };
    }

    return {
      eventId: event.id,
      eventType: event.type,
      status: "skipped",
    };
  }
}
