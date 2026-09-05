import { createHash } from "crypto";
import { describe, expect, it } from "vitest";
import { CCBillProvider } from "./ccbill";

const SALT = "test-salt";

function digest(subscriptionId: string, approved: boolean) {
  return createHash("md5")
    .update(`${subscriptionId}${approved ? "1" : "0"}${SALT}`)
    .digest("hex");
}

describe("CCBillProvider.parseWebhook", () => {
  const provider = new CCBillProvider("900000", "0000", "flex-id", SALT);

  it("reads Express-parsed form body instead of JSON-stringified rawBody", async () => {
    const subscriptionId = "sub_123";
    const body = {
      eventType: "NewSaleSuccess",
      subscriptionId,
      clientAccnum: "900000",
      "X-userId": "42",
      "X-intervalDays": "30",
      dynamicPricingValidationDigest: digest(subscriptionId, true),
    };

    const result = await provider.parseWebhook({
      rawBody: Buffer.from(JSON.stringify(body)),
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body,
    });

    expect(result.status).toBe("success");
    expect(result.userId).toBe(42);
    expect(result.sessionId).toBe(subscriptionId);
    expect(result.activateWithExpiry).toBeInstanceOf(Date);
  });

  it("does not activate a sale event without a valid digest", async () => {
    const result = await provider.parseWebhook({
      rawBody: Buffer.from(""),
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: {
        eventType: "NewSaleSuccess",
        subscriptionId: "sub_123",
        "X-userId": "42",
      },
    });

    expect(result.status).toBe("failed");
    expect(result.activateWithExpiry).toBeUndefined();
  });
});
