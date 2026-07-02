/**
 * Payment Provider Factory — 3-Layer Architecture
 *
 * Priority for credentials: DB (site_settings) > env vars > error
 *
 * Active providers: ccbill, crypto
 * Removed: stripe, paddle (no longer supported)
 */
import { getSetting, getPaymentSettings, invalidateSettingsCache } from "../settings-service";
import { CCBillProvider } from "./ccbill";
import { CryptoProvider } from "./crypto";
import type { PaymentProvider } from "./provider";

export type { PaymentProvider, CheckoutInput, CheckoutResult, VerifyPaymentResult, WebhookHandlerResult } from "./provider";
export type ProviderName = "ccbill" | "crypto";

/** Re-export for external callers that need to invalidate after settings change */
export { invalidateSettingsCache };

/** Cached provider instance — reset when settings change */
let _provider: PaymentProvider | null = null;

/** Get the active payment provider (reads from DB > env) */
export async function getPaymentProvider(): Promise<PaymentProvider> {
  if (_provider) return _provider;
  const name = await getActiveProviderName();
  _provider = await buildProvider(name);
  return _provider;
}

/** Get a specific provider by name (for multi-provider checkout) */
export async function getPaymentProviderByName(name: ProviderName): Promise<PaymentProvider> {
  return buildProvider(name);
}

/** Get the name of the active provider (falls back to crypto if CCBill is disabled) */
export async function getActiveProviderName(): Promise<ProviderName> {
  const name = await getSetting("payment.active_provider", "PAYMENT_PROVIDER", "crypto");
  if (name === "ccbill") {
    // If CCBill is disabled, fall back to crypto
    const settings = await getPaymentSettings();
    if (!settings.ccbill.enabled) return "crypto";
    return "ccbill";
  }
  if (name === "crypto") return "crypto";
  return "crypto";
}

/** Build a provider instance reading credentials from DB > env */
async function buildProvider(name: ProviderName): Promise<PaymentProvider> {
  switch (name) {
    case "ccbill": {
      const accountNum = await getSetting("payment.ccbill.account_num", "CCBILL_ACCOUNT_NUM", "");
      const subaccNum = await getSetting("payment.ccbill.sub_account_num", "CCBILL_SUBACC_NUM", "0000");
      const flexId = await getSetting("payment.ccbill.flex_id", "CCBILL_FLEX_ID", "");
      const salt = await getSetting("payment.ccbill.salt", "CCBILL_SALT", "");
      const currencyCode = await getSetting("payment.ccbill.currency_code", "CCBILL_CURRENCY_CODE", "840");

      if (!accountNum || !flexId || !salt) {
        throw new Error(
          "CCBill requires account number, flex ID, and salt. " +
          "Configure them in Admin → Payment Settings."
        );
      }
      return new CCBillProvider(accountNum, subaccNum, flexId, salt, currencyCode);
    }

    case "crypto": {
      const apiKey = await getSetting("payment.nowpayments.api_key", "NOWPAYMENTS_API_KEY", "");
      const ipnSecret = await getSetting("payment.nowpayments.ipn_secret", "NOWPAYMENTS_IPN_SECRET", "");
      const currency = await getSetting("payment.nowpayments.currency", "NOWPAYMENTS_CURRENCY", "usdttrc20");

      if (!apiKey || !ipnSecret) {
        throw new Error(
          "NOWPayments requires API key and IPN secret. " +
          "Configure them in Admin → Payment Settings."
        );
      }
      return new CryptoProvider(apiKey, ipnSecret, currency);
    }

    default:
      throw new Error(`Unknown payment provider: "${name}". Use "ccbill" or "crypto".`);
  }
}

/** Check if a specific provider is configured AND enabled */
export async function isProviderConfigured(name: ProviderName): Promise<boolean> {
  try {
    // Check enabled flag for CCBill
    if (name === "ccbill") {
      const settings = await getPaymentSettings();
      if (!settings.ccbill.enabled) return false;
    }
    await buildProvider(name);
    return true;
  } catch {
    return false;
  }
}

/** Check if any payment provider is configured */
export async function isPaymentConfigured(): Promise<boolean> {
  try {
    await getPaymentProvider();
    return true;
  } catch {
    return false;
  }
}

/** Reset cached provider (called after settings change or in tests) */
export function resetProviderCache() {
  _provider = null;
}
