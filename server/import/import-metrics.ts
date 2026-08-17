/**
 * Phase 8 — Import + Worker dashboards, metrics history.
 * DB-derived only — Architecture Freeze compliant.
 */

import { and, desc, eq, gte, inArray, sql } from "drizzle-orm";
import { getDb } from "../db";
import { zipImportJobs, zipImportMetricsSnapshots } from "../../drizzle/schema";
import { getImportJobStats } from "./zip-dedup";
import { collectSystemMetrics, type SystemMetrics } from "./system-metrics";

const ACTIVE_STATUSES = ["scheduled", "processing"] as const;
const QUEUE_STATUSES = ["waiting"] as const;
const WAITING_UPLOAD_STATUSES = ["uploaded"] as const;

export interface ImportDashboard {
  queue: number;
  running: number;
  waiting: number;
  completed: number;
  skipped: number;
  failed: number;
  override: number;
  retry: number;
  scheduled: number;
  waitingDiskSpace: number;
  cancelled: number;
  expired: number;
}

export interface WorkerJobView {
  jobId: number;
  workerId: string | null;
  status: string;
  pipelineStep: string | null;
  sourceArchiveOriginalName: string | null;
  heartbeatAt: string | null;
  heartbeatAgeSec: number | null;
  startedAt: string | null;
  runningTimeSec: number | null;
  progress: number;
  processedImages: number;
  totalImages: number;
}

export interface WorkerDashboard {
  activeCount: number;
  workers: WorkerJobView[];
  system: SystemMetrics;
  lastCompleted: LastWorkerView | null;
}

export interface LastWorkerView {
  jobId: number;
  workerId: string | null;
  status: string;
  completedAt: string | null;
  runtimeSec: number | null;
  processedImages: number;
  totalImages: number;
  sourceArchiveOriginalName: string | null;
}

export interface MetricsSnapshotPayload {
  importDashboard: ImportDashboard;
  workerCount: number;
  system: SystemMetrics;
  throughput24h: number;
  avgAlbumTimeSec: number | null;
}

async function countByStatus(status: string): Promise<number> {
  const db = await getDb();
  if (!db) return 0;
  const [row] = await db
    .select({ count: sql<number>`COUNT(*)` })
    .from(zipImportJobs)
    .where(eq(zipImportJobs.status, status as "completed"));
  return Number(row?.count ?? 0);
}

/** Sum step retry counts from checkpoint JSON (best-effort). */
async function sumRetryCounts(): Promise<number> {
  const db = await getDb();
  if (!db) return 0;

  const rows = await db
    .select({ checkpoint: zipImportJobs.checkpoint })
    .from(zipImportJobs)
    .where(
      inArray(zipImportJobs.status, [
        "processing",
        "scheduled",
        "waiting",
        "failed",
        "completed",
      ])
    )
    .limit(500);

  let total = 0;
  for (const row of rows) {
    if (!row.checkpoint) continue;
    try {
      const cp = JSON.parse(row.checkpoint) as { stepRetryCounts?: Record<string, number> };
      const counts = cp.stepRetryCounts ?? {};
      total += Object.values(counts).reduce((a, b) => a + (b || 0), 0);
    } catch {
      // ignore
    }
  }
  return total;
}

export async function getImportDashboard(): Promise<ImportDashboard> {
  const stats = await getImportJobStats();

  const [
    queue,
    running,
    waitingUpload,
    scheduled,
    waitingDisk,
    cancelled,
    expired,
    retry,
  ] = await Promise.all([
    countByStatus("waiting"),
    countByStatus("processing"),
    countByStatus("uploaded"),
    countByStatus("scheduled"),
    countByStatus("waiting_disk_space"),
    countByStatus("cancelled"),
    countByStatus("expired"),
    sumRetryCounts(),
  ]);

  return {
    queue,
    running: running + scheduled,
    waiting: waitingUpload,
    completed: stats.imported,
    skipped: stats.skipped,
    failed: stats.failed,
    override: stats.override,
    retry,
    scheduled,
    waitingDiskSpace: waitingDisk,
    cancelled,
    expired,
  };
}

export async function getWorkerDashboard(): Promise<WorkerDashboard> {
  const db = await getDb();
  const system = await collectSystemMetrics();
  if (!db) {
    return { activeCount: 0, workers: [], system, lastCompleted: null };
  }

  const rows = await db
    .select({
      id: zipImportJobs.id,
      workerId: zipImportJobs.workerId,
      status: zipImportJobs.status,
      pipelineStep: zipImportJobs.pipelineStep,
      sourceArchiveOriginalName: zipImportJobs.sourceArchiveOriginalName,
      heartbeatAt: zipImportJobs.heartbeatAt,
      startedAt: zipImportJobs.startedAt,
      progress: zipImportJobs.progress,
      processedImages: zipImportJobs.processedImages,
      totalImages: zipImportJobs.totalImages,
    })
    .from(zipImportJobs)
    .where(inArray(zipImportJobs.status, [...ACTIVE_STATUSES, "waiting_disk_space"]))
    .orderBy(desc(zipImportJobs.heartbeatAt))
    .limit(20);

  const now = Date.now();
  const workers: WorkerJobView[] = rows.map((r) => {
    const hb = r.heartbeatAt ? new Date(r.heartbeatAt).getTime() : null;
    const started = r.startedAt ? new Date(r.startedAt).getTime() : null;
    return {
      jobId: r.id,
      workerId: r.workerId,
      status: r.status,
      pipelineStep: r.pipelineStep,
      sourceArchiveOriginalName: r.sourceArchiveOriginalName,
      heartbeatAt: r.heartbeatAt?.toISOString() ?? null,
      heartbeatAgeSec: hb != null ? Math.round((now - hb) / 1000) : null,
      startedAt: r.startedAt?.toISOString() ?? null,
      runningTimeSec: started != null ? Math.round((now - started) / 1000) : null,
      progress: r.progress,
      processedImages: r.processedImages,
      totalImages: r.totalImages,
    };
  });

  return { activeCount: workers.length, workers, system, lastCompleted: await getLastCompletedWorker() };
}

