/**
 * Phase 8 — Operational Layer UI (Import/Worker/Health/Notifications/Cleanup/Readiness).
 */

import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import SchedulerCenterPanel from "./SchedulerCenterPanel";
import {
  Activity,
  Bell,
  CheckCircle2,
  Cpu,
  HardDrive,
  Loader2,
  RefreshCw,
  Server,
  Trash2,
  AlertTriangle,
  XCircle,
  Info,
} from "lucide-react";

const LEVEL_STYLES: Record<string, string> = {
  info: "bg-blue-500/10 text-blue-600",
  success: "bg-green-500/10 text-green-600",
  warning: "bg-amber-500/10 text-amber-600",
  error: "bg-red-500/10 text-red-600",
};

function StatCard({
  label,
  value,
  variant,
}: {
  label: string;
  value: number | string;
  variant?: "default" | "warn" | "error" | "success";
}) {
  const colors = {
    default: "",
    warn: "text-amber-600",
    error: "text-red-600",
    success: "text-green-600",
  };
  return (
    <div className="rounded-lg border p-3 text-center">
      <div className={`text-2xl font-bold ${colors[variant ?? "default"]}`}>{value}</div>
      <div className="text-xs text-muted-foreground mt-1">{label}</div>
    </div>
  );
}

function HealthIcon({ status }: { status: string }) {
  if (status === "ok" || status === "healthy") return <CheckCircle2 className="w-4 h-4 text-green-500" />;
  if (status === "warn" || status === "warning") return <AlertTriangle className="w-4 h-4 text-amber-500" />;
  return <XCircle className="w-4 h-4 text-red-500" />;
}

function OpsHealthBadge({ label, level }: { label: string; level: string }) {
  const variant =
    level === "healthy" ? "outline" : level === "warning" ? "secondary" : "destructive";
  return (
    <Badge variant={variant} className="gap-1 capitalize">
      <HealthIcon status={level === "healthy" ? "ok" : level === "warning" ? "warn" : "fail"} />
      {label}: {level}
    </Badge>
  );
}

function formatRuntime(sec: number | null | undefined): string {
  if (sec == null) return "—";
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return m > 0 ? `${m}m${s}s` : `${s}s`;
}

