/**
 * Phase 8 — System metrics (CPU, RAM, disk) for Operational Layer.
 * Read-only; no frozen-layer dependencies.
 */

import os from "os";
import fs from "fs/promises";
import { execFile } from "child_process";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

export interface SystemMetrics {
  cpu: {
    loadAvg1: number;
    loadAvg5: number;
    loadAvg15: number;
    cores: number;
    usagePercent: number;
  };
  memory: {
    totalMb: number;
    freeMb: number;
    usedMb: number;
    usedPercent: number;
    processRssMb: number;
  };
  disk: {
    importTempPath: string;
    importTempUsedGb: number | null;
    rootUsedPercent: number | null;
    rootFreeGb: number | null;
  };
  ts: string;
}

function estimateCpuPercent(load1: number, cores: number): number {
  if (cores <= 0) return 0;
  return Math.min(100, Math.round((load1 / cores) * 100));
}

export async function collectSystemMetrics(): Promise<SystemMetrics> {
  const load = os.loadavg();
  const cores = os.cpus().length;
  const totalMem = os.totalmem();
  const freeMem = os.freemem();
  const usedMem = totalMem - freeMem;
  const proc = process.memoryUsage();

  const importTempPath =
    process.env.IMPORT_TEMP_PATH || `${os.tmpdir()}/zip-import`;

  let importTempUsedGb: number | null = null;
  try {
    const du = await execFileAsync("du", ["-sb", importTempPath], {
      timeout: 10_000,
    }).catch(() => null);
    if (du?.stdout) {
      const bytes = parseInt(du.stdout.split(/\s+/)[0] || "0", 10);
      importTempUsedGb = Math.round((bytes / 1024 ** 3) * 100) / 100;
    }
  } catch {
    importTempUsedGb = null;
  }

  let rootUsedPercent: number | null = null;
  let rootFreeGb: number | null = null;
  try {
    const df = await execFileAsync("df", ["-B1", "/"], { timeout: 5000 });
    const line = df.stdout.trim().split("\n")[1];
    if (line) {
      const parts = line.split(/\s+/);
      const total = parseInt(parts[1] || "0", 10);
      const used = parseInt(parts[2] || "0", 10);
      const avail = parseInt(parts[3] || "0", 10);
      if (total > 0) rootUsedPercent = Math.round((used / total) * 100);
      rootFreeGb = Math.round((avail / 1024 ** 3) * 100) / 100;
    }
  } catch {
    // Windows dev or df unavailable
  }

  return {
    cpu: {
      loadAvg1: Math.round(load[0] * 100) / 100,
      loadAvg5: Math.round(load[1] * 100) / 100,
      loadAvg15: Math.round(load[2] * 100) / 100,
      cores,
      usagePercent: estimateCpuPercent(load[0], cores),
    },
    memory: {
      totalMb: Math.round(totalMem / 1024 / 1024),
      freeMb: Math.round(freeMem / 1024 / 1024),
      usedMb: Math.round(usedMem / 1024 / 1024),
      usedPercent: Math.round((usedMem / totalMem) * 100),
      processRssMb: Math.round(proc.rss / 1024 / 1024),
    },
    disk: {
      importTempPath,
      importTempUsedGb,
      rootUsedPercent,
      rootFreeGb,
    },
    ts: new Date().toISOString(),
  };
}

/** Sum bytes under a directory (best-effort). */
export async function dirSizeBytes(dir: string): Promise<number> {
  try {
    const du = await execFileAsync("du", ["-sb", dir], { timeout: 15_000 });
    return parseInt(du.stdout.split(/\s+/)[0] || "0", 10);
  } catch {
    return 0;
  }
}

/** Count files in directory (non-recursive listing for temp job dirs). */
export async function countTempJobDirs(basePath: string): Promise<number> {
  try {
    const entries = await fs.readdir(basePath, { withFileTypes: true });
    return entries.filter((e) => e.isDirectory() && e.name.startsWith("job-")).length;
  } catch {
    return 0;
  }
}
