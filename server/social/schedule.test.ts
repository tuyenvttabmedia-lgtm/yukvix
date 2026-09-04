import { describe, expect, it } from "vitest";
import { parseSocialConfig } from "./config";
import { nextRunAt, shouldRunSchedule } from "./schedule";

describe("telegram random schedule", () => {
  it("does not run when schedule is off", () => {
    expect(
      shouldRunSchedule({
        moduleEnabled: true,
        scheduleEnabled: false,
        intervalHours: 2,
        lastRunAt: null,
      })
    ).toBe(false);
  });

  it("runs immediately when enabled and never ran", () => {
    expect(
      shouldRunSchedule({
        moduleEnabled: true,
        scheduleEnabled: true,
        intervalHours: 4,
        lastRunAt: null,
      })
    ).toBe(true);
  });

  it("waits the configured 2 or 4 hours after last run", () => {
    const now = new Date("2026-09-04T16:00:00.000Z");
    expect(
      shouldRunSchedule({
        moduleEnabled: true,
        scheduleEnabled: true,
        intervalHours: 2,
        lastRunAt: "2026-09-04T14:30:00.000Z",
        now,
      })
    ).toBe(false);
    expect(
      shouldRunSchedule({
        moduleEnabled: true,
        scheduleEnabled: true,
        intervalHours: 2,
        lastRunAt: "2026-09-04T13:59:00.000Z",
        now,
      })
    ).toBe(true);
    expect(
      shouldRunSchedule({
        moduleEnabled: true,
        scheduleEnabled: true,
        intervalHours: 4,
        lastRunAt: "2026-09-04T12:00:00.000Z",
        now,
      })
    ).toBe(true);
  });

  it("parses schedule from stored config and defaults interval to 4h", () => {
    const parsed = parseSocialConfig(
      JSON.stringify({ schedule: { enabled: true, intervalHours: 2 } })
    );
    expect(parsed.schedule).toEqual({ enabled: true, intervalHours: 2 });
    expect(parseSocialConfig(null).schedule).toEqual({
      enabled: false,
      intervalHours: 4,
    });
    expect(
      parseSocialConfig(JSON.stringify({ schedule: { enabled: true, intervalHours: 9 } }))
        .schedule.intervalHours
    ).toBe(4);
  });

  it("computes next run from lastRunAt", () => {
    const next = nextRunAt("2026-09-04T10:00:00.000Z", 4);
    expect(next.toISOString()).toBe("2026-09-04T14:00:00.000Z");
  });
});