export default function ImportOperationsPanel() {
  const [historyPeriod, setHistoryPeriod] = useState<"24h" | "7d" | "30d">("24h");
  const utils = trpc.useUtils();

  const overview = trpc.zipImport.getOperationalOverview.useQuery(undefined, {
    refetchInterval: 15_000,
  });
  const health = trpc.zipImport.getHealthCenter.useQuery(undefined, { refetchInterval: 30_000 });
  const notifications = trpc.zipImport.listImportNotifications.useQuery(
    { limit: 30 },
    { refetchInterval: 20_000 }
  );
  const history = trpc.zipImport.getMetricsHistory.useQuery({ period: historyPeriod });
  const cleanup = trpc.zipImport.getCleanupStats.useQuery(undefined, { refetchInterval: 60_000 });
  const readiness = trpc.zipImport.getProductionReadiness.useQuery();
  const benchmark = trpc.zipImport.getBenchmarkResults.useQuery();

  const markRead = trpc.zipImport.markImportNotificationRead.useMutation({
    onSuccess: () => notifications.refetch(),
  });
  const markAllRead = trpc.zipImport.markAllImportNotificationsRead.useMutation({
    onSuccess: () => notifications.refetch(),
  });
  const runCleanup = trpc.zipImport.runImportCleanup.useMutation({
    onSuccess: (data) => {
      toast.success(`Cleanup done: ${data.results.map((r) => r.message).join("; ")}`);
      cleanup.refetch();
    },
    onError: (e) => toast.error(e.message),
  });

  const dash = overview.data?.importDashboard;
  const workers = overview.data?.workerDashboard;
  const lastWorker = workers?.lastCompleted;
  const benchmarkResults = (benchmark.data?.results ?? []) as Array<{
    images: number;
    totalSec: number | null;
    timePerImageSec: number | null;
    cpuPeak?: number;
    ramPeakMb?: number;
    diskPeakMb?: number;
    mode?: string;
    note?: string;
  }>;
  const hasRealBenchmark = benchmarkResults.some((r) => r.totalSec != null && r.mode !== "dry-run");

  return (
    <div className="space-y-6">
      <SchedulerCenterPanel />
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold flex items-center gap-2">
            <Activity className="w-5 h-5" />
            Operational Layer
          </h2>
          <p className="text-sm text-muted-foreground">
            Scheduler · Import · Worker · Health · Notifications · Cleanup · Readiness
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={async () => {
            await utils.zipImport.invalidate();
            await utils.scheduler.invalidate();
          }}
        >
          <RefreshCw className="w-4 h-4 mr-1" />
          Refresh
        </Button>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Import Dashboard</CardTitle>
        </CardHeader>
        <CardContent>
          {overview.isLoading ? (
            <Loader2 className="w-5 h-5 animate-spin" />
          ) : dash ? (
            <div className="grid grid-cols-4 md:grid-cols-8 gap-2">
              <StatCard label="Queue" value={dash.queue} />
              <StatCard label="Running" value={dash.running} />
              <StatCard label="Waiting" value={dash.waiting} />
              <StatCard label="Completed" value={dash.completed} variant="success" />
              <StatCard label="Skipped" value={dash.skipped} variant="warn" />
              <StatCard label="Failed" value={dash.failed} variant={dash.failed > 0 ? "error" : "default"} />
              <StatCard label="Override" value={dash.override} />
              <StatCard label="Retry" value={dash.retry} />
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Server className="w-4 h-4" />
            Worker Dashboard
          </CardTitle>
        </CardHeader>
        <CardContent>
          {workers && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-4">
              <StatCard label="Active Workers" value={workers.activeCount} />
              <StatCard label="CPU" value={`${workers.system.cpu.usagePercent}%`} />
              <StatCard label="RAM Used" value={`${workers.system.memory.usedPercent}%`} />
              <StatCard
                label="Disk Free"
                value={workers.system.disk.rootFreeGb != null ? `${workers.system.disk.rootFreeGb}GB` : "—"}
              />
            </div>
          )}
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Job</TableHead>
                <TableHead>Worker</TableHead>
                <TableHead>ZIP / Status</TableHead>
                <TableHead>Step</TableHead>
                <TableHead>Heartbeat</TableHead>
                <TableHead>Runtime</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {workers?.workers.length ? (
                workers.workers.map((w) => (
                  <TableRow key={w.jobId}>
                    <TableCell className="font-mono text-xs">#{w.jobId}</TableCell>
                    <TableCell className="text-xs truncate max-w-[100px]">{w.workerId ?? "—"}</TableCell>
                    <TableCell className="text-xs truncate max-w-[140px]">
                      {w.sourceArchiveOriginalName ?? "—"}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-xs">
                        {w.pipelineStep ?? w.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs">
                      {w.heartbeatAgeSec != null ? `${w.heartbeatAgeSec}s ago` : "—"}
                    </TableCell>
                    <TableCell className="text-xs">
                      {formatRuntime(w.runningTimeSec)}
                      {w.totalImages > 0 && ` · ${w.processedImages}/${w.totalImages}`}
                    </TableCell>
                  </TableRow>
                ))
              ) : lastWorker ? (
                <TableRow>
                  <TableCell colSpan={6} className="p-0">
                    <div className="rounded-lg border border-dashed bg-muted/20 p-4 m-2">
                      <p className="text-xs font-semibold text-muted-foreground mb-3">Last Worker</p>
                      <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-sm">
                        <div>
                          <span className="text-muted-foreground text-xs">Worker ID</span>
                          <p className="font-mono">{lastWorker.workerId ?? "—"}</p>
                        </div>
                        <div>
                          <span className="text-muted-foreground text-xs">Last Job</span>
                          <p className="font-mono">#{lastWorker.jobId}</p>
                        </div>
                        <div>
                          <span className="text-muted-foreground text-xs">Status</span>
                          <p className="capitalize">{lastWorker.status}</p>
                        </div>
                        <div>
                          <span className="text-muted-foreground text-xs">Completed</span>
                          <p>{lastWorker.completedAt ? new Date(lastWorker.completedAt).toLocaleString("vi-VN") : "—"}</p>
                        </div>
                        <div>
                          <span className="text-muted-foreground text-xs">Runtime</span>
                          <p>{formatRuntime(lastWorker.runtimeSec)}</p>
                        </div>
                        <div>
                          <span className="text-muted-foreground text-xs">Images</span>
                          <p>{lastWorker.processedImages} images</p>
                        </div>
                      </div>
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground py-6">
                    No worker history yet
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <div className="grid md:grid-cols-2 gap-6">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Bell className="w-4 h-4" />
              Notification Center
            </CardTitle>
          </CardHeader>
          <CardContent className="max-h-64 overflow-y-auto space-y-2">
            {notifications.data?.items.map((n) => (
              <div
                key={n.id}
                className={`rounded border p-2 text-sm ${!n.readAt ? "bg-muted/40" : ""}`}
                onClick={() => !n.readAt && markRead.mutate({ id: n.id })}
              >
                <Badge className={LEVEL_STYLES[n.level] ?? LEVEL_STYLES.info}>{n.level.toUpperCase()}</Badge>
                <span className="ml-2 font-medium">{n.title}</span>
              </div>
            ))}
            {!notifications.data?.items.length && (
              <p className="text-sm text-muted-foreground">No notifications yet</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Cpu className="w-4 h-4" />
              Health Center
            </CardTitle>
            <CardDescription className="flex flex-wrap gap-2 items-center">
              {health.data && (
                <>
                  <Badge variant={health.data.overall === "ok" ? "default" : "destructive"}>
                    Infra: {health.data.overall}
                  </Badge>
                  {"queueHealth" in health.data && (
                    <OpsHealthBadge label="Queue" level={String(health.data.queueHealth)} />
                  )}
                  {"schedulerHealth" in health.data && (
                    <OpsHealthBadge label="Scheduler" level={String(health.data.schedulerHealth)} />
                  )}
                </>
              )}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {health.data?.checks.map((c) => (
              <div key={c.name} className="flex items-center justify-between text-sm border-b pb-1">
                <span className="flex items-center gap-2 capitalize">
                  <HealthIcon status={c.status} />
                  {c.name}
                </span>
                <span className="text-xs text-muted-foreground truncate max-w-[160px]">
                  {c.message ?? c.status}
                </span>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Metrics History</CardTitle>
        </CardHeader>
        <CardContent>
          {(["24h", "7d", "30d"] as const).map((p) => (
            <Button
              key={p}
              variant={historyPeriod === p ? "default" : "outline"}
              size="sm"
              className="mr-2"
              onClick={() => setHistoryPeriod(p)}
            >
              {p}
            </Button>
          ))}
          <p className="text-sm text-muted-foreground mt-2">
            {history.data?.points.length ?? 0} snapshots
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <HardDrive className="w-4 h-4" />
              Cleanup Dashboard
            </CardTitle>
            <Button
              size="sm"
              variant="destructive"
              disabled={runCleanup.isPending}
              onClick={() => runCleanup.mutate({ all: true })}
            >
              Cleanup Now
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {cleanup.data?.schedule && (
            <div className="grid md:grid-cols-3 gap-3 text-sm border rounded-lg p-3 bg-muted/20">
              <div>
                <p className="text-xs text-muted-foreground">Last Cleanup</p>
                <p className="font-medium">
                  {cleanup.data.schedule.lastCleanupAt
                    ? new Date(cleanup.data.schedule.lastCleanupAt).toLocaleString("vi-VN")
                    : "Never"}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Next Cleanup</p>
                <p className="font-medium">
                  {cleanup.data.schedule.nextCleanupAt
                    ? new Date(cleanup.data.schedule.nextCleanupAt).toLocaleString("vi-VN")
                    : "—"}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Retention</p>
                <p className="text-xs">
                  Temp: {cleanup.data.schedule.retention.tempHours}h · Skipped: {cleanup.data.schedule.retention.skippedDays} ngày
                  <br />
                  Logs: {cleanup.data.schedule.retention.logsDays} ngày · Notification: {cleanup.data.schedule.retention.notificationDays} ngày
                </p>
              </div>
            </div>
          )}
          {cleanup.data && (
            <div className="grid grid-cols-2 md:grid-cols-5 gap-2 text-sm">
              <div className="border rounded p-2">
                <div className="font-medium">Temp</div>
                <div>{cleanup.data.temp.jobDirs} dirs</div>
              </div>
              <div className="border rounded p-2">
                <div className="font-medium">Skipped</div>
                <div>{cleanup.data.skipped.jobCount}</div>
              </div>
              <div className="border rounded p-2">
                <div className="font-medium">Checkpoint</div>
                <div>{cleanup.data.checkpoint.jobsWithCheckpoint}</div>
              </div>
              <div className="border rounded p-2">
                <div className="font-medium">Logs</div>
                <div>{cleanup.data.logs.jobsWithLogs}</div>
              </div>
              <div className="border rounded p-2">
                <div className="font-medium">Notification</div>
                <div>{cleanup.data.notification.total}</div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid md:grid-cols-2 gap-6">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Performance Benchmark</CardTitle>
          </CardHeader>
          <CardContent>
            {!hasRealBenchmark ? (
              <div className="rounded-lg border border-dashed p-6 text-center">
                <p className="font-medium text-muted-foreground">Not Benchmarked Yet</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Run scripts/benchmark-import.mjs on VPS — Performance score excluded until real data exists
                </p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Images</TableHead>
                    <TableHead>Time</TableHead>
                    <TableHead>Images/sec</TableHead>
                    <TableHead>CPU</TableHead>
                    <TableHead>RAM</TableHead>
                    <TableHead>Disk</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {benchmarkResults
                    .filter((r) => r.totalSec != null)
                    .map((r) => (
                      <TableRow key={r.images}>
                        <TableCell>{r.images}</TableCell>
                        <TableCell>{r.totalSec}s</TableCell>
                        <TableCell>
                          {r.timePerImageSec != null
                            ? (1 / r.timePerImageSec).toFixed(2)
                            : "—"}
                        </TableCell>
                        <TableCell>{r.cpuPeak ?? "—"}%</TableCell>
                        <TableCell>{r.ramPeakMb ?? "—"} MB</TableCell>
                        <TableCell>{r.diskPeakMb ?? "—"} MB</TableCell>
                      </TableRow>
                    ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Production Readiness Score</CardTitle>
            <CardDescription>Weighted dynamic score — excludes unbenchmarked dimensions</CardDescription>
          </CardHeader>
          <CardContent>
            {readiness.data && (
              <>
                <div className="text-3xl font-bold mb-2">
                  {readiness.data.overall}/100
                  <Badge className="ml-2">{readiness.data.grade}</Badge>
                </div>
                <div className="space-y-2">
                  {readiness.data.dimensions.map((d) => (
                    <div
                      key={d.name}
                      className={`flex justify-between text-sm ${d.excluded ? "opacity-50" : ""}`}
                    >
                      <span>
                        {d.name}
                        {d.excluded && " (excluded)"}
                        <span className="text-xs text-muted-foreground ml-1">w{d.weight}</span>
                      </span>
                      <span className="font-mono">{d.score}/100</span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
