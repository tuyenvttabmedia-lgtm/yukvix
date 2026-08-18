/**
 * AdminAlbumEditor — Full-featured album editor with:
 * - Drag-and-drop image upload (react-dropzone)
 * - Multiple image upload with per-file progress
 * - ZIP bulk upload with progress polling
 * - Direct browser-to-Wasabi via presigned PUT URLs
 * - Fallback: server-side upload when Wasabi not configured
 * - Drag-and-drop image sorting (@dnd-kit)
 * - Cover image selection
 * - Free preview image toggle
 * - SEO fields with auto slug generation
 */
import {
  DndContext,
  DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  rectSortingStrategy,
  sortableKeyboardCoordinates,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useDropzone } from "react-dropzone";
import { AdminPageShell, AdminPageHeader } from "@/admin";
import { useCallback, useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  ArrowLeft,
  Check,
  ChevronLeft,
  ChevronRight,
  Crown,
  Eye,
  EyeOff,
  GripVertical,
  ImageIcon,
  Library,
  Loader2,
  Save,
  Search,
  Star,
  Trash2,
  Upload,
  X,
  FileArchive,
  RefreshCw,
  AlertCircle,
  Info,
  User,
  Download,
  CheckCircle2,
  Calendar,
  Filter,
  SlidersHorizontal,
  Sparkles,
  FileImage,
} from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ChevronsUpDown } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";

// --- Types --------------------------------------------------------------------

interface UploadingFile {
  id: string;
  file: File;
  status: "pending" | "uploading" | "processing" | "done" | "error" | "cancelled";
  progress: number; // 0-100
  error?: string;
  thumbUrl?: string;
  xhr?: XMLHttpRequest; // stored to allow cancellation
  uploadedBytes?: number; // bytes transferred so far
  startedAt?: number;    // timestamp when upload started (ms)
  speed?: number;        // bytes/sec (rolling)
  eta?: number;          // seconds remaining
}

interface PhotoItem {
  id: number;
  thumbUrl: string | null;
  webpUrl: string | null;
  originalUrl: string | null;
  isFreePreview: boolean;
  sortOrder: number;
  width: number | null;
  height: number | null;
  fileSize: number | null;
}

// --- Sortable Photo Card ------------------------------------------------------

function SortablePhotoCard({
  photo,
  isCover,
  isSelected,
  onSetCover,
  onTogglePreview,
  onDelete,
  onToggleSelect,
}: {
  photo: PhotoItem;
  isCover: boolean;
  isSelected: boolean;
  onSetCover: (id: number) => void;
  onTogglePreview: (id: number, val: boolean) => void;
  onDelete: (id: number) => void;
  onToggleSelect: (id: number) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: photo.id,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 50 : "auto",
  };

  const imgSrc = photo.thumbUrl || photo.webpUrl || photo.originalUrl || "";

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`relative group rounded-lg overflow-hidden border-2 transition-all ${
        isSelected ? "border-blue-500 ring-2 ring-blue-500/30" : isCover ? "border-primary" : "border-border hover:border-border/80"
      } bg-card`}
    >
      {/* Select checkbox */}
      <div
        onClick={(e) => { e.stopPropagation(); onToggleSelect(photo.id); }}
        className={`absolute top-1 left-1 z-20 w-5 h-5 rounded border-2 cursor-pointer transition-all ${
          isSelected
            ? "bg-blue-500 border-blue-500 flex items-center justify-center"
            : "border-white/70 bg-black/40 opacity-0 group-hover:opacity-100"
        }`}
      >
        {isSelected && <Check className="w-3 h-3 text-white" />}
      </div>

      {/* Drag handle */}
      <div
        {...attributes}
        {...listeners}
        className="absolute top-1 left-7 z-10 p-1 rounded bg-black/60 text-white/70 cursor-grab active:cursor-grabbing opacity-0 group-hover:opacity-100 transition-opacity"
      >
        <GripVertical className="w-3.5 h-3.5" />
      </div>

      {/* Cover badge */}
      {isCover && (
        <div className="absolute top-1 right-1 z-10">
          <Badge className="bg-primary text-primary-foreground text-[10px] px-1.5 py-0.5 gap-1">
            <Star className="w-2.5 h-2.5" /> Cover
          </Badge>
        </div>
      )}

      {/* Free preview badge */}
      {photo.isFreePreview && !isCover && (
        <div className="absolute top-1 right-1 z-10">
          <Badge variant="secondary" className="text-[10px] px-1.5 py-0.5 gap-1 bg-emerald-900/80 text-emerald-300 border-emerald-700">
            <Eye className="w-2.5 h-2.5" /> Free
          </Badge>
        </div>
      )}

      {/* Image */}
      <div className="aspect-square bg-secondary">
        {imgSrc ? (
          <img
            src={imgSrc}
            alt=""
            className="w-full h-full object-cover"
            loading="lazy"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-muted-foreground">
            <ImageIcon className="w-6 h-6" />
          </div>
        )}
      </div>

      {/* Action overlay */}
      <div className="absolute inset-0 bg-black/70 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-1.5">
        <button
          onClick={() => onSetCover(photo.id)}
          title="Đặt làm ảnh bìa"
          className={`p-1.5 rounded-lg text-xs transition-colors ${
            isCover
              ? "bg-primary text-primary-foreground"
              : "bg-white/20 text-white hover:bg-primary hover:text-primary-foreground"
          }`}
        >
          <Star className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={() => onTogglePreview(photo.id, !photo.isFreePreview)}
          title={photo.isFreePreview ? "Xóa xem trước miễn phí" : "Đặt xem trước miễn phí"}
          className={`p-1.5 rounded-lg text-xs transition-colors ${
            photo.isFreePreview
              ? "bg-emerald-600 text-white"
              : "bg-white/20 text-white hover:bg-emerald-600"
          }`}
        >
          {photo.isFreePreview ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
        </button>
        <button
          onClick={() => onDelete(photo.id)}
          title="Xóa ảnh"
          className="p-1.5 rounded-lg bg-white/20 text-white hover:bg-red-600 transition-colors"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* File size */}
      {photo.fileSize && (
        <div className="absolute bottom-0 left-0 right-0 bg-black/60 text-white/60 text-[9px] px-1.5 py-0.5 text-center">
          {(photo.fileSize / 1024).toFixed(0)}KB
          {photo.width && photo.height ? ` · ${photo.width}×${photo.height}` : ""}
        </div>
      )}
    </div>
  );
}

// --- Upload Queue Item --------------------------------------------------------

function formatSpeed(bytesPerSec: number): string {
  if (bytesPerSec >= 1024 * 1024) return `${(bytesPerSec / 1024 / 1024).toFixed(1)} MB/s`;
  if (bytesPerSec >= 1024) return `${(bytesPerSec / 1024).toFixed(0)} KB/s`;
  return `${bytesPerSec.toFixed(0)} B/s`;
}

function formatEta(seconds: number): string {
  if (seconds < 60) return `${Math.ceil(seconds)}s`;
  const m = Math.floor(seconds / 60);
  const s = Math.ceil(seconds % 60);
  return s > 0 ? `${m}m ${s}s` : `${m}m`;
}

function UploadQueueItem({ item, onCancel }: { item: UploadingFile; onCancel?: (id: string) => void }) {
  const statusColor = {
    pending: "text-muted-foreground",
    uploading: "text-blue-400",
    processing: "text-amber-400",
    done: "text-emerald-400",
    error: "text-red-400",
    cancelled: "text-muted-foreground/60",
  }[item.status];

  const statusLabel = {
    pending: "Chờ...",
    uploading: `Đang tải ${item.progress}%`,
    processing: "Đang xử lý (WebP + thumbnail)...",
    done: "Hoàn thành",
    error: item.error || "Thất bại",
    cancelled: "Đã hủy",
  }[item.status];

  const canCancel = item.status === "pending" || item.status === "uploading";

  return (
    <div className="flex items-center gap-3 py-2 border-b border-border/50 last:border-0">
      {/* Thumbnail preview */}
      <div className={`w-10 h-10 rounded bg-secondary flex-shrink-0 overflow-hidden ${item.status === "cancelled" ? "opacity-40" : ""}`}>
        {item.thumbUrl ? (
          <img src={item.thumbUrl} alt="" className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <ImageIcon className="w-4 h-4 text-muted-foreground" />
          </div>
        )}
      </div>

      <div className="flex-1 min-w-0">
        <div className={`text-xs truncate ${item.status === "cancelled" ? "text-muted-foreground/50 line-through" : "text-foreground"}`}>{item.file.name}</div>
        <div className={`text-[11px] ${statusColor}`}>{statusLabel}</div>
        {item.status === "uploading" && (
          <>
            {(item.speed !== undefined || item.eta !== undefined) && (
              <div className="flex items-center gap-2 mt-0.5">
                {item.speed !== undefined && item.speed > 0 && (
                  <span className="text-[10px] text-blue-300/80">{formatSpeed(item.speed)}</span>
                )}
                {item.eta !== undefined && item.eta > 0 && (
                  <span className="text-[10px] text-muted-foreground/70">~{formatEta(item.eta)}</span>
                )}
              </div>
            )}
            <div className="mt-1 h-1 bg-secondary rounded-full overflow-hidden">
              <div
                className="h-full bg-primary transition-all duration-300 rounded-full"
                style={{ width: `${item.progress}%` }}
              />
            </div>
          </>
        )}
        {item.status === "processing" && (
          <div className="mt-1 h-1 bg-secondary rounded-full overflow-hidden">
            <div className="h-full bg-amber-400 transition-all duration-300 rounded-full" style={{ width: "90%" }} />
          </div>
        )}
      </div>

      <div className="flex-shrink-0 flex items-center gap-1">
        {canCancel && onCancel && (
          <button
            onClick={() => onCancel(item.id)}
            className="w-5 h-5 rounded-full flex items-center justify-center text-muted-foreground hover:text-red-400 hover:bg-red-400/10 transition-colors"
            title="Hủy tải lên"
          >
            <X className="w-3 h-3" />
          </button>
        )}
        {item.status === "pending" && !canCancel && <div className="w-4 h-4 rounded-full border-2 border-muted-foreground/30" />}
        {(item.status === "uploading" || item.status === "processing") && !canCancel && (
          <Loader2 className="w-4 h-4 animate-spin text-primary" />
        )}
        {item.status === "done" && <Check className="w-4 h-4 text-emerald-400" />}
        {item.status === "error" && <AlertCircle className="w-4 h-4 text-red-400" />}
        {item.status === "cancelled" && <X className="w-4 h-4 text-muted-foreground/50" />}
      </div>
    </div>
  );
}

