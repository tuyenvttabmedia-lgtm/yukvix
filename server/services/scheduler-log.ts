/**
 * Scheduler run log — last 30 runs stored in admin_settings.scheduler_run_log.
 */

import { eq } from "drizzle-orm";
import { getDb } from "../db";
import { adminSettings } from "../../drizzle/schema";
import { formatLocalTime, getSystemTimezone } from "./timezone-utils";

export type SchedulerTriggeredBy = "cron" | "manual" | "startup" | "retry";

export type SchedulerDisplayStatus =
  | "disabled"
  | "healthy"
  | "waiting_next_run"
  | "running"
  | "missed";

export interface SchedulerRunEntry {
  id: string;
  timestamp: string;
  schedulerName: string;
  currentUtc: string;
  currentLocal: string;
  timezone: string;
  configuredHourUtc: number;
  configuredHourLocal: number;
  shouldRun: boolean;
  reason: string;
  waitingJobs: number;
  pickedJobs: number[];
  durationMs: number;
  result: string;
  manual: boolean;
  triggeredBy?: SchedulerTriggeredBy;
}

const LOG_KEY = "scheduler_run_log";
const MAX_ENTRIES = 30;
export const SCHEDULER_GRACE_MS = 10 * 60 * 1000;

function newId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function resolveTriggeredBy(entry: {
  manual?: boolean;
  triggeredBy?: SchedulerTriggeredBy;
}): SchedulerTriggeredBy {
  if (entry.triggeredBy) return entry.triggeredBy;
  return entry.manual ? "manual" : "cron";
}

export function isSuccessfulRun(entry: SchedulerRunEntry): boolean {
  if (!entry.shouldRun) return false;
  const r = entry.result.toLowerCase();
  if (r.includes("error") || r.includes("fail")) return false;
  return true;
}

export function getExpectedRunTodayUtc(cronHourUtc: number, now = new Date()): Date {
  const expected = new Date(now);
  expected.setUTCMinutes(0, 0, 0);
  expected.setUTCHours(cronHourUtc);
  return expected;
}

export function getLastSuccessfulRun(
  logs: SchedulerRunEntry[],
  schedulerName: string,
  onOrAfter?: Date
): SchedulerRunEntry | undefined {
  return logs.find((l) => {
    if (l.schedulerName !== schedulerName || !isSuccessfulRun(l)) return false;
    if (onOrAfter && new Date(l.timestamp).getTime() < onOrAfter.getTime()) return false;
    return true;
  });
}

/** @deprecated Use computeSchedulerDisplayStatus */
export function isMissedSchedule(
  enabled: boolean,
  cronHourUtc: number,
  logs: SchedulerRunEntry[],
  schedulerName: string,
  now = new Date()
): boolean {
  return (
    computeSchedulerDisplayStatus({
      enabled,
      configuredHourUtc: cronHourUtc,
      hasHourlySchedule: true,
      logs,
      schedulerName,
      now,
    }) === "missed"
  );
}

export function computeSchedulerDisplayStatus(params: {
  enabled: boolean;
  configuredHourUtc: number;
  hasHourlySchedule: boolean;
  logs: SchedulerRunEntry[];
  schedulerName: string;
  isRunning?: boolean;
  now?: Date;
}): SchedulerDisplayStatus {
  if (!params.enabled) return "disabled";
  if (params.isRunning) return "running";

  if (!params.hasHourlySchedule || params.configuredHourUtc < 0) {
    return "healthy";
  }

  const now = params.now ?? new Date();
  const expectedRun = getExpectedRunTodayUtc(params.configuredHourUtc, now);

  if (now.getTime() < expectedRun.getTime()) {
    return "waiting_next_run";
  }

  const lastSuccessToday = getLastSuccessfulRun(
    params.logs,
    params.schedulerName,
    expectedRun
  );
  if (lastSuccessToday) return "healthy";

  const graceDeadline = expectedRun.getTime() + SCHEDULER_GRACE_MS;
  if (now.getTime() < graceDeadline) {
    return "waiting_next_run";
  }

  return "missed";
}

