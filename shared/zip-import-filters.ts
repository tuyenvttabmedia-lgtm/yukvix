/** Status groups for ZIP Import dashboard filters. `null` means no status constraint. */
export const ZIP_JOB_STATUS_GROUPS: Record<string, string[] | null> = {
  all: null,
  active: ["processing", "scheduled", "waiting_disk_space"],
  queued: ["uploaded", "waiting"],
  completed: ["completed"],
  failed: ["failed"],
  cancelled: ["cancelled"],
  expired: ["expired"],
};

export function zipJobStatusesForFilter(filter?: string | null): string[] | null {
  if (!filter || filter === "all") return null;
  if (Object.prototype.hasOwnProperty.call(ZIP_JOB_STATUS_GROUPS, filter)) {
    return ZIP_JOB_STATUS_GROUPS[filter];
  }
  return [filter];
}