// --- Main Component -----------------------------------------------------------

export default function AdminAlbumEditor({ albumId }: { albumId: number }) {
  const [, navigate] = useLocation();
  const utils = trpc.useUtils();

  // Album data
  const { data: album, isLoading: albumLoading } = trpc.albums.byId.useQuery({ id: albumId });
  const { data: photosData, refetch: refetchẢnh } = trpc.photos.byAlbum.useQuery(
    { albumId },
    { enabled: !!albumId }
  );

  // Local photo list (for optimistic reorder)
  const [photoList, setPhotoList] = useState<PhotoItem[]>([]);
  const [coverPhotoId, setCoverPhotoId] = useState<number | null>(null);

  // Upload queue
  const [uploadQueue, setUploadQueue] = useState<UploadingFile[]>([]);

  // Pending queue stored in ref so workers can read it without stale closure
  const pendingQueueRef = useRef<UploadingFile[]>([]);
  const activeWorkersRef = useRef(0);
  const CONCURRENCY = 8;  // increased from 3 — workers no longer block on polling
  const MAX_RETRIES = 2;
  // Cancel tracking: set of item IDs that have been cancelled
  const cancelledIdsRef = useRef<Set<string>>(new Set());
  // Batch collector: accumulates uploaded files, flushes to server every 500ms or when 20 items
  const batchCollectorRef = useRef<Array<{ originalKey: string; fileName: string; mimeType: string; fileSize: number }>>([]);
  const batchFlushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const batchProcessAfterUploadRef2 = useRef<typeof batchProcessAfterUpload | null>(null);

  // ZIP upload state
  const [zipFile, setZipFile] = useState<File | null>(null);
  const [zipJobId, setZipJobId] = useState<number | null>(null);
  const [zipStatus, setZipStatus] = useState<string>("");
  const [zipProgress, setZipProgress] = useState<{ processed: number; total: number } | null>(null);

  // Download ZIP upload state (manual ZIP for user downloads)
  const [dlZipFile, setDlZipFile] = useState<File | null>(null);
  const [dlZipUploading, setDlZipUploading] = useState(false);
  const [dlZipProgress, setDlZipProgress] = useState(0);
  const [dlZipSpeed, setDlZipSpeed] = useState<number | null>(null);   // bytes/sec
  const [dlZipEta, setDlZipEta] = useState<number | null>(null);       // seconds
  // Ref to the active XHR for download-ZIP upload so we can abort it
  const dlZipXhrRef = useRef<XMLHttpRequest | null>(null);

  // SEO form
  const [seoForm, setSeoForm] = useState({
    slug: "",
    seoTitle: "",
    seoDescription: "",
    seoKeywords: "",
    focusKeyword: "",
    canonicalUrl: "",
    ogImage: "",
    robotsIndex: true,
    seoLanguage: "en",
  });
  const [seoSaving, setSeoSaving] = useState(false);

  // Bulk select
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [bulkDeleting, setBulkDeleting] = useState(false);

  // Thư viện Media picker
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [librarySearch, setLibrarySearch] = useState("");
  const [libraryTrang, setLibraryTrang] = useState(0);
  const [librarySelected, setLibrarySelected] = useState<Set<number>>(new Set());
  const [libraryDateFrom, setLibraryDateFrom] = useState(""); // YYYY-MM-DD
  const [libraryDateTo, setLibraryDateTo] = useState("");   // YYYY-MM-DD
  const [libraryFilterAlbumId, setLibraryFilterAlbumId] = useState<number | undefined>(undefined);
  const [libraryShowFilters, setLibraryShowFilters] = useState(false);
  const LIBRARY_PAGE_SIZE = 48;

  // Display pagination (render limit — keeps drag-and-drop intact)
  const DISPLAY_PAGE = 100;
  const [displayLimit, setDisplayLimit] = useState(DISPLAY_PAGE);

  // Thư viện Media query (only when picker is open)
  const { data: libraryData, isLoading: libraryLoading } = trpc.media.list.useQuery(
    {
      search: librarySearch || undefined,
      limit: LIBRARY_PAGE_SIZE,
      offset: libraryTrang * LIBRARY_PAGE_SIZE,
      dateFrom: libraryDateFrom || undefined,
      dateTo: libraryDateTo || undefined,
      filterAlbumId: libraryFilterAlbumId,
    },
    { enabled: libraryOpen }
  );

  // Load album list for filter dropdown (only when picker is open)
  const { data: albumListData } = trpc.albums.adminList.useQuery(
    { limit: 200, page: 1 },
    { enabled: libraryOpen && libraryShowFilters }
  );
  const bulkAttachMutation = trpc.media.bulkAttachToAlbum.useMutation({
    onSuccess: (res) => {
      toast.success(`Đã thêm ${res.count} ảnh vào album`);
      setLibraryOpen(false);
      setLibrarySelected(new Set());
      refetchẢnh();
    },
    onError: (err) => toast.error(err.message || "Thêm ảnh thất bại"),
  });

  // Mutations
  const requestPresignedUrl = trpc.photos.requestPresignedUrl.useMutation();
  const processAfterUpload = trpc.photos.processAfterUpload.useMutation();
  const batchProcessAfterUpload = trpc.photos.batchProcessAfterUpload.useMutation();
  const uploadSingle = trpc.photos.uploadSingle.useMutation();
  const reorderMutation = trpc.photos.reorder.useMutation();
  const setCoverMutation = trpc.photos.setCover.useMutation();
  const togglePreviewMutation = trpc.photos.toggleFreePreview.useMutation();
  const deleteMutation = trpc.photos.delete.useMutation();
  const bulkDeleteMutation = trpc.photos.bulkDelete.useMutation();
  const updateSeoMutation = trpc.photos.updateSeo.useMutation();
  const updateAlbumMutation = trpc.albums.update.useMutation();
  const suggestAlbumSeoMutation = trpc.seo.suggestAlbum.useMutation();
  const suggestTagsMutation = trpc.seo.suggestTagsFromImages.useMutation();
  const generateAltTextsMutation = trpc.photos.generateAltTexts.useMutation();
  const [aiSuggestLoading, setAiSuggestLoading] = useState(false);
  const [generateAltLoading, setGenerateAltLoading] = useState(false);
  // AI Tag Suggestion state
  const [tagSuggestLoading, setTagSuggestLoading] = useState(false);
  const [tagSuggestions, setTagSuggestions] = useState<Array<{ name: string; existsInDb: boolean }> | null>(null);
  const [selectedSuggestions, setSelectedSuggestions] = useState<Set<string>>(new Set());
  const [tagSuggestReasoning, setTagSuggestReasoning] = useState("");
  const [showTagSuggestPanel, setShowTagSuggestPanel] = useState(false);
  const { data: creatorsData } = trpc.creators.adminList.useQuery({ page: 1, limit: 200 });
  const { data: allTagsData } = trpc.albums.tags.useQuery();

  // Tag state — initialized from album.tags when album loads
  const [albumTags, setAlbumTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState("");
  const [tagSaving, setTagSaving] = useState(false);

  // Sync tags from album data
  useEffect(() => {
    if (album) {
      const tags = (album as any).tags as Array<{ name: string }> | undefined;
      setAlbumTags(tags?.map((t) => t.name.toLowerCase()) ?? []);
    }
  }, [album?.id]); // only re-init when album ID changes, not on every refetch

  function addAlbumTag(name: string) {
    const trimmed = name.trim().toLowerCase();
    if (trimmed && !albumTags.includes(trimmed)) {
      setAlbumTags((prev) => [...prev, trimmed]);
    }
    setTagInput("");
  }

  const handleSuggestTags = async () => {
    if (!albumId) return;
    setTagSuggestLoading(true);
    setTagSuggestions(null);
    setSelectedSuggestions(new Set());
    setShowTagSuggestPanel(true);
    try {
      const result = await suggestTagsMutation.mutateAsync({ albumId });
      setTagSuggestions(result.suggestions);
      setTagSuggestReasoning(result.reasoning);
      // Pre-select all suggestions
      setSelectedSuggestions(new Set(result.suggestions.map((s) => s.name)));
    } catch (err: any) {
      toast.error(err.message || "Không thể phân tích ảnh");
      setShowTagSuggestPanel(false);
    } finally {
      setTagSuggestLoading(false);
    }
  };

  const handleApplySuggestedTags = () => {
    const toAdd = Array.from(selectedSuggestions).filter((t) => !albumTags.includes(t));
    if (toAdd.length === 0) {
      toast.info("Không có tag mới nào được chọn");
      return;
    }
    setAlbumTags((prev) => [...prev, ...toAdd]);
    setShowTagSuggestPanel(false);
    setTagSuggestions(null);
    toast.success(`Đã thêm ${toAdd.length} tag — nhấn Lưu Tags để lưu`);
  };

  function removeAlbumTag(name: string) {
    setAlbumTags((prev) => prev.filter((t) => t !== name));
  }

  const handleSaveTags = async () => {
    setTagSaving(true);
    try {
      await updateAlbumMutation.mutateAsync({ id: albumId, tagNames: albumTags });
      utils.albums.byId.invalidate({ id: albumId });
      toast.success("Tags saved");
    } catch (err: any) {
      toast.error(err.message || "Failed to save tags");
    } finally {
      setTagSaving(false);
    }
  };
  const [creatorComboOpen, setCreatorComboOpen] = useState(false);
  const { data: zipJobData } = trpc.photos.uploadJobStatus.useQuery(
    { jobId: zipJobId! },
    { enabled: !!zipJobId, refetchInterval: zipJobId ? 1500 : false }
  );

  // --- Stable refs: mutations must NOT be captured in closures -----------------
  // React re-renders on every setUploadQueue call (progress updates).
  // Closures inside workers capture stale mutation instances → aborted requests.
  // Solution: always read mutations via ref.current — never capture directly.
  const requestPresignedUrlRef = useRef(requestPresignedUrl);
  const processAfterUploadRef = useRef(processAfterUpload);
  const batchProcessAfterUploadRef = useRef(batchProcessAfterUpload);
  const uploadSingleRef = useRef(uploadSingle);
  const refetchẢnhRef = useRef(refetchẢnh);
  useEffect(() => { requestPresignedUrlRef.current = requestPresignedUrl; });
  useEffect(() => { processAfterUploadRef.current = processAfterUpload; });
  useEffect(() => { batchProcessAfterUploadRef.current = batchProcessAfterUpload; });
  useEffect(() => { uploadSingleRef.current = uploadSingle; });
  useEffect(() => { refetchẢnhRef.current = refetchẢnh; });
  // Keep batchProcessAfterUploadRef2 in sync
  useEffect(() => { batchProcessAfterUploadRef2.current = batchProcessAfterUpload; });

  // Flush batch collector to server — called every 500ms or when 20 items accumulated
  const flushBatch = useCallback(async () => {
    if (batchCollectorRef.current.length === 0) return;
    const batch = batchCollectorRef.current.splice(0, 50); // take up to 50
    if (batch.length === 0) return;
    try {
      await batchProcessAfterUploadRef2.current?.mutateAsync({ albumId, files: batch });
      console.log(`[upload] Batch enqueued ${batch.length} jobs`);
    } catch (err) {
      console.error("[upload] Batch enqueue failed:", err);
      // Put failed items back for retry
      batchCollectorRef.current.unshift(...batch);
    }
  }, [albumId]);

  const scheduleBatchFlush = useCallback(() => {
    // Flush immediately if 20+ items accumulated
    if (batchCollectorRef.current.length >= 20) {
      if (batchFlushTimerRef.current) clearTimeout(batchFlushTimerRef.current);
      flushBatch();
      return;
    }
    // Otherwise debounce 500ms
    if (!batchFlushTimerRef.current) {
      batchFlushTimerRef.current = setTimeout(() => {
        batchFlushTimerRef.current = null;
        flushBatch();
      }, 500);
    }
  }, [flushBatch]);

  // Sync photos from server
  useEffect(() => {
    if (photosData) {
      setPhotoList(photosData as unknown as PhotoItem[]);
      setDisplayLimit(DISPLAY_PAGE); // reset display on data refresh
    }
  }, [photosData]);

  // Sync album cover
  useEffect(() => {
    if (album) {
      setSeoForm({
        slug: album.slug || "",
        seoTitle: (album as any).seoTitle || "",
        seoDescription: (album as any).seoDescription || "",
        seoKeywords: (album as any).seoKeywords || "",
        focusKeyword: (album as any).focusKeyword || "",
        canonicalUrl: (album as any).canonicalUrl || "",
        ogImage: (album as any).ogImage || "",
        robotsIndex: (album as any).robotsIndex !== false,
        seoLanguage: (album as any).seoLanguage || "en",
      });
      // Determine cover photo from coverUrl match (thumb / webp / original)
      if (album.coverUrl && photosData) {
        const cover = (photosData as unknown as PhotoItem[]).find(
          (p) =>
            p.thumbUrl === album.coverUrl ||
            p.webpUrl === album.coverUrl ||
            p.originalUrl === album.coverUrl
        );
        if (cover) setCoverPhotoId(cover.id);
        else setCoverPhotoId(null); // cover URL doesn't match any photo (e.g. deleted)
      } else if (!album.coverUrl) {
        setCoverPhotoId(null);
      }
    }
  }, [album, photosData]);

  // Track ZIP job progress
  useEffect(() => {
    if (!zipJobData) return;
    const job = zipJobData as any;
    setZipStatus(job.status);
    if (job.totalFiles) {
      setZipProgress({ processed: job.processedFiles || 0, total: job.totalFiles });
    }
    if (job.status === "completed") {
      setZipJobId(null);
      setZipFile(null);
      setZipProgress(null);
      toast.success(`ZIP processed: ${job.processedFiles} photos added`);
      refetchẢnh();
    } else if (job.status === "failed") {
      setZipJobId(null);
      toast.error(`ZIP processing failed: ${job.errorMessage || "Không rõ error"}`);
    }
  }, [zipJobData]);

  // --- DnD Sensors -------------------------------------------------------------
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  // --- Auto slug generation -----------------------------------------------------
  const generateSlug = (title: string) =>
    title
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, "")
      .replace(/\s+/g, "-")
      .replace(/-+/g, "-")
      .slice(0, 200);

  // --- Core upload function: uses refs to avoid stale closures -----------------
  // IMPORTANT: reads mutations via *Ref.current — never captures them directly.
  // This prevents stale closure bugs when React re-renders during progress updates.
  const executeUpload = useCallback(
    async (queueItem: UploadingFile, attempt = 1): Promise<void> => {
      const updateItem = (patch: Partial<UploadingFile>) => {
        setUploadQueue((prev) =>
          prev.map((i) => (i.id === queueItem.id ? { ...i, ...patch } : i))
        );
      };

      // Check if already cancelled before starting
      if (cancelledIdsRef.current.has(queueItem.id)) {
        updateItem({ status: "cancelled", progress: 0 });
        return;
      }

      try {
        updateItem({ status: "uploading", progress: 5, error: undefined });
        console.log(`[upload] ${queueItem.file.name} — attempt ${attempt}/${MAX_RETRIES + 1} (${(queueItem.file.size / 1024 / 1024).toFixed(2)} MB)`);

        // Always read via ref — avoids stale tRPC mutation instances
        const { mode, presignedUrl, originalKey } = await requestPresignedUrlRef.current.mutateAsync({
          albumId,
          fileName: queueItem.file.name,
          mimeType: queueItem.file.type || "image/jpeg",
          fileSize: queueItem.file.size,
        });

        if (mode === "presigned" && presignedUrl) {
          console.log(`[upload] PUT → Wasabi: ${presignedUrl.split("?")[0]}`);
          await new Promise<void>((resolve, reject) => {
            const xhr = new XMLHttpRequest();
            xhr.timeout = 10 * 60 * 1000; // 10 min
            // Store XHR in queue item so cancel handler can abort it
            updateItem({ xhr });

            const uploadStart = Date.now();
            xhr.upload.onprogress = (e) => {
              if (e.lengthComputable) {
                const elapsed = (Date.now() - uploadStart) / 1000; // seconds
                const speed = elapsed > 0.5 ? e.loaded / elapsed : 0; // bytes/sec
                const remaining = speed > 0 ? (e.total - e.loaded) / speed : 0;
                updateItem({
                  progress: Math.round((e.loaded / e.total) * 80),
                  uploadedBytes: e.loaded,
                  speed: speed > 0 ? speed : undefined,
                  eta: remaining > 0 ? remaining : undefined,
                });
              }
            };

            xhr.onload = () => {
              if (xhr.status === 200) {
                console.log(`[upload] PUT OK: ${queueItem.file.name}`);
                resolve();
              } else {
                console.error(`[upload] PUT failed: status=${xhr.status} body=${xhr.responseText?.slice(0, 300)}`);
                reject(new Error(`Wasabi upload failed: HTTP ${xhr.status} ${xhr.statusText}`));
              }
            };

            xhr.onerror = () => {
              if (cancelledIdsRef.current.has(queueItem.id)) {
                reject(new Error("__CANCELLED__"));
              } else {
                console.error(`[upload] Network error — file=${queueItem.file.name} url=${presignedUrl.split("?")[0]}`);
                reject(new Error("Network error during upload"));
              }
            };

            xhr.onabort = () => reject(new Error("__CANCELLED__"));

            xhr.ontimeout = () => {
              console.error(`[upload] Timeout: ${queueItem.file.name}`);
              reject(new Error("Upload timed out"));
            };

            xhr.open("PUT", presignedUrl);
            xhr.setRequestHeader("Content-Type", queueItem.file.type || "image/jpeg");
            xhr.send(queueItem.file);
          });

          // Mark as done immediately — enqueue is handled by batch collector
          // This frees the worker slot immediately after Wasabi upload
          updateItem({ status: "done", progress: 100 });
          // Push to batch collector for server-side enqueue
          batchCollectorRef.current.push({
            originalKey,
            fileName: queueItem.file.name,
            mimeType: queueItem.file.type || "image/jpeg",
            fileSize: queueItem.file.size,
          });
          scheduleBatchFlush();
          console.log(`[upload] ✓ Hoàn thành: ${queueItem.file.name}`);
        } else {
          // Fallback: server-side upload via base64
          updateItem({ progress: 20 });
          const base64 = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve((reader.result as string).split(",")[1]);
            reader.onerror = reject;
            reader.readAsDataURL(queueItem.file);
          });
          updateItem({ progress: 50 });
          const result = await uploadSingleRef.current.mutateAsync({
            albumId,
            fileName: queueItem.file.name,
            mimeType: queueItem.file.type || "image/jpeg",
            base64Data: base64,
            sortOrder: 0,
          });
          updateItem({ status: "done", progress: 100, thumbUrl: result.thumbUrl });
        }

        // Throttled refetch: only every 5 files to reduce server load
        refetchẢnhRef.current();
      } catch (err: any) {
        const rawMsg: string = err?.message || "";
        // Handle cancellation
        if (rawMsg === "__CANCELLED__" || cancelledIdsRef.current.has(queueItem.id)) {
          updateItem({ status: "cancelled", progress: 0, xhr: undefined });
          return;
        }
        const isHtmlError = rawMsg.includes("<!DOCTYPE") || rawMsg.includes("<html") || rawMsg.includes("Unexpected token '<'");
        const friendlyMsg = isHtmlError
          ? "Server error (HTML response) — server may have crashed or timed out"
          : rawMsg || "Tải lên thất bại";

        if (isHtmlError) {
          console.error(`[upload] Server returned HTML for ${queueItem.file.name} — likely API timeout`);
        }

        const isRetryable = isHtmlError ||
          rawMsg.includes("Network error") ||
          rawMsg.includes("timed out") ||
          rawMsg.includes("500") ||
          rawMsg.includes("502") ||
          rawMsg.includes("503");

        if (isRetryable && attempt <= MAX_RETRIES) {
          const delay = attempt * 3000; // 3s, 6s backtrongf
          console.warn(`[upload] Retrying ${queueItem.file.name} in ${delay}ms (attempt ${attempt + 1}/${MAX_RETRIES + 1})`);
          updateItem({ status: "pending", progress: 0, error: `Retrying... (${attempt}/${MAX_RETRIES})` });
          await new Promise((r) => setTimeout(r, delay));
          return executeUpload(queueItem, attempt + 1);
        }

        console.error(`[upload] ✗ Thất bại: ${queueItem.file.name} — ${friendlyMsg}`);
        updateItem({ status: "error", error: friendlyMsg });
      }
    },
    [albumId] // albumId only — mutations accessed via refs
  );

  // --- Worker loop: pulls from pendingQueueRef, max CONCURRENCY workers ---------
  // Workers are persistent — they keep running as long as pendingQueueRef has items.
  // New drops append to pendingQueueRef and spawn workers if slots are free.
  const spawnWorkerIfNeeded = useCallback(() => {
    while (activeWorkersRef.current < CONCURRENCY && pendingQueueRef.current.length > 0) {
      activeWorkersRef.current += 1;
      const runWorker = async () => {
        while (pendingQueueRef.current.length > 0) {
          const item = pendingQueueRef.current.shift();
          if (item) await executeUpload(item);
        }
        activeWorkersRef.current -= 1;
        // One final refetch when this worker finishes
        if (activeWorkersRef.current === 0) {
          console.log("[upload] All workers done, final refetch");
          refetchẢnhRef.current();
        }
      };
      runWorker();
    }
  }, [executeUpload]);

  // --- Drop handler ----------------------------------------------------------
  const onDrop = useCallback(
    (acceptedFiles: File[]) => {
      const newItems: UploadingFile[] = acceptedFiles.map((file) => ({
        id: `${Date.now()}-${Math.random()}`,
        file,
        status: "pending" as const,
        progress: 0,
      }));
      // Add to React state (for UI) AND to ref queue (for workers)
      setUploadQueue((prev) => [...prev, ...newItems]);
      pendingQueueRef.current.push(...newItems);
      console.log(`[upload] Queued ${newItems.length} files. Workers: ${activeWorkersRef.current}/${CONCURRENCY}. Pending: ${pendingQueueRef.current.length}`);
      spawnWorkerIfNeeded();
    },
    [spawnWorkerIfNeeded]
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { "image/*": [".jpg", ".jpeg", ".png", ".gif", ".webp", ".avif"] },
    multiple: true,
    maxSize: 50 * 1024 * 1024,
  });

  // --- Cancel individual photo upload ------------------------------------------
  const handleCancelUpload = useCallback((id: string) => {
    cancelledIdsRef.current.add(id);
    // Remove from pending queue ref immediately (if not yet started)
    pendingQueueRef.current = pendingQueueRef.current.filter((i) => i.id !== id);
    // Abort XHR if currently uploading
    setUploadQueue((prev) => {
      const item = prev.find((i) => i.id === id);
      if (item?.xhr) {
        item.xhr.abort();
      }
      return prev.map((i) =>
        i.id === id ? { ...i, status: "cancelled" as const, progress: 0, xhr: undefined } : i
      );
    });
  }, []);

  // --- Cancel download ZIP upload ----------------------------------------------
  const handleCancelDlZip = useCallback(() => {
    if (dlZipXhrRef.current) {
      dlZipXhrRef.current.abort();
      dlZipXhrRef.current = null;
    }
    setDlZipUploading(false);
    setDlZipProgress(0);
    toast("Đã hủy upload ZIP");
  }, []);

  // --- ZIP upload ---------------------------------------------------------------
  const handleZipUpload = async () => {
    if (!zipFile) return;
    const formData = new FormData();
    formData.append("file", zipFile);
    formData.append("albumId", String(albumId));

    try {
      const res = await fetch("/api/upload/zip", {
        method: "POST",
        body: formData,
        credentials: "include",
      });

      // Safe JSON parse — server may return HTML on crash/timeout
      let data: any;
      const rawText = await res.text();
      try {
        data = JSON.parse(rawText);
      } catch {
        console.error(`[zip-upload] Server returned non-JSON: ${rawText.slice(0, 300)}`);
        throw new Error(`Server error — unexpected response (${res.status}). Check server logs.`);
      }

      if (!res.ok) throw new Error(data.error || `ZIP upload failed (HTTP ${res.status})`);
      setZipJobId(data.jobId);
      setZipStatus("processing");
      toast.info("ZIP upload started — processing in background...");
    } catch (err: any) {
      console.error(`[zip-upload] Thất bại: ${err.message}`);
      toast.error(err.message || "ZIP upload failed");
    }
  };

  // --- Download ZIP upload (manual ZIP for user downloads) --------------------
  const handleDlZipUpload = async () => {
    if (!dlZipFile) return;
    setDlZipUploading(true);
    setDlZipProgress(0);

    try {
      // Step 1: Get presigned PUT URL from server
      const presignRes = await fetch("/api/upload/presign-download-zip", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          albumId: String(albumId),
          filename: dlZipFile.name,
          contentType: "application/zip",
        }),
      });
      const presignData = await presignRes.json();
      if (!presignRes.ok || !presignData.presignedUrl) {
        toast.error(presignData.error || "Không lấy được presigned URL");
        setDlZipUploading(false);
        setDlZipProgress(0);
        return;
      }

      const { presignedUrl, key } = presignData;

      // Step 2: PUT file directly to Wasabi S3 (no server proxy, no size limit)
      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        // Store XHR so cancel button can abort it
        dlZipXhrRef.current = xhr;
        const dlZipStart = Date.now();
        xhr.upload.onprogress = (e) => {
          if (e.lengthComputable) {
            const elapsed = (Date.now() - dlZipStart) / 1000;
            const speed = elapsed > 0.5 ? e.loaded / elapsed : 0;
            const remaining = speed > 0 ? (e.total - e.loaded) / speed : 0;
            setDlZipProgress(Math.round((e.loaded / e.total) * 100));
            setDlZipSpeed(speed > 0 ? speed : null);
            setDlZipEta(remaining > 0 ? remaining : null);
          }
        };
        xhr.onload = () => {
          dlZipXhrRef.current = null;
          if (xhr.status >= 200 && xhr.status < 300) resolve();
          else reject(new Error(`S3 upload failed: HTTP ${xhr.status}`));
        };
        xhr.onerror = () => {
          dlZipXhrRef.current = null;
          reject(new Error("Lỗi kết nối khi upload lên S3"));
        };
        xhr.onabort = () => {
          dlZipXhrRef.current = null;
          reject(new Error("__CANCELLED__"));
        };
        xhr.open("PUT", presignedUrl);
        xhr.setRequestHeader("Content-Type", "application/zip");
        xhr.send(dlZipFile);
      });

      // Step 3: Confirm upload to server (save zipUrl in DB)
      const confirmRes = await fetch("/api/upload/confirm-download-zip", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          albumId: String(albumId),
          key,
          fileSize: String(dlZipFile.size),
        }),
      });
      const confirmData = await confirmRes.json();
      if (!confirmRes.ok || !confirmData.success) {
        toast.error(confirmData.error || "Lưu thông tin ZIP thất bại");
      } else {
        toast.success("ZIP tải xuống đã được upload thành công!");
        utils.albums.byId.invalidate({ id: albumId });
        setDlZipFile(null);
      }
    } catch (err: any) {
      if (err.message !== "__CANCELLED__") {
        toast.error(err.message || "Upload thất bại");
      }
    } finally {
      setDlZipUploading(false);
      setDlZipProgress(0);
      setDlZipSpeed(null);
      setDlZipEta(null);
      dlZipXhrRef.current = null;
    }
  };

  // --- Drag-and-drop reorder ----------------------------------------------------
  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = photoList.findIndex((p) => p.id === active.id);
    const newIndex = photoList.findIndex((p) => p.id === over.id);
    const newList = arrayMove(photoList, oldIndex, newIndex);
    setPhotoList(newList);

    try {
      await reorderMutation.mutateAsync({
        albumId,
        photoIds: newList.map((p) => p.id),
      });
    } catch {
      toast.error("Failed to save order");
      refetchẢnh();
    }
  };

  // --- Set cover ----------------------------------------------------------------
  const handleSetCover = async (photoId: number) => {
    // Optimistic update
    const prevCoverId = coverPhotoId;
    setCoverPhotoId(photoId);
    try {
      await setCoverMutation.mutateAsync({ albumId, photoId });
      toast.success("Cover image updated");
      utils.albums.byId.invalidate({ id: albumId });
    } catch {
      // Rollback on error
      setCoverPhotoId(prevCoverId);
      toast.error("Failed to set cover");
    }
  };

  // --- Toggle free preview ------------------------------------------------------
  const handleTogglePreview = async (photoId: number, val: boolean) => {
    setPhotoList((prev) =>
      prev.map((p) => (p.id === photoId ? { ...p, isFreePreview: val } : p))
    );
    try {
      await togglePreviewMutation.mutateAsync({ photoId, isFreePreview: val });
    } catch {
      toast.error("Đị nhật xem trước thất bại");
      refetchẢnh();
    }
  };

  // --- Delete photo -------------------------------------------------------------
  const handleDelete = async (photoId: number) => {
    if (!confirm("Đã chắc chắn muốn xóa ảnh này vĩnh viễn?")) return;
    setPhotoList((prev) => prev.filter((p) => p.id !== photoId));
    setSelectedIds((prev) => { const s = new Set(prev); s.delete(photoId); return s; });
    try {
      await deleteMutation.mutateAsync({ photoId });
      toast.success("Đã xóa ảnh");
    } catch {
      toast.error("Xóa ảnh thất bại");
      refetchẢnh();
    }
  };

  // --- Bulk delete --------------------------------------------------------------
  const handleBulkDelete = async () => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    if (!confirm(`Delete ${ids.length} selected photo${ids.length > 1 ? "s" : ""} permanently?`)) return;
    setBulkDeleting(true);
    setPhotoList((prev) => prev.filter((p) => !selectedIds.has(p.id)));
    setSelectedIds(new Set());
    try {
      await bulkDeleteMutation.mutateAsync({ photoIds: ids });
      toast.success(`${ids.length} photo${ids.length > 1 ? "s" : ""} deleted`);
      refetchẢnh();
    } catch {
      toast.error("Bulk delete failed");
      refetchẢnh();
    } finally {
      setBulkDeleting(false);
    }
  };

  const toggleSelect = (id: number) => {
    setSelectedIds((prev) => {
      const s = new Set(prev);
      if (s.has(id)) s.delete(id); else s.add(id);
      return s;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === photoList.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(photoList.map((p) => p.id)));
    }
  };

  // --- Save SEO -----------------------------------------------------------------
  const handleSaveSeo = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!seoForm.slug) return;
    setSeoSaving(true);
    try {
      await updateSeoMutation.mutateAsync({
        albumId,
        slug: seoForm.slug,
        seoTitle: seoForm.seoTitle || undefined,
        seoDescription: seoForm.seoDescription || undefined,
        seoKeywords: seoForm.seoKeywords || undefined,
        focusKeyword: seoForm.focusKeyword || undefined,
        canonicalUrl: seoForm.canonicalUrl || undefined,
        ogImage: seoForm.ogImage || undefined,
        robotsIndex: seoForm.robotsIndex,
        seoLanguage: seoForm.seoLanguage || undefined,
      });
      toast.success("SEO settings saved");
      utils.albums.byId.invalidate({ id: albumId });
    } catch (err: any) {
      toast.error(err.message || "Failed to save SEO settings");
    } finally {
      setSeoSaving(false);
    }
  };

  // --- Update creator ------------------------------------------------------------
  const handleUpdateCreator = async (creatorIdStr: string) => {
    const creatorId = creatorIdStr === "none" ? null : parseInt(creatorIdStr, 10);
    try {
      await updateAlbumMutation.mutateAsync({ id: albumId, creatorId });
      utils.albums.byId.invalidate({ id: albumId });
      toast.success(creatorId ? "Creator assigned" : "Creator removed");
    } catch (err: any) {
      toast.error(err.message || "Failed to update creator");
    }
  };

  // --- Clear done items from queue ----------------------------------------------
  const clearDoneItems = () => {
    setUploadQueue((prev) => prev.filter((i) => i.status !== "done" && i.status !== "error"));
  };

  if (albumLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!album) {
    return (
      <div className="text-center py-16 text-muted-foreground">
        Album not found.{" "}
        <button onClick={() => navigate("/admin/albums")} className="text-primary underline">
          Go back
        </button>
      </div>
    );
  }

  const pendingCount = uploadQueue.filter((i) => i.status === "pending" || i.status === "uploading" || i.status === "processing").length;
  const doneCount = uploadQueue.filter((i) => i.status === "done").length;
  const errorCount = uploadQueue.filter((i) => i.status === "error").length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => navigate("/admin/albums")}
          className="p-2 rounded-lg hover:bg-secondary transition-colors text-muted-foreground"
        >
          <ArrowLeft className="w-4 h-4" />
        </button>
        <div className="flex-1 min-w-0">
          <h1 className="text-xl font-semibold text-foreground truncate">{album.title}</h1>
          <p className="text-sm text-muted-foreground">
            {photoList.length} photo{photoList.length !== 1 ? "s" : ""}
            {(album as any).isVip && (
              <span className="ml-2 inline-flex items-center gap-1 text-primary">
                <Crown className="w-3 h-3" /> VIP
              </span>
            )}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* LEFT: Upload + Ảnh */}
        <div className="xl:col-span-2 space-y-6">

          {/* -- Image Upload Zone -- */}
          <div className="bg-card border border-border rounded-xl p-5 space-y-4">
            <h2 className="font-semibold text-foreground flex items-center gap-2">
              <Upload className="w-4 h-4 text-primary" />
              Upload Images
            </h2>

            {/* Dropzone */}
            <div
              {...getRootProps()}
              className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all ${
                isDragActive
                  ? "border-primary bg-primary/10 scale-[1.01]"
                  : "border-border hover:border-primary/50 hover:bg-secondary/50"
              }`}
            >
              <input {...getInputProps()} />
              <div className="flex flex-col items-center gap-3">
                <div className={`p-3 rounded-full ${isDragActive ? "bg-primary/20" : "bg-secondary"}`}>
                  <Upload className={`w-6 h-6 ${isDragActive ? "text-primary" : "text-muted-foreground"}`} />
                </div>
                {isDragActive ? (
                  <p className="text-primary font-medium">Drop images here...</p>
                ) : (
                  <>
                    <p className="text-foreground font-medium">Drag & drop images here</p>
                    <p className="text-sm text-muted-foreground">
                      or <span className="text-primary underline">click to browse</span>
                    </p>
                    <p className="text-xs text-muted-foreground">
                      JPG, PNG, GIF, WebP, AVIF · Max 50MB per file · Multiple files supported
                    </p>
                  </>
                )}
              </div>
            </div>

            {/* Upload queue */}
            {uploadQueue.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="text-sm text-muted-foreground flex items-center gap-3">
                    {pendingCount > 0 && (
                      <span className="flex items-center gap-1">
                        <Loader2 className="w-3 h-3 animate-spin" /> {pendingCount} uploading
                      </span>
                    )}
                    {doneCount > 0 && (
                      <span className="text-emerald-400 flex items-center gap-1">
                        <Check className="w-3 h-3" /> {doneCount} done
                      </span>
                    )}
                    {errorCount > 0 && (
                      <span className="text-red-400 flex items-center gap-1">
                        <AlertCircle className="w-3 h-3" /> {errorCount} failed
                      </span>
                    )}
                  </div>
                  {(doneCount > 0 || errorCount > 0) && (
                    <button
                      onClick={clearDoneItems}
                      className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
                    >
                      <X className="w-3 h-3" /> Clear
                    </button>
                  )}
                </div>
                <div className="max-h-48 overflow-y-auto rounded-lg bg-secondary/50 px-3 divide-y divide-border/30">
                  {uploadQueue.map((item) => (
                    <UploadQueueItem key={item.id} item={item} onCancel={handleCancelUpload} />
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* -- Download ZIP Upload -- */}
          <div className="bg-card border border-border rounded-xl p-5 space-y-4">
            <h2 className="font-semibold text-foreground flex items-center gap-2">
              <Download className="w-4 h-4 text-primary" />
              ZIP Tải Xuống
            </h2>

            {/* Current ZIP status */}
            {(album as any).zipUrl && (
              <div className="flex items-start gap-3 p-3 rounded-lg bg-emerald-950/40 border border-emerald-800/50">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-emerald-300">ZIP đã sẵn sàng</p>
                  <p className="text-xs text-muted-foreground truncate mt-0.5">
                    {(album as any).zipUrl.split("/").pop()}
                    {(album as any).zipSize && (
                      <span className="ml-2 text-emerald-400/70">
                        ({((album as any).zipSize / 1024 / 1024).toFixed(1)} MB)
                      </span>
                    )}
                  </p>
                </div>
                <a
                  href={(album as any).zipUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex-shrink-0 text-xs text-emerald-400 hover:text-emerald-300 underline"
                >
                  Xem
                </a>
              </div>
            )}

            {!((album as any).zipUrl) && (
              <div className="flex items-center gap-2 p-3 rounded-lg bg-secondary/50 border border-border">
                <AlertCircle className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                <p className="text-sm text-muted-foreground">Chưa có ZIP tải xuống nào được gán cho album này.</p>
              </div>
            )}

            {/* File picker + upload button */}
            <div className="flex items-center gap-3">
              <label className="flex-1 flex items-center gap-3 px-4 py-3 rounded-lg bg-secondary border border-border cursor-pointer hover:border-primary/50 transition-colors">
                <FileArchive className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                <span className="text-sm text-muted-foreground truncate">
                  {dlZipFile ? dlZipFile.name : "Chọn file ZIP..."}
                </span>
                {dlZipFile && (
                  <span className="text-xs text-muted-foreground/70 flex-shrink-0">
                    ({(dlZipFile.size / 1024 / 1024).toFixed(1)} MB)
                  </span>
                )}
                <input
                  type="file"
                  accept=".zip,application/zip"
                  className="hidden"
                  onChange={(e) => setDlZipFile(e.target.files?.[0] || null)}
                />
              </label>
              <Button
                onClick={handleDlZipUpload}
                disabled={!dlZipFile || dlZipUploading}
                className="bg-primary text-primary-foreground hover:bg-primary/90 flex-shrink-0"
              >
                {dlZipUploading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Upload className="w-4 h-4" />
                )}
                {dlZipUploading ? `${dlZipProgress}%` : (album as any).zipUrl ? "Thay thế ZIP" : "Upload ZIP"}
              </Button>
            </div>

            {/* Upload progress bar */}
            {dlZipUploading && (
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <span>Đang upload lên S3...</span>
                    {dlZipSpeed !== null && dlZipSpeed > 0 && (
                      <span className="text-blue-400">{formatSpeed(dlZipSpeed)}</span>
                    )}
                    {dlZipEta !== null && dlZipEta > 0 && (
                      <span className="text-muted-foreground/70">~{formatEta(dlZipEta)}</span>
                    )}
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-muted-foreground font-medium">{dlZipProgress}%</span>
                    <button
                      onClick={handleCancelDlZip}
                      className="flex items-center gap-1 text-red-400 hover:text-red-300 transition-colors font-medium"
                      title="Hủy upload"
                    >
                      <X className="w-3 h-3" />
                      Hủy
                    </button>
                  </div>
                </div>
                <div className="h-2 bg-secondary rounded-full overflow-hidden">
                  <div
                    className="h-full bg-primary transition-all duration-300 rounded-full"
                    style={{ width: `${dlZipProgress}%` }}
                  />
                </div>
              </div>
            )}

            <p className="text-xs text-muted-foreground flex items-start gap-1.5">
              <Info className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
              Tải lên file ZIP bạn đã tạo sẵn trên máy tính. File này sẽ được gán vào nút "Download ZIP" trong trang album để VIP có thể tải xuống.
            </p>
          </div>

          {/* -- Photo Grid with Sorting -- */}
          <div className="bg-card border border-border rounded-xl p-5 space-y-4">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <h2 className="font-semibold text-foreground flex items-center gap-2">
                <ImageIcon className="w-4 h-4 text-primary" />
                Ảnh ({photoList.length})
              </h2>
              <div className="flex items-center gap-2">
                {selectedIds.size > 0 && (
                  <>
                    <span className="text-xs text-blue-400 font-medium">{selectedIds.size} selected</span>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={toggleSelectAll}
                      className="h-7 text-xs px-2"
                    >
                      {selectedIds.size === photoList.length ? "Deselect all" : "Select all"}
                    </Button>
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={handleBulkDelete}
                      disabled={bulkDeleting}
                      className="h-7 text-xs px-2 gap-1"
                    >
                      {bulkDeleting ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}
                      Delete ({selectedIds.size})
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setSelectedIds(new Set())}
                      className="h-7 text-xs px-2 text-muted-foreground"
                    >
                      <X className="w-3 h-3" />
                    </Button>
                  </>
                )}
                {selectedIds.size === 0 && photoList.length > 0 && (
                  <button
                    onClick={toggleSelectAll}
                    className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                  >
                    Select all
                  </button>
                )}
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => { setLibraryOpen(true); setLibrarySelected(new Set()); }}
                  className="h-7 text-xs px-2 gap-1.5"
                >
                  <Library className="w-3.5 h-3.5" />
                  Thêm từ Thư viện
                </Button>
                <button
                  onClick={() => refetchẢnh()}
                  className="p-1.5 rounded-lg hover:bg-secondary transition-colors text-muted-foreground"
                  title="Làm mới"
                >
                  <RefreshCw className="w-4 h-4" />
                </button>
              </div>
            </div>

            {photoList.length === 0 ? (
              <div className="py-12 text-center text-muted-foreground">
                <ImageIcon className="w-10 h-10 mx-auto mb-3 opacity-30" />
                <p className="text-sm">Chưa có ảnh nào. Hãy upload ảnh ở trên.</p>
              </div>
            ) : (
              <>
                <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                  <GripVertical className="w-3.5 h-3.5" />
                  Drag photos to reorder · <Star className="w-3 h-3 text-primary" /> = cover · <Eye className="w-3 h-3 text-emerald-400" /> = free preview
                </p>
                <DndContext
                  sensors={sensors}
                  collisionDetection={closestCenter}
                  onDragEnd={handleDragEnd}
                >
                  <SortableContext
                    items={photoList.map((p) => p.id)}
                    strategy={rectSortingStrategy}
                  >
                    <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-2">
                      {photoList.slice(0, displayLimit).map((photo) => (
                        <SortablePhotoCard
                          key={photo.id}
                          photo={photo}
                          isCover={coverPhotoId === photo.id}
                          isSelected={selectedIds.has(photo.id)}
                          onSetCover={handleSetCover}
                          onTogglePreview={handleTogglePreview}
                          onDelete={handleDelete}
                          onToggleSelect={toggleSelect}
                        />
                      ))}
                    </div>
                  </SortableContext>
                </DndContext>
                {photoList.length > displayLimit && (
                  <div className="pt-2 text-center">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setDisplayLimit((l) => l + DISPLAY_PAGE)}
                    >
                      Load more ({photoList.length - displayLimit} remaining)
                    </Button>
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        {/* RIGHT: SEO Panel */}
        <div className="space-y-6">
          <div className="bg-card border border-border rounded-xl p-5 space-y-4 sticky top-6">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-foreground flex items-center gap-2">
                <Save className="w-4 h-4 text-primary" />
                SEO & Metadata
              </h2>
              <button
                type="button"
                disabled={aiSuggestLoading}
                onClick={async () => {
                  if (!album?.id) return;
                  setAiSuggestLoading(true);
                  try {
                    const result = await suggestAlbumSeoMutation.mutateAsync({ albumId: album.id });
                    setSeoForm((prev) => ({
                      ...prev,
                      focusKeyword: result.focusKeyword || prev.focusKeyword,
                      seoTitle: result.metaTitle || prev.seoTitle,
                      seoDescription: result.metaDescription || prev.seoDescription,
                    }));
                    toast.success("AI đã gợi ý SEO thành công!");
                  } catch (err: any) {
                    toast.error(err?.message || "AI gợi ý thất bại");
                  } finally {
                    setAiSuggestLoading(false);
                  }
                }}
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-primary/10 border border-primary/30 text-primary text-xs font-medium hover:bg-primary/20 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                title="AI tự động gợi ý SEO dựa trên nội dung album"
              >
                {aiSuggestLoading ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Sparkles className="w-3.5 h-3.5" />
                )}
                {aiSuggestLoading ? "Đang gợi ý..." : "AI Suggest"}
              </button>
            </div>

{/* SEO Warnings */}
            {(() => {
              const warnings: string[] = [];
              if (!seoForm.seoTitle) warnings.push("Thiếu SEO title");
              if (!seoForm.seoDescription) warnings.push("Thiếu SEO description");
              if (!seoForm.slug) warnings.push("Thiếu URL slug");
              if (!album.coverUrl) warnings.push("Chưa có ảnh bìa (cover)");
              if (warnings.length === 0) return null;
              return (
                <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 space-y-1.5 mb-1">
                  <p className="text-xs font-medium text-amber-400 flex items-center gap-1.5">
                    <AlertCircle className="w-3.5 h-3.5" /> SEO Warnings ({warnings.length})
                  </p>
                  {warnings.map((w) => (
                    <p key={w} className="text-[11px] text-amber-300/80 pl-5">• {w}</p>
                  ))}
                </div>
              );
            })()}

            <form onSubmit={handleSaveSeo} className="space-y-4">
              {/* Slug */}
              <div>
                <Label className="text-xs text-muted-foreground mb-1.5 block">URL Slug *</Label>
                <div className="flex gap-2">
                  <Input
                    value={seoForm.slug}
                    onChange={(e) => setSeoForm({ ...seoForm, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "") })}
                    placeholder="album-url-slug"
                    className={`bg-secondary border-border font-mono text-sm ${!seoForm.slug ? "border-amber-500/50" : ""}`}
                  />
                  <button
                    type="button"
                    onClick={() => setSeoForm({ ...seoForm, slug: generateSlug(album.title || "") })}
                    className="px-2.5 py-1.5 rounded-lg bg-secondary border border-border text-xs text-muted-foreground hover:text-foreground hover:border-primary/50 transition-colors flex-shrink-0"
                    title="Tự động tạo từ tiêu đề"
                  >
                    Tự động
                  </button>
                </div>
                <p className="text-[11px] text-muted-foreground mt-1">
                  /album/<span className="text-primary">{seoForm.slug || "..."}</span>
                </p>
              </div>

              {/* SEO Title */}
              <div>
                <Label className="text-xs text-muted-foreground mb-1.5 block">
                  Tiêu đề SEO
                  <span className={`ml-1 ${seoForm.seoTitle.length > 60 ? "text-amber-400" : "text-muted-foreground/60"}`}>({seoForm.seoTitle.length}/70)</span>
                </Label>
                <Input
                  value={seoForm.seoTitle}
                  onChange={(e) => setSeoForm({ ...seoForm, seoTitle: e.target.value.slice(0, 70) })}
                  placeholder={album.title || "Title for search engines"}
                  className={`bg-secondary border-border text-sm ${!seoForm.seoTitle ? "border-amber-500/30" : ""}`}
                />
              </div>

              {/* SEO Description */}
              <div>
                <Label className="text-xs text-muted-foreground mb-1.5 block">
                  SEO Description
                  <span className={`ml-1 ${seoForm.seoDescription.length > 150 ? "text-amber-400" : "text-muted-foreground/60"}`}>({seoForm.seoDescription.length}/160)</span>
                </Label>
                <textarea
                  value={seoForm.seoDescription}
                  onChange={(e) => setSeoForm({ ...seoForm, seoDescription: e.target.value.slice(0, 160) })}
                  placeholder="Brief description for search results..."
                  rows={3}
                  className={`w-full px-3 py-2 rounded-lg bg-secondary border text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary resize-none placeholder:text-muted-foreground ${!seoForm.seoDescription ? "border-amber-500/30" : "border-border"}`}
                />
              </div>

              {/* Focus Keyword */}
              <div>
                <Label className="text-xs text-muted-foreground mb-1.5 block">Focus Keyword</Label>
                <Input
                  value={seoForm.focusKeyword}
                  onChange={(e) => setSeoForm({ ...seoForm, focusKeyword: e.target.value.slice(0, 200) })}
                  placeholder="e.g. creamsoda bambi cosplay"
                  className="bg-secondary border-border text-sm"
                />
                <p className="text-[11px] text-muted-foreground/60 mt-1">Từ khóa chính muốn rank trên Google</p>
              </div>

              {/* SEO Keywords */}
              <div>
                <Label className="text-xs text-muted-foreground mb-1.5 block">
                  SEO Keywords <span className="text-muted-foreground/50">(comma-separated)</span>
                </Label>
                <Input
                  value={seoForm.seoKeywords}
                  onChange={(e) => setSeoForm({ ...seoForm, seoKeywords: e.target.value })}
                  placeholder="cosplay, anime, fantasy, ..."
                  className="bg-secondary border-border text-sm"
                />
              </div>

              {/* Language */}
              <div>
                <Label className="text-xs text-muted-foreground mb-1.5 block">Ngôn ngữ nội dung</Label>
                <select
                  value={seoForm.seoLanguage}
                  onChange={(e) => setSeoForm({ ...seoForm, seoLanguage: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg bg-secondary border border-border text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                >
                  <option value="en">English</option>
                  <option value="ja">Japanese (日本語)</option>
                  <option value="ko">Korean (한국어)</option>
                  <option value="zh-CN">Chinese Simplified (简体中文)</option>
                  <option value="zh-TW">Chinese Traditional (繁體中文)</option>
                  <option value="vi">Vietnamese (Tiếng Việt)</option>
                </select>
              </div>

              {/* Robots Index Toggle */}
              <div className="flex items-center justify-between">
                <div>
                  <Label className="text-xs text-muted-foreground block">Cho phép Google index</Label>
                  <p className="text-[11px] text-muted-foreground/60">Tắt = noindex, nofollow</p>
                </div>
                <button
                  type="button"
                  onClick={() => setSeoForm({ ...seoForm, robotsIndex: !seoForm.robotsIndex })}
                  className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                    seoForm.robotsIndex ? "bg-primary" : "bg-muted"
                  }`}
                >
                  <span
                    className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${
                      seoForm.robotsIndex ? "translate-x-4.5" : "translate-x-0.5"
                    }`}
                  />
                </button>
              </div>

              {/* Advanced SEO */}
              <details className="group">
                <summary className="text-xs text-muted-foreground cursor-pointer hover:text-foreground flex items-center gap-1 select-none list-none">
                  <ChevronRight className="w-3 h-3 transition-transform group-open:rotate-90" />
                  Nâng cao (Canonical, OG Image)
                </summary>
                <div className="mt-3 space-y-3 pl-1">
                  <div>
                    <Label className="text-xs text-muted-foreground mb-1.5 block">Canonical URL</Label>
                    <Input
                      value={seoForm.canonicalUrl}
                      onChange={(e) => setSeoForm({ ...seoForm, canonicalUrl: e.target.value })}
                      placeholder="https://yukvix.com/album/..."
                      className="bg-secondary border-border text-sm font-mono"
                    />
                    <p className="text-[11px] text-muted-foreground/60 mt-1">Để trống = dùng URL hiện tại</p>
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground mb-1.5 block">OG Image URL</Label>
                    <Input
                      value={seoForm.ogImage}
                      onChange={(e) => setSeoForm({ ...seoForm, ogImage: e.target.value })}
                      placeholder="https://..."
                      className="bg-secondary border-border text-sm font-mono"
                    />
                    <p className="text-[11px] text-muted-foreground/60 mt-1">Để trống = dùng ảnh bìa album</p>
                  </div>
                </div>
              </details>

              {/* Search Preview */}
              {(seoForm.seoTitle || seoForm.seoDescription) && (
                <div className="rounded-lg border border-border/50 bg-secondary/50 p-3 space-y-1">
                  <p className="text-xs text-muted-foreground mb-2">Search preview:</p>
                  <p className="text-sm text-blue-400 truncate">
                    {seoForm.seoTitle || album.title}
                  </p>
                  <p className="text-xs text-emerald-600">
                    yukvix.com/album/{seoForm.slug || album.slug}
                  </p>
                  <p className="text-xs text-muted-foreground line-clamp-2">
                    {seoForm.seoDescription || (album as any).description || "Chưa có mô tả"}
                  </p>
                </div>
              )}

              <Button
                type="submit"
                disabled={seoSaving || !seoForm.slug}
                className="w-full bg-primary text-primary-foreground hover:bg-primary/90"
              >
                {seoSaving ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Save className="w-4 h-4" />
                )}
                Lưu cài đặt SEO
              </Button>
            </form>

            {/* Creator assignment */}
            <div className="pt-4 border-t border-border space-y-3">
              <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider flex items-center gap-1.5">
                <User className="w-3 h-3" /> Creator
              </p>
              <Popover open={creatorComboOpen} onOpenChange={setCreatorComboOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    role="combobox"
                    aria-expanded={creatorComboOpen}
                    className="w-full justify-between bg-secondary border-border text-sm h-9 font-normal"
                  >
                    <span className="truncate">
                      {(album as any).creatorId
                        ? (creatorsData?.items ?? []).find((c: any) => c.id === (album as any).creatorId)?.name ?? "Loading..."
                        : "— No creator —"}
                    </span>
                    <ChevronsUpDown className="ml-2 h-3.5 w-3.5 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[280px] p-0" align="start">
                  <Command>
                    <CommandInput placeholder="Tìm creator..." className="h-9" />
                    <CommandList>
                      <CommandEmpty>Không tìm thấy creator.</CommandEmpty>
                      <CommandGroup>
                        <CommandItem
                          value="none"
                          onSelect={() => {
                            handleUpdateCreator("none");
                            setCreatorComboOpen(false);
                          }}
                        >
                          <Check className={`mr-2 h-3.5 w-3.5 ${
                            !(album as any).creatorId ? "opacity-100" : "opacity-0"
                          }`} />
                          — No creator —
                        </CommandItem>
                        {(creatorsData?.items ?? []).map((c: any) => (
                          <CommandItem
                            key={c.id}
                            value={c.name}
                            onSelect={() => {
                              handleUpdateCreator(String(c.id));
                              setCreatorComboOpen(false);
                            }}
                          >
                            <Check className={`mr-2 h-3.5 w-3.5 ${
                              (album as any).creatorId === c.id ? "opacity-100" : "opacity-0"
                            }`} />
                            {c.name}
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
              {(album as any).creatorId && (
                <p className="text-[11px] text-muted-foreground">
                  View: <a href={`/creator/${(album as any).creatorSlug || ""}`} target="_blank" rel="noreferrer" className="text-primary hover:underline">/creator/{(album as any).creatorSlug || "..."}</a>
                </p>
              )}
            </div>

            {/* Tags */}
            <div className="pt-4 border-t border-border space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider flex items-center gap-1.5">
                  <Search className="w-3 h-3" /> Tags
                </p>
                <button
                  type="button"
                  onClick={handleSuggestTags}
                  disabled={tagSuggestLoading}
                  title="AI phân tích ảnh và gợi ý tag"
                  className="flex items-center gap-1 text-xs text-primary hover:text-primary/80 disabled:opacity-50 transition-colors"
                >
                  {tagSuggestLoading
                    ? <Loader2 className="w-3 h-3 animate-spin" />
                    : <Sparkles className="w-3 h-3" />}
                  AI Gợi ý
                </button>
              </div>

              {/* AI Tag Suggestion Panel */}
              {showTagSuggestPanel && (
                <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-medium text-primary flex items-center gap-1">
                      <Sparkles className="w-3 h-3" />
                      {tagSuggestLoading ? "AI đang phân tích ảnh..." : `Gợi ý ${tagSuggestions?.length ?? 0} tag`}
                    </p>
                    <button
                      type="button"
                      onClick={() => { setShowTagSuggestPanel(false); setTagSuggestions(null); }}
                      className="text-muted-foreground hover:text-foreground transition-colors"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  {tagSuggestLoading && (
                    <div className="flex items-center gap-2 text-xs text-muted-foreground py-2">
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      Đang phân tích {photoList.length > 0 ? `${Math.min(4, photoList.length + 1)} ảnh` : "album"}...
                    </div>
                  )}

                  {tagSuggestions && tagSuggestions.length > 0 && (
                    <>
                      <div className="flex flex-wrap gap-1.5">
                        {tagSuggestions.map((s) => {
                          const selected = selectedSuggestions.has(s.name);
                          return (
                            <button
                              key={s.name}
                              type="button"
                              onClick={() => {
                                setSelectedSuggestions((prev) => {
                                  const next = new Set(prev);
                                  if (next.has(s.name)) next.delete(s.name);
                                  else next.add(s.name);
                                  return next;
                                });
                              }}
                              className={`flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border transition-all ${
                                selected
                                  ? "bg-primary text-primary-foreground border-primary"
                                  : "bg-secondary text-muted-foreground border-border hover:border-primary/50"
                              }`}
                            >
                              #{s.name}
                              {s.existsInDb && !selected && (
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" title="Đã có trong DB" />
                              )}
                              {selected && <Check className="w-2.5 h-2.5" />}
                            </button>
                          );
                        })}
                      </div>
                      {tagSuggestReasoning && (
                        <p className="text-xs text-muted-foreground italic leading-relaxed">{tagSuggestReasoning}</p>
                      )}
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          className="flex-1 h-7 text-xs bg-primary text-primary-foreground hover:bg-primary/90"
                          onClick={handleApplySuggestedTags}
                          disabled={selectedSuggestions.size === 0}
                        >
                          <Check className="w-3 h-3 mr-1" />
                          Áp dụng ({selectedSuggestions.size})
                        </Button>
                        <button
                          type="button"
                          onClick={() => setSelectedSuggestions(new Set(tagSuggestions.map((s) => s.name)))}
                          className="text-xs text-muted-foreground hover:text-foreground transition-colors px-2"
                        >
                          Chọn tất cả
                        </button>
                      </div>
                    </>
                  )}

                  {tagSuggestions && tagSuggestions.length === 0 && !tagSuggestLoading && (
                    <p className="text-xs text-muted-foreground italic">Không tìm thấy tag phù hợp</p>
                  )}
                </div>
              )}
              <div className="flex flex-wrap gap-1.5">
                {albumTags.map((tag) => (
                  <span key={tag} className="flex items-center gap-1 bg-primary/10 text-primary text-xs px-2 py-0.5 rounded-full border border-primary/20">
                    #{tag}
                    <button
                      type="button"
                      onClick={() => removeAlbumTag(tag)}
                      className="hover:text-destructive transition-colors"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                ))}
                {albumTags.length === 0 && (
                  <span className="text-xs text-muted-foreground italic">Chưa có tag nào</span>
                )}
              </div>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={tagInput}
                  onChange={(e) => setTagInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === ",") { e.preventDefault(); addAlbumTag(tagInput); }
                    if (e.key === "Backspace" && !tagInput && albumTags.length > 0) {
                      removeAlbumTag(albumTags[albumTags.length - 1]);
                    }
                  }}
                  placeholder="Nhập tag..."
                  className="flex-1 px-2.5 py-1.5 rounded-lg bg-secondary border border-border text-xs focus:outline-none focus:ring-1 focus:ring-primary"
                  list="editor-tag-suggestions"
                  autoComplete="off"
                />
                <button
                  type="button"
                  onClick={() => addAlbumTag(tagInput)}
                  disabled={!tagInput.trim()}
                  className="px-2.5 py-1.5 rounded-lg bg-secondary border border-border text-xs text-muted-foreground hover:text-foreground disabled:opacity-40 transition-colors"
                >
                  +
                </button>
              </div>
              <datalist id="editor-tag-suggestions">
                {allTagsData?.filter((t) => !albumTags.includes(t.name.toLowerCase())).map((t) => (
                  <option key={t.id} value={t.name} />
                ))}
              </datalist>
              <Button
                size="sm"
                className="w-full bg-primary/10 text-primary hover:bg-primary/20 border border-primary/20"
                onClick={handleSaveTags}
                disabled={tagSaving}
              >
                {tagSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" /> : <Check className="w-3.5 h-3.5 mr-1" />}
                Lưu Tags
              </Button>
            </div>

            {/* Image Alt Texts */}
            <div className="pt-4 border-t border-border space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider flex items-center gap-1.5">
                  <FileImage className="w-3 h-3" /> Image Alt Texts
                </p>
              </div>
              <p className="text-[11px] text-muted-foreground leading-relaxed">
                Tự động sinh alt text SEO cho tất cả ảnh dựa trên tên cosplayer, nhân vật, series và tags.
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={generateAltLoading || photoList.length === 0}
                  onClick={async () => {
                    if (!album?.id) return;
                    setGenerateAltLoading(true);
                    try {
                      const result = await generateAltTextsMutation.mutateAsync({ albumId: album.id, overwrite: false });
                      toast.success(`Đã cập nhật ${result.updated} ảnh${result.skipped > 0 ? ` (bỏ qua ${result.skipped} đã có alt)` : ""}`);
                    } catch (err: any) {
                      toast.error(err?.message || "Sinh alt text thất bại");
                    } finally {
                      setGenerateAltLoading(false);
                    }
                  }}
                  className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-secondary border border-border text-xs font-medium text-foreground hover:bg-secondary/80 hover:border-primary/50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  title="Chỉ cập nhật ảnh chưa có alt text"
                >
                  {generateAltLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FileImage className="w-3.5 h-3.5" />}
                  Sinh Alt Texts
                </button>
                <button
                  type="button"
                  disabled={generateAltLoading || photoList.length === 0}
                  onClick={async () => {
                    if (!album?.id) return;
                    if (!confirm(`Ghi đè alt text cho tất cả ${photoList.length} ảnh?`)) return;
                    setGenerateAltLoading(true);
                    try {
                      const result = await generateAltTextsMutation.mutateAsync({ albumId: album.id, overwrite: true });
                      toast.success(`Đã cập nhật ${result.updated}/${result.total} ảnh`);
                    } catch (err: any) {
                      toast.error(err?.message || "Sinh alt text thất bại");
                    } finally {
                      setGenerateAltLoading(false);
                    }
                  }}
                  className="px-3 py-2 rounded-lg bg-secondary border border-border text-xs font-medium text-muted-foreground hover:text-foreground hover:border-amber-500/50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  title="Ghi đè tất cả alt text kể cả ảnh đã có"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                </button>
              </div>
              {photoList.length === 0 && (
                <p className="text-[11px] text-muted-foreground italic">Album chưa có ảnh</p>
              )}
            </div>
            {/* Album info summary */}
            <div className="pt-4 border-t border-border space-y-2">
              <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Album Info</p>
              <div className="space-y-1.5 text-xs text-muted-foreground">
                <div className="flex justify-between">
                  <span>Ảnh</span>
                  <span className="text-foreground">{photoList.length}</span>
                </div>
                <div className="flex justify-between">
                  <span>Free prelượt xem</span>
                  <span className="text-emerald-400">
                    {photoList.filter((p) => p.isFreePreview).length}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>VIP locked</span>
                  <span className="text-primary">
                    {photoList.filter((p) => !p.isFreePreview).length}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>Trạng thái</span>
                  <span className="text-foreground capitalize">{(album as any).status}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* -- Thư viện Media Picker Dialog -- */}
      <Dialog open={libraryOpen} onOpenChange={(open) => { setLibraryOpen(open); if (!open) setLibrarySelected(new Set()); }}>
        <DialogContent className="max-w-4xl h-[80vh] flex flex-col p-0 gap-0">
          <DialogHeader className="px-5 pt-5 pb-3 border-b border-border/50">
            <DialogTitle className="flex items-center justify-between gap-2">
              <span className="flex items-center gap-2">
                <Library className="w-4 h-4 text-primary" />
                Thư viện Media
              </span>
              <button
                type="button"
                onClick={() => setLibraryShowFilters((v) => !v)}
                className={`flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-md border transition-colors ${
                  libraryShowFilters || libraryDateFrom || libraryDateTo || libraryFilterAlbumId
                    ? "border-primary text-primary bg-primary/10"
                    : "border-border text-muted-foreground hover:border-border/80"
                }`}
              >
                <SlidersHorizontal className="w-3.5 h-3.5" />
                Bộ lọc
                {(libraryDateFrom || libraryDateTo || libraryFilterAlbumId) && (
                  <span className="ml-1 bg-primary text-primary-foreground rounded-full w-4 h-4 text-[10px] flex items-center justify-center">
                    {[libraryDateFrom, libraryDateTo, libraryFilterAlbumId].filter(Boolean).length}
                  </span>
                )}
              </button>
            </DialogTitle>

            {/* Search bar */}
            <div className="relative mt-2">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                value={librarySearch}
                onChange={(e) => { setLibrarySearch(e.target.value); setLibraryTrang(0); }}
                placeholder="Tìm theo tên file…"
                className="pl-8 h-8 text-sm"
              />
            </div>

            {/* Filter panel */}
            {libraryShowFilters && (
              <div className="mt-2 p-3 rounded-lg bg-muted/40 border border-border/50 flex flex-wrap gap-3">
                {/* Date From */}
                <div className="flex flex-col gap-1 min-w-[140px] flex-1">
                  <label className="text-xs text-muted-foreground flex items-center gap-1">
                    <Calendar className="w-3 h-3" />Từ ngày
                  </label>
                  <Input
                    type="date"
                    value={libraryDateFrom}
                    onChange={(e) => { setLibraryDateFrom(e.target.value); setLibraryTrang(0); }}
                    className="h-7 text-xs"
                  />
                </div>
                {/* Date To */}
                <div className="flex flex-col gap-1 min-w-[140px] flex-1">
                  <label className="text-xs text-muted-foreground flex items-center gap-1">
                    <Calendar className="w-3 h-3" />Đến ngày
                  </label>
                  <Input
                    type="date"
                    value={libraryDateTo}
                    onChange={(e) => { setLibraryDateTo(e.target.value); setLibraryTrang(0); }}
                    className="h-7 text-xs"
                  />
                </div>
                {/* Album filter */}
                <div className="flex flex-col gap-1 min-w-[180px] flex-1">
                  <label className="text-xs text-muted-foreground flex items-center gap-1">
                    <Filter className="w-3 h-3" />Theo album
                  </label>
                  <Select
                    value={libraryFilterAlbumId ? String(libraryFilterAlbumId) : "__all__"}
                    onValueChange={(v) => { setLibraryFilterAlbumId(v && v !== "__all__" ? Number(v) : undefined); setLibraryTrang(0); }}
                  >
                    <SelectTrigger className="h-7 text-xs">
                      <SelectValue placeholder="Tất cả album" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__all__">Tất cả album</SelectItem>
                      {(albumListData?.items ?? []).map((a: any) => (
                        <SelectItem key={a.id} value={String(a.id)}>{a.title}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {/* Clear filters */}
                {(libraryDateFrom || libraryDateTo || libraryFilterAlbumId) && (
                  <div className="flex items-end">
                    <button
                      type="button"
                      onClick={() => { setLibraryDateFrom(""); setLibraryDateTo(""); setLibraryFilterAlbumId(undefined); setLibraryTrang(0); }}
                      className="flex items-center gap-1 text-xs text-destructive hover:text-destructive/80 px-2 py-1 rounded border border-destructive/30 hover:bg-destructive/10 transition-colors h-7"
                    >
                      <X className="w-3 h-3" />Xóa bộ lọc
                    </button>
                  </div>
                )}
              </div>
            )}
          </DialogHeader>

          {/* Grid */}
          <div className="flex-1 overflow-y-auto px-5 py-4">
            {libraryLoading ? (
              <div className="grid grid-cols-4 sm:grid-cols-6 gap-2">
                {Array.from({ length: 24 }).map((_, i) => (
                  <div key={i} className="aspect-square rounded-lg bg-muted animate-pulse" />
                ))}
              </div>
            ) : !libraryData?.items?.length ? (
              <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-3">
                <ImageIcon className="w-10 h-10 opacity-30" />
                <p className="text-sm">{librarySearch ? `Không tìm thấy kết quả cho "${librarySearch}"` : "Thư viện chưa có ảnh nào"}</p>
              </div>
            ) : (
              <div className="grid grid-cols-4 sm:grid-cols-6 gap-2">
                {(libraryData.items as any[]).map((item) => {
                  const imgSrc = item.thumbUrl || item.webpUrl || item.originalUrl || "";
                  const sel = librarySelected.has(item.id);
                  return (
                    <div
                      key={item.id}
                      className={`relative group cursor-pointer rounded-lg overflow-hidden border-2 transition-all ${
                        sel ? "border-primary ring-2 ring-primary/30" : "border-transparent hover:border-border"
                      }`}
                      onClick={() => setLibrarySelected((prev) => { const s = new Set(prev); if (s.has(item.id)) s.delete(item.id); else s.add(item.id); return s; })}
                    >
                      <div className="aspect-square bg-muted">
                        {imgSrc ? (
                          <img src={imgSrc} alt={item.filename} className="w-full h-full object-cover" loading="lazy" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-muted-foreground">
                            <ImageIcon className="w-6 h-6" />
                          </div>
                        )}
                      </div>
                      <div className={`absolute inset-0 bg-primary/10 transition-opacity ${sel ? "opacity-100" : "opacity-0 group-hover:opacity-50"}`} />
                      {sel && (
                        <div className="absolute top-1 left-1">
                          <Check className="w-4 h-4 text-primary drop-shadow" />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {/* Pagination */}
            {(libraryData?.total ?? 0) > LIBRARY_PAGE_SIZE && (
              <div className="flex items-center justify-center gap-3 pt-4">
                <Button variant="outline" size="sm" onClick={() => setLibraryTrang((p) => Math.max(0, p - 1))} disabled={libraryTrang === 0}>
                  <ChevronLeft className="w-4 h-4" />
                </Button>
                <span className="text-xs text-muted-foreground">
                  Trang {libraryTrang + 1} trong {Math.ceil((libraryData?.total ?? 0) / LIBRARY_PAGE_SIZE)}
                </span>
                <Button variant="outline" size="sm" onClick={() => setLibraryTrang((p) => p + 1)} disabled={(libraryTrang + 1) * LIBRARY_PAGE_SIZE >= (libraryData?.total ?? 0)}>
                  <ChevronRight className="w-4 h-4" />
                </Button>
              </div>
            )}
          </div>

          <DialogFooter className="px-5 py-3 border-t border-border/50 flex items-center gap-3 flex-wrap">
            <span className="text-sm text-muted-foreground flex-1 min-w-0">
              {librarySelected.size > 0 ? `Đã chọn ${librarySelected.size} ảnh` : "Nhấp vào ảnh để chọn"}
            </span>
            {/* Select all / Deselect all for current page */}
            {libraryData?.items?.length ? (
              (() => {
                const pageIds = (libraryData.items as any[]).map((i: any) => i.id);
                const allSelected = pageIds.every((id: number) => librarySelected.has(id));
                return (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setLibrarySelected((prev) => {
                        const s = new Set(prev);
                        if (allSelected) {
                          pageIds.forEach((id: number) => s.delete(id));
                        } else {
                          pageIds.forEach((id: number) => s.add(id));
                        }
                        return s;
                      });
                    }}
                  >
                    {allSelected ? (
                      <><X className="w-3.5 h-3.5 mr-1.5" />Bỏ chọn trang này</>
                    ) : (
                      <><Check className="w-3.5 h-3.5 mr-1.5" />Chọn trang này ({pageIds.length})</>
                    )}
                  </Button>
                );
              })()
            ) : null}
            <Button variant="outline" onClick={() => setLibraryOpen(false)}>Hủy</Button>
            <Button
              onClick={() => bulkAttachMutation.mutate({ albumId, mediaItemIds: Array.from(librarySelected) })}
              disabled={librarySelected.size === 0 || bulkAttachMutation.isPending}
            >
              {bulkAttachMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Library className="w-4 h-4 mr-2" />}
              Thêm {librarySelected.size > 0 ? librarySelected.size : ""} ảnh vào album
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
