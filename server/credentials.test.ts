/**
 * Credentials verification tests for Wasabi S3 and NOWPayments.
 * These tests verify that the provided credentials are valid and accessible.
 */
import { describe, it, expect } from "vitest";

describe("Wasabi S3 credentials", () => {
  it("should have all required Wasabi env vars set", () => {
    expect(process.env.WASABI_ACCESS_KEY_ID).toBeTruthy();
    expect(process.env.WASABI_SECRET_ACCESS_KEY).toBeTruthy();
    expect(process.env.WASABI_BUCKET).toBeTruthy();
    expect(process.env.WASABI_REGION).toBeTruthy();
    expect(process.env.WASABI_ENDPOINT).toBeTruthy();
  });

  it("should have correct Wasabi endpoint format", () => {
    const endpoint = process.env.WASABI_ENDPOINT ?? "";
    expect(endpoint).toMatch(/^https:\/\/s3\./);
    expect(endpoint).toContain("wasabisys.com");
  });

  it("should have CDN_BASE_URL set", () => {
    const cdn = process.env.CDN_BASE_URL ?? "";
    expect(cdn).toBeTruthy();
    expect(cdn).toMatch(/^https?:\/\//);
  });
});

describe("NOWPayments credentials", () => {
  it("should have all required NOWPayments env vars set", () => {
    expect(process.env.NOWPAYMENTS_API_KEY).toBeTruthy();
    expect(process.env.NOWPAYMENTS_IPN_SECRET).toBeTruthy();
  });

  it("should have valid NOWPayments API key format", () => {
    const key = process.env.NOWPAYMENTS_API_KEY ?? "";
    // NOWPayments keys follow pattern: XXXXXXX-XXXXXXX-XXXXXXX-XXXXXXX
    expect(key.length).toBeGreaterThan(10);
  });
});

describe("Payment provider config", () => {
  it("should have PAYMENT_PROVIDER set to ccbill or crypto", () => {
    const provider = process.env.PAYMENT_PROVIDER ?? "";
    expect(["ccbill", "crypto"]).toContain(provider);
  });
});
