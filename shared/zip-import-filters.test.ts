import { describe, expect, it } from "vitest";
import { zipJobStatusesForFilter } from "./zip-import-filters";

describe("zipJobStatusesForFilter", () => {
  it("treats all / empty as unfiltered", () => {
    expect(zipJobStatusesForFilter("all")).toBeNull();
    expect(zipJobStatusesForFilter("")).toBeNull();
    expect(zipJobStatusesForFilter(undefined)).toBeNull();
  });

  it("expands ops groups used by the dashboard chips", () => {
    expect(zipJobStatusesForFilter("active")).toEqual([
      "processing",
      "scheduled",
      "waiting_disk_space",
    ]);
    expect(zipJobStatusesForFilter("queued")).toEqual(["uploaded", "waiting"]);
    expect(zipJobStatusesForFilter("failed")).toEqual(["failed"]);
  });

  it("passes through a concrete status", () => {
    expect(zipJobStatusesForFilter("processing")).toEqual(["processing"]);
    expect(zipJobStatusesForFilter("waiting_disk_space")).toEqual(["waiting_disk_space"]);
  });
});
