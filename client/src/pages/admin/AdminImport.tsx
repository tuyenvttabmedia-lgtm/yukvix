import { useState, useEffect, useRef, useCallback } from "react";
import { OperationsPage } from "@/admin";
import AdminLayout from "./AdminLayout";
import { Link } from "wouter";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import {
  Download,
  Globe,
  CheckCircle,
  XCircle,
  Clock,
  Loader2,
  RefreshCw,
  Ban,
  ExternalLink,
  Settings,
  History,
  FileText,
  Plus,
  ChevronRight,
  Terminal,
  X,
  PauseCircle,
  PlayCircle,
} from "lucide-react";

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  queued: { label: "Queued", color: "bg-slate-500", icon: <Clock className="w-3 h-3" /> },
  crawling: { label: "Crawling", color: "bg-blue-500", icon: <Globe className="w-3 h-3" /> },
  downloading: { label: "Downloading", color: "bg-indigo-500", icon: <Download className="w-3 h-3" /> },
  processing: { label: "Đang xử lý", color: "bg-purple-500", icon: <Loader2 className="w-3 h-3 animate-spin" /> },
  seo: { label: "SEO", color: "bg-amber-500", icon: <FileText className="w-3 h-3" /> },
  done: { label: "Hoàn thành", color: "bg-green-500", icon: <CheckCircle className="w-3 h-3" /> },
  failed: { label: "Thất bại", color: "bg-red-500", icon: <XCircle className="w-3 h-3" /> },
  cancelled: { label: "Đã hủy", color: "bg-gray-500", icon: <Ban className="w-3 h-3" /> },
};

const LOG_LEVEL_STYLE: Record<string, string> = {
  info: "text-slate-300",
  warn: "text-amber-400",
  error: "text-red-400",
  debug: "text-slate-500",
};

