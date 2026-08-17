import { useState, useEffect, type ReactElement } from "react";
import { OperationsPage } from "@/admin";
import { trpc } from "@/lib/trpc";
import AdminLayout from "./AdminLayout";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Sparkles, Loader2, CheckCircle2, XCircle, Clock,
  ChevronDown, ChevronUp, Image, User, StopCircle, X,
  RefreshCw, RotateCcw, AlertCircle, Pencil, Check, Filter,
  CalendarClock, Play, Save,
} from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type JobType = "albums" | "creators" | "tags";
type ItemStatus = "pending" | "processing" | "done" | "failed";

type JobItem = {
  id: number;
  name: string;
  status: ItemStatus;
  error?: string;
  // SEO fields
  focusKeyword?: string;
  metaTitle?: string;
  metaDescription?: string;
  // Tag fields
  suggestedTags?: string[];
  appliedTagCount?: number;
};

type JobStatus = {
  jobId: string;
  type: JobType;
  total: number;
  done: number;
  failed: number;
  processing: number;
  pending: number;
  finished: boolean;
  cancelled: boolean;
  items: JobItem[];
};

type EditState = {
  focusKeyword: string;
  metaTitle: string;
  metaDescription: string;
};

const STATUS_ICON: Record<ItemStatus, ReactElement> = {
  pending: <Clock className="w-4 h-4 text-muted-foreground" />,
  processing: <Loader2 className="w-4 h-4 text-primary animate-spin" />,
  done: <CheckCircle2 className="w-4 h-4 text-green-500" />,
  failed: <XCircle className="w-4 h-4 text-destructive" />,
};

const STATUS_LABEL: Record<ItemStatus, string> = {
  pending: "Chờ xử lý",
  processing: "Đang tạo...",
  done: "Hoàn thành",
  failed: "Thất bại",
};

