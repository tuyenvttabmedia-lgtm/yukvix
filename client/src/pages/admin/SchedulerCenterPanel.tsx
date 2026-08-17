/**
 * Scheduler Center — Operations tab
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
import {
  CalendarClock,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Loader2,
  Play,
  XCircle,
} from "lucide-react";

type DisplayStatus = "healthy" | "waiting_next_run" | "running" | "missed" | "disabled";

function StatusBadge({ status, label }: { status: DisplayStatus; label: string }) {
  if (status === "missed") {
    return (
      <Badge variant="destructive" className="gap-1">
        <AlertTriangle className="w-3 h-3" />
        {label}
      </Badge>
    );
  }
  if (status === "waiting_next_run") {
    return (
      <Badge className="gap-1 bg-amber-500/15 text-amber-600 border-amber-500/30" variant="outline">
        <Clock className="w-3 h-3" />
        {label}
      </Badge>
    );
  }
  if (status === "running") {
    return (
      <Badge className="gap-1 bg-blue-500/15 text-blue-600 border-blue-500/30" variant="outline">
        <Loader2 className="w-3 h-3 animate-spin" />
        {label}
      </Badge>
    );
  }
  if (status === "disabled") {
    return <Badge variant="secondary">{label}</Badge>;
  }
  return (
    <Badge variant="outline" className="gap-1 text-green-600 border-green-500/30">
      <CheckCircle2 className="w-3 h-3" />
      {label}
    </Badge>
  );
}

function cardBorderClass(status: DisplayStatus): string | undefined {
  if (status === "missed") return "border-red-500/50";
  if (status === "waiting_next_run") return "border-amber-500/30";
  if (status === "running") return "border-blue-500/30";
  return undefined;
}

export default function SchedulerCenterPanel() {
  const [testResult, setTestResult] = useState<Record<string, unknown> | null>(null);
  const status = trpc.scheduler.getStatus.useQuery(undefined, { refetchInterval: 30_000 });
  const runLog = trpc.scheduler.getRunLog.useQuery({ limit: 30 }, { refetchInterval: 30_000 });
  const runTest = trpc.scheduler.runSchedulerTest.useMutation({
    onSuccess: (data) => {
      setTestResult(data as Record<string, unknown>);
      toast.success(`Scheduler test: ${data.overall}`);
    },
    onError: (e) => toast.error(e.message),
  });

  const data = status.data;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-xl font-semibold flex items-center gap-2">
            <CalendarClock className="w-5 h-5" />
            Scheduler Center
          </h2>
          <p className="text-sm text-muted-foreground">
            ZIP Import · Auto SEO · Cleanup · Metrics · Notification
            {data?.timezone && (
              <span className="ml-2">
                · Timezone: <code className="text-xs">{data.timezone}</code>
              </span>
            )}
          </p>
          {data && (
            <p className="text-xs text-muted-foreground mt-1">
              Server: {data.serverTimeLocal} ({data.timezone}) · UTC {data.serverTimeUtc.slice(11, 19)}
              {data.schedulerHealth && (
                <Badge className="ml-2" variant={data.schedulerHealth === "healthy" ? "outline" : "destructive"}>
                  Scheduler Health: {data.schedulerHealth}
                </Badge>
              )}
            </p>
          )}
        </div>
        <Button
          size="sm"
          variant="outline"
          disabled={runTest.isPending}
          onClick={() => runTest.mutate()}
        >
          {runTest.isPending ? (
            <Loader2 className="w-4 h-4 mr-1 animate-spin" />
          ) : (
            <Play className="w-4 h-4 mr-1" />
          )}
          Run Test
        </Button>
      </div>

      {testResult && (
        <Card className="border-dashed">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Scheduler Test (dry-run)</CardTitle>
            <CardDescription>{String(testResult.note ?? "")}</CardDescription>
          </CardHeader>
          <CardContent className="text-xs space-y-3">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              <div><span className="text-muted-foreground">UTC</span><br />{String(testResult.currentUtc ?? "").slice(0, 19)}</div>
              <div><span className="text-muted-foreground">VN</span><br />{String(testResult.currentLocal ?? "")}</div>
              <div><span className="text-muted-foreground">Timezone</span><br />{String(testResult.timezone ?? "")}</div>
              <div><span className="text-muted-foreground">Should Run</span><br />{testResult.shouldRun ? "Yes" : "No"}</div>
            </div>
            <div className="flex flex-wrap gap-2">
              {(testResult.checks as Array<{ name: string; status: string; detail?: string }> | undefined)?.map((c) => (
                <Badge
                  key={c.name}
                  variant={c.status === "OK" ? "outline" : c.status === "FAIL" ? "destructive" : "secondary"}
                >
                  {c.name}: {c.status}
                </Badge>
              ))}
              <Badge variant={testResult.overall === "PASS" ? "default" : "destructive"}>
                Overall: {String(testResult.overall)}
              </Badge>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {data?.schedulers.map((s) => {
          const displayStatus = (s.displayStatus ?? (s.missedSchedule ? "missed" : s.enabled ? "healthy" : "disabled")) as DisplayStatus;
          return (
            <Card key={s.id} className={cardBorderClass(displayStatus)}>
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between gap-2">
                  <CardTitle className="text-base">{s.name}</CardTitle>
                  <StatusBadge status={displayStatus} label={s.statusLabel ?? displayStatus.toUpperCase()} />
                </div>
                <CardDescription className="text-xs font-mono">{s.endpoint}</CardDescription>
              </CardHeader>
              <CardContent className="text-xs space-y-2">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Enabled</span>
                  <span>{s.enabled ? "Yes" : "No"}</span>
                </div>
                {s.configuredHourLocal >= 0 && s.enabled && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Schedule</span>
                    <span>
                      {String(s.configuredHourLocal).padStart(2, "0")}:00 VN
                      <span className="text-muted-foreground ml-1">
                        ({String(s.configuredHourUtc).padStart(2, "0")}:00 UTC)
                      </span>
                    </span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Cron</span>
                  <span className="font-mono">{s.cronPattern}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Last run</span>
                  <span>{s.lastRun ? new Date(s.lastRun).toLocaleString("vi-VN") : "—"}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Next run</span>
                  <span>{s.nextRunLocal ? `${s.nextRunLocal} VN` : "—"}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Last result</span>
                  <span className="truncate max-w-[140px]" title={s.lastResult ?? ""}>
                    {s.lastResult ?? "—"}
                  </span>
                </div>
                {s.id === "zip-import" && (
                  <>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Batch size</span>
                      <span>
                        {(s as { configuredBatchSize?: number }).configuredBatchSize ?? s.currentConfig?.batchSize ?? "—"}
                        {(s as { batchContinuing?: boolean }).batchContinuing && (
                          <Badge className="ml-1 text-[10px] py-0" variant="outline">
                            continuing
                          </Badge>
                        )}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Last batch</span>
                      <span className="font-mono">
                        {(s as { lastBatchStarted?: number }).lastBatchStarted ?? 0}
                        /
                        {(s as { configuredBatchSize?: number }).configuredBatchSize ?? s.currentConfig?.batchSize ?? 1}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Waiting queue</span>
                      <span className={s.waitingJobs > 0 ? "text-amber-500 font-semibold" : ""}>
                        {s.waitingJobs}
                      </span>
                    </div>
                    {(s as { batchJobIds?: number[] }).batchJobIds &&
                      (s as { batchJobIds?: number[] }).batchJobIds!.length > 0 && (
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Batch job IDs</span>
                          <span className="font-mono text-[10px]">
                            {(s as { batchJobIds?: number[] }).batchJobIds!.join(", ")}
                          </span>
                        </div>
                      )}
                  </>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Clock className="w-4 h-4" />
            Scheduler Run Log (30 gần nhất)
          </CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Time (VN)</TableHead>
                <TableHead>Scheduler</TableHead>
                <TableHead>Triggered By</TableHead>
                <TableHead>Should Run</TableHead>
                <TableHead>Reason</TableHead>
                <TableHead>Waiting</TableHead>
                <TableHead>Job IDs</TableHead>
                <TableHead>Duration</TableHead>
                <TableHead>Result</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(runLog.data?.logs ?? []).length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9} className="text-center text-muted-foreground">
                    Chưa có log scheduler
                  </TableCell>
                </TableRow>
              ) : (
                runLog.data?.logs.map((log) => (
                  <TableRow key={log.id}>
                    <TableCell className="whitespace-nowrap text-xs">
                      {log.currentLocal}
                      <div className="text-muted-foreground">{log.currentUtc.slice(11, 19)} UTC</div>
                    </TableCell>
                    <TableCell className="text-xs font-medium">{log.schedulerName}</TableCell>
                    <TableCell className="text-xs capitalize">{log.triggeredBy ?? (log.manual ? "manual" : "cron")}</TableCell>
                    <TableCell>
                      {log.shouldRun ? (
                        <Badge variant="outline" className="text-green-600">Yes</Badge>
                      ) : (
                        <Badge variant="secondary">No</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-xs max-w-[180px] truncate" title={log.reason}>
                      {log.reason}
                    </TableCell>
                    <TableCell>{log.waitingJobs}</TableCell>
                    <TableCell className="text-xs font-mono">
                      {log.pickedJobs.length ? log.pickedJobs.join(", ") : "—"}
                    </TableCell>
                    <TableCell>{log.durationMs}ms</TableCell>
                    <TableCell className="text-xs max-w-[120px] truncate">{log.result}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
