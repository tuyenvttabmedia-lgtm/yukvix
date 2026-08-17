/**
 * Phase 8 — Job timeline from importLogs + job timestamps (no pipeline hooks).
 */

import { eq } from "drizzle-orm";
import { getDb } from "../db";
import { zipImportJobs } from "../../drizzle/schema";

export interface TimelineEntry {
  at: string;
  event: string;
  step?: string;
  detail?: string;
}

const STEP_LOG_RE = /\[Step:([\w_]+)\]/;
const STEP_COMPLETE_RE = /\[Step:([\w_]+)\] completed in (\d+)ms/;
const SEO_RE = /\[SEO\]/;

export function parseImportLogsToTimeline(logs: string[]): TimelineEntry[] {
  const entries: TimelineEntry[] = [];

  for (const line of logs) {
    const tsMatch = line.match(/^\[([^\]]+)\]/);
    const at = tsMatch?.[1] ?? new Date().toISOString();
    const body = tsMatch ? line.slice(tsMatch[0].length).trim() : line;

    const stepComplete = body.match(STEP_COMPLETE_RE);
    if (stepComplete) {
      entries.push({
        at,
        event: "STEP_COMPLETED",
        step: stepComplete[1],
        detail: `${stepComplete[2]}ms`,
      });
      continue;
    }

    const stepMatch = body.match(STEP_LOG_RE);
    if (stepMatch) {
      entries.push({ at, event: "STEP", step: stepMatch[1], detail: body });
      continue;
    }

    if (SEO_RE.test(body)) {
      entries.push({ at, event: "SEO", detail: body });
      continue;
    }

    if (body.includes("Import completed")) {
      entries.push({ at, event: "JOB_COMPLETED", detail: body });
      continue;
    }

    if (body.toLowerCase().includes("failed")) {
      entries.push({ at, event: "ERROR", detail: body });
    }
  }

  return entries;
}

export async function getJobTimeline(jobId: number): Promise<TimelineEntry[]> {
  const db = await getDb();
  if (!db) return [];

  const rows = await db
    .select({
      importLogs: zipImportJobs.importLogs,
      createdAt: zipImportJobs.createdAt,
      scheduledAt: zipImportJobs.scheduledAt,
      startedAt: zipImportJobs.startedAt,
      completedAt: zipImportJobs.completedAt,
      status: zipImportJobs.status,
      pipelineStep: zipImportJobs.pipelineStep,
    })
    .from(zipImportJobs)
    .where(eq(zipImportJobs.id, jobId))
    .limit(1);

  const job = rows[0];
  if (!job) return [];

  const entries: TimelineEntry[] = [];

  entries.push({
    at: job.createdAt.toISOString(),
    event: "CREATED",
    detail: "Job created",
  });

  if (job.scheduledAt) {
    entries.push({
      at: job.scheduledAt.toISOString(),
      event: "SCHEDULED",
    });
  }

  if (job.startedAt) {
    entries.push({
      at: job.startedAt.toISOString(),
      event: "STARTED",
    });
  }

  if (job.importLogs) {
    try {
      const logs = JSON.parse(job.importLogs) as string[];
      if (Array.isArray(logs)) {
        entries.push(...parseImportLogsToTimeline(logs));
      }
    } catch {
      // ignore
    }
  }

  if (job.completedAt) {
    entries.push({
      at: job.completedAt.toISOString(),
      event: job.status === "completed" ? "COMPLETED" : job.status.toUpperCase(),
      step: job.pipelineStep ?? undefined,
    });
  }

  entries.sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());
  return entries;
}
