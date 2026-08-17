/**
 * Shared schedule config helpers — local hour (admin UI) ↔ UTC hour (cron gate).
 */

import {
  getSystemTimezone,
  localHourToUtcHour,
  utcHourToLocalHour,
} from "./timezone-utils";

export interface StoredScheduleConfig {
  enabled: boolean;
  batchSize?: number;
  cronHour?: number;
  localHour?: number;
  timezone?: string;
  maxAlbums?: number;
  maxCreators?: number;
  maxTags?: number;
}

export interface ScheduleConfigView {
  enabled: boolean;
  localHour: number;
  cronHourUtc: number;
  timezone: string;
  batchSize?: number;
  maxAlbums?: number;
  maxCreators?: number;
  maxTags?: number;
}

export async function normalizeScheduleConfig(
  raw: StoredScheduleConfig,
  defaults: { localHour: number; batchSize?: number }
): Promise<ScheduleConfigView> {
  const timezone = raw.timezone || (await getSystemTimezone());
  let cronHourUtc = raw.cronHour ?? localHourToUtcHour(defaults.localHour, timezone);
  let localHour =
    raw.localHour ?? utcHourToLocalHour(cronHourUtc, timezone);
  return {
    enabled: raw.enabled ?? false,
    localHour,
    cronHourUtc,
    timezone,
    batchSize: raw.batchSize ?? defaults.batchSize,
    maxAlbums: raw.maxAlbums,
    maxCreators: raw.maxCreators,
    maxTags: raw.maxTags,
  };
}

export async function buildStoredScheduleConfig(
  input: {
    enabled: boolean;
    localHour: number;
    batchSize?: number;
    maxAlbums?: number;
    maxCreators?: number;
    maxTags?: number;
  },
  timezone?: string
): Promise<StoredScheduleConfig & { cronHour: number; localHour: number; timezone: string }> {
  const tz = timezone || (await getSystemTimezone());
  const cronHour = localHourToUtcHour(input.localHour, tz);
  return {
    enabled: input.enabled,
    localHour: input.localHour,
    cronHour,
    timezone: tz,
    batchSize: input.batchSize,
    maxAlbums: input.maxAlbums,
    maxCreators: input.maxCreators,
    maxTags: input.maxTags,
  };
}