function StatusBadge({ status }: { status: string }) {
  const cfg = STATUS_CONFIG[status] || STATUS_CONFIG.queued;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium text-white ${cfg.color}`}>
      {cfg.icon}
      {cfg.label}
    </span>
  );
}

function ProgressBar({ value, max, color = "bg-blue-500" }: { value: number; max: number; color?: string }) {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
  return (
    <div className="w-full bg-slate-700 rounded-full h-1.5">
      <div className={`${color} h-1.5 rounded-full transition-all duration-500`} style={{ width: `${pct}%` }} />
    </div>
  );
}

// --- Live Logs Panel --------------------------------------------------------

interface LogEntry {
  id: number;
  level: string;
  message: string;
  createdAt: Date;
}

const LOG_LEVEL_BG: Record<string, string> = {
  info: "",
  warn: "bg-amber-950/30",
  error: "bg-red-950/40",
  debug: "",
};

const LOG_LEVEL_BADGE: Record<string, string> = {
  info: "text-slate-500",
  warn: "text-amber-400 font-bold",
  error: "text-red-400 font-bold",
  debug: "text-slate-600",
};

function LiveLogsPanel({
  jobId,
  jobTitle,
  jobStatus,
  onClose,
}: {
  jobId: number;
  jobTitle: string;
  jobStatus: string;
  onClose: () => void;
}) {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [afterId, setAfterId] = useState<number | undefined>(undefined);
  const [autoScroll, setAutoScroll] = useState(true);
  const [isLive, setIsLive] = useState(true);
  const [newLogCount, setNewLogCount] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const isRunning = ["queued", "crawling", "downloading", "processing", "seo"].includes(jobStatus);

  // Initial load
  const { data: initialData } = trpc.importJobs.getLogs.useQuery(
    { jobId, limit: 200 },
    { enabled: true, staleTime: 0 }
  );

  useEffect(() => {
    if (initialData?.logs && logs.length === 0) {
      const mapped = initialData.logs.map((l: any) => ({
        id: l.id,
        level: l.level,
        message: l.message,
        createdAt: new Date(l.createdAt),
      }));
      setLogs(mapped);
      if (mapped.length > 0) {
        setAfterId(mapped[mapped.length - 1].id);
      }
      // Scroll to bottom on initial load
      setTimeout(() => {
        bottomRef.current?.scrollIntoView({ behavior: "instant" });
      }, 50);
    }
  }, [initialData]);

  // Polling for new logs when job is running
  const { data: newData } = trpc.importJobs.getLogs.useQuery(
    { jobId, afterId, limit: 100 },
    {
      enabled: isRunning && isLive && afterId !== undefined,
      refetchInterval: 2000,
      staleTime: 0,
    }
  );

  useEffect(() => {
    if (newData?.logs && newData.logs.length > 0) {
      const mapped = newData.logs.map((l: any) => ({
        id: l.id,
        level: l.level,
        message: l.message,
        createdAt: new Date(l.createdAt),
      }));
      setLogs(prev => {
        const existingIds = new Set(prev.map(x => x.id));
        const fresh = mapped.filter((l: LogEntry) => !existingIds.has(l.id));
        if (fresh.length === 0) return prev;
        if (!autoScroll) setNewLogCount(c => c + fresh.length);
        return [...prev, ...fresh];
      });
      setAfterId(mapped[mapped.length - 1].id);
    }
  }, [newData]);

  // Auto-scroll using sentinel element (smooth)
  useEffect(() => {
    if (autoScroll && bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior: "smooth", block: "end" });
    }
  }, [logs, autoScroll]);

  const handleScroll = useCallback(() => {
    if (!scrollRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = scrollRef.current;
    const atBottom = scrollHeight - scrollTop - clientHeight < 60;
    if (atBottom) {
      setAutoScroll(true);
      setNewLogCount(0);
    } else {
      setAutoScroll(false);
    }
  }, []);

  const scrollToBottom = useCallback(() => {
    setAutoScroll(true);
    setNewLogCount(0);
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, []);

  const copyLogs = useCallback(() => {
    const text = logs.map(l =>
      `[${l.createdAt.toISOString()}] [${l.level.toUpperCase()}] ${l.message}`
    ).join("\n");
    navigator.clipboard.writeText(text).then(() => toast.success("Logs copied to clipboard"));
  }, [logs]);

  const formatTime = (d: Date) =>
    d.toLocaleTimeString("en-US", { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" });

  const errorCount = logs.filter(l => l.level === "error").length;
  const warnCount = logs.filter(l => l.level === "warn").length;

  return (
    <div className="fixed inset-0 z-50 flex items-stretch justify-end pointer-events-none">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 pointer-events-auto backdrop-blur-sm"
        onClick={onClose}
      />
      {/* Panel */}
      <div
        className="relative w-full max-w-2xl bg-[#0d1117] border-l border-slate-700/80 flex flex-col pointer-events-auto shadow-2xl"
        style={{ animation: "slideInRight 220ms cubic-bezier(0.23,1,0.32,1)" }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-700/80 shrink-0 bg-slate-900/80">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-7 h-7 rounded-md bg-slate-800 flex items-center justify-center shrink-0">
              <Terminal className="w-3.5 h-3.5 text-slate-400" />
            </div>
            <div className="min-w-0">
              <p className="text-white text-sm font-semibold truncate leading-tight">{jobTitle}</p>
              <p className="text-slate-500 text-xs">Job #{jobId}</p>
            </div>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            {/* Copy logs */}
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-xs text-slate-400 hover:text-white gap-1"
              onClick={copyLogs}
              title="Copy all logs"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
            </Button>
            {/* Live toggle */}
            {isRunning && (
              <Button
                variant="ghost"
                size="sm"
                className={`h-7 px-2.5 text-xs gap-1.5 rounded-md ${
                  isLive
                    ? "text-green-400 bg-green-950/40 hover:bg-green-950/60"
                    : "text-slate-400 hover:text-white"
                }`}
                onClick={() => setIsLive(v => !v)}
              >
                {isLive ? (
                  <>
                    <span className="w-1.5 h-1.5 bg-green-400 rounded-full animate-pulse" />
                    Live
                  </>
                ) : (
                  <>
                    <PauseCircle className="w-3 h-3" />
                    Paused
                  </>
                )}
              </Button>
            )}
            <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-slate-400 hover:text-white" onClick={onClose}>
              <X className="w-4 h-4" />
            </Button>
          </div>
        </div>

        {/* Status bar */}
        <div className="px-4 py-2 bg-slate-900/40 border-b border-slate-700/50 shrink-0 flex items-center gap-3 flex-wrap">
          <StatusBadge status={jobStatus} />
          <span className="text-slate-500 text-xs">{logs.length} entries</span>
          {errorCount > 0 && (
            <span className="text-red-400 text-xs font-medium">{errorCount} error{errorCount > 1 ? "s" : ""}</span>
          )}
          {warnCount > 0 && (
            <span className="text-amber-400 text-xs">{warnCount} warn{warnCount > 1 ? "s" : ""}</span>
          )}
          {!isRunning && (
            <span className="text-slate-600 text-xs ml-auto">Job completed</span>
          )}
        </div>

        {/* Log entries */}
        <div
          ref={scrollRef}
          onScroll={handleScroll}
          className="flex-1 overflow-y-auto font-mono text-xs bg-[#0d1117] scroll-smooth"
        >
          {logs.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full py-16 gap-3">
              <Terminal className="w-8 h-8 text-slate-700" />
              <p className="text-slate-600">No logs yet...</p>
              {isRunning && <p className="text-slate-700 text-xs">Chờ for job to start</p>}
            </div>
          ) : (
            <div className="py-2">
              {logs.map((log, idx) => (
                <div
                  key={log.id}
                  className={`flex gap-0 leading-5 group ${
                    LOG_LEVEL_BG[log.level] || ""
                  } hover:bg-slate-800/40 transition-colors`}
                >
                  {/* Line number */}
                  <span className="text-slate-700 select-none w-10 text-right pr-3 shrink-0 group-hover:text-slate-600 py-0.5">
                    {idx + 1}
                  </span>
                  {/* Timestamp */}
                  <span className="text-slate-600 shrink-0 pr-2 py-0.5 select-none">
                    {formatTime(log.createdAt)}
                  </span>
                  {/* Level badge */}
                  <span className={`shrink-0 w-9 pr-2 py-0.5 uppercase text-[10px] font-bold tracking-wide ${
                    LOG_LEVEL_BADGE[log.level] || "text-slate-500"
                  }`}>
                    {log.level.slice(0, 4)}
                  </span>
                  {/* Message */}
                  <span className={`break-all py-0.5 pr-4 ${
                    log.level === "error" ? "text-red-300" :
                    log.level === "warn" ? "text-amber-300" :
                    log.level === "debug" ? "text-slate-600" :
                    "text-slate-200"
                  }`}>
                    {log.message}
                  </span>
                </div>
              ))}
              {/* Bottom sentinel for auto-scroll */}
              <div ref={bottomRef} className="h-2" />
            </div>
          )}
        </div>

        {/* Floating scroll-to-bottom button */}
        {!autoScroll && (
          <div className="absolute bottom-4 right-4 z-10">
            <button
              onClick={scrollToBottom}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-violet-600 hover:bg-violet-500 text-white text-xs font-medium rounded-full shadow-lg transition-all active:scale-95"
            >
              {newLogCount > 0 && (
                <span className="bg-white text-violet-700 text-[10px] font-bold px-1.5 rounded-full">
                  +{newLogCount}
                </span>
              )}
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" />
              </svg>
              Jump to latest
            </button>
          </div>
        )}
      </div>

      <style>{`
        @keyframes slideInRight {
          from { transform: translateX(100%); opacity: 0; }
          to { transform: translateX(0); opacity: 1; }
        }
      `}</style>
    </div>
  );
}

// --- Main Content ------------------------------------------------------------

function AdminImportContent() {
  const [url, setUrl] = useState("");
  const [sourceId, setSourceId] = useState<string>("none");
  const [crawlCategorySourceId, setCrawlCategorySourceId] = useState<string>("none");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [page, setPage] = useState(1);
  const [liveLogsJobId, setLiveLogsJobId] = useState<number | null>(null);

  const { data: stats, refetch: refetchStats } = trpc.importJobs.stats.useQuery(undefined, {
    refetchInterval: 5000,
  });

  const { data: sourcesData } = trpc.importSources.list.useQuery();

  const { data: jobsData, refetch: refetchJobs } = trpc.importJobs.list.useQuery({
    page,
    limit: 20,
    status: statusFilter !== "all" ? (statusFilter as any) : undefined,
  }, {
    refetchInterval: 5000,
  });

  const createMutation = trpc.importJobs.create.useMutation({
    onSuccess: (data) => {
      if (data.isDuplicate) {
        toast.error("Duplicate URL", { description: data.message });
      } else {
        toast.success("Import queued!", { description: data.message });
        setUrl("");
        refetchJobs();
        refetchStats();
      }
    },
    onError: (err) => toast.error("Error", { description: err.message }),
  });

  const retryMutation = trpc.importJobs.retry.useMutation({
    onSuccess: () => { refetchJobs(); toast.success("Job re-queued"); },
    onError: (err) => toast.error("Error", { description: err.message }),
  });

  const utils = trpc.useUtils();
  const cancelMutation = trpc.importJobs.cancel.useMutation({
    onMutate: async ({ id }) => {
      await utils.importJobs.list.cancel();
      const prev = utils.importJobs.list.getData({ page, limit: 20, status: statusFilter !== "all" ? (statusFilter as any) : undefined });
      utils.importJobs.list.setData(
        { page, limit: 20, status: statusFilter !== "all" ? (statusFilter as any) : undefined },
        (old) => old ? { ...old, jobs: old.jobs.map(j => j.id === id ? { ...j, status: "cancelled" as const, completedAt: new Date() } : j) } : old
      );
      return { prev };
    },
    onSuccess: () => { refetchJobs(); refetchStats(); toast.success("Job cancelled"); },
    onError: (err, _vars, ctx) => {
      if (ctx?.prev) utils.importJobs.list.setData({ page, limit: 20, status: statusFilter !== "all" ? (statusFilter as any) : undefined }, ctx.prev);
      toast.error("Error", { description: err.message });
    },
  });

  const handleImport = () => {
    if (!url.trim()) return;
    createMutation.mutate({
      sourceUrl: url.trim(),
      sourceId: sourceId !== "none" ? parseInt(sourceId) : undefined,
    });
  };

  const crawlCategoryMutation = trpc.importSources.crawlCategory.useMutation({
    onSuccess: (data) => {
      toast.success(`Category crawl started`, { description: `${data.count} article URLs found and queued` });
      refetchJobs();
      refetchStats();
    },
    onError: (err) => toast.error("Crawl failed", { description: err.message }),
  });

  const sources = (Array.isArray(sourcesData) ? sourcesData : (sourcesData as any)?.sources ?? sourcesData ?? []) as any[];
  const jobs = jobsData?.jobs || [];

  // Find job for live logs panel
  const liveLogsJob = liveLogsJobId ? jobs.find(j => j.id === liveLogsJobId) : null;

  return (
    <OperationsPage
      shell="full"
      header={{
        icon: Globe,
        title: "Import Manager",
        subtitle: "Import cosplay galleries from external sources",
        actions: (
          <div className="flex gap-2">
            <Link href="/admin/import/sources">
              <Button variant="outline" size="sm" className="gap-1.5">
                <Settings className="w-4 h-4" /> Sources
              </Button>
            </Link>
            <Link href="/admin/import/history">
              <Button variant="outline" size="sm" className="gap-1.5">
                <History className="w-4 h-4" /> History
              </Button>
            </Link>
          </div>
        ),
      }}
      primary={
    <div className="space-y-6">
      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: "Running", value: stats.running, color: "text-blue-400" },
            { label: "Queued", value: stats.queued, color: "text-slate-400" },
            { label: "Hoàn thành", value: stats.done, color: "text-green-400" },
            { label: "Thất bại", value: stats.failed, color: "text-red-400" },
          ].map(s => (
            <Card key={s.label} className="bg-slate-800 border-slate-700">
              <CardContent className="p-3">
                <p className="text-slate-400 text-xs">{s.label}</p>
                <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Import from URL */}
      <Card className="bg-slate-800 border-slate-700">
        <CardHeader className="pb-3">
          <CardTitle className="text-white text-base flex items-center gap-2">
            <Plus className="w-4 h-4" /> Import from URL
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex gap-2">
            <Input
              placeholder="https://everia.club/2024/01/01/post-title/"
              value={url}
              onChange={e => setUrl(e.target.value)}
              onKeyDown={e => e.key === "Enter" && handleImport()}
              className="bg-slate-700 border-slate-600 text-white placeholder:text-slate-500 flex-1"
            />
            <Button
              onClick={handleImport}
              disabled={createMutation.isPending || !url.trim()}
              className="bg-violet-600 hover:bg-violet-700 shrink-0"
            >
              {createMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Import"}
            </Button>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-slate-400 text-xs shrink-0">Use source config:</span>
            <Select value={sourceId} onValueChange={setSourceId}>
              <SelectTrigger className="bg-slate-700 border-slate-600 text-slate-300 h-7 text-xs w-48">
                <SelectValue placeholder="Auto-detect" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Auto-detect</SelectItem>
                {sources.map(s => (
                  <SelectItem key={s.id} value={String(s.id)}>{s.siteName}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Crawl Category */}
      <Card className="bg-slate-800 border-slate-700">
        <CardHeader className="pb-3">
          <CardTitle className="text-white text-base flex items-center gap-2">
            <Globe className="w-4 h-4" /> Crawl Category
          </CardTitle>
          <p className="text-slate-400 text-xs">Crawl all articles in a source's configured category URLs.</p>
        </CardHeader>
        <CardContent>
          <div className="flex gap-2">
            <Select value={crawlCategorySourceId} onValueChange={setCrawlCategorySourceId}>
              <SelectTrigger className="bg-slate-700 border-slate-600 text-slate-300 flex-1">
                <SelectValue placeholder="Select source..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Select source...</SelectItem>
                {sources.map(s => (
                  <SelectItem key={s.id} value={String(s.id)}>{s.siteName}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              onClick={() => {
                if (crawlCategorySourceId === "none") return toast.error("Select a source first");
                crawlCategoryMutation.mutate({ sourceId: parseInt(crawlCategorySourceId) });
              }}
              disabled={crawlCategoryMutation.isPending || crawlCategorySourceId === "none"}
              className="bg-blue-600 hover:bg-blue-700 shrink-0 gap-1.5"
            >
              {crawlCategoryMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <><ChevronRight className="w-4 h-4" /> Crawl Now</>}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Job List */}
      <Card className="bg-slate-800 border-slate-700">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-white text-base">Công việc Import</CardTitle>
            <div className="flex items-center gap-2">
              <Select value={statusFilter} onValueChange={v => { setStatusFilter(v); setPage(1); }}>
                <SelectTrigger className="bg-slate-700 border-slate-600 text-slate-300 h-7 text-xs w-36">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All statuses</SelectItem>
                  {Object.entries(STATUS_CONFIG).map(([k, v]) => (
                    <SelectItem key={k} value={k}>{v.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button variant="ghost" size="sm" onClick={() => refetchJobs()} className="text-slate-400">
                <RefreshCw className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {jobs.length === 0 ? (
            <div className="text-center py-12 text-slate-500">
              <Globe className="w-10 h-10 mx-auto mb-3 opacity-30" />
              <p>Chưa có công việc import yet. Paste a URL above to start.</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-700">
              {jobs.map((job) => (
                <div key={job.id} className={`p-4 hover:bg-slate-750 transition-colors ${liveLogsJobId === job.id ? "bg-slate-800/80 border-l-2 border-violet-500" : ""}`}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-slate-400 text-xs font-mono">#{job.id}</span>
                        <StatusBadge status={job.status} />
                        {job.isDuplicate && (
                          <Badge variant="outline" className="text-xs border-amber-500 text-amber-400">Duplicate</Badge>
                        )}
                      </div>
                      <p className="text-white text-sm truncate font-medium">
                        {job.extractedTitle || job.sourceUrl}
                      </p>
                      <p className="text-slate-500 text-xs truncate mt-0.5">{job.sourceUrl}</p>

                      {/* Progress */}
                      {["crawling", "downloading", "processing"].includes(job.status) && (
                        <div className="mt-2 space-y-1">
                          {job.status === "crawling" && job.totalPages > 0 && (
                            <div>
                              <div className="flex justify-between text-xs text-slate-400 mb-0.5">
                                <span>Trangs</span>
                                <span>{job.crawledPages}/{job.totalPages}</span>
                              </div>
                              <ProgressBar value={job.crawledPages} max={job.totalPages} color="bg-blue-500" />
                            </div>
                          )}
                          {job.totalImages > 0 && (
                            <div>
                              <div className="flex justify-between text-xs text-slate-400 mb-0.5">
                                <span>Images</span>
                                <span>{job.processedImages}/{job.totalImages}</span>
                              </div>
                              <ProgressBar value={job.processedImages} max={job.totalImages} color="bg-purple-500" />
                            </div>
                          )}
                        </div>
                      )}

                      {job.status === "failed" && job.errorMessage && (
                        <p className="text-red-400 text-xs mt-1 truncate">{job.errorMessage}</p>
                      )}

                      <div className="flex items-center gap-3 mt-1.5 text-xs text-slate-500">
                        {job.totalImages > 0 && <span>{job.totalImages} images</span>}
                        {job.extractedCreator && <span>by {job.extractedCreator}</span>}
                        <span>{new Date(job.createdAt).toLocaleString()}</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      {job.albumId && (
                        <Link href={`/admin/album/${job.albumId}`}>
                          <Button variant="ghost" size="sm" className="text-green-400 h-7 px-2 text-xs gap-1">
                            <ExternalLink className="w-3 h-3" /> Album
                          </Button>
                        </Link>
                      )}
                      {/* Live Logs button — replaces old static Logs link */}
                      <Button
                        variant="ghost"
                        size="sm"
                        className={`h-7 px-2 text-xs gap-1 ${liveLogsJobId === job.id ? "text-violet-400 bg-violet-500/10" : "text-slate-400"}`}
                        onClick={() => setLiveLogsJobId(liveLogsJobId === job.id ? null : job.id)}
                        title="View live logs"
                      >
                        <Terminal className="w-3 h-3" />
                        {liveLogsJobId === job.id ? "Close" : "Logs"}
                      </Button>
                      {job.status === "failed" && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-blue-400 h-7 px-2 text-xs gap-1"
                          onClick={() => retryMutation.mutate({ id: job.id })}
                          disabled={retryMutation.isPending}
                        >
                          <RefreshCw className="w-3 h-3" /> Retry
                        </Button>
                      )}
                      {["queued", "crawling", "downloading", "processing", "seo"].includes(job.status) && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-red-400 h-7 px-2 text-xs gap-1"
                          onClick={() => cancelMutation.mutate({ id: job.id })}
                          disabled={cancelMutation.isPending}
                        >
                          <Ban className="w-3 h-3" /> Cancel
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Pagination */}
          {jobs.length === 20 && (
            <div className="flex justify-center gap-2 p-4 border-t border-slate-700">
              <Button variant="outline" size="sm" disabled={page === 1} onClick={() => setPage(p => p - 1)}>Trước</Button>
              <span className="text-slate-400 text-sm self-center">Trang {page}</span>
              <Button variant="outline" size="sm" onClick={() => setPage(p => p + 1)}>Tiếp</Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
      }
    />
  );
}

export default function AdminImport() {
  return (
    <AdminLayout>
      <AdminImportContent />
    </AdminLayout>
  );
}
