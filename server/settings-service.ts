/**
 * Settings Service — 3-Layer Architecture
 *
 * Layer 1: .env / platform secrets (infrastructure defaults, never exposed to UI)
 * Layer 2: site_settings table in DB (admin-configurable, overrides env)
 * Layer 3: Admin UI reads/writes via tRPC procedures
 *
 * Priority: DB value > env value > hardcoded default
 *
 * Keys stored in site_settings:
 *   payment.active_provider    — "ccbill" | "crypto"
 *   payment.ccbill.account_num
 *   payment.ccbill.sub_account_num
 *   payment.ccbill.flex_id
 *   payment.ccbill.salt
 *   payment.ccbill.currency_code
 *   payment.nowpayments.api_key
 *   payment.nowpayments.ipn_secret
 *   payment.nowpayments.currency
 *   wasabi.bucket
 *   wasabi.region
 *   wasabi.endpoint
 *   wasabi.access_key_id
 *   wasabi.secret_access_key
 *   wasabi.cdn_base_url
 *   social.credentials_key   — AES-256-GCM key for social account credentials
 */

import { eq } from "drizzle-orm";
import { getDb } from "./db";
import { siteSettings } from "../drizzle/schema";

/** In-memory cache: key → value, refreshed on write */
const cache = new Map<string, string>();
let cacheLoaded = false;

async function loadCache(): Promise<void> {
  if (cacheLoaded) return;
  try {
    const db = await getDb();
    if (!db) return;
    const rows = await db
      .select({ key: siteSettings.key, value: siteSettings.value })
      .from(siteSettings)
      .where(
        // Only load payment.* and wasabi.* keys to avoid loading CMS settings
        eq(siteSettings.key, siteSettings.key) // load all, filter in memory
      );
    for (const row of rows) {
      if (row.value !== null && row.value !== undefined) {
        cache.set(row.key, row.value);
      }
    }
    cacheLoaded = true;
  } catch {
    // DB not ready yet — will retry on next call
  }
}

/** Invalidate cache (called after writes) */
export function invalidateSettingsCache(): void {
  cache.clear();
  cacheLoaded = false;
}

/**
 * Get a setting value.
 * Priority: DB (cache) > env > defaultValue
 */
export async function getSetting(
  key: string,
  envKey?: string,
  defaultValue = ""
): Promise<string> {
  await loadCache();
  // 1. DB value
  if (cache.has(key)) return cache.get(key)!;
  // 2. Env value
  if (envKey && process.env[envKey]) return process.env[envKey]!;
  // 3. Default
  return defaultValue;
}

/**
 * Get a setting synchronously (from cache only, no DB call).
 * Use only after cache is warmed up via getSetting().
 */
export function getSettingSync(key: string, envKey?: string, defaultValue = ""): string {
  if (cache.has(key)) return cache.get(key)!;
  if (envKey && process.env[envKey]) return process.env[envKey]!;
  return defaultValue;
}

/**
 * Set a setting value in DB and update cache.
 */
export async function setSetting(key: string, value: string): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db
    .insert(siteSettings)
    .values({ key, value })
    .onDuplicateKeyUpdate({ set: { value, updatedAt: new Date() } });
  cache.set(key, value);
}

/**
 * Delete a setting from DB (reverts to env/default).
 */
export async function deleteSetting(key: string): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(siteSettings).where(eq(siteSettings.key, key));
  cache.delete(key);
}

/**
 * Get all payment settings as a structured object.
 * Masks sensitive values for display.
 */
