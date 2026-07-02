import { useState, useEffect, useRef } from "react";
import { Link, useParams } from "wouter";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft, RefreshCw, ExternalLink, CheckCircle, XCircle, Clock, Loader2 } from "lucide-react";
import AdminLayout from "./AdminLayout";

const LEVEL_COLORS: Record<string, string> = {
  info: "text-blue-400",
  warn: "text-amber-400",
  error: "text-red-400",
  debug: "text-slate-500",
};

const STATUS_COLORS: Record<string, string> = {
  queued: "bg-slate-500",
  crawling: "bg-blue-500",
  downloading: "bg-indigo-500",
  processing: "bg-purple-500",
  seo: "bg-amber-500",
  done: "bg-green-500",
  failed: "bg-red-500",
  cancelled: "bg-gray-500",
};

function AdminImportLogsContent() {
  const params = useParams<{ id: string }>();
  const jobId = parseInt(params.id || "0");
  const logsEndRef = useRef<HTMLDivElement>(null);
  const [autoScroll, setAutoScroll] = useState(true);
  const [lastLogId, setLastLogId] = useState<number | undefined>(undefined);
  const [allLogs, setAllLogs] = useState<any[]>([]);

  const { data: jobData, refetch: refetchJob } = trpc.importJobs.get.useQuery(
    { id: jobId },
    { refetchInterval: 3000, enabled: !!jobId }
  );

  const { data: newLogsData } = trpc.importJobs.getLogs.useQuery(
    { jobId, afterId: lastLogId, limit: 100 },
    {
      refetchInterval: 2000,
      enabled: !!jobId,
    }
  );

  // Append new logs
  useEffect(() => {
    if (newLogsData?.logs && newLogsData.logs.length > 0) {
      setAllLogs((prev) => {
        const existingIds = new Set(prev.map((l) => l.id));
        const newOnes = newLogsData.logs.filter((l: any) => !existingIds.has(l.id));
        if (newOnes.length === 0) return prev;
        const lastId = newOnes[newOnes.length - 1].id;
        setLastLogId(lastId);
        return [...prev, ...newOnes];
      });
    }
  }, [newLogsData]);

  // Auto-scroll
  useEffect(() => {
    if (autoScroll && logsEndRef.current) {
      logsEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [allLogs, autoScroll]);

  const job = jobData?.job;
  const isRunning = job && ["queued", "crawling", "downloading", "processing", "seo"].includes(job.status);

  if (!jobId) return <div className="text-red-400">Invalid job ID</div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Link href="/admin/import">
          <Button variant="ghost" size="sm" className="text-slate-400 gap-1">
            <ArrowLeft className="w-4 h-4" /> Back
          </Button>
        </Link>
        <div className="flex-1">
          <h1 className="text-xl font-bold text-white">Import Job #{jobId}</h1>
          {job && <p className="text-slate-400 text-sm truncate">{job.sourceUrl}</p>}
        </div>
        {job?.albumId && (
          <Link href={`/admin/album/${job.albumId}`}>
            <Button variant="outline" size="sm" className="gap-2 text-green-400 border-green-500">
              <ExternalLink className="w-4 h-4" /> View Album
            </Button>
          </Link>
        )}
      </div>

      {/* Job Status Card */}
      {job && (
        <Card className="bg-slate-800 border-slate-700">
          <CardContent className="p-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <p className="text-slate-400 text-xs mb-1">Trạng thái</p>
                <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium text-white ${STATUS_COLORS[job.status] || "bg-slate-500"}`}>
                  {isRunning ? <Loader2 className="w-3 h-3 animate-spin" /> : job.status === "done" ? <CheckCircle className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
                  {job.status}
                </span>
              </div>
              <div>
                <p className="text-slate-400 text-xs mb-1">Trangs</p>
                <p className="text-white text-sm">{job.crawledPages || 0} / {job.totalPages || "?"}</p>
              </div>
              <div>
                <p className="text-slate-400 text-xs mb-1">Images</p>
                <p className="text-white text-sm">{job.processedImages || 0} / {job.totalImages || "?"}</p>
              </div>
              <div>
                <p className="text-slate-400 text-xs mb-1">Duration</p>
                <p className="text-white text-sm">
                  {job.startedAt && job.completedAt
                    ? `${Math.round((new Date(job.completedAt).getTime() - new Date(job.startedAt).getTime()) / 1000)}s`
                    : job.startedAt
                    ? "Running..."
                    : "Not started"}
                </p>
              </div>
            </div>
            {job.extractedTitle && (
              <div className="mt-3 pt-3 border-t border-slate-700">
                <p className="text-slate-400 text-xs mb-1">Extracted Title</p>
                <p className="text-white text-sm">{job.extractedTitle}</p>
              </div>
            )}
            {job.errorMessage && (
              <div className="mt-3 pt-3 border-t border-slate-700">
                <p className="text-red-400 text-xs mb-1">Error</p>
                <p className="text-red-300 text-sm">{job.errorMessage}</p>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Log Viewer */}
      <Card className="bg-slate-800 border-slate-700">
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-white text-base">
            Logs
            {isRunning && <span className="ml-2 inline-block w-2 h-2 rounded-full bg-green-400 animate-pulse" />}
          </CardTitle>
          <div className="flex items-center gap-2">
            <label className="flex items-center gap-1.5 text-slate-400 text-xs cursor-pointer">
              <input type="checkbox" checked={autoScroll} onChange={(e) => setAutoScroll(e.target.checked)} className="accent-violet-500" />
              Auto-scroll
            </label>
            <span className="text-slate-500 text-xs">{allLogs.length} entries</span>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="h-[500px] overflow-y-auto bg-slate-950 rounded-b font-mono text-xs">
            {allLogs.length === 0 ? (
              <div className="flex items-center justify-center h-full text-slate-600">
                {isRunning ? (
                  <span className="flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Chờ for logs...</span>
                ) : "No logs available"}
              </div>
            ) : (
              <div className="p-3 space-y-0.5">
                {allLogs.map((log) => (
                  <div key={log.id} className="flex gap-2 hover:bg-slate-900 px-1 py-0.5 rounded">
                    <span className="text-slate-600 shrink-0 w-20 text-right">
                      {new Date(log.createdAt).toLocaleTimeString()}
                    </span>
                    <span className={`shrink-0 w-10 ${LEVEL_COLORS[log.level] || "text-slate-400"}`}>
                      [{log.level?.toUpperCase().slice(0, 4)}]
                    </span>
                    <span className="text-slate-300 break-all">{log.message}</span>
                    {log.data && (
                      <span className="text-slate-600 truncate max-w-xs">{log.data}</span>
                    )}
                  </div>
                ))}
                <div ref={logsEndRef} />
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export default function AdminImportLogs() {
  return (
    <AdminLayout>
      <AdminImportLogsContent />
    </AdminLayout>
  );
}
