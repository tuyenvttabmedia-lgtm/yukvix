/**
 * Phase 8 — Health Center checks (DB, Redis, Wasabi, Gemini, Disk, CPU, RAM).
 */

import { sql } from "drizzle-orm";
import { HeadBucketCommand, S3Client } from "@aws-sdk/client-s3";
import { collectSystemMetrics } from "./system-metrics";
import { getAiProviderConfig } from "../services/ai-provider";

export type HealthStatus = "ok" | "warn" | "fail";

export interface HealthCheck {
  name: string;
  status: HealthStatus;
  message?: string;
  latencyMs?: number;
}

export interface HealthCenterResult {
  overall: HealthStatus;
  checks: HealthCheck[];
  system: Awaited<ReturnType<typeof collectSystemMetrics>>;
  queueHealth: "healthy" | "warning" | "error";
  schedulerHealth: "healthy" | "warning" | "error";
  ts: string;
}

function overallFromChecks(checks: HealthCheck[]): HealthStatus {
  if (checks.some((c) => c.status === "fail")) return "fail";
  if (checks.some((c) => c.status === "warn")) return "warn";
  return "ok";
}

async function checkDatabase(): Promise<HealthCheck> {
  const t0 = Date.now();
  try {
    const { getDb } = await import("../db");
    const db = await getDb();
    if (!db) throw new Error("DB unavailable");
    await db.execute(sql`SELECT 1`);
    return { name: "database", status: "ok", latencyMs: Date.now() - t0 };
  } catch (err) {
    return {
      name: "database",
      status: "fail",
      message: (err as Error).message,
      latencyMs: Date.now() - t0,
    };
  }
}

async function checkRedis(): Promise<HealthCheck> {
  const t0 = Date.now();
  try {
    const Redis = (await import("ioredis")).default;
    const url = process.env.REDIS_URL || "redis://localhost:6379";
    const redis = new Redis(url, { connectTimeout: 2000, maxRetriesPerRequest: 1 });
    const pong = await redis.ping();
    redis.disconnect();
    return {
      name: "redis",
      status: pong === "PONG" ? "ok" : "warn",
      latencyMs: Date.now() - t0,
    };
  } catch (err) {
    return {
      name: "redis",
      status: "warn",
      message: (err as Error).message,
      latencyMs: Date.now() - t0,
    };
  }
}

async function checkWasabi(): Promise<HealthCheck> {
  const t0 = Date.now();
  const bucket = process.env.WASABI_BUCKET || "";
  const accessKey = process.env.WASABI_ACCESS_KEY_ID || "";
  const secretKey = process.env.WASABI_SECRET_ACCESS_KEY || "";
  const region = process.env.WASABI_REGION || "us-east-1";
  const endpoint =
    process.env.WASABI_ENDPOINT || `https://s3.${region}.wasabisys.com`;

  if (!bucket || !accessKey || !secretKey) {
    return {
      name: "wasabi",
      status: "warn",
      message: "Wasabi credentials not configured",
    };
  }

  try {
    const client = new S3Client({
      region,
      endpoint,
      credentials: { accessKeyId: accessKey, secretAccessKey: secretKey },
    });
    await client.send(new HeadBucketCommand({ Bucket: bucket }));
    return { name: "wasabi", status: "ok", latencyMs: Date.now() - t0 };
  } catch (err) {
    return {
      name: "wasabi",
      status: "fail",
      message: (err as Error).message,
      latencyMs: Date.now() - t0,
    };
  }
}

async function checkGemini(): Promise<HealthCheck> {
  const t0 = Date.now();
  try {
    const cfg = await getAiProviderConfig();
    if (!cfg.apiKey) {
      return { name: "gemini", status: "warn", message: "AI API key not configured" };
    }
    return {
      name: "gemini",
      status: "ok",
      message: `provider=${cfg.provider} model=${cfg.model}`,
      latencyMs: Date.now() - t0,
    };
  } catch (err) {
    return {
      name: "gemini",
      status: "warn",
      message: (err as Error).message,
      latencyMs: Date.now() - t0,
    };
  }
}

function checkDisk(system: Awaited<ReturnType<typeof collectSystemMetrics>>): HealthCheck {
  const freeGb = system.disk.rootFreeGb;
  const usedPct = system.disk.rootUsedPercent;
  if (freeGb != null && freeGb < 10) {
    return { name: "disk", status: "fail", message: `Free ${freeGb}GB (< 10GB)` };
  }
  if (usedPct != null && usedPct > 90) {
    return { name: "disk", status: "warn", message: `Root ${usedPct}% used` };
  }
  return {
    name: "disk",
    status: "ok",
    message: freeGb != null ? `${freeGb}GB free` : undefined,
  };
}

