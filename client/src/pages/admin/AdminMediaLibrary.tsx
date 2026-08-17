/**
 * AdminMediaLibrary — lightweight media management UI
 * Grid view trong all media_items with search, pagination, multi-select, delete,
 * and a production-grade bulk upload zone (drag & drop, queue, concurrency 3, retry).
 */
import { useState, useCallback, useRef, useEffect } from "react";
import { AdminPageShell, AdminPageHeader } from "@/admin";
import { trpc } from "@/lib/trpc";
import AdminLayout from "./AdminLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
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
  Search,
  Trash2,
  ImageIcon,
  ChevronLeft,
  ChevronRight,
  CheckSquare,
  Square,
  X,
  Upload,
  RotateCcw,
  CheckCircle2,
  AlertCircle,
  Loader2,
  CloudUpload,
  Grid2X2,
  Grid3X3,
  LayoutList,
  ZoomIn,
  ExternalLink,
  Sparkles,
} from "lucide-react";
import { toast } from "sonner";

// --- Constants ----------------------------------------------------------------
const PAGE_SIZE = 48;
const CONCURRENCY = 5;           // 5 parallel uploads
const MAX_RETRIES = 3;           // retry up to 3 times
const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50 MB
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif", "image/avif"];

// --- Types --------------------------------------------------------------------
type UploadStatus = "pending" | "uploading" | "processing" | "done" | "error";

interface UploadItem {
  id: string;
  file: File;
  status: UploadStatus;
  progress: number; // 0–100 for XHR upload
  jobId?: number;
  error?: string;
  retries: number;
}

interface MediaItem {
  id: number;
  filename: string;
  thumbUrl: string | null;
  webpUrl: string | null;
  originalUrl: string | null;
  width: number | null;
  height: number | null;
  fileSize: number | null;
  mimeType: string | null;
  createdAt: Date;
}

