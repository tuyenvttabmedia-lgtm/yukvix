/**
 * AdminZipImport.tsx — Admin ZIP/RAR Album Import UI (V4.17)
 *
 * 3-step wizard:
 *   Step 1: Upload archive (drag-and-drop + presigned URL direct upload)
 *   Step 2: Review & edit AI-generated SEO metadata
 *   Step 3: Confirm & monitor import progress
 *
 * Plus: Import Jobs Dashboard (list all jobs, cancel, retry)
 *
 * IMPORTANT: This is a SEPARATE flow from:
 *   - Media Library (/admin/media) — for individual image uploads
 *   - Legacy crawler import (/admin/import) — for URL-based crawling
 */

import { useState, useCallback, useRef, useEffect } from "react";
import { EntityPage, OperationsPage } from "@/admin";
import AdminLayout from "./AdminLayout";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { uploadArchiveMultipart, uploadArchivePut } from "@/lib/archive-upload";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  AlertCircle,
  CheckCircle2,
  Clock,
  Download,
  FileArchive,
  FileCheck,
  Loader2,
  RefreshCw,
  Upload,
  X,
  Zap,
  Eye,
  ChevronRight,
  FolderUp,
  Play,
  Trash2,
  Settings2,
  CalendarClock,
  ChevronDown,
  ChevronUp,
  Save,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

type JobStatus =
  | "uploaded"
  | "waiting"
  | "scheduled"
  | "processing"
  | "waiting_disk_space"
  | "completed"
  | "failed"
  | "cancelled"
  | "expired";

type WizardStep = 1 | 2 | 3;
type BatchFileStatus = "pending" | "uploading" | "uploaded" | "queuing" | "queued" | "error";

interface BatchFile {
  id: string;
  file: File;
  status: BatchFileStatus;
  progress: number;
  jobId?: number;
  albumSlug?: string;
  error?: string;
}

interface SeoFormData {
  title: string;
  creator: string;
  collectionName: string;
  description: string;
  category: "Japan" | "China" | "Korea" | "Euro" | "Cosplay" | "Gravure";
  tags: string;
  metaTitle: string;
  metaDescription: string;
  focusKeyword: string;
  relatedKeywords: string;
  altTextTemplate: string;
  shortDescription: string;
  archivePasswordIndex: number;
}