function checkCpu(system: Awaited<ReturnType<typeof collectSystemMetrics>>): HealthCheck {
  if (system.cpu.usagePercent > 90) {
    return { name: "cpu", status: "warn", message: `Load ${system.cpu.usagePercent}%` };
  }
  return { name: "cpu", status: "ok", message: `${system.cpu.usagePercent}% est.` };
}

function checkRam(system: Awaited<ReturnType<typeof collectSystemMetrics>>): HealthCheck {
  if (system.memory.usedPercent > 90) {
    return { name: "ram", status: "warn", message: `${system.memory.usedPercent}% used` };
  }
  return { name: "ram", status: "ok", message: `${system.memory.freeMb}MB free` };
}

export async function getHealthCenter(): Promise<HealthCenterResult> {
  const system = await collectSystemMetrics();
  const checks = await Promise.all([
    checkDatabase(),
    checkRedis(),
    checkWasabi(),
    checkGemini(),
  ]);
  checks.push(checkDisk(system), checkCpu(system), checkRam(system));

  const { getImportDashboard } = await import("./import-metrics");
  const dash = await getImportDashboard();
  const { computeQueueOpsHealth, computeSchedulerOpsHealth, getSchedulerRunLog, computeSchedulerDisplayStatus } =
    await import("../services/scheduler-log");
  const { normalizeScheduleConfig } = await import("../services/schedule-config");

  const queueHealth = computeQueueOpsHealth({
    failed: dash.failed,
    waitingDiskSpace: dash.waitingDiskSpace,
    running: dash.running,
  });

  const logs = await getSchedulerRunLog(30);
  const importRaw = await (async () => {
    try {
      const { getDb } = await import("../db");
      const { adminSettings } = await import("../../drizzle/schema");
      const { eq } = await import("drizzle-orm");
      const db = await getDb();
      if (!db) return {};
      const rows = await db
        .select({ value: adminSettings.value })
        .from(adminSettings)
        .where(eq(adminSettings.key, "import_schedule_config"))
        .limit(1);
      return rows[0]?.value ? JSON.parse(rows[0].value) : {};
    } catch {
      return {};
    }
  })();

  const importCfg = await normalizeScheduleConfig(
    {
      enabled: !!importRaw.enabled,
      cronHour: importRaw.cronHour,
      localHour: importRaw.localHour,
      timezone: importRaw.timezone,
    },
    { localHour: 17, batchSize: 10 }
  );

  const seoRaw = await (async () => {
    try {
      const { getDb } = await import("../db");
      const { adminSettings } = await import("../../drizzle/schema");
      const { eq } = await import("drizzle-orm");
      const db = await getDb();
      if (!db) return {};
      const rows = await db
        .select({ value: adminSettings.value })
        .from(adminSettings)
        .where(eq(adminSettings.key, "auto_seo_config"))
        .limit(1);
      return rows[0]?.value ? JSON.parse(rows[0].value) : {};
    } catch {
      return {};
    }
  })();

  const seoCfg = await normalizeScheduleConfig(
    { enabled: seoRaw.enabled !== false, cronHour: seoRaw.cronHour, localHour: seoRaw.localHour },
    { localHour: 9 }
  );

  const importStatus = computeSchedulerDisplayStatus({
    enabled: importCfg.enabled,
    configuredHourUtc: importCfg.cronHourUtc,
    hasHourlySchedule: true,
    logs,
    schedulerName: "zip-import",
    isRunning: dash.running > 0,
  });

  const seoStatus = computeSchedulerDisplayStatus({
    enabled: seoCfg.enabled,
    configuredHourUtc: seoCfg.cronHourUtc,
    hasHourlySchedule: true,
    logs,
    schedulerName: "auto-seo",
  });

  const schedulerHealth = computeSchedulerOpsHealth([
    { enabled: importCfg.enabled, displayStatus: importStatus },
    { enabled: seoCfg.enabled, displayStatus: seoStatus },
  ]);

  return {
    overall: overallFromChecks(checks),
    checks,
    system,
    queueHealth,
    schedulerHealth,
    ts: new Date().toISOString(),
  };
}

/** Lightweight block for /api/health extension. */
export async function getZipImportHealthBlock(): Promise<Record<string, unknown>> {
  const { getImportDashboard } = await import("./import-metrics");
  const dash = await getImportDashboard();
  return {
    waiting: dash.queue,
    processing: dash.running,
    failed: dash.failed,
    completed: dash.completed,
  };
}
