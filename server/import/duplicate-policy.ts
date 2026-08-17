/**
 * Duplicate policy loader — config-driven, not hardcoded in worker.
 */

import { eq } from "drizzle-orm";
import { getDb } from "../db";
import { adminSettings } from "../../drizzle/schema";
import type { DuplicatePolicyConfig, DuplicateRule, DuplicateType } from "./duplicate-types";

const SETTINGS_KEY = "import_duplicate_policy";

const DEFAULT_RULES: Record<DuplicateType, DuplicateRule> = {
  SKIPPED_SHA256: { action: "skip", minConfidence: 1.0 },
  SKIPPED_FILENAME: { action: "skip", minConfidence: 0.85, windowDays: 30 },
  SKIPPED_SIZE: { action: "skip", minConfidence: 0.8, requireSameFilename: false },
  SKIPPED_CREATOR: { action: "skip", minConfidence: 0.85 },
  SKIPPED_TITLE: { action: "skip", minConfidence: 0.9 },
  SKIPPED_IMAGE_HASH: { action: "skip", minConfidence: 0.8, matchPercent: 80 },
};

export const DEFAULT_STRICT_POLICY: DuplicatePolicyConfig = {
  mode: "STRICT",
  rules: { ...DEFAULT_RULES },
};

export const DEFAULT_LENIENT_POLICY: DuplicatePolicyConfig = {
  mode: "LENIENT",
  rules: {
    ...DEFAULT_RULES,
    SKIPPED_FILENAME: { action: "warn", minConfidence: 0.85, windowDays: 30 },
    SKIPPED_SIZE: { action: "warn", minConfidence: 0.8 },
    SKIPPED_CREATOR: { action: "warn", minConfidence: 0.85 },
    SKIPPED_TITLE: { action: "warn", minConfidence: 0.9 },
    SKIPPED_IMAGE_HASH: { action: "warn", minConfidence: 0.8, matchPercent: 80 },
  },
};

function mergePolicy(parsed: Partial<DuplicatePolicyConfig>): DuplicatePolicyConfig {
  const base = parsed.mode === "LENIENT" ? DEFAULT_LENIENT_POLICY : DEFAULT_STRICT_POLICY;
  return {
    mode: parsed.mode || base.mode,
    rules: { ...base.rules, ...(parsed.rules || {}) },
  };
}

export async function loadDuplicatePolicy(): Promise<DuplicatePolicyConfig> {
  const db = await getDb();
  if (!db) return DEFAULT_STRICT_POLICY;

  try {
    const rows = await db
      .select()
      .from(adminSettings)
      .where(eq(adminSettings.key, SETTINGS_KEY))
      .limit(1);
    if (rows[0]?.value) {
      return mergePolicy(JSON.parse(rows[0].value) as Partial<DuplicatePolicyConfig>);
    }
  } catch (err) {
    console.warn("[DuplicatePolicy] Failed to load policy, using STRICT default:", (err as Error).message);
  }
  return DEFAULT_STRICT_POLICY;
}

export async function ensureDuplicatePolicySeeded(): Promise<void> {
  const db = await getDb();
  if (!db) return;

  const rows = await db
    .select({ id: adminSettings.id })
    .from(adminSettings)
    .where(eq(adminSettings.key, SETTINGS_KEY))
    .limit(1);

  if (rows.length === 0) {
    await db.insert(adminSettings).values({
      key: SETTINGS_KEY,
      value: JSON.stringify(DEFAULT_STRICT_POLICY),
    });
    console.log("[DuplicatePolicy] Seeded default STRICT policy");
  }
}

export function shouldSkipForMatch(
  policy: DuplicatePolicyConfig,
  duplicateType: DuplicateType,
  confidence: number
): boolean {
  const rule = policy.rules[duplicateType] || DEFAULT_RULES[duplicateType];
  if (confidence < rule.minConfidence) return false;
  if (policy.mode === "LENIENT" && rule.action === "warn") return false;
  return rule.action === "skip";
}
