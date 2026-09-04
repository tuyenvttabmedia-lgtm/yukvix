import { describe, expect, it } from "vitest";
import {
  MAX_SCHEDULE_INTERVAL_MINUTES,
  MIN_SCHEDULE_INTERVAL_MINUTES,
  parseSocialConfig,
} from "./config";
import { describeScheduleLastRun, nextRunAt, shouldRunSchedule } from "./schedule";

describe("telegram random schedule", () => {
  it("does not run when schedule is off", () => {
    expect(
      shouldRunSchedule({
        moduleEnabled: true,
        scheduleEnabled: false,
        intervalMinutes: 120,
        lastRunAt: null,
      })
    ).toBe(false);
  });

  it("runs immediately when enabled and never ran", () => {
    expect(
      shouldRunSchedule({
        moduleEnabled: true,
        scheduleEnabled: true,
        intervalMinutes: 240,
        lastRunAt: null,
      })
    ).toBe(true);
  });

  it("waits the configured minutes after last run", () => {
    const now = new Date("2026-09-04T16:00:00.000Z");
    expect(
      shouldRunSchedule({
        moduleEnabled: true,
        scheduleEnabled: true,
        intervalMinutes: 120,
        lastRunAt: "2026-09-04T14:30:00.000Z",
        now,
      })
    ).toBe(false);
    expect(
      shouldRunSchedule({
        moduleEnabled: true,
        scheduleEnabled: true,
        intervalMinutes: 120,
        lastRunAt: "2026-09-04T13:59:00.000Z",
        now,
      })
    ).toBe(true);
    expect(
      shouldRunSchedule({
        moduleEnabled: true,
        scheduleEnabled: true,
        intervalMinutes: 90,
        lastRunAt: "2026-09-04T14:29:00.000Z",
        now,
      })
    ).toBe(true);
    expect(
      shouldRunSchedule({
        moduleEnabled: true,
        scheduleEnabled: true,
        intervalMinutes: 90,
        lastRunAt: "2026-09-04T14:31:00.000Z",
        now,
      })
    ).toBe(false);
  });

  it("parses schedule minutes from stored config, including old intervalHours", () => {
    const parsed = parseSocialConfig(
      JSON.stringify({ schedule: { enabled: true, intervalHours: 2 } })
    );
    expect(parsed.schedule).toEqual({ enabled: true, intervalMinutes: 120 });
    expect(parseSocialConfig(null).schedules).toEqual({
      mastodon: { enabled: false, intervalMinutes: 240 },
      bluesky: { enabled: false, intervalMinutes: 240 },
    });
    expect(
      parseSocialConfig(
        JSON.stringify({ schedule: { enabled: true, intervalMinutes: 90 } })
      ).schedule.intervalMinutes
    ).toBe(90);
    expect(
      parseSocialConfig(
        JSON.stringify({ schedule: { enabled: true, intervalHours: 9 } })
      ).schedule.intervalMinutes
    ).toBe(540);
    expect(
      parseSocialConfig(
        JSON.stringify({ schedule: { enabled: true, intervalMinutes: 1 } })
      ).schedule.intervalMinutes
    ).toBe(MIN_SCHEDULE_INTERVAL_MINUTES);
    expect(
      parseSocialConfig(
        JSON.stringify({ schedule: { enabled: true, intervalMinutes: 99_999 } })
      ).schedule.intervalMinutes
    ).toBe(MAX_SCHEDULE_INTERVAL_MINUTES);
  });

  it("computes next run from lastRunAt in minutes", () => {
    const next = nextRunAt("2026-09-04T10:00:00.000Z", 90);
    expect(next.toISOString()).toBe("2026-09-04T11:30:00.000Z");
  });

  it("describes last-run from live post status instead of queue pending", () => {
    expect(
      describeScheduleLastRun({
        lastPostStatus: "pending",
        lastStatus: "pending",
        lastError: null,
      })
    ).toBe("Đã xếp hàng, đang gửi");
    expect(
      describeScheduleLastRun({
        lastPostStatus: "sent",
        lastStatus: "pending",
        lastError: null,
      })
    ).toBe("Đã lên kênh");
    expect(
      describeScheduleLastRun({
        lastPostStatus: "failed",
        lastStatus: "pending",
        lastError: "telegram timeout",
      })
    ).toBe("Gửi thất bại: telegram timeout");
  });
});