export async function getPaymentSettings() {
  await loadCache();

  const activeProvider = await getSetting("payment.active_provider", "PAYMENT_PROVIDER", "crypto");

  // CCBill
  const ccbillAccountNum = await getSetting("payment.ccbill.account_num", "CCBILL_ACCOUNT_NUM", "");
  const ccbillSubAccountNum = await getSetting("payment.ccbill.sub_account_num", "CCBILL_SUB_ACCOUNT_NUM", "0000");
  const ccbillFlexId = await getSetting("payment.ccbill.flex_id", "CCBILL_FLEX_ID", "");
  const ccbillSalt = await getSetting("payment.ccbill.salt", "CCBILL_SALT", "");
  const ccbillCurrencyCode = await getSetting("payment.ccbill.currency_code", "CCBILL_CURRENCY_CODE", "840");

  // CCBill enabled flag
  const ccbillEnabledRaw = await getSetting("payment.ccbill.enabled", "", "true");
  const ccbillEnabled = ccbillEnabledRaw !== "false";

  // NOWPayments
  const nowApiKey = await getSetting("payment.nowpayments.api_key", "NOWPAYMENTS_API_KEY", "");
  const nowIpnSecret = await getSetting("payment.nowpayments.ipn_secret", "NOWPAYMENTS_IPN_SECRET", "");
  const nowCurrency = await getSetting("payment.nowpayments.currency", "NOWPAYMENTS_CURRENCY", "usdttrc20");

  return {
    activeProvider,
    ccbill: {
      accountNum: ccbillAccountNum,
      subAccountNum: ccbillSubAccountNum,
      flexId: ccbillFlexId,
      salt: ccbillSalt ? mask(ccbillSalt) : "",
      saltConfigured: !!ccbillSalt,
      currencyCode: ccbillCurrencyCode,
      configured: !!(ccbillAccountNum && ccbillFlexId && ccbillSalt),
      enabled: ccbillEnabled,
    },
    nowpayments: {
      apiKey: nowApiKey ? mask(nowApiKey) : "",
      apiKeyConfigured: !!nowApiKey,
      ipnSecret: nowIpnSecret ? mask(nowIpnSecret) : "",
      ipnSecretConfigured: !!nowIpnSecret,
      currency: nowCurrency,
      configured: !!(nowApiKey && nowIpnSecret),
    },
  };
}

/** Mask sensitive string: show first 4 + last 4 chars */
function mask(value: string): string {
  if (value.length <= 8) return "••••••••";
  return value.slice(0, 4) + "••••••••" + value.slice(-4);
}

/**
 * Get watermark settings.
 */
export async function getWatermarkSettings() {
  const enabled = await getSetting("watermark.enabled", "", "false");
  const key = await getSetting("watermark.key", "", "");
  const opacity = parseFloat(await getSetting("watermark.opacity", "", "0.4"));
  const position = (await getSetting("watermark.position", "", "southeast")) as
    | "southeast"
    | "southwest"
    | "northeast"
    | "northwest"
    | "center";
  return {
    enabled: enabled === "true",
    key,
    opacity: isNaN(opacity) ? 0.4 : Math.min(1, Math.max(0, opacity)),
    position,
  };
}

/**
 * Get Wasabi settings.
 */
export async function getWasabiSettings() {
  // cdn_enabled: DB value takes priority; env CDN_BASE_URL presence is the fallback default
  const cdnEnabledRaw = await getSetting("wasabi.cdn_enabled", "", "");
  // If no DB value, default ON when CDN_BASE_URL env is set, OFF otherwise
  const cdnEnabled =
    cdnEnabledRaw !== ""
      ? cdnEnabledRaw === "true"
      : !!process.env.CDN_BASE_URL;
  return {
    bucket: await getSetting("wasabi.bucket", "WASABI_BUCKET", ""),
    region: await getSetting("wasabi.region", "WASABI_REGION", "us-east-1"),
    endpoint: await getSetting("wasabi.endpoint", "WASABI_ENDPOINT", ""),
    accessKeyId: await getSetting("wasabi.access_key_id", "WASABI_ACCESS_KEY_ID", ""),
    secretAccessKey: await getSetting("wasabi.secret_access_key", "WASABI_SECRET_ACCESS_KEY", ""),
    cdnBaseUrl: await getSetting("wasabi.cdn_base_url", "CDN_BASE_URL", ""),
    cdnEnabled,
  };
}
