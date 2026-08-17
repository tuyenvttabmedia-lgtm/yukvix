/**
 * Timezone helpers — reads system.timezone from site_settings (via settings-service).
 */

import { getSetting } from "../settings-service";

const DEFAULT_TZ = "Asia/Ho_Chi_Minh";

export async function getSystemTimezone(): Promise<string> {
  const tz = await getSetting("system.timezone", "", DEFAULT_TZ);
  return tz || DEFAULT_TZ;
}

/** Hour (0–23) in timezone for a given instant. */
export function getHourInTimezone(date: Date, timezone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    hour: "numeric",
    hour12: false,
  }).formatToParts(date);
  const h = parts.find((p) => p.type === "hour")?.value ?? "0";
  return parseInt(h, 10) % 24;
}

/** Format HH:00 in timezone for display. */
export function formatLocalTime(date: Date, timezone: string): string {
  return new Intl.DateTimeFormat("vi-VN", {
    timeZone: timezone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

/** Convert admin-entered local hour → UTC hour for cron gate. */
export function localHourToUtcHour(localHour: number, timezone: string, refDate = new Date()): number {
  const y = refDate.getUTCFullYear();
  const m = refDate.getUTCMonth();
  const d = refDate.getUTCDate();
  for (let utc = 0; utc < 24; utc++) {
    const candidate = new Date(Date.UTC(y, m, d, utc, 0, 0));
    if (getHourInTimezone(candidate, timezone) === localHour) return utc;
  }
  // DST edge: try next day
  for (let utc = 0; utc < 24; utc++) {
    const candidate = new Date(Date.UTC(y, m, d + 1, utc, 0, 0));
    if (getHourInTimezone(candidate, timezone) === localHour) return utc;
  }
  return localHour;
}

/** Convert stored UTC hour → local hour for UI display. */
export function utcHourToLocalHour(utcHour: number, timezone: string, refDate = new Date()): number {
  const y = refDate.getUTCFullYear();
  const m = refDate.getUTCMonth();
  const d = refDate.getUTCDate();
  const candidate = new Date(Date.UTC(y, m, d, utcHour, 0, 0));
  return getHourInTimezone(candidate, timezone);
}

/** Next run: today or tomorrow at configured UTC hour. */
export function computeNextRunUtc(cronHourUtc: number, from = new Date()): Date {
  const next = new Date(from);
  next.setUTCMinutes(0, 0, 0);
  next.setUTCHours(cronHourUtc);
  if (next.getTime() <= from.getTime()) {
    next.setUTCDate(next.getUTCDate() + 1);
  }
  return next;
}
