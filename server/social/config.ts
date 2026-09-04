import type { SocialDistributionConfig, SocialPlatform } from "./types";

export const SOCIAL_CONFIG_KEY = "social_distribution_config";

export const DEFAULT_SOCIAL_CONFIG: SocialDistributionConfig = {
  enabled: true,
  contentRating: "mature",
  defaultDelayMinutes: 15,
  platforms: {
    telegram: {
      enabled: true,
      defaultAutoShare: false,
      maxImages: 10,
      delayMinutes: 5,
    },
    mastodon: {
      enabled: true,
      defaultAutoShare: false,
      maxImages: 4,
      delayMinutes: 15,
    },
    bluesky: {
      enabled: true,
      defaultAutoShare: false,
      maxImages: 4,
      delayMinutes: 20,
    },
    x: {
      enabled: false,
      defaultAutoShare: false,
      maxImages: 4,
      delayMinutes: 30,
      requireApproval: true,
    },
  },
};

function asObject(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function mergePlatform(
  fallback: SocialDistributionConfig["platforms"][SocialPlatform],
  override: unknown
): SocialDistributionConfig["platforms"][SocialPlatform] {
  const o = asObject(override) ?? {};
  return {
    enabled: typeof o.enabled === "boolean" ? o.enabled : fallback.enabled,
    defaultAutoShare:
      typeof o.defaultAutoShare === "boolean"
        ? o.defaultAutoShare
        : fallback.defaultAutoShare,
    maxImages:
      typeof o.maxImages === "number" && o.maxImages > 0
        ? o.maxImages
        : fallback.maxImages,
    delayMinutes:
      typeof o.delayMinutes === "number" && o.delayMinutes >= 0
        ? o.delayMinutes
        : fallback.delayMinutes,
    requireApproval:
      typeof o.requireApproval === "boolean"
        ? o.requireApproval
        : fallback.requireApproval,
  };
}

export function parseSocialConfig(
  raw: string | null | undefined
): SocialDistributionConfig {
  if (!raw) return structuredClone(DEFAULT_SOCIAL_CONFIG);
  try {
    const parsed = asObject(JSON.parse(raw));
    if (!parsed) return structuredClone(DEFAULT_SOCIAL_CONFIG);
    const platforms = asObject(parsed.platforms) ?? {};
    return {
      enabled:
        typeof parsed.enabled === "boolean"
          ? parsed.enabled
          : DEFAULT_SOCIAL_CONFIG.enabled,
      contentRating:
        typeof parsed.contentRating === "string" && parsed.contentRating.trim()
          ? parsed.contentRating
          : DEFAULT_SOCIAL_CONFIG.contentRating,
      defaultDelayMinutes:
        typeof parsed.defaultDelayMinutes === "number" &&
        parsed.defaultDelayMinutes >= 0
          ? parsed.defaultDelayMinutes
          : DEFAULT_SOCIAL_CONFIG.defaultDelayMinutes,
      platforms: {
        telegram: mergePlatform(
          DEFAULT_SOCIAL_CONFIG.platforms.telegram,
          platforms.telegram
        ),
        mastodon: mergePlatform(
          DEFAULT_SOCIAL_CONFIG.platforms.mastodon,
          platforms.mastodon
        ),
        bluesky: mergePlatform(
          DEFAULT_SOCIAL_CONFIG.platforms.bluesky,
          platforms.bluesky
        ),
        x: mergePlatform(DEFAULT_SOCIAL_CONFIG.platforms.x, platforms.x),
      },
    };
  } catch {
    return structuredClone(DEFAULT_SOCIAL_CONFIG);
  }
}

export function delayMinutesFor(
  config: SocialDistributionConfig,
  platform: SocialPlatform
): number {
  return config.platforms[platform]?.delayMinutes ?? config.defaultDelayMinutes;
}

export async function loadSocialConfig(): Promise<SocialDistributionConfig> {
  const { getDb } = await import("../db");
  const { adminSettings } = await import("../../drizzle/schema");
  const { eq } = await import("drizzle-orm");
  const db = await getDb();
  if (!db) return structuredClone(DEFAULT_SOCIAL_CONFIG);
  const rows = await db
    .select({ value: adminSettings.value })
    .from(adminSettings)
    .where(eq(adminSettings.key, SOCIAL_CONFIG_KEY))
    .limit(1);
  return parseSocialConfig(rows[0]?.value);
}