// --- Helpers ------------------------------------------------------------------
function formatBytes(bytes: number | null | undefined): string {
  if (!bytes) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function uid(): string {
  return Math.random().toString(36).slice(2, 10);
}

// --- MediaCard ----------------------------------------------------------------
interface MediaCardProps {
  item: MediaItem;
  selected: boolean;
  onToggle: (id: number) => void;
}

function MediaCard({ item, selected, onToggle }: MediaCardProps) {
  const imgSrc = item.thumbUrl || item.webpUrl || item.originalUrl || "";
  return (
    <div
      className={`relative group cursor-pointer rounded-lg overflow-hidden border-2 transition-all ${
        selected ? "border-primary ring-2 ring-primary/30" : "border-transparent hover:border-border"
      }`}
      onClick={() => onToggle(item.id)}
    >
      <div className="aspect-square bg-muted">
        {imgSrc ? (
          <img src={imgSrc} alt={item.filename} className="w-full h-full object-cover" loading="lazy" />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-muted-foreground">
            <ImageIcon className="w-8 h-8" />
          </div>
        )}
      </div>
      <div className={`absolute inset-0 bg-primary/10 transition-opacity ${selected ? "opacity-100" : "opacity-0 group-hover:opacity-50"}`} />
      <div className="absolute top-1.5 left-1.5">
        {selected ? (
          <CheckSquare className="w-5 h-5 text-primary drop-shadow" />
        ) : (
          <Square className="w-5 h-5 text-white/80 drop-shadow opacity-0 group-hover:opacity-100 transition-opacity" />
        )}
      </div>
      <div className="absolute bottom-0 left-0 right-0 bg-black/60 px-2 py-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <p className="text-xs text-white truncate">{item.filename}</p>
        <p className="text-xs text-white/60">{formatBytes(item.fileSize)}</p>
      </div>
    </div>
  );
}

// --- UploadQueueItem ----------------------------------------------------------
function UploadQueueItem({ item, onRetry }: { item: UploadItem; onRetry: (id: string) => void }) {
  const statusIcon = {
    pending: <div className="w-4 h-4 rounded-full border-2 border-muted-foreground/40" />,
    uploading: <Loader2 className="w-4 h-4 animate-spin text-primary" />,
    processing: <Loader2 className="w-4 h-4 animate-spin text-amber-500" />,
    done: <CheckCircle2 className="w-4 h-4 text-green-500" />,
    error: <AlertCircle className="w-4 h-4 text-destructive" />,
  }[item.status];

  const statusLabel = {
    pending: "Chờ",
    uploading: `Đang tải ${item.progress}%`,
    processing: "Đang xử lý…",
    done: "Hoàn thành",
    error: item.error || "Thất bại",
  }[item.status];

  return (
    <div className="flex items-center gap-2 py-1.5 border-b border-border/40 last:border-0">
      {statusIcon}
      <span className="text-xs text-foreground truncate flex-1 min-w-0">{item.file.name}</span>
      <span className={`text-xs shrink-0 ${item.status === "error" ? "text-destructive" : "text-muted-foreground"}`}>
        {statusLabel}
      </span>
      {item.status === "error" && (
        <button onClick={() => onRetry(item.id)} className="shrink-0 text-muted-foreground hover:text-foreground">
          <RotateCcw className="w-3.5 h-3.5" />
        </button>
      )}
      {(item.status === "uploading") && (
        <div className="w-16 shrink-0">
          <Progress value={item.progress} className="h-1" />
        </div>
      )}
    </div>
  );
}

type ViewMode = "grid-sm" | "grid-md" | "grid-lg" | "list";

// --- ListRow ------------------------------------------------------------------
interface ListRowProps {
  item: MediaItem;
  selected: boolean;
  onToggle: (id: number) => void;
  onPreview: (item: MediaItem) => void;
}

function ListRow({ item, selected, onToggle, onPreview }: ListRowProps) {
  const imgSrc = item.thumbUrl || item.webpUrl || item.originalUrl || "";
  return (
    <div
      className={`flex items-center gap-3 px-3 py-2 rounded-lg border cursor-pointer transition-all ${
        selected ? "border-primary bg-primary/5" : "border-transparent hover:border-border hover:bg-muted/30"
      }`}
      onClick={() => onToggle(item.id)}
    >
      <div className="w-5 h-5 shrink-0 flex items-center justify-center">
        {selected ? (
          <CheckSquare className="w-4 h-4 text-primary" />
        ) : (
          <Square className="w-4 h-4 text-muted-foreground" />
        )}
      </div>
      <div className="w-12 h-12 shrink-0 rounded overflow-hidden bg-muted">
        {imgSrc ? (
          <img src={imgSrc} alt={item.filename} className="w-full h-full object-cover" loading="lazy" />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <ImageIcon className="w-5 h-5 text-muted-foreground" />
          </div>
        )}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">{item.filename}</p>
        <p className="text-xs text-muted-foreground">
          {item.width && item.height ? `${item.width}×${item.height} · ` : ""}
          {formatBytes(item.fileSize)} · {item.mimeType || "image"}
        </p>
      </div>
      <p className="text-xs text-muted-foreground shrink-0 hidden md:block">
        {new Date(item.createdAt).toLocaleDateString()}
      </p>
      <button
        className="shrink-0 text-muted-foreground hover:text-foreground p-1 rounded"
        onClick={(e) => { e.stopPropagation(); onPreview(item); }}
      >
        <ZoomIn className="w-4 h-4" />
      </button>
    </div>
  );
}

// --- Main Component -----------------------------------------------------------
export default function AdminMediaLibrary() {
  // Gallery state
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>("grid-sm");
  const [previewItem, setPreviewItem] = useState<MediaItem | null>(null);

  // Upload state
  const [queue, setQueue] = useState<UploadItem[]>([]);
  const [showQueue, setShowQueue] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const activeUploadsRef = useRef(0);
  const queueRef = useRef<UploadItem[]>([]);
  const processingIdsRef = useRef<Set<string>>(new Set()); // track items being processed to prevent duplicate

  // Keep ref in sync with state
  useEffect(() => { queueRef.current = queue; }, [queue]);

  // Debounce search
  const handleSearchChange = useCallback((val: string) => {
    setSearch(val);
    setPage(0);
    const t = setTimeout(() => setDebouncedSearch(val), 400);
    return () => clearTimeout(t);
  }, []);

  const utils = trpc.useUtils();

  const { data, isLoading, refetch } = trpc.media.list.useQuery({
    search: debouncedSearch || undefined,
    limit: PAGE_SIZE,
    offset: page * PAGE_SIZE,
  });

  const deleteMutation = trpc.media.delete.useMutation({
    onSuccess: () => { toast.success("Đã xóa tệp"); refetch(); },
    onError: (err) => toast.error(err.message || "Delete failed"),
  });

  const requestPresignedUrl = trpc.media.requestPresignedUrl.useMutation();
  const processUpload = trpc.media.processUpload.useMutation();

  // Cleanup originals
  const { data: originalsCount, refetch: refetchOriginalsCount } = trpc.media.countOriginals.useQuery(undefined, {
    refetchInterval: false,
  });
  const cleanupOriginals = trpc.media.cleanupOriginals.useMutation({
    onSuccess: (data) => {
      toast.success(`Đã dọn ${data.cleaned} file gốc · ${data.errors} lỗi`);
      refetchOriginalsCount();
    },
    onError: (err) => toast.error(err.message || "Dọn dẹp thất bại"),
  });

  const retryFailedJobs = trpc.media.retryFailedJobs.useMutation({
    onSuccess: (data) => {
      toast.success(`Đã đưa ${data.reset} ảnh lỗi vào hàng chờ xử lý lại`);
      utils.media.queueStats.invalidate();
    },
    onError: () => toast.error("Không thể retry — thử lại sau"),
  });

  // Server-side queue stats (auto-refresh every 10s when there are pending jobs)
  const { data: serverQueue } = trpc.media.queueStats.useQuery(undefined, {
    refetchInterval: (query) => {
      const d = query.state.data;
      return d && (d.pending > 0 || d.processing > 0) ? 10_000 : 30_000;
    },
  });

  const items: MediaItem[] = (data?.items ?? []) as MediaItem[];
  const total = data?.total ?? 0;
  const totalPages = Math.ceil(total / PAGE_SIZE);

  // -- Selection --------------------------------------------------------------
  const toggleSelect = (id: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };
  const selectAll = () => setSelected(new Set(items.map((i) => i.id)));
  const clearSelection = () => setSelected(new Set());

  const handleBulkDelete = async () => {
    const ids = Array.from(selected);
    let failed = 0;
    for (const id of ids) {
      try { await deleteMutation.mutateAsync({ id }); }
      catch { failed++; }
    }
    clearSelection();
    setDeleteConfirmOpen(false);
    if (failed > 0) toast.error(`${failed} item(s) failed to delete`);
    else toast.success(`${ids.length} item(s) deleted`);
    refetch();
  };

  // -- Upload queue engine ----------------------------------------------------
  const updateItem = useCallback((id: string, patch: Partial<UploadItem>) => {
    setQueue((prev) => prev.map((item) => item.id === id ? { ...item, ...patch } : item));
  }, []);

  const processQueue = useCallback(async () => {
    while (true) {
      if (activeUploadsRef.current >= CONCURRENCY) break;
      const next = queueRef.current.find((i) => i.status === "pending" && !processingIdsRef.current.has(i.id));
      if (!next) break;

      activeUploadsRef.current++;
      processingIdsRef.current.add(next.id); // mark as claimed before any async work
      updateItem(next.id, { status: "uploading", progress: 0 });

      (async () => {
        const item = next;
        try {
          // Step 1: get presigned URL
          const { mode, presignedUrl, originalKey } = await requestPresignedUrl.mutateAsync({
            fileName: item.file.name,
            mimeType: item.file.type || "image/jpeg",
            fileSize: item.file.size,
          });

          if (mode === "presigned" && presignedUrl) {
            // Step 2: XHR PUT to Wasabi with progress
            await new Promise<void>((resolve, reject) => {
              const xhr = new XMLHttpRequest();
              xhr.open("PUT", presignedUrl);
              xhr.setRequestHeader("Content-Type", item.file.type || "image/jpeg");
              xhr.upload.onprogress = (e) => {
                if (e.lengthComputable) {
                  updateItem(item.id, { progress: Math.round((e.loaded / e.total) * 100) });
                }
              };
              xhr.onload = () => xhr.status < 300 ? resolve() : reject(new Error(`HTTP ${xhr.status}`));
              xhr.onerror = () => reject(new Error("Network error"));
              xhr.send(item.file);
            });
          }

          // Step 3: enqueue processing job
          updateItem(item.id, { status: "processing", progress: 100 });
          const { jobId } = await processUpload.mutateAsync({
            originalKey,
            fileName: item.file.name,
            mimeType: item.file.type || "image/jpeg",
            fileSize: item.file.size,
          });
          updateItem(item.id, { jobId, status: "processing" });

          // Poll job status until done (worker processes every 3s, max wait 120s)
          if (jobId) {
            const pollStart = Date.now();
            const MAX_POLL_MS = 120_000;
            const POLL_INTERVAL = 1500;
            await new Promise<void>((resolve) => {
              const poll = async () => {
                try {
                  const jobStatus = await utils.media.uploadJobStatus.fetch({ jobId });
                  if (jobStatus?.status === "done" || jobStatus?.status === "failed") {
                    resolve();
                    return;
                  }
                } catch { /* ignore poll errors */ }
                if (Date.now() - pollStart < MAX_POLL_MS) {
                  setTimeout(poll, POLL_INTERVAL);
                } else {
                  resolve(); // timeout — proceed anyway
                }
              };
              setTimeout(poll, POLL_INTERVAL);
            });
          }

          updateItem(item.id, { jobId, status: "done" });
          refetch(); // refresh gallery immediately after job completes

        } catch (err: any) {
          const retries = item.retries + 1;
          if (retries <= MAX_RETRIES) {
            updateItem(item.id, { status: "pending", retries, error: undefined });
          } else {
            updateItem(item.id, { status: "error", error: err?.message || "Tải lên thất bại" });
          }
        } finally {
          activeUploadsRef.current--;
          processingIdsRef.current.delete(item.id); // release claim
          processQueue(); // continue with next items in queue
        }
      })();
    }
  }, [requestPresignedUrl, processUpload, updateItem, refetch]);

  // Trigger queue whenever queue changes
  useEffect(() => {
    const hasPending = queue.some((i) => i.status === "pending");
    if (hasPending) processQueue();
  }, [queue, processQueue]);

  const addFiles = useCallback((files: FileList | File[]) => {
    const valid: UploadItem[] = [];
    const fileArr = Array.from(files);
    for (const file of fileArr) {
      if (!ALLOWED_TYPES.includes(file.type)) {
        toast.error(`${file.name}: unsupported type`);
        continue;
      }
      if (file.size > MAX_FILE_SIZE) {
        toast.error(`${file.name}: exceeds 50 MB limit`);
        continue;
      }
      valid.push({ id: uid(), file, status: "pending", progress: 0, retries: 0 });
    }
    if (valid.length === 0) return;
    setQueue((prev) => [...prev, ...valid]);
    setShowQueue(true);
    toast.success(`${valid.length} file${valid.length !== 1 ? "s" : ""} đã thêm vào hàng đợi`);
  }, []);

  const handleRetry = useCallback((id: string) => {
    setQueue((prev) => prev.map((item) =>
      item.id === id ? { ...item, status: "pending", error: undefined, progress: 0 } : item
    ));
  }, []);

  const clearDoneItems = useCallback(() => {
    setQueue((prev) => prev.filter((i) => i.status !== "done"));
  }, []);

  // Drag & drop
  const handleDragOver = (e: React.DragEvent) => { e.preventDefault(); setIsDragOver(true); };
  const handleDragLeave = () => setIsDragOver(false);
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    if (e.dataTransfer.files.length > 0) addFiles(e.dataTransfer.files);
  };

  // Queue stats
  const doneCount = queue.filter((i) => i.status === "done").length;
  const errorCount = queue.filter((i) => i.status === "error").length;
  const activeCount = queue.filter((i) => i.status === "uploading" || i.status === "processing").length;
  const pendingCount = queue.filter((i) => i.status === "pending").length;

  return (
    <AdminLayout>
      <div className="space-y-5 py-6">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-xl font-semibold">Thư viện Media</h1>
            <div className="flex items-center gap-2 flex-wrap">
              <p className="text-sm text-muted-foreground">
                {total.toLocaleString()} item{total !== 1 ? "s" : ""} total
              </p>
              {serverQueue && serverQueue.pending > 0 && (
                <Badge variant="outline" className="text-xs gap-1 text-amber-500 border-amber-500/30 bg-amber-500/10">
                  <Loader2 className="w-3 h-3 animate-spin" />
                  {serverQueue.pending} đang chờ xử lý
                </Badge>
              )}
              {serverQueue && serverQueue.failed > 0 && (
                <button
                  onClick={() => retryFailedJobs.mutate()}
                  disabled={retryFailedJobs.isPending}
                  className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border border-red-500/30 bg-red-500/10 text-red-500 hover:bg-red-500/20 transition-colors disabled:opacity-60 cursor-pointer"
                  title="Click để retry tất cả ảnh lỗi"
                >
                  {retryFailedJobs.isPending
                    ? <Loader2 className="w-3 h-3 animate-spin" />
                    : <RotateCcw className="w-3 h-3" />
                  }
                  {serverQueue.failed} lỗi — click để retry
                </button>
              )}
              {originalsCount && (originalsCount.photoCount + originalsCount.mediaCount) > 0 && (
                <button
                  onClick={() => cleanupOriginals.mutate({})}
                  disabled={cleanupOriginals.isPending}
                  className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border border-orange-500/30 bg-orange-500/10 text-orange-500 hover:bg-orange-500/20 transition-colors disabled:opacity-60 cursor-pointer"
                  title="Xóa file gốc khỏi Wasabi (giải phóng dung lượng)"
                >
                  {cleanupOriginals.isPending
                    ? <Loader2 className="w-3 h-3 animate-spin" />
                    : <Sparkles className="w-3 h-3" />
                  }
                  {originalsCount.photoCount + originalsCount.mediaCount} file gốc — dọn dẹp
                </button>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {/* Search */}
            <div className="relative w-56">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => handleSearchChange(e.target.value)}
                placeholder="Search by filename…"
                className="pl-8 h-9"
              />
              {search && (
                <button
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  onClick={() => handleSearchChange("")}
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
            {/* View mode toggle */}
            <div className="flex items-center border border-border rounded-md overflow-hidden">
              <button
                className={`p-1.5 transition-colors ${
                  viewMode === "grid-sm" ? "bg-primary text-primary-foreground" : "hover:bg-muted text-muted-foreground"
                }`}
                title="Small grid"
                onClick={() => setViewMode("grid-sm")}
              >
                <Grid3X3 className="w-4 h-4" />
              </button>
              <button
                className={`p-1.5 transition-colors ${
                  viewMode === "grid-md" ? "bg-primary text-primary-foreground" : "hover:bg-muted text-muted-foreground"
                }`}
                title="Medium grid"
                onClick={() => setViewMode("grid-md")}
              >
                <Grid2X2 className="w-4 h-4" />
              </button>
              <button
                className={`p-1.5 transition-colors ${
                  viewMode === "list" ? "bg-primary text-primary-foreground" : "hover:bg-muted text-muted-foreground"
                }`}
                title="List view"
                onClick={() => setViewMode("list")}
              >
                <LayoutList className="w-4 h-4" />
              </button>
            </div>
            {/* Upload button */}
            <Button size="sm" onClick={() => fileInputRef.current?.click()} className="gap-1.5">
              <Upload className="w-4 h-4" />
              Upload
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept={ALLOWED_TYPES.join(",")}
              className="hidden"
              onChange={(e) => e.target.files && addFiles(e.target.files)}
            />
          </div>
        </div>

        {/* Upload drop zone */}
        <div
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          className={`border-2 border-dashed rounded-xl px-6 py-8 text-center cursor-pointer transition-colors select-none ${
            isDragOver
              ? "border-primary bg-primary/5 text-primary"
              : "border-border hover:border-primary/50 hover:bg-muted/30 text-muted-foreground"
          }`}
        >
          <CloudUpload className="w-8 h-8 mx-auto mb-2 opacity-60" />
          <p className="text-sm font-medium">Drop images here or click to browse</p>
          <p className="text-xs mt-1 opacity-60">JPEG · PNG · WebP · GIF · AVIF · max 50 MB each</p>
        </div>

        {/* Upload queue panel */}
        {queue.length > 0 && (
          <div className="rounded-xl border border-border bg-card overflow-hidden">
            <div
              className="flex items-center justify-between px-4 py-2.5 border-b border-border cursor-pointer hover:bg-muted/30 transition-colors"
              onClick={() => setShowQueue((v) => !v)}
            >
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium">Upload Queue</span>
                <div className="flex items-center gap-1.5">
                  {activeCount > 0 && (
                    <Badge variant="secondary" className="text-xs px-1.5 py-0 h-5">
                      <Loader2 className="w-3 h-3 mr-1 animate-spin" />{activeCount} active
                    </Badge>
                  )}
                  {pendingCount > 0 && (
                    <Badge variant="outline" className="text-xs px-1.5 py-0 h-5">{pendingCount} pending</Badge>
                  )}
                  {doneCount > 0 && (
                    <Badge className="text-xs px-1.5 py-0 h-5 bg-green-500/15 text-green-600 border-green-500/20">
                      <CheckCircle2 className="w-3 h-3 mr-1" />{doneCount} done
                    </Badge>
                  )}
                  {errorCount > 0 && (
                    <Badge variant="destructive" className="text-xs px-1.5 py-0 h-5">{errorCount} failed</Badge>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2">
                {errorCount > 0 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 text-xs text-orange-500 hover:text-orange-600"
                    onClick={(e) => {
                      e.stopPropagation();
                      setQueue((prev) => prev.map((i) =>
                        i.status === "error" ? { ...i, status: "pending", error: undefined, progress: 0, retries: 0 } : i
                      ));
                    }}
                  >
                    <RotateCcw className="w-3 h-3 mr-1" />Retry all
                  </Button>
                )}
                {doneCount > 0 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 text-xs"
                    onClick={(e) => { e.stopPropagation(); clearDoneItems(); }}
                  >
                    Clear done
                  </Button>
                )}
                <span className="text-xs text-muted-foreground">{showQueue ? "▲" : "▼"}</span>
              </div>
            </div>
            {showQueue && (
              <div className="px-4 py-2 max-h-64 overflow-y-auto">
                {queue.map((item) => (
                  <UploadQueueItem key={item.id} item={item} onRetry={handleRetry} />
                ))}
              </div>
            )}
          </div>
        )}

        {/* Selection toolbar */}
        {selected.size > 0 && (
          <div className="flex items-center gap-3 rounded-lg bg-primary/5 border border-primary/20 px-4 py-2.5">
            <span className="text-sm font-medium">{selected.size} selected</span>
            <Button variant="ghost" size="sm" onClick={selectAll} className="h-7 text-xs">
              Select all {items.length}
            </Button>
            <Button variant="ghost" size="sm" onClick={clearSelection} className="h-7 text-xs">
              Clear
            </Button>
            <div className="ml-auto">
              <Button
                variant="destructive"
                size="sm"
                onClick={() => setDeleteConfirmOpen(true)}
                className="h-7 text-xs"
              >
                <Trash2 className="w-3.5 h-3.5 mr-1.5" />
                Delete {selected.size}
              </Button>
            </div>
          </div>
        )}

        {/* Grid / List */}
        {isLoading ? (
          viewMode === "list" ? (
            <div className="space-y-1">
              {Array.from({ length: 12 }).map((_, i) => (
                <div key={i} className="h-14 rounded-lg bg-muted animate-pulse" />
              ))}
            </div>
          ) : (
            <div className={`grid gap-2 ${
              viewMode === "grid-sm" ? "grid-cols-6 sm:grid-cols-8 lg:grid-cols-12" :
              "grid-cols-3 sm:grid-cols-4 lg:grid-cols-6"
            }`}>
              {Array.from({ length: 24 }).map((_, i) => (
                <div key={i} className="aspect-square rounded-lg bg-muted animate-pulse" />
              ))}
            </div>
          )
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-muted-foreground gap-3">
            <ImageIcon className="w-12 h-12 opacity-30" />
            <p className="text-sm">
              {debouncedSearch ? `No results for "${debouncedSearch}"` : "No media items yet. Upload some images above."}
            </p>
            {debouncedSearch && (
              <Button variant="ghost" size="sm" onClick={() => handleSearchChange("")}>
                Clear search
              </Button>
            )}
          </div>
        ) : viewMode === "list" ? (
          <div className="space-y-1">
            {items.map((item) => (
              <ListRow key={item.id} item={item} selected={selected.has(item.id)} onToggle={toggleSelect} onPreview={setPreviewItem} />
            ))}
          </div>
        ) : (
          <div className={`grid gap-2 ${
            viewMode === "grid-sm" ? "grid-cols-6 sm:grid-cols-8 lg:grid-cols-12" :
            "grid-cols-3 sm:grid-cols-4 lg:grid-cols-6"
          }`}>
            {items.map((item) => (
              <MediaCard key={item.id} item={item} selected={selected.has(item.id)} onToggle={toggleSelect} />
            ))}
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between pt-2">
            <p className="text-sm text-muted-foreground">
              Trang {page + 1} trong {totalPages} · {total} items
            </p>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                disabled={page === 0}
              >
                <ChevronLeft className="w-4 h-4" />
              </Button>
              <Badge variant="secondary" className="px-3">{page + 1}</Badge>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                disabled={page >= totalPages - 1}
              >
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Image preview lightbox */}
      {previewItem && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm"
          onClick={() => setPreviewItem(null)}
        >
          <div
            className="relative max-w-4xl max-h-[90vh] w-full mx-4 bg-card rounded-xl overflow-hidden shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-border">
              <div>
                <p className="text-sm font-medium truncate max-w-xs">{previewItem.filename}</p>
                <p className="text-xs text-muted-foreground">
                  {previewItem.width && previewItem.height ? `${previewItem.width}×${previewItem.height} · ` : ""}
                  {formatBytes(previewItem.fileSize)}
                </p>
              </div>
              <div className="flex items-center gap-2">
                {previewItem.webpUrl && (
                  <a
                    href={previewItem.webpUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-muted-foreground hover:text-foreground p-1.5 rounded hover:bg-muted transition-colors"
                    title="Open full size"
                  >
                    <ExternalLink className="w-4 h-4" />
                  </a>
                )}
                <button
                  className="text-muted-foreground hover:text-foreground p-1.5 rounded hover:bg-muted transition-colors"
                  onClick={() => setPreviewItem(null)}
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
            <div className="flex items-center justify-center bg-muted/30 max-h-[75vh] overflow-hidden">
              <img
                src={previewItem.webpUrl || previewItem.originalUrl || ""}
                alt={previewItem.filename}
                className="max-w-full max-h-[75vh] object-contain"
              />
            </div>
          </div>
        </div>
      )}

      {/* Delete confirm dialog */}
      <AlertDialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {selected.size} media item{selected.size !== 1 ? "s" : ""}?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes the items from the Thư viện Media and detaches them from all album. The
              actual files in Wasabi storage are <strong>not deleted</strong> — only the database
              bản ghi are removed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Hủy</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleBulkDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AdminLayout>
  );
}