export default function AdminSeoBulk() {
  const [expandedItems, setExpandedItems] = useState<Set<number>>(new Set());
  const [editingItems, setEditingItems] = useState<Map<number, EditState>>(new Map());
  const [savingItems, setSavingItems] = useState<Set<number>>(new Set());
  const [pollingEnabled, setPollingEnabled] = useState(false);
  const [forceAll, setForceAll] = useState(false);
  const [confirmForceAll, setConfirmForceAll] = useState<JobType | null>(null);

  // Filters
  const [selectedCategoryId, setSelectedCategoryId] = useState<number | undefined>();
  const [selectedTagId, setSelectedTagId] = useState<number | undefined>();
  const [showFilters, setShowFilters] = useState(false);

  // Auto Schedule config
  const [scheduleEnabled, setScheduleEnabled] = useState(false);
  const [cronHour, setCronHour] = useState(2);
  const [maxAlbums, setMaxAlbums] = useState(20);
  const [maxCreators, setMaxCreators] = useState(10);
  const [maxTags, setMaxTags] = useState(10);
  const [showSchedulePanel, setShowSchedulePanel] = useState(false);
  const [runNowResult, setRunNowResult] = useState<any>(null);

  const utils = trpc.useUtils();

  // Auto Schedule: load config from server
  const { data: autoSeoConfig } = trpc.seo.getAutoSeoConfig.useQuery(undefined, {
    onSuccess: (data: any) => {
      if (!data) return;
      setScheduleEnabled(data.enabled ?? false);
      setCronHour(data.cronHour ?? 2);
      setMaxAlbums(data.maxAlbums ?? 20);
      setMaxCreators(data.maxCreators ?? 10);
      setMaxTags(data.maxTags ?? 10);
    },
  });

  const saveAutoSeoConfigMutation = trpc.seo.saveAutoSeoConfig.useMutation({
    onSuccess: () => toast.success("Đã lưu cấu hình Auto Schedule"),
    onError: (err: any) => toast.error(err.message),
  });

  const runAutoSeoNowMutation = trpc.seo.runAutoSeoNow.useMutation({
    onSuccess: (data: any) => {
      setRunNowResult(data);
      toast.success(data.message || "Đã chạy xong Auto Bulk SEO");
    },
    onError: (err: any) => toast.error("Lỗi: " + err.message),
  });

  // Sync state when config loads
  useEffect(() => {
    if (autoSeoConfig) {
      setScheduleEnabled((autoSeoConfig as any).enabled ?? false);
      setCronHour((autoSeoConfig as any).cronHour ?? 2);
      setMaxAlbums((autoSeoConfig as any).maxAlbums ?? 20);
      setMaxCreators((autoSeoConfig as any).maxCreators ?? 10);
      setMaxTags((autoSeoConfig as any).maxTags ?? 10);
    }
  }, [autoSeoConfig]);

  // Dropdown data for filters
  const { data: categories } = trpc.albums.categories.useQuery();
  const { data: tags } = trpc.albums.tags.useQuery();

  // Stats with filters applied
  const { data: stats, refetch: refetchStats } = trpc.seo.getBulkStats.useQuery(
    { categoryId: selectedCategoryId, tagId: selectedTagId },
    { refetchInterval: pollingEnabled ? false : 30000 }
  );

  const { data: jobStatus, refetch: refetchStatus } = trpc.seo.getBulkJobStatus.useQuery(undefined, {
    refetchInterval: pollingEnabled ? 1500 : false,
    refetchIntervalInBackground: true,
  });

  const startJobMutation = trpc.seo.startBulkJob.useMutation({
    onSuccess: (data) => {
      if (data.total === 0) {
        toast.success("Tất cả đã có SEO đầy đủ — không có mục nào cần xử lý.");
        refetchStats();
        return;
      }
      toast.success(`Đã bắt đầu tạo SEO cho ${data.total} mục`);
      setPollingEnabled(true);
    },
    onError: (err) => toast.error(err.message),
  });

  const cancelJobMutation = trpc.seo.cancelBulkJob.useMutation({
    onSuccess: () => {
      toast.info("Đã hủy job");
      refetchStatus();
    },
    onError: (err) => toast.error(err.message),
  });

  const clearJobMutation = trpc.seo.clearBulkJob.useMutation({
    onSuccess: () => {
      utils.seo.getBulkJobStatus.invalidate();
      setPollingEnabled(false);
      refetchStats();
    },
    onError: (err) => toast.error(err.message),
  });

  const updateItemMutation = trpc.seo.updateBulkItem.useMutation({
    onSuccess: (_, variables) => {
      toast.success("Đã lưu thay đổi SEO");
      setSavingItems((prev) => { const s = new Set(prev); s.delete(variables.id); return s; });
      setEditingItems((prev) => { const m = new Map(prev); m.delete(variables.id); return m; });
      // Update local job status cache
      utils.seo.getBulkJobStatus.invalidate();
    },
    onError: (err, variables) => {
      toast.error(err.message);
      setSavingItems((prev) => { const s = new Set(prev); s.delete(variables.id); return s; });
    },
  });

  // Stop polling when job finishes
  useEffect(() => {
    if (jobStatus?.finished || jobStatus?.cancelled) {
      setPollingEnabled(false);
      if (jobStatus.finished) {
        toast.success(`Hoàn thành! ${jobStatus.done} thành công, ${jobStatus.failed} thất bại.`);
        refetchStats();
      }
    }
  }, [jobStatus?.finished, jobStatus?.cancelled]);

  function toggleExpand(id: number) {
    setExpandedItems((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function startEdit(item: JobItem) {
    setEditingItems((prev) => {
      const m = new Map(prev);
      m.set(item.id, {
        focusKeyword: item.focusKeyword ?? "",
        metaTitle: item.metaTitle ?? "",
        metaDescription: item.metaDescription ?? "",
      });
      return m;
    });
    // Auto-expand
    setExpandedItems((prev) => new Set(prev).add(item.id));
  }

  function cancelEdit(id: number) {
    setEditingItems((prev) => { const m = new Map(prev); m.delete(id); return m; });
  }

  function saveEdit(item: JobItem, type: JobType) {
    const edit = editingItems.get(item.id);
    if (!edit) return;
    setSavingItems((prev) => new Set(prev).add(item.id));
    updateItemMutation.mutate({
      type,
      id: item.id,
      focusKeyword: edit.focusKeyword,
      metaTitle: edit.metaTitle,
      metaDescription: edit.metaDescription,
    });
  }

  function handleStart(type: JobType) {
    if (forceAll) {
      setConfirmForceAll(type);
      return;
    }
    startJobMutation.mutate({ type, forceAll: false, categoryId: selectedCategoryId, tagId: selectedTagId });
  }

  function confirmAndStart(type: JobType) {
    setConfirmForceAll(null);
    startJobMutation.mutate({ type, forceAll: true, categoryId: selectedCategoryId, tagId: selectedTagId });
  }

  const isRunning = jobStatus && !jobStatus.finished && !jobStatus.cancelled;
  const progressPct = jobStatus && jobStatus.total > 0
    ? Math.round(((jobStatus.done + jobStatus.failed) / jobStatus.total) * 100)
    : 0;

  const albumMissing = stats?.albums.missing ?? 0;
  const creatorMissing = stats?.creators.missing ?? 0;
  const albumTotal = stats?.albums.total ?? 0;
  const creatorTotal = stats?.creators.total ?? 0;
  const tagsMissing = stats?.tags?.missing ?? 0;
  const tagsTotal = stats?.tags?.total ?? 0;

  const selectedCategoryName = categories?.find((c) => c.id === selectedCategoryId)?.name;
  const selectedTagName = tags?.find((t) => t.id === selectedTagId)?.name;

  return (
    <AdminLayout>
      <OperationsPage
        shell="full"
        header={{
          icon: Sparkles,
          title: "Bulk Generate SEO",
          subtitle: "Tự động tạo SEO và thẻ tag bằng AI cho Album và Creator đang thiếu thông tin",
        }}
        primary={
      <div className="space-y-6">
        <div className="flex flex-wrap gap-3">
          {/* Force Regenerate toggle */}
          <div className="flex items-center gap-2.5 rounded-lg border border-border bg-muted/30 px-3 py-2 flex-1 min-w-[260px]">
            <button
              type="button"
              onClick={() => setForceAll((v) => !v)}
              className={`relative w-9 h-5 rounded-full transition-colors duration-200 flex-shrink-0 ${forceAll ? "bg-primary" : "bg-muted-foreground/30"}`}
            >
              <span className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform duration-200 ${forceAll ? "translate-x-4" : "translate-x-0"}`} />
            </button>
            <div>
              <p className="text-sm font-medium flex items-center gap-1.5">
                <RotateCcw className="w-3.5 h-3.5" />
                Chạy lại tất cả
              </p>
              <p className="text-xs text-muted-foreground">
                {forceAll ? "Ghi đè SEO hiện có" : "Chỉ mục thiếu SEO (mặc định)"}
              </p>
            </div>
          </div>

          {/* Filter toggle button */}
          <button
            type="button"
            onClick={() => setShowFilters((v) => !v)}
            className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-colors ${showFilters || selectedCategoryId || selectedTagId ? "border-primary text-primary bg-primary/5" : "border-border text-muted-foreground hover:text-foreground"}`}
          >
            <Filter className="w-4 h-4" />
            Bộ lọc
            {(selectedCategoryId || selectedTagId) && (
              <span className="bg-primary text-primary-foreground text-xs rounded-full w-4 h-4 flex items-center justify-center">
                {(selectedCategoryId ? 1 : 0) + (selectedTagId ? 1 : 0)}
              </span>
            )}
          </button>
        </div>

        {/* Filter panel */}
        {showFilters && (
          <div className="rounded-lg border border-border bg-card p-4 space-y-3">
            <p className="text-sm font-medium text-muted-foreground">Lọc Albums theo (áp dụng cho cả thống kê và job)</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Danh mục</label>
                <select
                  className="w-full rounded-md border border-border bg-background text-sm px-3 py-2 focus:outline-none focus:ring-1 focus:ring-primary"
                  value={selectedCategoryId ?? ""}
                  onChange={(e) => setSelectedCategoryId(e.target.value ? Number(e.target.value) : undefined)}
                >
                  <option value="">Tất cả danh mục</option>
                  {categories?.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Tag</label>
                <select
                  className="w-full rounded-md border border-border bg-background text-sm px-3 py-2 focus:outline-none focus:ring-1 focus:ring-primary"
                  value={selectedTagId ?? ""}
                  onChange={(e) => setSelectedTagId(e.target.value ? Number(e.target.value) : undefined)}
                >
                  <option value="">Tất cả tags</option>
                  {tags?.map((t) => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
                </select>
              </div>
            </div>
            {(selectedCategoryId || selectedTagId) && (
              <button
                type="button"
                onClick={() => { setSelectedCategoryId(undefined); setSelectedTagId(undefined); }}
                className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
              >
                <X className="w-3 h-3" /> Xóa bộ lọc
              </button>
            )}
          </div>
        )}

        {/* Active filter badge */}
        {(selectedCategoryId || selectedTagId) && (
          <div className="flex items-center gap-2 text-xs text-primary">
            <Filter className="w-3.5 h-3.5" />
            Đang lọc:
            {selectedCategoryName && <span className="bg-primary/10 px-2 py-0.5 rounded-full">{selectedCategoryName}</span>}
            {selectedTagName && <span className="bg-primary/10 px-2 py-0.5 rounded-full">#{selectedTagName}</span>}
          </div>
        )}

        {/* ─── Auto Schedule Panel ─────────────────────────────────────── */}
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          {/* Header row - always visible */}
          <button
            type="button"
            onClick={() => setShowSchedulePanel((v) => !v)}
            className="w-full flex items-center justify-between px-5 py-4 hover:bg-muted/30 transition-colors"
          >
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                <CalendarClock className="w-4 h-4 text-primary" />
              </div>
              <div className="text-left">
                <p className="text-sm font-semibold">Auto Schedule SEO</p>
                <p className="text-xs text-muted-foreground">
                  {scheduleEnabled
                    ? `Bật — chạy hàng ngày lúc ${cronHour}:00 UTC (${cronHour + 7 > 23 ? cronHour + 7 - 24 : cronHour + 7}:00 giờ VN)`
                    : "Tắt — chỉ chạy thủ công"}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Button
                size="sm"
                variant="outline"
                className="gap-1.5 text-xs"
                disabled={runAutoSeoNowMutation.isPending}
                onClick={(e) => { e.stopPropagation(); setRunNowResult(null); runAutoSeoNowMutation.mutate(); }}
              >
                {runAutoSeoNowMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
                Chạy ngay
              </Button>
              {showSchedulePanel ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
            </div>
          </button>

          {/* Expandable config */}
          {showSchedulePanel && (
            <div className="border-t border-border px-5 py-4 space-y-5">
              {/* Enable toggle */}
              <div className="flex items-center justify-between">
                <div>
                  <Label className="text-sm font-medium">Bật Auto Schedule</Label>
                  <p className="text-xs text-muted-foreground mt-0.5">Hệ thống tự chạy Bulk SEO theo lịch đã cấu hình</p>
                </div>
                <Switch checked={scheduleEnabled} onCheckedChange={setScheduleEnabled} />
              </div>

              {/* Hour picker */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Giờ chạy (UTC)</Label>
                  <Input
                    type="number" min={0} max={23}
                    className="h-8 text-sm"
                    value={cronHour}
                    onChange={(e) => setCronHour(Math.max(0, Math.min(23, parseInt(e.target.value) || 0)))}
                  />
                  <p className="text-xs text-muted-foreground">{cronHour + 7 > 23 ? cronHour + 7 - 24 : cronHour + 7}:00 giờ Việt Nam</p>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Max Albums/lần</Label>
                  <Input
                    type="number" min={1} max={100}
                    className="h-8 text-sm"
                    value={maxAlbums}
                    onChange={(e) => setMaxAlbums(Math.max(1, Math.min(100, parseInt(e.target.value) || 1)))}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Max Creators/lần</Label>
                  <Input
                    type="number" min={1} max={100}
                    className="h-8 text-sm"
                    value={maxCreators}
                    onChange={(e) => setMaxCreators(Math.max(1, Math.min(100, parseInt(e.target.value) || 1)))}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Max Tags/lần</Label>
                  <Input
                    type="number" min={1} max={100}
                    className="h-8 text-sm"
                    value={maxTags}
                    onChange={(e) => setMaxTags(Math.max(1, Math.min(100, parseInt(e.target.value) || 1)))}
                  />
                </div>
              </div>

              {/* Save button */}
              <div className="flex items-center justify-between pt-1">
                <p className="text-xs text-muted-foreground">
                  Cron job Linux trên VPS sẽ đọc config này khi chạy tự động.
                </p>
                <Button
                  size="sm"
                  className="gap-1.5"
                  disabled={saveAutoSeoConfigMutation.isPending}
                  onClick={() => saveAutoSeoConfigMutation.mutate({ enabled: scheduleEnabled, cronHour, maxAlbums, maxCreators, maxTags })}
                >
                  {saveAutoSeoConfigMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                  Lưu cấu hình
                </Button>
              </div>
            </div>
          )}

          {/* Run Now result */}
          {runNowResult && (
            <div className="border-t border-border px-5 py-3 bg-muted/20">
              <p className="text-xs font-medium text-muted-foreground mb-1">Kết quả chạy thủ công:</p>
              <div className="grid grid-cols-3 gap-3 text-xs">
                <div className="text-center">
                  <p className="font-semibold text-green-500">{runNowResult.results?.albumsProcessed ?? 0}</p>
                  <p className="text-muted-foreground">Albums SEO</p>
                </div>
                <div className="text-center">
                  <p className="font-semibold text-green-500">{runNowResult.results?.creatorsProcessed ?? 0}</p>
                  <p className="text-muted-foreground">Creators SEO</p>
                </div>
                <div className="text-center">
                  <p className="font-semibold text-green-500">{runNowResult.results?.tagsProcessed ?? 0}</p>
                  <p className="text-muted-foreground">Albums Tags</p>
                </div>
              </div>
              {runNowResult.message && <p className="text-xs text-muted-foreground mt-1 text-center">{runNowResult.message}</p>}
            </div>
          )}
        </div>

        {/* Start buttons with stats */}
        {!isRunning && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {/* Albums card */}
            <div className="rounded-xl border border-border bg-card p-5 space-y-4">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                    <Image className="w-4 h-4 text-primary" />
                  </div>
                  <div>
                    <p className="font-semibold text-sm">Albums</p>
                    <p className="text-xs text-muted-foreground">Cosplay photo albums</p>
                  </div>
                </div>
                {stats && (
                  albumMissing === 0 && !forceAll ? (
                    <span className="text-xs bg-green-500/10 text-green-500 px-2 py-0.5 rounded-full flex items-center gap-1">
                      <CheckCircle2 className="w-3 h-3" /> Đầy đủ SEO
                    </span>
                  ) : (
                    <span className="text-xs bg-orange-500/10 text-orange-400 px-2 py-0.5 rounded-full flex items-center gap-1">
                      <AlertCircle className="w-3 h-3" />
                      {forceAll ? `${albumTotal} mục` : `${albumMissing} thiếu SEO`}
                    </span>
                  )
                )}
              </div>

              {stats && albumTotal > 0 && (
                <div>
                  <div className="flex justify-between text-xs text-muted-foreground mb-1">
                    <span>Đã có SEO</span>
                    <span>{albumTotal - albumMissing}/{albumTotal}</span>
                  </div>
                  <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                    <div
                      className="h-full bg-green-500 rounded-full transition-all"
                      style={{ width: `${albumTotal > 0 ? Math.round(((albumTotal - albumMissing) / albumTotal) * 100) : 0}%` }}
                    />
                  </div>
                </div>
              )}

              <Button
                className="w-full"
                onClick={() => handleStart("albums")}
                disabled={startJobMutation.isPending || !!isRunning || (!forceAll && albumMissing === 0)}
                variant={!forceAll && albumMissing === 0 ? "outline" : "default"}
              >
                {startJobMutation.isPending && startJobMutation.variables?.type === "albums"
                  ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Đang khởi động...</>
                  : forceAll
                    ? <><RotateCcw className="w-4 h-4 mr-2" />Chạy lại {albumTotal} Albums</>
                    : albumMissing === 0
                      ? <><CheckCircle2 className="w-4 h-4 mr-2" />Đã đầy đủ SEO</>
                      : <><Sparkles className="w-4 h-4 mr-2" />Tạo SEO cho {albumMissing} Albums</>
                }
              </Button>
            </div>

            {/* Creators card */}
            <div className="rounded-xl border border-border bg-card p-5 space-y-4">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                    <User className="w-4 h-4 text-primary" />
                  </div>
                  <div>
                    <p className="font-semibold text-sm">Creators</p>
                    <p className="text-xs text-muted-foreground">Cosplay creators / models</p>
                  </div>
                </div>
                {stats && (
                  creatorMissing === 0 && !forceAll ? (
                    <span className="text-xs bg-green-500/10 text-green-500 px-2 py-0.5 rounded-full flex items-center gap-1">
                      <CheckCircle2 className="w-3 h-3" /> Đầy đủ SEO
                    </span>
                  ) : (
                    <span className="text-xs bg-orange-500/10 text-orange-400 px-2 py-0.5 rounded-full flex items-center gap-1">
                      <AlertCircle className="w-3 h-3" />
                      {forceAll ? `${creatorTotal} mục` : `${creatorMissing} thiếu SEO`}
                    </span>
                  )
                )}
              </div>

              {stats && creatorTotal > 0 && (
                <div>
                  <div className="flex justify-between text-xs text-muted-foreground mb-1">
                    <span>Đã có SEO</span>
                    <span>{creatorTotal - creatorMissing}/{creatorTotal}</span>
                  </div>
                  <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                    <div
                      className="h-full bg-green-500 rounded-full transition-all"
                      style={{ width: `${creatorTotal > 0 ? Math.round(((creatorTotal - creatorMissing) / creatorTotal) * 100) : 0}%` }}
                    />
                  </div>
                </div>
              )}

              <Button
                className="w-full"
                onClick={() => handleStart("creators")}
                disabled={startJobMutation.isPending || !!isRunning || (!forceAll && creatorMissing === 0)}
                variant={!forceAll && creatorMissing === 0 ? "outline" : "default"}
              >
                {startJobMutation.isPending && startJobMutation.variables?.type === "creators"
                  ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Đang khởi động...</>
                  : forceAll
                    ? <><RotateCcw className="w-4 h-4 mr-2" />Chạy lại {creatorTotal} Creators</>
                    : creatorMissing === 0
                      ? <><CheckCircle2 className="w-4 h-4 mr-2" />Đã đầy đủ SEO</>
                      : <><Sparkles className="w-4 h-4 mr-2" />Tạo SEO cho {creatorMissing} Creators</>
                }
              </Button>
            </div>

            {/* Tags card */}
            <div className="rounded-xl border border-border bg-card p-5 space-y-4">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                    <span className="text-primary text-base">#</span>
                  </div>
                  <div>
                    <p className="font-semibold text-sm">Tags</p>
                    <p className="text-xs text-muted-foreground">Albums chưa có thẻ tag</p>
                  </div>
                </div>
                {stats && (
                  tagsMissing === 0 && !forceAll ? (
                    <span className="text-xs bg-green-500/10 text-green-500 px-2 py-0.5 rounded-full flex items-center gap-1">
                      <CheckCircle2 className="w-3 h-3" /> Đầy đủ Tags
                    </span>
                  ) : (
                    <span className="text-xs bg-orange-500/10 text-orange-400 px-2 py-0.5 rounded-full flex items-center gap-1">
                      <AlertCircle className="w-3 h-3" />
                      {forceAll ? `${tagsTotal} albums` : `${tagsMissing} chưa có tag`}
                    </span>
                  )
                )}
              </div>

              {stats && tagsTotal > 0 && (
                <div>
                  <div className="flex justify-between text-xs text-muted-foreground mb-1">
                    <span>Đã có tag</span>
                    <span>{tagsTotal - tagsMissing}/{tagsTotal}</span>
                  </div>
                  <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                    <div
                      className="h-full bg-green-500 rounded-full transition-all"
                      style={{ width: `${tagsTotal > 0 ? Math.round(((tagsTotal - tagsMissing) / tagsTotal) * 100) : 0}%` }}
                    />
                  </div>
                </div>
              )}

              <Button
                className="w-full"
                onClick={() => handleStart("tags")}
                disabled={startJobMutation.isPending || !!isRunning || (!forceAll && tagsMissing === 0)}
                variant={!forceAll && tagsMissing === 0 ? "outline" : "default"}
              >
                {startJobMutation.isPending && startJobMutation.variables?.type === "tags"
                  ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Đang khởi động...</>
                  : forceAll
                    ? <><RotateCcw className="w-4 h-4 mr-2" />Chạy lại {tagsTotal} Albums</>
                    : tagsMissing === 0
                      ? <><CheckCircle2 className="w-4 h-4 mr-2" />Đã đầy đủ Tags</>
                      : <><Sparkles className="w-4 h-4 mr-2" />Tạo Tags cho {tagsMissing} Albums</>
                }
              </Button>
            </div>
            </div>
        )}

        {/* Job result panel */}
        {jobStatus && (
          <div className="rounded-xl border border-border bg-card overflow-hidden">
            <div className="px-5 py-4 border-b border-border flex items-center justify-between">
              <div className="flex items-center gap-3">
                {isRunning
                  ? <Loader2 className="w-5 h-5 text-primary animate-spin" />
                  : jobStatus.cancelled
                    ? <StopCircle className="w-5 h-5 text-muted-foreground" />
                    : <CheckCircle2 className="w-5 h-5 text-green-500" />
                }
                <div>
                  <p className="font-semibold text-sm">
                    {jobStatus.type === "tags" ? "Bulk Tags" : "Bulk SEO"} — {jobStatus.type === "albums" ? "Albums" : jobStatus.type === "creators" ? "Creators" : "Tags"}
                    {jobStatus.cancelled && <span className="ml-2 text-xs text-muted-foreground">(Đã hủy)</span>}
                    {jobStatus.finished && <span className="ml-2 text-xs text-green-500">(Hoàn thành)</span>}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {jobStatus.done}/{jobStatus.total} xong
                    {jobStatus.failed > 0 && ` · ${jobStatus.failed} thất bại`}
                    {jobStatus.processing > 0 && ` · ${jobStatus.processing} đang xử lý`}
                    {jobStatus.pending > 0 && ` · ${jobStatus.pending} chờ`}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {isRunning && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => cancelJobMutation.mutate()}
                    disabled={cancelJobMutation.isPending}
                    className="flex items-center gap-1.5 text-destructive border-destructive/30 hover:bg-destructive/10"
                  >
                    <StopCircle className="w-3.5 h-3.5" />
                    Hủy
                  </Button>
                )}
                {!isRunning && (
                  <>
                    <Button variant="outline" size="sm" onClick={() => refetchStatus()} className="flex items-center gap-1.5">
                      <RefreshCw className="w-3.5 h-3.5" />
                      Làm mới
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => clearJobMutation.mutate()}
                      disabled={clearJobMutation.isPending}
                      className="flex items-center gap-1.5 text-muted-foreground hover:text-foreground"
                      title="Ẩn kết quả (không xóa SEO đã tạo)"
                    >
                      <X className="w-3.5 h-3.5" />
                      Ẩn kết quả
                    </Button>
                  </>
                )}
              </div>
            </div>

            {/* Progress bar */}
            <div className="px-5 pt-3 pb-1">
              <div className="flex items-center justify-between text-xs text-muted-foreground mb-1.5">
                <span>Tiến độ</span>
                <span>{progressPct}%</span>
              </div>
              <div className="h-2 bg-muted rounded-full overflow-hidden">
                <div
                  className="h-full bg-primary rounded-full transition-all duration-500"
                  style={{ width: `${progressPct}%` }}
                />
              </div>
            </div>

            {/* Stats row */}
            <div className="px-5 py-3 grid grid-cols-4 gap-2 text-center border-b border-border">
              {[
                { label: "Tổng", value: jobStatus.total, color: "text-foreground" },
                { label: "Xong", value: jobStatus.done, color: "text-green-500" },
                { label: "Thất bại", value: jobStatus.failed, color: "text-destructive" },
                { label: "Còn lại", value: jobStatus.pending + jobStatus.processing, color: "text-muted-foreground" },
              ].map((stat) => (
                <div key={stat.label} className="rounded-lg bg-muted/40 py-2">
                  <p className={`text-lg font-bold ${stat.color}`}>{stat.value}</p>
                  <p className="text-xs text-muted-foreground">{stat.label}</p>
                </div>
              ))}
            </div>

            {/* Item list */}
            <div className="divide-y divide-border max-h-[520px] overflow-y-auto">
              {jobStatus.items.map((item) => {
                const isEditing = editingItems.has(item.id);
                const editState = editingItems.get(item.id);
                const isSaving = savingItems.has(item.id);
                const isExpanded = expandedItems.has(item.id);

                return (
                  <div key={item.id} className="px-5 py-3">
                    {/* Item header row */}
                    <div className="flex items-center gap-3">
                      <div className="flex-shrink-0">{STATUS_ICON[item.status]}</div>
                      <div
                        className="flex-1 min-w-0 cursor-pointer"
                        onClick={() => item.status === "done" && toggleExpand(item.id)}
                      >
                        <p className="text-sm font-medium truncate">{item.name}</p>
                        <p className="text-xs text-muted-foreground">{STATUS_LABEL[item.status]}</p>
                      </div>

                      {item.status === "done" && item.focusKeyword && !isEditing && (
                        <span className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full truncate max-w-[120px] hidden sm:block">
                          {item.focusKeyword}
                        </span>
                      )}
                      {item.status === "failed" && item.error && (
                        <span className="text-xs text-destructive truncate max-w-[140px]" title={item.error}>
                          {item.error}
                        </span>
                      )}

                      {/* Action buttons for done items */}
                      {item.status === "done" && !isEditing && (
                        <div className="flex items-center gap-1 flex-shrink-0">
                          {jobStatus.type !== "tags" && (
                            <button
                              type="button"
                              onClick={() => startEdit(item)}
                              className="p-1.5 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                              title="Chỉnh sửa SEO"
                            >
                              <Pencil className="w-3.5 h-3.5" />
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => toggleExpand(item.id)}
                            className="p-1.5 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                          >
                            {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                          </button>
                        </div>
                      )}

                      {/* Save/Cancel when editing */}
                      {isEditing && (
                        <div className="flex items-center gap-1 flex-shrink-0">
                          <button
                            type="button"
                            onClick={() => saveEdit(item, jobStatus.type)}
                            disabled={isSaving}
                            className="p-1.5 rounded-md bg-primary/10 hover:bg-primary/20 text-primary transition-colors"
                            title="Lưu"
                          >
                            {isSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                          </button>
                          <button
                            type="button"
                            onClick={() => cancelEdit(item.id)}
                            disabled={isSaving}
                            className="p-1.5 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                            title="Hủy"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      )}
                    </div>

                    {/* Inline edit form */}
                    {isEditing && editState && (
                      <div className="mt-3 ml-7 space-y-2">
                        <div>
                          <label className="text-xs text-muted-foreground font-medium block mb-1">Focus Keyword</label>
                          <input
                            type="text"
                            value={editState.focusKeyword}
                            onChange={(e) => setEditingItems((prev) => {
                              const m = new Map(prev);
                              m.set(item.id, { ...editState, focusKeyword: e.target.value });
                              return m;
                            })}
                            className="w-full rounded-md border border-border bg-background text-sm px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-primary"
                            placeholder="e.g. Nnian cosplay model"
                          />
                        </div>
                        <div>
                          <label className="text-xs text-muted-foreground font-medium block mb-1">
                            Meta Title <span className="text-muted-foreground/60">({editState.metaTitle.length}/60)</span>
                          </label>
                          <input
                            type="text"
                            value={editState.metaTitle}
                            onChange={(e) => setEditingItems((prev) => {
                              const m = new Map(prev);
                              m.set(item.id, { ...editState, metaTitle: e.target.value });
                              return m;
                            })}
                            className="w-full rounded-md border border-border bg-background text-sm px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-primary"
                            placeholder="SEO title..."
                          />
                        </div>
                        <div>
                          <label className="text-xs text-muted-foreground font-medium block mb-1">
                            Meta Description <span className="text-muted-foreground/60">({editState.metaDescription.length}/160)</span>
                          </label>
                          <textarea
                            value={editState.metaDescription}
                            onChange={(e) => setEditingItems((prev) => {
                              const m = new Map(prev);
                              m.set(item.id, { ...editState, metaDescription: e.target.value });
                              return m;
                            })}
                            rows={2}
                            className="w-full rounded-md border border-border bg-background text-sm px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-primary resize-none"
                            placeholder="SEO description..."
                          />
                        </div>
                      </div>
                    )}

                    {/* Expanded read-only view */}
                    {!isEditing && item.status === "done" && isExpanded && (
                      <div className="mt-2 ml-7 space-y-1.5 text-xs bg-muted/30 rounded-lg p-3">
                        {jobStatus.type === "tags" ? (
                          <>
                            {item.appliedTagCount !== undefined && (
                              <div>
                                <span className="text-muted-foreground font-medium">Tags đã áp dụng: </span>
                                <span className="text-green-500 font-semibold">{item.appliedTagCount} tags</span>
                              </div>
                            )}
                            {item.suggestedTags && item.suggestedTags.length > 0 && (
                              <div>
                                <span className="text-muted-foreground font-medium block mb-1">Tags gợi ý:</span>
                                <div className="flex flex-wrap gap-1">
                                  {item.suggestedTags.map((tag) => (
                                    <span key={tag} className="bg-primary/10 text-primary px-2 py-0.5 rounded-full">{tag}</span>
                                  ))}
                                </div>
                              </div>
                            )}
                          </>
                        ) : (
                          <>
                            {item.metaTitle && (
                              <div>
                                <span className="text-muted-foreground font-medium">Title: </span>
                                <span>{item.metaTitle}</span>
                              </div>
                            )}
                            {item.metaDescription && (
                              <div>
                                <span className="text-muted-foreground font-medium">Description: </span>
                                <span>{item.metaDescription}</span>
                              </div>
                            )}
                          </>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Empty state */}
        {!jobStatus && !startJobMutation.isPending && (
          <div className="text-center py-10 text-muted-foreground">
            <Sparkles className="w-10 h-10 mx-auto mb-3 opacity-30" />
            <p className="text-sm">Chọn loại nội dung để bắt đầu tạo SEO hàng loạt</p>
            <p className="text-xs mt-1 opacity-60">Dùng bộ lọc để chọn nhóm cụ thể, hoặc bật "Chạy lại tất cả" để refresh SEO</p>
          </div>
        )}
      </div>
        }
      />

      {/* Confirmation dialog for forceAll */}
      <AlertDialog open={!!confirmForceAll} onOpenChange={(open) => !open && setConfirmForceAll(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <RotateCcw className="w-5 h-5 text-orange-500" />
              Xác nhận chạy lại tất cả
            </AlertDialogTitle>
            <AlertDialogDescription>
              Bạn đang chọn <strong>"Chạy lại tất cả"</strong> cho{" "}
              <strong>{confirmForceAll === "albums" ? "Albums" : confirmForceAll === "creators" ? "Creators" : "Tags (Albums)"}</strong>.
              <br /><br />
              {confirmForceAll === "tags"
                ? <>Thao tác này sẽ <strong>ghi đè toàn bộ tags hiện có</strong> của album (kể cả những tags đã được gắn thủ công).</>
                : <>Thao tác này sẽ <strong>ghi đè toàn bộ SEO hiện có</strong> (kể cả những mục đã được chỉnh sửa thủ công).</>
              }
              {(selectedCategoryId || selectedTagId) && (
                <>
                  <br /><br />
                  Bộ lọc đang áp dụng:{" "}
                  {selectedCategoryName && <strong>{selectedCategoryName}</strong>}
                  {selectedTagName && <strong> #{selectedTagName}</strong>}
                </>
              )}
              <br /><br />
              Bạn có chắc chắn muốn tiếp tục?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Hủy</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => confirmForceAll && confirmAndStart(confirmForceAll)}
              className="bg-orange-500 hover:bg-orange-600 text-white"
            >
              Xác nhận chạy lại
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AdminLayout>
  );
}
