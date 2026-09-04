import type { SocialDistributionConfig, SocialPlatform } from "./types";

export const SOCIAL_CONFIG_KEY = "social_distribution_config";

export const DEFAULT_SOCIAL_CONFIG: SocialDistributionConfig = {
  enabled: true,
  contentRating: "mature",
  defaultDelayMinutes: 15,
  schedule: {
    enabled: false,
    intervalMinutes: 240,
  },
  schedules: {
    mastodon: { enabled: false, intervalMinutes: 240 },
    bluesky: { enabled: false, intervalMinutes: 240 },
  },
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

export const SOCIAL_SCHEDULE_STATE_KEY = "social_schedule_state";

export const MIN_SCHEDULE_INTERVAL_MINUTES = 5;
export const MAX_SCHEDULE_INTERVAL_MINUTES = 7 * 24 * 60;

export function normalizeScheduleIntervalMinutes(
  minutes: unknown,
  hoursFallback?: unknown
): number {
  const fromMinutes =
    typeof minutes === "number" && Number.isFinite(minutes) ? minutes : null;
  const fromHours =
    typeof hoursFallback === "number" && Number.isFinite(hoursFallback)
      ? hoursFallback * 60
      : null;
  const raw = fromMinutes ?? fromHours ?? 240;
  const rounded = Math.round(raw);
  if (rounded < MIN_SCHEDULE_INTERVAL_MINUTES) return MIN_SCHEDULE_INTERVAL_MINUTES;
  if (rounded > MAX_SCHEDULE_INTERVAL_MINUTES) return MAX_SCHEDULE_INTERVAL_MINUTES;
  return rounded;
}

function parseOneSchedule(raw: unknown): {
  enabled: boolean;
  intervalMinutes: number;
} {
  const o = asObject(raw) ?? {};
  return {
    enabled: o.enabled === true,
    intervalMinutes: normalizeScheduleIntervalMinutes(o.intervalMinutes, o.intervalHours),
  };
}

function parseSchedule(raw: unknown): SocialDistributionConfig["schedule"] {
  return parseOneSchedule(raw);
}

function parsePlatformSchedules(
  raw: unknown
): SocialDistributionConfig["schedules"] {
  const o = asObject(raw) ?? {};
  return {
    mastodon: parseOneSchedule(o.mastodon ?? DEFAULT_SOCIAL_CONFIG.schedules.mastodon),
    bluesky: parseOneSchedule(o.bluesky ?? DEFAULT_SOCIAL_CONFIG.schedules.bluesky),
  };
}

export type SocialSchedulePlatform = "telegram" | "mastodon" | "bluesky";

export function scheduleFor(
  config: SocialDistributionConfig,
  platform: SocialSchedulePlatform
): { enabled: boolean; intervalMinutes: number } {
  if (platform === "telegram") return config.schedule;
  return config.schedules[platform];
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
      schedule: parseSchedule(parsed.schedule),
      schedules: parsePlatformSchedules(parsed.schedules),
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

export async function saveSocialConfig(
  patch: Partial<SocialDistributionConfig> & {
    schedule?: Partial<SocialDistributionConfig["schedule"]>;
  }
): Promise<SocialDistributionConfig> {
  const current = await loadSocialConfig();
  const next: SocialDistributionConfig = {
    ...current,
    ...patch,
    schedule: {
      ...current.schedule,
      ...(patch.schedule ?? {}),
      intervalMinutes: normalizeScheduleIntervalMinutes(
        patch.schedule?.intervalMinutes ?? current.schedule.intervalMinutes,
        patch.schedule && "intervalHours" in (patch.schedule as object)
          ? (patch.schedule as { intervalHours?: unknown }).intervalHours
          : undefined
      ),
    },
    schedules: {
      mastodon: {
        ...current.schedules.mastodon,
        ...(patch.schedules?.mastodon ?? {}),
        intervalMinutes: normalizeScheduleIntervalMinutes(
          patch.schedules?.mastodon?.intervalMinutes ??
            current.schedules.mastodon.intervalMinutes
        ),
      },
      bluesky: {
        ...current.schedules.bluesky,
        ...(patch.schedules?.bluesky ?? {}),
        intervalMinutes: normalizeScheduleIntervalMinutes(
          patch.schedules?.bluesky?.intervalMinutes ??
            current.schedules.bluesky.intervalMinutes
        ),
      },
    },
    platforms: patch.platforms ?? current.platforms,
  };
  const { getDb } = await import("../db");
  const { adminSettings } = await import("../../drizzle/schema");
  const db = await getDb();
  if (!db) return next;
  const value = JSON.stringify(next);
  await db
    .insert(adminSettings)
    .values({ key: SOCIAL_CONFIG_KEY, value })
    .onDuplicateKeyUpdate({ set: { value } });
  return next;
}

export type SocialScheduleState = {
  lastRunAt: string | null;
  lastAlbumId: number | null;
  lastStatus: string | null;
  lastPostId: number | null;
};

function emptyScheduleState(): SocialScheduleState {
  return {
    lastRunAt: null,
    lastAlbumId: null,
    lastStatus: null,
    lastPostId: null,
  };
}

function parseOneScheduleState(raw: unknown): SocialScheduleState {
  const o = asObject(raw);
  if (!o) return emptyScheduleState();
  return {
    lastRunAt: typeof o.lastRunAt === "string" ? o.lastRunAt : null,
    lastAlbumId: typeof o.lastAlbumId === "number" ? o.lastAlbumId : null,
    lastStatus: typeof o.lastStatus === "string" ? o.lastStatus : null,
    lastPostId: typeof o.lastPostId === "number" ? o.lastPostId : null,
  };
}

type ScheduleStateMap = Record<SocialSchedulePlatform, SocialScheduleState>;

function parseScheduleStateMap(raw: string | null | undefined): ScheduleStateMap {
  const empty: ScheduleStateMap = {
    telegram: emptyScheduleState(),
    mastodon: emptyScheduleState(),
    bluesky: emptyScheduleState(),
  };
  if (!raw) return empty;
  try {
    const parsed = asObject(JSON.parse(raw));
    if (!parsed) return empty;
    if (asObject(parsed.telegram) || asObject(parsed.mastodon) || asObject(parsed.bluesky)) {
      return {
        telegram: parseOneScheduleState(parsed.telegram),
        mastodon: parseOneScheduleState(parsed.mastodon),
        bluesky: parseOneScheduleState(parsed.bluesky),
      };
    }
    return { ...empty, telegram: parseOneScheduleState(parsed) };
  } catch {
    return empty;
  }
}

async function loadScheduleStateMap(): Promise<ScheduleStateMap> {
  const { getDb } = await import("../db");
  const { adminSettings } = await import("../../drizzle/schema");
  const { eq } = await import("drizzle-orm");
  const db = await getDb();
  if (!db) {
    return {
      telegram: emptyScheduleState(),
      mastodon: emptyScheduleState(),
      bluesky: emptyScheduleState(),
    };
  }
  const rows = await db
    .select({ value: adminSettings.value })
    .from(adminSettings)
    .where(eq(adminSettings.key, SOCIAL_SCHEDULE_STATE_KEY))
    .limit(1);
  return parseScheduleStateMap(rows[0]?.value);
}

export async function loadScheduleState(
  platform: SocialSchedulePlatform = "telegram"
): Promise<SocialScheduleState> {
  const map = await loadScheduleStateMap();
  return map[platform];
}

export async function saveScheduleState(
  state: SocialScheduleState,
  platform: SocialSchedulePlatform = "telegram"
): Promise<void> {
  const { getDb } = await import("../db");
  const { adminSettings } = await import("../../drizzle/schema");
  const db = await getDb();
  if (!db) return;
  const map = await loadScheduleStateMap();
  map[platform] = state;
  const value = JSON.stringify(map);
  await db
    .insert(adminSettings)
    .values({ key: SOCIAL_SCHEDULE_STATE_KEY, value })
    .onDuplicateKeyUpdate({ set: { value } });
}