export async function getLastCompletedWorker(): Promise<LastWorkerView | null> {
  const db = await getDb();
  if (!db) return null;

  const rows = await db
    .select({
      id: zipImportJobs.id,
      workerId: zipImportJobs.workerId,
      status: zipImportJobs.status,
      completedAt: zipImportJobs.completedAt,
      startedAt: zipImportJobs.startedAt,
      processedImages: zipImportJobs.processedImages,
      totalImages: zipImportJobs.totalImages,
      sourceArchiveOriginalName: zipImportJobs.sourceArchiveOriginalName,
    })
    .from(zipImportJobs)
    .where(eq(zipImportJobs.status, "completed"))
    .orderBy(desc(zipImportJobs.completedAt))
    .limit(1);

  const r = rows[0];
  if (!r) return null;

  const started = r.startedAt ? new Date(r.startedAt).getTime() : null;
  const completed = r.completedAt ? new Date(r.completedAt).getTime() : null;
  const runtimeSec =
    started != null && completed != null
      ? Math.round((completed - started) / 1000)
      : null;

  return {
    jobId: r.id,
    workerId: r.workerId,
    status: r.status,
    completedAt: r.completedAt?.toISOString() ?? null,
    runtimeSec,
    processedImages: r.processedImages,
    totalImages: r.totalImages,
    sourceArchiveOriginalName: r.sourceArchiveOriginalName,
  };
}

async function computeThroughput24h(): Promise<number> {
  const db = await getDb();
  if (!db) return 0;
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const [row] = await db
    .select({ count: sql<number>`COUNT(*)` })
    .from(zipImportJobs)
    .where(
      and(eq(zipImportJobs.status, "completed"), gte(zipImportJobs.completedAt, since))
    );
  return Number(row?.count ?? 0);
}

async function computeAvgAlbumTimeSec(): Promise<number | null> {
  const db = await getDb();
  if (!db) return null;
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const rows = await db
    .select({
      startedAt: zipImportJobs.startedAt,
      completedAt: zipImportJobs.completedAt,
    })
    .from(zipImportJobs)
    .where(
      and(
        eq(zipImportJobs.status, "completed"),
        gte(zipImportJobs.completedAt, since),
        sql`${zipImportJobs.startedAt} IS NOT NULL`
      )
    )
    .limit(100);

  if (rows.length === 0) return null;
  const durations = rows
    .map((r) => {
      if (!r.startedAt || !r.completedAt) return null;
      return (new Date(r.completedAt).getTime() - new Date(r.startedAt).getTime()) / 1000;
    })
    .filter((d): d is number => d != null && d > 0);

  if (durations.length === 0) return null;
  return Math.round(durations.reduce((a, b) => a + b, 0) / durations.length);
}

export async function buildMetricsSnapshotPayload(): Promise<MetricsSnapshotPayload> {
  const [importDashboard, workerDash, throughput24h, avgAlbumTimeSec] = await Promise.all([
    getImportDashboard(),
    getWorkerDashboard(),
    computeThroughput24h(),
    computeAvgAlbumTimeSec(),
  ]);

  return {
    importDashboard,
    workerCount: workerDash.activeCount,
    system: workerDash.system,
    throughput24h,
    avgAlbumTimeSec,
  };
}

export async function persistMetricsSnapshot(): Promise<void> {
  const db = await getDb();
  if (!db) return;
  const payload = await buildMetricsSnapshotPayload();
  await db.insert(zipImportMetricsSnapshots).values({
    snapshotAt: new Date(),
    payload: JSON.stringify(payload),
  });
}

export type MetricsHistoryPeriod = "24h" | "7d" | "30d";

export async function getMetricsHistory(period: MetricsHistoryPeriod): Promise<{
  period: MetricsHistoryPeriod;
  points: Array<{ at: string; payload: MetricsSnapshotPayload }>;
}> {
  const db = await getDb();
  if (!db) return { period, points: [] };

  const ms =
    period === "24h"
      ? 24 * 60 * 60 * 1000
      : period === "7d"
        ? 7 * 24 * 60 * 60 * 1000
        : 30 * 24 * 60 * 60 * 1000;

  const since = new Date(Date.now() - ms);
  const rows = await db
    .select({
      snapshotAt: zipImportMetricsSnapshots.snapshotAt,
      payload: zipImportMetricsSnapshots.payload,
    })
    .from(zipImportMetricsSnapshots)
    .where(gte(zipImportMetricsSnapshots.snapshotAt, since))
    .orderBy(zipImportMetricsSnapshots.snapshotAt)
    .limit(period === "24h" ? 288 : period === "7d" ? 336 : 360);

  const points = rows.map((r) => ({
    at: r.snapshotAt.toISOString(),
    payload: JSON.parse(r.payload) as MetricsSnapshotPayload,
  }));

  return { period, points };
}

export async function getOperationalOverview() {
  const [importDashboard, workerDashboard, throughput24h, avgAlbumTimeSec] =
    await Promise.all([
      getImportDashboard(),
      getWorkerDashboard(),
      computeThroughput24h(),
      computeAvgAlbumTimeSec(),
    ]);

  return {
    importDashboard,
    workerDashboard,
    throughput24h,
    avgAlbumTimeSec,
  };
}