// ─── Status Badge ─────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: JobStatus }) {
  const variants: Record<JobStatus, { label: string; className: string }> = {
    uploaded: { label: "Đã tải lên", className: "bg-blue-500/10 text-blue-400 border-blue-500/20" },
    waiting: { label: "Đang chờ", className: "bg-yellow-500/10 text-yellow-400 border-yellow-500/20" },
    scheduled: { label: "Đã lên lịch", className: "bg-purple-500/10 text-purple-400 border-purple-500/20" },
    processing: { label: "Đang xử lý", className: "bg-orange-500/10 text-orange-400 border-orange-500/20" },
    waiting_disk_space: { label: "Chờ dung lượng", className: "bg-amber-500/10 text-amber-400 border-amber-500/20" },
    completed: { label: "Hoàn thành", className: "bg-green-500/10 text-green-400 border-green-500/20" },
    failed: { label: "Thất bại", className: "bg-red-500/10 text-red-400 border-red-500/20" },
    cancelled: { label: "Đã hủy", className: "bg-gray-500/10 text-gray-400 border-gray-500/20" },
    expired: { label: "Hết hạn", className: "bg-gray-500/10 text-gray-400 border-gray-500/20" },
  };
  const v = variants[status] || variants.failed;
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border ${v.className}`}>
      {v.label}
    </span>
  );
}

// ─── Format helpers ───────────────────────────────────────────────────────────

function formatBytes(bytes: number | null | undefined): string {
  if (!bytes) return "—";
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

function formatDate(d: Date | string | null | undefined): string {
  if (!d) return "—";
  return new Date(d).toLocaleString("vi-VN", {
    timeZone: "Asia/Ho_Chi_Minh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

// ─── Step 1: Upload ───────────────────────────────────────────────────────────

function UploadStep({
  onSuccess,
}: {
  onSuccess: (jobId: number, filename: string) => void;
}) {
  const [dragging, setDragging] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const presignMutation = trpc.zipImport.presignArchiveUpload.useMutation();

  const handleFile = useCallback((f: File) => {
    const ext = f.name.split(".").pop()?.toLowerCase();
    if (!["zip"].includes(ext || "")) {
      toast.error("Lỗi định dạng", { description: "Chỉ hỗ trợ file .zip" });
      return;
    }
    setFile(f);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragging(false);
      const f = e.dataTransfer.files[0];
      if (f) handleFile(f);
    },
    [handleFile]
  );

  const handleUpload = async () => {
    if (!file) return;
    setUploading(true);
    setUploadProgress(0);

    try {
      const { jobId, presignedUrl } = await presignMutation.mutateAsync({
        filename: file.name,
        size: file.size,
      });

      if (!presignedUrl) throw new Error("Wasabi presign failed");
      await uploadArchivePut({
        url: presignedUrl,
        file,
        onProgress: setUploadProgress,
      });

      toast.success("Tải lên thành công", { description: `${file.name} đã được tải lên.` });
      onSuccess(jobId, file.name);
    } catch (err) {
      toast.error("Lỗi tải lên", { description: (err as Error).message });
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div
        className={`border-2 border-dashed rounded-xl p-10 text-center transition-colors cursor-pointer ${
          dragging
            ? "border-primary bg-primary/5"
            : "border-border hover:border-primary/50 hover:bg-muted/30"
        }`}
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".zip"
          className="hidden"
          onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
        />
        <FileArchive className="w-12 h-12 text-muted-foreground/50 mx-auto mb-3" />
        <p className="text-lg font-medium text-foreground mb-1">
          {dragging ? "Thả file vào đây" : "Kéo thả hoặc click để chọn file"}
        </p>
        <p className="text-sm text-muted-foreground">Chỉ hỗ trợ .zip — tối đa 4GB</p>
      </div>

      {file && (
        <Card className="bg-muted/30">
          <CardContent className="pt-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <FileArchive className="w-5 h-5 text-primary" />
                <div>
                  <p className="font-medium text-sm">{file.name}</p>
                  <p className="text-xs text-muted-foreground">{formatBytes(file.size)}</p>
                </div>
              </div>
              <Button variant="ghost" size="sm" onClick={() => setFile(null)}>
                <X className="w-4 h-4" />
              </Button>
            </div>
            {uploading && (
              <div className="mt-3">
                <Progress value={uploadProgress} className="h-2" />
                <p className="text-xs text-muted-foreground mt-1 text-right">{uploadProgress}%</p>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <Button
        className="w-full"
        disabled={!file || uploading}
        onClick={handleUpload}
      >
        {uploading ? (
          <>
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            Đang tải lên... {uploadProgress}%
          </>
        ) : (
          <>
            <Upload className="w-4 h-4 mr-2" />
            Tải lên & Tiếp tục
          </>
        )}
      </Button>
    </div>
  );
}

// ─── Step 2: SEO Form ─────────────────────────────────────────────────────────

function SeoFormStep({
  jobId,
  originalFileName,
  onSuccess,
}: {
  jobId: number;
  originalFileName: string;
  onSuccess: (albumId: number, albumSlug: string) => void;
}) {
  const [form, setForm] = useState<SeoFormData>({
    title: "",
    creator: "",
    collectionName: "",
    description: "",
    category: "Japan",
    tags: "",
    metaTitle: "",
    metaDescription: "",
    focusKeyword: "",
    relatedKeywords: "",
    altTextTemplate: "",
    shortDescription: "",
    archivePasswordIndex: 0,
  });
  const [aiLoading, setAiLoading] = useState(false);
  const [aiGenerated, setAiGenerated] = useState(false);

  const generateSeoMutation = trpc.zipImport.generateSeoFromFilename.useMutation();
  const createAlbumMutation = trpc.zipImport.createAlbumAndImport.useMutation();

  const handleGenerateSeo = async () => {
    setAiLoading(true);
    try {
      const result = await generateSeoMutation.mutateAsync({
        originalFileName,
        adminTitle: form.title || undefined,
        creator: form.creator || undefined,
        category: form.category,
      });
      setForm((prev) => ({
        ...prev,
        // SeoOutput uses albumTitle (not title)
        title: result.albumTitle || prev.title,
        creator: result.creator || prev.creator,
        collectionName: result.collectionName || prev.collectionName,
        description: result.shortDescription || prev.description,
        tags: Array.isArray(result.tags) ? result.tags.join(", ") : prev.tags,
        // SeoOutput uses seoTitle (not metaTitle) and metaDescription
        metaTitle: result.seoTitle || prev.metaTitle,
        metaDescription: result.metaDescription || prev.metaDescription,
        focusKeyword: result.focusKeyword || prev.focusKeyword,
        relatedKeywords: Array.isArray(result.relatedKeywords)
          ? result.relatedKeywords.join(", ")
          : prev.relatedKeywords,
        altTextTemplate: result.altTextTemplate || prev.altTextTemplate,
        shortDescription: result.shortDescription || prev.shortDescription,
        category: (result.category as SeoFormData["category"]) || prev.category,
      }));
      setAiGenerated(true);
      toast.success("AI SEO đã tạo xong", { description: "Hãy kiểm tra và chỉnh sửa nếu cần." });
    } catch (err) {
      toast.error("Lỗi tạo SEO", { description: (err as Error).message });
    } finally {
      setAiLoading(false);
    }
  };

  const handleSubmit = async () => {
    if (!form.title.trim()) {
      toast.error("Thiếu tiêu đề", { description: "Vui lòng nhập tiêu đề album." });
      return;
    }
    try {
      const result = await createAlbumMutation.mutateAsync({
        jobId,
        title: form.title,
        creator: form.creator || undefined,
        collectionName: form.collectionName || undefined,
        description: form.description || undefined,
        category: form.category,
        tags: form.tags ? form.tags.split(",").map((t) => t.trim()).filter(Boolean) : undefined,
        metaTitle: form.metaTitle || undefined,
        metaDescription: form.metaDescription || undefined,
        focusKeyword: form.focusKeyword || undefined,
        relatedKeywords: form.relatedKeywords
          ? form.relatedKeywords.split(",").map((k) => k.trim()).filter(Boolean)
          : undefined,
        altTextTemplate: form.altTextTemplate || undefined,
        shortDescription: form.shortDescription || undefined,
        originalFileName,
        archivePasswordIndex: form.archivePasswordIndex,
      });
      toast.success("Đã xếp vào kho chờ", { description: "Album sẽ được tạo khi worker chạy (Run hoặc lịch ngày)." });
      onSuccess(result.jobId, result.albumSlug ?? "");
    } catch (err) {
      toast.error("Lỗi tạo album", { description: (err as Error).message });
    }
  };

  return (
    <div className="space-y-6">
      {/* AI Generate Button */}
      <div className="flex items-center justify-between p-4 rounded-lg bg-primary/5 border border-primary/20">
        <div>
          <p className="font-medium text-sm">Tự động tạo SEO bằng AI</p>
          <p className="text-xs text-muted-foreground">Phân tích tên file: <span className="font-mono">{originalFileName}</span></p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={handleGenerateSeo}
          disabled={aiLoading}
        >
          {aiLoading ? (
            <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Đang tạo...</>
          ) : (
            <><Zap className="w-4 h-4 mr-2" />{aiGenerated ? "Tạo lại" : "Tạo SEO"}</>
          )}
        </Button>

 </div>
      {/* Basic Info */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Tiêu đề album <span className="text-destructive">*</span></Label>
          <Input
            value={form.title}
            onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))}
            placeholder="Ví dụ: Yua Mikami — Sweet Memories Vol.3"
          />
        </div>
        <div className="space-y-2">
          <Label>Danh mục</Label>
          <Select
            value={form.category}
            onValueChange={(v) => setForm((p) => ({ ...p, category: v as SeoFormData["category"] }))}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {["Japan", "China", "Korea", "Euro", "Cosplay", "Gravure"].map((c) => (
                <SelectItem key={c} value={c}>{c}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>Cosplayer / Model</Label>
          <Input
            value={form.creator}
            onChange={(e) => setForm((p) => ({ ...p, creator: e.target.value }))}
            placeholder="Ví dụ: Yua Mikami"
          />
        </div>
        <div className="space-y-2">
          <Label>Bộ sưu tập (nếu có)</Label>
          <Input
            value={form.collectionName}
            onChange={(e) => setForm((p) => ({ ...p, collectionName: e.target.value }))}
            placeholder="Ví dụ: XIUREN, DJAWA, ..."
          />
        </div>
        {/* Password field removed — ZIP files are not password-protected */}
        <div className="space-y-2">
          <Label>Tags (cách nhau bởi dấu phẩy)</Label>
          <Input
            value={form.tags}
            onChange={(e) => setForm((p) => ({ ...p, tags: e.target.value }))}
            placeholder="cosplay, anime, cute, ..."
          />
        </div>
      </div>

      {/* Description */}
      <div className="space-y-2">
        <Label>Mô tả ngắn</Label>
        <Input
          value={form.shortDescription}
          onChange={(e) => setForm((p) => ({ ...p, shortDescription: e.target.value }))}
          placeholder="1-2 câu mô tả ngắn cho album"
        />
      </div>
      <div className="space-y-2">
        <Label>Mô tả đầy đủ</Label>
        <Textarea
          value={form.description}
          onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
          rows={3}
          placeholder="Mô tả chi tiết về album..."
        />
      </div>

      {/* SEO */}
      <div className="space-y-4 p-4 rounded-lg border border-border bg-muted/20">
        <p className="text-sm font-medium text-muted-foreground uppercase tracking-wide">SEO</p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>Meta Title</Label>
            <Input
              value={form.metaTitle}
              onChange={(e) => setForm((p) => ({ ...p, metaTitle: e.target.value }))}
              placeholder="Meta title (max 60 ký tự)"
              maxLength={100}
            />
          </div>
          <div className="space-y-2">
            <Label>Focus Keyword</Label>
            <Input
              value={form.focusKeyword}
              onChange={(e) => setForm((p) => ({ ...p, focusKeyword: e.target.value }))}
              placeholder="Từ khóa chính"
            />
          </div>
        </div>
        <div className="space-y-2">
          <Label>Meta Description</Label>
          <Textarea
            value={form.metaDescription}
            onChange={(e) => setForm((p) => ({ ...p, metaDescription: e.target.value }))}
            rows={2}
            placeholder="Meta description (max 160 ký tự)"
            maxLength={300}
          />
        </div>
        <div className="space-y-2">
          <Label>Related Keywords</Label>
          <Input
            value={form.relatedKeywords}
            onChange={(e) => setForm((p) => ({ ...p, relatedKeywords: e.target.value }))}
            placeholder="Từ khóa liên quan, cách nhau bởi dấu phẩy"
          />
        </div>
        <div className="space-y-2">
          <Label>Alt Text Template</Label>
          <Input
            value={form.altTextTemplate}
            onChange={(e) => setForm((p) => ({ ...p, altTextTemplate: e.target.value }))}
            placeholder="Ví dụ: {creator} cosplay photo {n}"
          />
        </div>
      </div>

      <Button
        className="w-full"
        onClick={handleSubmit}
        disabled={createAlbumMutation.isPending || !form.title.trim()}
      >
        {createAlbumMutation.isPending ? (
          <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Đang tạo album...</>
        ) : (
          <><ChevronRight className="w-4 h-4 mr-2" />Tạo album & Bắt đầu import</>
        )}
      </Button>
    </div>
  );
}

// ─── Step 3: Progress Monitor ─────────────────────────────────────────────────

function ProgressStep({
  jobId,
  albumSlug,
  onReset,
}: {
  jobId: number;
  albumSlug: string;
  onReset: () => void;
}) {
  const { data: job, refetch } = trpc.zipImport.getStatus.useQuery(
    { jobId },
    {
      refetchInterval: (query) => {
        const status = query.state.data?.status;
        if (status === "completed" || status === "failed" || status === "cancelled") return false;
        return 3000;
      },
    }
  );

  const triggerQueue = trpc.zipImport.triggerQueueNow.useMutation();
  const triggeredRef = useRef(false);

  const cancelMutation = trpc.zipImport.cancel.useMutation({
    onSuccess: () => refetch(),
  });

  useEffect(() => {
    if (job?.status === "waiting" && !triggeredRef.current) {
      triggeredRef.current = true;
      triggerQueue.mutate();
    }
  }, [job?.status]);

  if (!job) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const isActive = ["waiting", "scheduled", "processing"].includes(job.status);
  const isCompleted = job.status === "completed";
  const isFailed = job.status === "failed";

  return (
    <div className="space-y-6">
      {/* Status header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          {isActive && <Loader2 className="w-5 h-5 animate-spin text-primary" />}
          {isCompleted && <CheckCircle2 className="w-5 h-5 text-green-500" />}
          {isFailed && <AlertCircle className="w-5 h-5 text-destructive" />}
          {!isActive && !isCompleted && !isFailed && <Clock className="w-5 h-5 text-muted-foreground" />}
          <div>
            <p className="font-medium">Job #{jobId}</p>
            <p className="text-sm text-muted-foreground">{job.sourceArchiveOriginalName}</p>
          </div>
        </div>
        <StatusBadge status={job.status as JobStatus} />
      </div>

      {/* Progress bar */}
      {(isActive || isCompleted) && (
        <div className="space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Tiến độ</span>
            <span className="font-medium">{job.progress ?? 0}%</span>
          </div>
          <Progress value={job.progress ?? 0} className="h-3" />
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>{job.processedImages ?? 0} / {job.totalImages ?? "?"} ảnh</span>
            {(job.failedImages ?? 0) > 0 && (
              <span className="text-destructive">{job.failedImages} thất bại</span>
            )}
          </div>
        </div>
      )}

      {/* Logs */}
      {Array.isArray(job.importLogs) && job.importLogs.length > 0 && (
        <div className="rounded-lg bg-black/30 border border-border p-3 max-h-48 overflow-y-auto font-mono text-xs space-y-1">
          {job.importLogs.map((log: string, i: number) => (
            <p key={i} className="text-muted-foreground leading-relaxed">{log}</p>
          ))}
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-3">
        {isCompleted && (
          <Button variant="outline" size="sm" asChild>
            <a href={`/album/${albumSlug}`} target="_blank" rel="noopener noreferrer">
              <Eye className="w-4 h-4 mr-2" />
              Xem album
            </a>
          </Button>
        )}
        {isActive && (
          <Button
            variant="destructive"
            size="sm"
            onClick={() => cancelMutation.mutate({ jobId })}
            disabled={cancelMutation.isPending}
          >
            <X className="w-4 h-4 mr-2" />
            Hủy
          </Button>
        )}
        <Button variant="outline" size="sm" onClick={onReset}>
          <Upload className="w-4 h-4 mr-2" />
          Import mới
        </Button>
      </div>
    </div>
  );
}

// ─── Jobs Dashboard ───────────────────────────────────────────────────────────

function JobsDashboard() {
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [page, setPage] = useState(0);
  const PAGE_SIZE = 15;

  const { data, refetch, isLoading } = trpc.zipImport.listJobs.useQuery({
    limit: PAGE_SIZE,
    offset: page * PAGE_SIZE,
    status: statusFilter === "all" ? undefined : statusFilter,
  });

  const cancelMutation = trpc.zipImport.cancel.useMutation({
    onSuccess: () => refetch(),
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-44">
              <SelectValue placeholder="Lọc trạng thái" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tất cả</SelectItem>
              <SelectItem value="uploaded">Đã tải lên</SelectItem>
              <SelectItem value="waiting">Đang chờ</SelectItem>
              <SelectItem value="processing">Đang xử lý</SelectItem>
              <SelectItem value="completed">Hoàn thành</SelectItem>
              <SelectItem value="failed">Thất bại</SelectItem>
              <SelectItem value="cancelled">Đã hủy</SelectItem>
            </SelectContent>
          </Select>
          <span className="text-sm text-muted-foreground">
            {data?.total ?? 0} jobs
          </span>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()}>
          <RefreshCw className="w-4 h-4 mr-2" />
          Làm mới
        </Button>
      </div>

      <div className="rounded-lg border border-border overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-12">ID</TableHead>
              <TableHead>File</TableHead>
              <TableHead>Trạng thái</TableHead>
              <TableHead>Tiến độ</TableHead>
              <TableHead>Kích thước</TableHead>
              <TableHead>Thời gian</TableHead>
              <TableHead className="w-24">Hành động</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-8">
                  <Loader2 className="w-6 h-6 animate-spin mx-auto text-muted-foreground" />
                </TableCell>
              </TableRow>
            ) : !data?.jobs.length ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                  Chưa có import job nào
                </TableCell>
              </TableRow>
            ) : (
              data.jobs.map((job) => (
                <TableRow key={job.id}>
                  <TableCell className="font-mono text-xs text-muted-foreground">#{job.id}</TableCell>
                  <TableCell>
                    <div>
                      <p className="text-sm font-medium truncate max-w-[200px]">
                        {job.albumTitle || job.sourceArchiveOriginalName}
                      </p>
                      {job.albumSlug && (
                        <p className="text-xs text-muted-foreground font-mono">{job.albumSlug}</p>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={job.status as JobStatus} />
                  </TableCell>
                  <TableCell>
                    {job.status === "processing" ? (
                      <div className="w-24">
                        <Progress value={job.progress ?? 0} className="h-1.5" />
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {job.processedImages ?? 0}/{job.totalImages ?? "?"}
                        </p>
                      </div>
                    ) : job.status === "completed" ? (
                      <span className="text-xs text-green-500">{job.totalImages ?? 0} ảnh</span>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {formatBytes(job.sourceArchiveSize)}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {formatDate(job.createdAt)}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      {/* V4.17: SEO Review button shows when job.status='completed' (album.publishStatus='ready_for_review') */}
                      {job.albumId && job.status === "completed" && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-blue-600 hover:text-blue-700"
                          title="SEO Review"
                          onClick={() => window.location.href = `/admin/albums/${job.albumId}/seo-review`}
                        >
                          <FileCheck className="w-3.5 h-3.5" />
                        </Button>
                      )}
                      {job.albumSlug && job.status === "completed" && (
                        <Button variant="ghost" size="icon" className="h-7 w-7" asChild>
                          <a href={`/album/${job.albumSlug}`} target="_blank" rel="noopener noreferrer">
                            <Eye className="w-3.5 h-3.5" />
                          </a>
                        </Button>
                      )}
                      {["uploaded", "waiting", "scheduled", "processing"].includes(job.status) && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-destructive hover:text-destructive"
                          onClick={() => cancelMutation.mutate({ jobId: job.id })}
                          disabled={cancelMutation.isPending}
                        >
                          <X className="w-3.5 h-3.5" />
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      {data && data.total > PAGE_SIZE && (
        <div className="flex items-center justify-between">
          <Button
            variant="outline"
            size="sm"
            disabled={page === 0}
            onClick={() => setPage((p) => p - 1)}
          >
            Trước
          </Button>
          <span className="text-sm text-muted-foreground">
            Trang {page + 1} / {Math.ceil(data.total / PAGE_SIZE)}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={(page + 1) * PAGE_SIZE >= data.total}
            onClick={() => setPage((p) => p + 1)}
          >
            Sau
          </Button>
        </div>
      )}
    </div>
  );
}

// ─── Batch Upload ─────────────────────────────────────────────────────────────

function BatchUpload() {
  const [files, setFiles] = useState<BatchFile[]>([]);
  const [dragging, setDragging] = useState(false);
  const [phase, setPhase] = useState<"idle" | "uploading" | "queuing" | "done">("idle");
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Import config
  const [publishMode, setPublishMode] = useState<"draft" | "published">("published");
  const [defaultVip, setDefaultVip] = useState(true);
  const [freePreviewCount, setFreePreviewCount] = useState<number | null>(10);
  const [configSynced, setConfigSynced] = useState(false);

  const batchPresign = trpc.zipImport.batchPresignUploads.useMutation();
  const batchAutoImport = trpc.zipImport.batchAutoImport.useMutation();
  const initMultipartMut = trpc.zipImport.createMultipartUpload.useMutation();
  const presignPartMut = trpc.zipImport.presignUploadPart.useMutation();
  const completeMultipartMut = trpc.zipImport.completeMultipartUpload.useMutation();
  const abortMultipartMut = trpc.zipImport.abortMultipartUpload.useMutation();

  // Load saved config from server
  const { data: savedConfig } = trpc.zipImport.getBatchImportConfig.useQuery(undefined, {
    refetchOnWindowFocus: false,
  });
  if (savedConfig && !configSynced) {
    setDefaultVip(savedConfig.defaultVip);
    setFreePreviewCount(savedConfig.freePreviewCount);
    setPublishMode(savedConfig.publishMode as "draft" | "published");
    setConfigSynced(true);
  }

  const saveConfigMutation = trpc.zipImport.saveBatchImportConfig.useMutation({
    onSuccess: () => toast.success("Đã lưu cấu hình mặc định"),
    onError: (err) => toast.error("Lỗi lưu cấu hình", { description: err.message }),
  });

  const addFiles = useCallback((incoming: FileList | File[]) => {
    const arr = Array.from(incoming);
    const valid = arr.filter((f) => /\.zip$/i.test(f.name));
    if (valid.length < arr.length)
      toast.warning(`${arr.length - valid.length} file không hợp lệ (chỉ .zip)`);
    setFiles((prev) => [
      ...prev,
      ...valid.map((f) => ({
        id: `${f.name}-${f.size}-${Date.now()}-${Math.random()}`,
        file: f,
        status: "pending" as BatchFileStatus,
        progress: 0,
      })),
    ]);
  }, []);

  const removeFile = (id: string) => {
    setFiles((prev) => prev.filter((f) => f.id !== id));
  };

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragging(false);
      addFiles(e.dataTransfer.files);
    },
    [addFiles]
  );

  const updateFile = (id: string, patch: Partial<BatchFile>) => {
    setFiles((prev) => prev.map((f) => (f.id === id ? { ...f, ...patch } : f)));
  };

  const handleStartImport = async () => {
    const pending = files.filter((f) => f.status === "pending");
    if (pending.length === 0) return;

    setPhase("uploading");

    // Step 1: Create staging jobs (PUT url or multipart mode)
    let presignResults: Array<{
      jobId: number;
      filename: string;
      presignedUrl: string;
      error?: string;
      mode?: "put" | "multipart";
      partSize?: number;
    }>;
    try {
      const res = await batchPresign.mutateAsync({
        files: pending.map((f) => ({ filename: f.file.name, size: f.file.size })),
      });
      presignResults = res.results;
    } catch (err) {
      toast.error(`Presign thất bại: ${(err as Error).message}`);
      setPhase("idle");
      return;
    }

    // Step 2: Upload each file directly to Wasabi (multipart for large zips)
    const uploadedJobs: Array<{ jobId: number; filename: string }> = [];

    for (let i = 0; i < pending.length; i++) {
      const batchFile = pending[i];
      const presign = presignResults.find((r) => r.filename === batchFile.file.name);

      if (!presign || presign.error || presign.jobId < 0) {
        updateFile(batchFile.id, { status: "error", error: presign?.error || "Presign failed" });
        continue;
      }

      updateFile(batchFile.id, { status: "uploading", jobId: presign.jobId });

      try {
        const useMultipart = presign.mode === "multipart" || !presign.presignedUrl;
        if (useMultipart) {
          await uploadArchiveMultipart({
            file: batchFile.file,
            partSize: presign.partSize || 16 * 1024 * 1024,
            init: async () => {
              const r = await initMultipartMut.mutateAsync({ jobId: presign.jobId });
              return { uploadId: r.uploadId };
            },
            presignPart: async (uploadId, partNumber) => {
              const r = await presignPartMut.mutateAsync({
                jobId: presign.jobId,
                uploadId,
                partNumber,
              });
              return r.url;
            },
            complete: async (uploadId) => {
              await completeMultipartMut.mutateAsync({ jobId: presign.jobId, uploadId });
            },
            abort: async (uploadId) => {
              await abortMultipartMut.mutateAsync({ jobId: presign.jobId, uploadId });
            },
            onProgress: (pct) => updateFile(batchFile.id, { progress: pct }),
          });
        } else {
          await uploadArchivePut({
            url: presign.presignedUrl,
            file: batchFile.file,
            onProgress: (pct) => updateFile(batchFile.id, { progress: pct }),
          });
        }

        updateFile(batchFile.id, { status: "uploaded", progress: 100 });
        uploadedJobs.push({ jobId: presign.jobId, filename: batchFile.file.name });
      } catch (err) {
        updateFile(batchFile.id, { status: "error", error: (err as Error).message });
      }
    }

    if (uploadedJobs.length === 0) {
      toast.error("Không có file nào upload thành công");
      setPhase("idle");
      return;
    }

    // Step 3: Auto-generate SEO + queue all uploaded jobs
    setPhase("queuing");
    uploadedJobs.forEach(({ jobId }) => {
      const batchFile = files.find((f) => f.jobId === jobId);
      if (batchFile) updateFile(batchFile.id, { status: "queuing" });
    });

      toast.info(`Đang tạo SEO từ tên file cho ${uploadedJobs.length} zip — chưa tạo album.`);

    try {
      const queueRes = await batchAutoImport.mutateAsync({
        jobs: uploadedJobs,
        publishMode,
        defaultVip,
        freePreviewCount,
      });

      for (const result of queueRes.results) {
        const batchFile = files.find((f) => f.jobId === result.jobId);
        if (!batchFile) continue;
        if (result.error) {
          updateFile(batchFile.id, { status: "error", error: result.error });
        } else {
          updateFile(batchFile.id, { status: "queued", albumSlug: result.albumSlug });
        }
      }

      const queued = queueRes.results.filter((r) => !r.error).length;
      const failed = queueRes.results.filter((r) => r.error).length;

      toast.success(
        `${queued} zip đã vào kho chờ. Dùng Run hoặc lịch 20 album/ngày để giải nén — album chỉ tạo lúc đó.${failed > 0 ? ` ${failed} thất bại.` : ""}`
      );
      setPhase("done");
    } catch (err) {
      toast.error(`Queue thất bại: ${(err as Error).message}`);
      setPhase("idle");
    }
  };

  const pendingCount = files.filter((f) => f.status === "pending").length;
  const uploadingCount = files.filter((f) => ["uploading", "queuing"].includes(f.status)).length;
  const doneCount = files.filter((f) => f.status === "queued").length;
  const errorCount = files.filter((f) => f.status === "error").length;
  const isRunning = phase === "uploading" || phase === "queuing";

  return (
    <div className="space-y-5">
      {/* Header */}
      <div>
        <h2 className="text-lg font-semibold">Batch Upload</h2>
        <p className="text-sm text-muted-foreground mt-0.5">
          Upload nhiều file ZIP lên Wasabi (kho chờ). Album chỉ được tạo khi bấm Run hoặc tới lịch 20 album/ngày. SEO lấy từ tên file, cosplayer chỉ gán nếu khớp danh mục. Free xem 10 ảnh đầu. ZIP gốc là file tải VIP.
        </p>
      </div>

      {/* ─── Import Config ─────────────────────────────────────────────── */}
      <div className="rounded-xl border border-border bg-card/50 p-4 space-y-4">
        <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
          <Settings2 className="w-4 h-4" />
          Cấu hình Import
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Publish mode */}
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Trạng thái sau khi xử lý</Label>
            <Select value={publishMode} onValueChange={(v) => setPublishMode(v as "draft" | "published")}>
              <SelectTrigger className="h-8 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="draft">Nháp (Draft)</SelectItem>
                <SelectItem value="published">Đã xuất bản (Published)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {/* VIP mode */}
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Chế độ VIP mặc định</Label>
            <div className="flex items-center gap-2 h-8">
              <Switch
                id="batch-vip"
                checked={defaultVip}
                onCheckedChange={setDefaultVip}
                disabled={isRunning}
              />
              <label htmlFor="batch-vip" className="text-sm cursor-pointer select-none">
                {defaultVip ? <span className="text-amber-400 font-medium">VIP</span> : <span className="text-muted-foreground">Miễn phí</span>}
              </label>
            </div>
          </div>
          {/* Free preview count */}
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Số ảnh xem miễn phí</Label>
            <Input
              type="number"
              min={0}
              max={50}
              className="h-8 text-sm"
              value={freePreviewCount ?? ""}
              placeholder="10"
              disabled={isRunning}
              onChange={(e) => {
                const v = e.target.value;
                setFreePreviewCount(v === "" ? null : Math.max(0, Math.min(50, parseInt(v) || 0)));
              }}
            />
          </div>
          {/* Save config button */}
          <div className="flex flex-col justify-end gap-1.5 pb-1">
            <Button
              size="sm"
              variant="outline"
              className="gap-1.5 text-xs h-8"
              disabled={saveConfigMutation.isPending || isRunning}
              onClick={() => saveConfigMutation.mutate({
                defaultVip,
                freePreviewCount: freePreviewCount ?? 10,
                publishMode,
              })}
            >
              {saveConfigMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
              Lưu mặc định
            </Button>
            <p className="text-xs text-muted-foreground">
              Lưu làm giá trị mặc định cho lần sau.
            </p>
          </div>
        </div>
      </div>

      {/* Drop zone */}
      <div
        className={`relative border-2 border-dashed rounded-xl p-8 text-center transition-colors cursor-pointer ${
          dragging ? "border-primary bg-primary/5" : "border-border hover:border-primary/50"
        }`}
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".zip"
          multiple
          className="hidden"
          onChange={(e) => e.target.files && addFiles(e.target.files)}
        />
        <FolderUp className="w-10 h-10 mx-auto mb-3 text-muted-foreground" />
        <p className="text-sm font-medium">Kéo thả hoặc click để chọn nhiều file</p>
        <p className="text-xs text-muted-foreground mt-1">Chỉ hỗ trợ .zip — tối đa 20 file, 4GB/file</p>
      </div>

      {/* File list */}
      {files.length > 0 && (
        <div className="space-y-2">
          {files.map((f) => (
            <div
              key={f.id}
              className="flex items-center gap-3 p-3 rounded-lg bg-muted/30 border border-border"
            >
              <FileArchive className="w-5 h-5 shrink-0 text-muted-foreground" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{f.file.name}</p>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="text-xs text-muted-foreground">{formatBytes(f.file.size)}</span>
                  {f.status === "uploading" && (
                    <span className="text-xs text-blue-400">{f.progress}%</span>
                  )}
                  {f.status === "queuing" && (
                    <span className="text-xs text-purple-400">Đang tạo SEO...</span>
                  )}
                  {f.status === "queued" && (
                    <span className="text-xs text-green-400">✓ Đã vào hàng chờ</span>
                  )}
                  {f.status === "error" && (
                    <span className="text-xs text-destructive truncate max-w-[200px]">{f.error}</span>
                  )}
                </div>
                {f.status === "uploading" && (
                  <div className="mt-1.5">
                    <Progress value={f.progress} className="h-1" />
                  </div>
                )}
              </div>
              <div className="shrink-0 flex items-center gap-1">
                {f.status === "pending" && !isRunning && (
                  <button
                    onClick={(e) => { e.stopPropagation(); removeFile(f.id); }}
                    className="p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
                {f.status === "uploading" && (
                  <button
                    onClick={(e) => { e.stopPropagation(); updateFile(f.id, { status: "cancelled" }); }}
                    className="p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
                    title="Huy upload"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
                {f.status === "uploading" && <Loader2 className="w-4 h-4 animate-spin text-blue-400" />}
                {f.status === "queuing" && <Loader2 className="w-4 h-4 animate-spin text-purple-400" />}
                {f.status === "queued" && <CheckCircle2 className="w-4 h-4 text-green-500" />}
                {f.status === "error" && <AlertCircle className="w-4 h-4 text-destructive" />}
                {f.status === "cancelled" && <X className="w-4 h-4 text-muted-foreground" />}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Summary + Action */}
      {files.length > 0 && (
        <div className="flex items-center justify-between pt-1">
          <div className="text-sm text-muted-foreground">
            {pendingCount > 0 && <span>{pendingCount} chờ upload</span>}
            {uploadingCount > 0 && <span className="ml-2 text-blue-400">{uploadingCount} đang xử lý</span>}
            {doneCount > 0 && <span className="ml-2 text-green-400">{doneCount} hoàn thành</span>}
            {errorCount > 0 && <span className="ml-2 text-destructive">{errorCount} lỗi</span>}
          </div>
          <div className="flex gap-2">
            {!isRunning && pendingCount === 0 && files.length > 0 && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setFiles([])}
              >
                <Trash2 className="w-4 h-4 mr-2" />
                Xóa tất cả
              </Button>
            )}
            {pendingCount > 0 && (
              <Button
                size="sm"
                onClick={handleStartImport}
                disabled={isRunning}
                className="bg-primary hover:bg-primary/90"
              >
                {isRunning ? (
                  <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Đang xử lý...</>
                ) : (
                  <><Play className="w-4 h-4 mr-2" />Bắt đầu import ({pendingCount} file)</>
                )}
              </Button>
            )}
          </div>
        </div>
      )}

      {/* Done state */}
      {phase === "done" && doneCount > 0 && (
        <div className="rounded-lg bg-green-500/10 border border-green-500/20 p-4 text-sm text-green-400">
          <CheckCircle2 className="w-4 h-4 inline mr-2" />
          {doneCount} album đã được đưa vào hàng chờ. Chuyển sang tab <strong>Dashboard</strong> để theo dõi tiến độ.
        </div>
      )}
    </div>
  );
}

// ─── Import Schedule Panel ──────────────────────────────────────────────────

function ImportSchedulePanel() {
  const [scheduleEnabled, setScheduleEnabled] = useState(false);
  const [localHour, setLocalHour] = useState(17);
  const [cronHourUtc, setCronHourUtc] = useState(10);
  const { data: tzData } = trpc.scheduler.getTimezone.useQuery();
  const timezone = tzData?.timezone ?? "Asia/Ho_Chi_Minh";
  const [batchSize, setBatchSize] = useState(20);
  const [showConfig, setShowConfig] = useState(false);
  const [runNowResult, setRunNowResult] = useState<{ processed: number; skipped: number; message: string } | null>(null);

  const { data: scheduleConfig } = trpc.zipImport.getImportScheduleConfig.useQuery(undefined);

  useEffect(() => {
    if (!scheduleConfig) return;
    setScheduleEnabled(scheduleConfig.enabled ?? false);
    setLocalHour(scheduleConfig.localHour ?? scheduleConfig.cronHourUtc ?? 17);
    setCronHourUtc(scheduleConfig.cronHourUtc ?? scheduleConfig.cronHour ?? 10);
    setBatchSize(scheduleConfig.batchSize ?? 20);
  }, [scheduleConfig]);

  const { data: waitingData, refetch: refetchWaiting } = trpc.zipImport.countWaitingJobs.useQuery(undefined, {
    refetchInterval: 30000,
  });

  const saveConfigMutation = trpc.zipImport.saveImportScheduleConfig.useMutation({
    onSuccess: () => toast.success("Đã lưu cấu hình lịch xử lý"),
    onError: (err) => toast.error("Lỗi lưu cấu hình", { description: err.message }),
  });

  const runNowMutation = trpc.zipImport.runImportQueueNow.useMutation({
    onSuccess: (data) => {
      const result = data.result as { processed?: number; skipped?: number; message?: string };
      setRunNowResult({
        processed: result?.processed ?? 0,
        skipped: result?.skipped ?? 0,
        message: result?.message ?? "Đã kích hoạt xử lý",
      });
      toast.success("Đã kích hoạt xử lý hàng chờ", { description: result?.message });
      refetchWaiting();
    },
    onError: (err) => toast.error("Lỗi kích hoạt", { description: err.message }),
  });

  const waitingCount = waitingData?.count ?? 0;
  const displayUtc = ((localHour - 7 + 24) % 24);

  return (
    <div className="space-y-4">
      {waitingCount > 0 && (
        <div className="rounded-xl border border-yellow-500/30 bg-yellow-500/10 p-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Clock className="w-5 h-5 text-yellow-400" />
            <div>
              <p className="text-sm font-semibold text-yellow-300">{waitingCount} job đang chờ xử lý theo lịch</p>
              <p className="text-xs text-yellow-400/70 mt-0.5">
                {scheduleEnabled
                  ? `Sẽ được xử lý tự động lúc ${String(localHour).padStart(2, "0")}:00 Việt Nam (${String(cronHourUtc).padStart(2, "0")}:00 UTC)`
                  : "Lịch tự động đang tắt — nhấn \"Chạy ngay\" để xử lý thủ công"}
              </p>
            </div>
          </div>
          <Button
            size="sm"
            variant="outline"
            className="gap-1.5 text-xs border-yellow-500/30 text-yellow-300 hover:bg-yellow-500/10"
            disabled={runNowMutation.isPending}
            onClick={() => { setRunNowResult(null); runNowMutation.mutate(); }}
          >
            {runNowMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
            Chạy ngay
          </Button>
        </div>
      )}

      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <button
          type="button"
          onClick={() => setShowConfig((v) => !v)}
          className="w-full flex items-center justify-between px-5 py-4 hover:bg-muted/30 transition-colors"
        >
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
              <CalendarClock className="w-4 h-4 text-primary" />
            </div>
            <div className="text-left">
              <p className="text-sm font-semibold">Lịch xử lý tự động</p>
              <p className="text-xs text-muted-foreground">
                {scheduleEnabled
                  ? `Bật — chạy hàng ngày lúc ${String(localHour).padStart(2, "0")}:00 Việt Nam (${String(cronHourUtc).padStart(2, "0")}:00 UTC), tối đa ${batchSize} album/lần`
                  : "Tắt — chỉ xử lý khi nhấn Chạy ngay"}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {waitingCount === 0 && (
              <Button
                size="sm"
                variant="outline"
                className="gap-1.5 text-xs"
                disabled={runNowMutation.isPending}
                onClick={(e) => { e.stopPropagation(); setRunNowResult(null); runNowMutation.mutate(); }}
              >
                {runNowMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
                Chạy ngay
              </Button>
            )}
            {showConfig ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
          </div>
        </button>

        {showConfig && (
          <div className="border-t border-border px-5 py-4 space-y-5">
            <div className="flex items-center justify-between">
              <div>
                <Label className="text-sm font-medium">Bật lịch tự động xử lý</Label>
                <p className="text-xs text-muted-foreground mt-0.5">Cron gọi endpoint mỗi giờ; backend chỉ dispatch đúng giờ đã cấu hình</p>
              </div>
              <Switch checked={scheduleEnabled} onCheckedChange={setScheduleEnabled} />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Giờ chạy (Việt Nam 0–23)</Label>
                <Input
                  type="number"
                  min={0}
                  max={23}
                  className="h-8 text-sm"
                  value={localHour}
                  onChange={(e) => setLocalHour(Math.max(0, Math.min(23, parseInt(e.target.value) || 0)))}
                />
                <p className="text-xs text-muted-foreground">
                  {String(localHour).padStart(2, "0")}:00 Việt Nam ({String(displayUtc).padStart(2, "0")}:00 UTC dự kiến)
                </p>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Số album xử lý mỗi lần (1–50)</Label>
                <Input
                  type="number"
                  min={1}
                  max={50}
                  className="h-8 text-sm"
                  value={batchSize}
                  onChange={(e) => setBatchSize(Math.max(1, Math.min(50, parseInt(e.target.value) || 1)))}
                />
                <p className="text-xs text-muted-foreground">Tối đa 50 album/lần chạy</p>
              </div>
            </div>

            <div className="flex items-center justify-between pt-1">
              <p className="text-xs text-muted-foreground">
                Giờ UTC thực tế được tính từ timezone hệ thống khi lưu.
              </p>
              <Button
                size="sm"
                className="gap-1.5"
                disabled={saveConfigMutation.isPending}
                onClick={() => saveConfigMutation.mutate({ enabled: scheduleEnabled, localHour, batchSize })}
              >
                {saveConfigMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                Lưu cấu hình
              </Button>
            </div>
          </div>
        )}

        {runNowResult && (
          <div className="border-t border-border px-5 py-3 bg-muted/20">
            <p className="text-xs font-medium text-muted-foreground mb-1">Kết quả chạy thủ công:</p>
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="text-center">
                <p className="font-semibold text-green-500">{runNowResult.processed}</p>
                <p className="text-muted-foreground">Jobs đã khởi động</p>
              </div>
              <div className="text-center">
                <p className="font-semibold text-yellow-500">{runNowResult.skipped}</p>
                <p className="text-muted-foreground">Jobs bị bỏ qua</p>
              </div>
            </div>
            <p className="text-xs text-muted-foreground mt-2">{runNowResult.message}</p>
          </div>
        )}
      </div>

      <div className="rounded-lg border border-border bg-muted/20 p-4 text-xs text-muted-foreground space-y-1.5">
        <p className="font-medium text-foreground">Ảnh hưởng của chế độ Scheduled-Only:</p>
        <p>• Khi <strong className="text-foreground">Bật lịch tự động</strong>: jobs được đưa vào hàng chờ sau khi upload, chỉ xử lý theo giờ đã cấu hình.</p>
        <p>• Khi <strong className="text-foreground">Tắt</strong>: jobs vẫn được đưa vào hàng chờ nhưng không tự chạy — dùng nút &quot;Chạy ngay&quot; để kích hoạt thủ công.</p>
        <p>• Linux cron gọi endpoint mỗi giờ (<code className="font-mono">0 * * * *</code>); backend chỉ dispatch đúng giờ UTC đã lưu.</p>
        <p className="text-muted-foreground">Timezone: <code className="font-mono">{timezone}</code></p>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function AdminZipImport() {
  const [step, setStep] = useState<WizardStep>(1);
  const [jobId, setJobId] = useState<number | null>(null);
  const [originalFileName, setOriginalFileName] = useState("");
  const [albumSlug, setAlbumSlug] = useState("");
  const [albumId, setAlbumId] = useState<number | null>(null);
  const [activeTab, setActiveTab] = useState<"new" | "batch" | "dashboard" | "schedule">("new");

  const handleUploadSuccess = (id: number, filename: string) => {
    setJobId(id);
    setOriginalFileName(filename);
    setStep(2);
  };

  const handleAlbumCreated = (id: number, slug: string) => {
    setAlbumId(id);
    setAlbumSlug(slug);
    setStep(3);
  };

  const handleReset = () => {
    setStep(1);
    setJobId(null);
    setOriginalFileName("");
    setAlbumSlug("");
    setAlbumId(null);
  };

  const steps = [
    { n: 1, label: "Tải lên archive" },
    { n: 2, label: "Cấu hình SEO" },
    { n: 3, label: "Theo dõi tiến độ" },
  ];

  const zipHeader = {
    icon: FileArchive,
    title: "ZIP Import",
    subtitle: "Import album từ file ZIP/RAR",
  };

  const tabBar = (
    <div className="flex gap-1 p-1 bg-muted/40 rounded-lg w-fit mb-6">
      {([
        { id: "new" as const, label: "Import mới" },
        { id: "batch" as const, label: "Batch Upload" },
        { id: "dashboard" as const, label: "Dashboard" },
        { id: "schedule" as const, label: "Lịch xử lý" },
      ]).map((tab) => (
        <button
          key={tab.id}
          className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
            activeTab === tab.id
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          }`}
          onClick={() => setActiveTab(tab.id)}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );

  const newImportPanel = (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2 mb-2">
          {steps.map((s, i) => (
            <div key={s.n} className="flex items-center gap-2">
              <div
                className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-colors ${
                  step === s.n
                    ? "bg-primary text-primary-foreground"
                    : step > s.n
                    ? "bg-green-500 text-white"
                    : "bg-muted text-muted-foreground"
                }`}
              >
                {step > s.n ? <CheckCircle2 className="w-4 h-4" /> : s.n}
              </div>
              <span className={`text-sm ${step === s.n ? "text-foreground font-medium" : "text-muted-foreground"}`}>
                {s.label}
              </span>
              {i < steps.length - 1 && <ChevronRight className="w-4 h-4 text-muted-foreground/40 mx-1" />}
            </div>
          ))}
        </div>
        <CardTitle className="text-lg">
          {step === 1 && "Bước 1: Tải lên file archive"}
          {step === 2 && "Bước 2: Cấu hình SEO & Metadata"}
          {step === 3 && "Bước 3: Theo dõi tiến độ import"}
        </CardTitle>
        {step === 1 && (
          <CardDescription>
            Kéo thả hoặc chọn file ZIP. File sẽ được upload trực tiếp lên Wasabi staging.
          </CardDescription>
        )}
        {step === 2 && (
          <CardDescription>
            File: <span className="font-mono text-xs">{originalFileName}</span> — Job #{jobId}
          </CardDescription>
        )}
      </CardHeader>
      <CardContent>
        {step === 1 && <UploadStep onSuccess={handleUploadSuccess} />}
        {step === 2 && jobId && (
          <SeoFormStep jobId={jobId} originalFileName={originalFileName} onSuccess={handleAlbumCreated} />
        )}
        {step === 3 && jobId && (
          <ProgressStep jobId={jobId} albumSlug={albumSlug} onReset={handleReset} />
        )}
      </CardContent>
    </Card>
  );

  return (
    <AdminLayout>
      {activeTab === "dashboard" ? (
        <EntityPage
          shell="full"
          header={zipHeader}
          banner={tabBar}
        >
          <Card>
            <CardHeader>
              <CardTitle>Import Jobs Dashboard</CardTitle>
              <CardDescription>
                Danh sách tất cả các import jobs. Luồng ZIP Import riêng biệt, không liên quan Media Library hay crawler cũ.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <JobsDashboard />
            </CardContent>
          </Card>
        </EntityPage>
      ) : (
        <OperationsPage
          shell="full"
          header={zipHeader}
          primary={
            <>
              {tabBar}
              {activeTab === "batch" && (
                <Card>
                  <CardContent className="pt-6">
                    <BatchUpload />
                  </CardContent>
                </Card>
              )}
              {activeTab === "schedule" && <ImportSchedulePanel />}
              {activeTab === "new" && newImportPanel}
            </>
          }
        />
      )}
    </AdminLayout>
  );
}