export type OpsHealthLevel = "healthy" | "warning" | "error";

export function computeSchedulerOpsHealth(
  schedulers: Array<{ enabled: boolean; displayStatus: SchedulerDisplayStatus }>
): OpsHealthLevel {
  const hourly = schedulers.filter((s) => s.enabled);
  if (hourly.some((s) => s.displayStatus === "missed")) return "error";
  if (hourly.some((s) => s.displayStatus === "running")) return "healthy";
  if (hourly.every((s) => s.displayStatus === "disabled")) return "warning";
  return "healthy";
}

export function computeQueueOpsHealth(params: {
  failed: number;
  waitingDiskSpace: number;
  running: number;
}): OpsHealthLevel {
  if (params.failed > 5) return "error";
  if (params.failed > 0 || params.waitingDiskSpace > 0) return "warning";
  return "healthy";
}

export async function getSchedulerRunLog(limit = MAX_ENTRIES): Promise<SchedulerRunEntry[]> {
  try {
    const db = await getDb();
    if (!db) return [];
    const rows = await db
      .select({ value: adminSettings.value })
      .from(adminSettings)
      .where(eq(adminSettings.key, LOG_KEY))
      .limit(1);
    if (!rows[0]?.value) return [];
    const parsed = JSON.parse(rows[0].value) as SchedulerRunEntry[];
    if (!Array.isArray(parsed)) return [];
    return parsed.slice(0, limit).map((e) => ({
      ...e,
      triggeredBy: resolveTriggeredBy(e),
    }));
  } catch {
    return [];
  }
}

export async function appendSchedulerRun(
  entry: Omit<SchedulerRunEntry, "id" | "currentUtc" | "currentLocal" | "timezone" | "triggeredBy"> & {
    currentUtc?: string;
    currentLocal?: string;
    timezone?: string;
    triggeredBy?: SchedulerTriggeredBy;
  }
): Promise<SchedulerRunEntry> {
  const now = new Date();
  const timezone = entry.timezone ?? (await getSystemTimezone());
  const triggeredBy = resolveTriggeredBy(entry);
  const full: SchedulerRunEntry = {
    id: newId(),
    timestamp: now.toISOString(),
    currentUtc: entry.currentUtc ?? now.toISOString(),
    currentLocal: entry.currentLocal ?? formatLocalTime(now, timezone),
    timezone,
    triggeredBy,
    manual: triggeredBy === "manual",
    ...entry,
  };

  console.log(
    `[SchedulerLog] ${full.schedulerName} by=${triggeredBy} shouldRun=${full.shouldRun} reason=${full.reason} jobs=${full.pickedJobs.join(",") || "-"} duration=${full.durationMs}ms`
  );

  try {
    const db = await getDb();
    if (!db) return full;
    const existing = await getSchedulerRunLog(MAX_ENTRIES + 5);
    const updated = [full, ...existing].slice(0, MAX_ENTRIES);
    const value = JSON.stringify(updated);
    const row = await db
      .select({ id: adminSettings.id })
      .from(adminSettings)
      .where(eq(adminSettings.key, LOG_KEY))
      .limit(1);
    if (row.length > 0) {
      await db
        .update(adminSettings)
        .set({ value, updatedAt: new Date() })
        .where(eq(adminSettings.key, LOG_KEY));
    } else {
      await db.insert(adminSettings).values({ key: LOG_KEY, value });
    }
  } catch (err) {
    console.warn("[SchedulerLog] Failed to persist:", (err as Error).message);
  }

  return full;
}

export function getLastRunForScheduler(
  logs: SchedulerRunEntry[],
  schedulerName: string
): SchedulerRunEntry | undefined {
  return logs.find((l) => l.schedulerName === schedulerName);
}
