import { trpc } from "@/lib/trpc";
import { EntityPage, EntityToolbar, DataTable, AdminStatusBadge, adminGlossary } from "@/admin";
import AdminLayout from "./AdminLayout";
import { useState, useRef, useEffect } from "react";
import { useLocation } from "wouter";
import {
  Check,
  Crown,
  Edit,
  FileArchive,
  Hash,
  ImageIcon,
  Loader2,
  Plus,
  RefreshCw,
  Share2,
  Trash2,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const PAGE_SIZE_KEY = "yukvix.admin.albums.pageSize";
const PAGE_SIZES = [10, 20, 50, 100] as const;

function readPageSize(): number {
  if (typeof window === "undefined") return 20;
  const raw = Number(window.localStorage.getItem(PAGE_SIZE_KEY));
  return PAGE_SIZES.includes(raw as (typeof PAGE_SIZES)[number]) ? raw : 20;
}

export default function AdminAlbums() {
  const [, navigate] = useLocation();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(readPageSize);
  const [statusFilter, setStatusFilter] = useState<"all" | "published" | "draft" | "archived">("all");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<"all" | "free" | "vip">("all");
  const [tagFilter, setTagFilter] = useState<string>("");
  const [sortBy, setSortBy] = useState<"newest" | "oldest" | "popular" | "title">("newest");
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingAlbum, setEditingAlbum] = useState<any | null>(null);
  const [deleteConfirmAlbum, setDeleteConfirmAlbum] = useState<{ id: number; title: string } | null>(null);
  const [publishConfirmAlbum, setPublishConfirmAlbum] = useState<{ id: number; title: string } | null>(null);

  useEffect(() => {
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => { setDebouncedSearch(search); setPage(1); }, 350);
    return () => { if (searchTimer.current) clearTimeout(searchTimer.current); };
  }, [search]);

  const utils = trpc.useUtils();

  const { data: allTagsForFilter } = trpc.albums.tags.useQuery();

  const { data, isLoading, isFetching, refetch } = trpc.albums.adminList.useQuery({
    page,
    limit: pageSize,
    status: statusFilter === "all" ? undefined : statusFilter,
    search: debouncedSearch || undefined,
    isVip: typeFilter === "all" ? undefined : typeFilter === "vip",
    tagSlug: tagFilter || undefined,
    sortBy,
  }, { placeholderData: (prev) => prev });

  useEffect(() => {
    if (!data) return;
    const lastPage = Math.max(1, Math.ceil(data.total / pageSize));
    if (page > lastPage) setPage(lastPage);
  }, [data, page, pageSize]);

  const invalidateAlbums = () => {
    utils.albums.list.invalidate();
    utils.albums.adminList.invalidate();
  };

  const handlePageSizeChange = (size: number) => {
    setPageSize(size);
    setPage(1);
    window.localStorage.setItem(PAGE_SIZE_KEY, String(size));
  };

  const createAlbum = trpc.albums.create.useMutation({
    onSuccess: () => {
      invalidateAlbums();
      setShowCreateModal(false);
      toast.success("Tạo album thành công");
    },
    onError: (e) => toast.error(e.message),
  });

  const updateAlbum = trpc.albums.update.useMutation({
    onSuccess: () => {
      invalidateAlbums();
      setEditingAlbum(null);
      toast.success("Cập nhật album thành công");
    },
    onError: (e) => toast.error(e.message),
  });

  const deleteAlbum = trpc.albums.delete.useMutation({
    onSuccess: () => {
      invalidateAlbums();
      toast.success("Xóa album thành công");
    },
    onError: (e) => toast.error(e.message),
  });

  const publishAlbum = trpc.albums.update.useMutation({
    onSuccess: () => {
      invalidateAlbums();
      toast.success("Đã xuất bản album!");
    },
    onError: (e) => toast.error(e.message),
  });

  const albums = data?.items ?? [];
  const totalPages = data ? Math.max(1, Math.ceil(data.total / pageSize)) : 1;
  const hasFilters = !!(search || statusFilter !== "all" || typeFilter !== "all" || tagFilter);
  const clearFilters = () => {
    setSearch("");
    setDebouncedSearch("");
    setStatusFilter("all");
    setTypeFilter("all");
    setTagFilter("");
    setSortBy("newest");
    setPage(1);
  };

  return (
    <AdminLayout>
      <EntityPage
        shell="full"
        header={{
          icon: ImageIcon,
          title: "Quản lý album",
          subtitle: isLoading ? adminGlossary.loading.page : `${data?.total ?? 0} album`,
          actions: (
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" className="gap-1.5" onClick={() => refetch()} disabled={isFetching}>
                <RefreshCw className={`w-4 h-4 ${isFetching ? "animate-spin" : ""}`} />
                Làm mới
              </Button>
              <Button
                className="bg-primary text-primary-foreground hover:bg-primary/90 gap-2"
                onClick={() => setShowCreateModal(true)}
              >
                <Plus className="w-4 h-4" />
                {adminGlossary.action.createAlbum}
              </Button>
            </div>
          ),
        }}
        toolbar={
          <EntityToolbar
            search={{
              value: search,
              onChange: setSearch,
              placeholder: "Tìm theo tiêu đề, cosplayer, nhân vật...",
            }}
            filters={
              <div className="flex flex-wrap gap-2 items-center">
                <div className="flex gap-1 p-1 bg-secondary/30 rounded-xl">
                  {(["all", "published", "draft", "archived"] as const).map((s) => (
                    <button
                      key={s}
                      onClick={() => { setStatusFilter(s); setPage(1); }}
                      className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors capitalize ${
                        statusFilter === s
                          ? "bg-primary text-primary-foreground shadow-sm"
                          : "text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      {s === "all" ? "Tất cả" : s === "published" ? "Đã xuất bản" : s === "draft" ? "Nháp" : "Lưu trữ"}
                    </button>
                  ))}
                </div>
                <div className="flex gap-1 p-1 bg-secondary/30 rounded-xl">
                  {(["all", "free", "vip"] as const).map((t) => (
                    <button
                      key={t}
                      onClick={() => { setTypeFilter(t); setPage(1); }}
                      className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors capitalize ${
                        typeFilter === t
                          ? "bg-primary text-primary-foreground shadow-sm"
                          : "text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      {t === "vip" ? "VIP" : t === "free" ? "Miễn phí" : "Tất cả"}
                    </button>
                  ))}
                </div>
                <div className="relative">
                  <select
                    value={tagFilter}
                    onChange={(e) => { setTagFilter(e.target.value); setPage(1); }}
                    className="pl-7 pr-3 py-1 rounded-xl text-xs bg-secondary/30 border-0 text-muted-foreground hover:text-foreground focus:outline-none focus:ring-1 focus:ring-primary cursor-pointer appearance-none"
                  >
                    <option value=""># Tất cả tags</option>
                    {allTagsForFilter?.map((t) => (
                      <option key={t.id} value={t.slug || t.name}>{t.name} ({(t as any).albumCount ?? 0})</option>
                    ))}
                  </select>
                  <Hash className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground pointer-events-none" />
                </div>
                {hasFilters && (
                  <button onClick={clearFilters} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
                    <X className="w-3.5 h-3.5" /> Xóa bộ lọc
                  </button>
                )}
                <select
                  value={sortBy}
                  onChange={(e) => { setSortBy(e.target.value as typeof sortBy); setPage(1); }}
                  className="px-3 py-1 rounded-xl text-xs bg-secondary/30 border-0 text-muted-foreground hover:text-foreground focus:outline-none focus:ring-1 focus:ring-primary cursor-pointer"
                >
                  <option value="newest">Mới nhất</option>
                  <option value="oldest">Cũ nhất</option>
                  <option value="popular">Xem nhiều</option>
                  <option value="title">Theo tên</option>
                </select>
              </div>
            }
          />
        }
        pagination={
          data
            ? {
                page,
                totalPages,
                total: data.total,
                pageSize,
                onPageChange: setPage,
                onPageSizeChange: handlePageSizeChange,
                itemLabel: "album",
              }
            : undefined
        }
        isEmpty={!isLoading && albums.length === 0}
        emptyState={{
          icon: ImageIcon,
          title: hasFilters ? adminGlossary.empty.search : "Chưa có album nào",
          action: hasFilters
            ? { label: "Xóa bộ lọc", onClick: clearFilters }
            : { label: adminGlossary.action.createAlbum, onClick: () => setShowCreateModal(true) },
        }}
      >
        <DataTable
            stickyHeader={false}
            columns={[
              {
                id: "album",
                header: "Album",
                cell: (album) => (
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-10 h-10 rounded-lg overflow-hidden bg-muted shrink-0">
                      {album.coverUrl ? (
                        <img src={album.coverUrl} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <ImageIcon className="w-4 h-4 text-muted-foreground/30" />
                        </div>
                      )}
                    </div>
                    <div className="min-w-0">
                      <p className="font-medium text-foreground truncate max-w-[28rem]" title={album.title}>{album.title}</p>
                      <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                        {album.isVip && (
                          <span className="vip-badge flex items-center gap-0.5">
                            <Crown className="w-2 h-2" />VIP
                          </span>
                        )}
                        <span className="text-xs text-muted-foreground truncate max-w-[20rem]">{album.slug}</span>
                      </div>
                    </div>
                  </div>
                ),
              },
              {
                id: "status",
                header: "Trạng thái",
                hideBelow: "md",
                cell: (album) => (
                  <div className="flex flex-col gap-1 items-start">
                    <AdminStatusBadge
                      status={album.status === "published" ? "published" : album.status === "draft" ? "draft" : "cancelled"}
                      label={album.status === "published" ? "Đã xuất bản" : album.status === "draft" ? "Nháp" : "Lưu trữ"}
                    />
                    {(album as any).publishStatus === "processing" && (
                      <AdminStatusBadge status="processing" />
                    )}
                    {(album as any).publishStatus === "ready_for_review" && album.status === "draft" && (
                      <AdminStatusBadge status="ready_for_review" />
                    )}
                  </div>
                ),
              },
              {
                id: "creator",
                header: "Cosplayer",
                hideBelow: "lg",
                cell: (album) => (
                  <span className="text-muted-foreground truncate max-w-[10rem] block" title={(album as any).creatorName || album.cosplayer || ""}>
                    {(album as any).creatorName || album.cosplayer || "—"}
                  </span>
                ),
              },
              {
                id: "photos",
                header: "Ảnh",
                hideBelow: "sm",
                cell: (album) => <span className="text-muted-foreground tabular-nums">{album.photoCount}</span>,
              },
              {
                id: "views",
                header: "Lượt xem",
                hideBelow: "lg",
                cell: (album) => <span className="text-muted-foreground tabular-nums">{album.viewCount.toLocaleString()}</span>,
              },
              {
                id: "updated",
                header: "Cập nhật",
                hideBelow: "lg",
                cell: (album) => (
                  <span className="text-xs text-muted-foreground tabular-nums">
                    {album.updatedAt ? new Date(album.updatedAt).toLocaleDateString("vi-VN") : "—"}
                  </span>
                ),
              },
              {
                id: "zip",
                header: "ZIP",
                hideBelow: "lg",
                cell: (album) =>
                  album.zipKey || album.zipUrl ? (
                    <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-emerald-400/10 text-emerald-400 font-medium">
                      <FileArchive className="w-3 h-3" />
                      ZIP
                    </span>
                  ) : (
                    <span className="text-xs text-muted-foreground/40">—</span>
                  ),
              },
            ]}
            data={albums}
            rowKey={(album) => album.id}
            isLoading={isLoading}
            actionsColumn={(album) => (
              <div className="flex items-center justify-end gap-1">
                {album.status === "draft" && (
                  <button
                    onClick={() => setPublishConfirmAlbum({ id: album.id, title: album.title })}
                    className="p-1.5 rounded-lg hover:bg-green-500/20 text-muted-foreground hover:text-green-400 transition-colors"
                    title="Xuất bản"
                  >
                    <Check className="w-4 h-4" />
                  </button>
                )}
                {album.status === "published" && (
                  <button
                    onClick={() => navigate(`/admin/social?albumId=${album.id}`)}
                    className="p-1.5 rounded-lg hover:bg-primary/20 text-muted-foreground hover:text-primary transition-colors"
                    title="Share Telegram"
                  >
                    <Share2 className="w-4 h-4" />
                  </button>
                )}
                <button
                  onClick={() => navigate(`/admin/albums/${album.id}`)}
                  className="p-1.5 rounded-lg hover:bg-primary/20 text-muted-foreground hover:text-primary transition-colors"
                  title="Sửa ảnh & SEO"
                >
                  <ImageIcon className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setEditingAlbum(album)}
                  className="p-1.5 rounded-lg hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors"
                  title="Chỉnh sửa"
                >
                  <Edit className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setDeleteConfirmAlbum({ id: album.id, title: album.title })}
                  className="p-1.5 rounded-lg hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
                  title="Xóa"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            )}
          />
      </EntityPage>

      {/* Tạo album Modal */}
      <CreateAlbumModal
        open={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        onSubmit={(data) => createAlbum.mutate(data)}
        loading={createAlbum.isPending}
      />

      {/* Chỉnh sửa album Modal */}
      {editingAlbum && (
        <EditAlbumModal
          album={editingAlbum}
          onClose={() => setEditingAlbum(null)}
          onSubmit={(data) => updateAlbum.mutate({ id: editingAlbum.id, ...data })}
          loading={updateAlbum.isPending}
        />
      )}

      {/* Delete Confirm Dialog */}
      <Dialog open={deleteConfirmAlbum !== null} onOpenChange={(v) => !v && setDeleteConfirmAlbum(null)}>
        <DialogContent className="bg-card border-border max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <Trash2 className="w-5 h-5" /> Xác nhận xóa
            </DialogTitle>
            <DialogDescription>
              Xóa album <strong className="text-foreground">{deleteConfirmAlbum?.title}</strong>? Tất cả ảnh trong album sẽ bị xóa vĩnh viễn.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteConfirmAlbum(null)}>Hủy</Button>
            <Button
              variant="destructive"
              disabled={deleteAlbum.isPending}
              onClick={() => deleteConfirmAlbum && deleteAlbum.mutate({ id: deleteConfirmAlbum.id }, { onSuccess: () => setDeleteConfirmAlbum(null) })}
            >
              {deleteAlbum.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Trash2 className="w-4 h-4 mr-2" />}
              Xóa album
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Publish Confirm Dialog */}
      <Dialog open={publishConfirmAlbum !== null} onOpenChange={(v) => !v && setPublishConfirmAlbum(null)}>
        <DialogContent className="bg-card border-border max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-green-400">
              <Check className="w-5 h-5" /> Xuất bản album
            </DialogTitle>
            <DialogDescription>
              Xuất bản <strong className="text-foreground">{publishConfirmAlbum?.title}</strong>? Album sẽ hiển thị công khai cho người dùng.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPublishConfirmAlbum(null)}>Hủy</Button>
            <Button
              className="bg-green-600 hover:bg-green-700 text-white"
              disabled={publishAlbum.isPending}
              onClick={() => publishConfirmAlbum && publishAlbum.mutate({ id: publishConfirmAlbum.id, status: "published" }, { onSuccess: () => setPublishConfirmAlbum(null) })}
            >
              {publishAlbum.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Check className="w-4 h-4 mr-2" />}
              Xuất bản
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </AdminLayout>
  );
}

function CreateAlbumModal({
  open,
  onClose,
  onSubmit,
  loading,
}: {
  open: boolean;
  onClose: () => void;
  onSubmit: (data: any) => void;
  loading: boolean;
}) {
  const { data: cmsSettings } = trpc.cms.getPublicSettings.useQuery();
  const defaultFreePreview = Number(cmsSettings?.["default_free_preview_count"]) || 5;

  const [form, setForm] = useState({
    title: "",
    description: "",
    cosplayer: "",
    character: "",
    series: "",
    isVip: false,
    freePreviewCount: 5,
    status: "published" as "published" | "draft",
  });

  // Sync freePreviewCount default when CMS settings load
  useEffect(() => {
    if (cmsSettings && !form.title) {
      setForm((f) => ({ ...f, freePreviewCount: defaultFreePreview }));
    }
  }, [defaultFreePreview]);

  const { data: categories } = trpc.albums.categories.useQuery();
  const { data: allTags } = trpc.albums.tags.useQuery();
  const [categoryId, setCategoryId] = useState<number | undefined>();
  const [tagInput, setTagInput] = useState("");
  const [selectedTags, setSelectedTags] = useState<string[]>([]);

  function addTag(name: string) {
    const trimmed = name.trim().toLowerCase();
    if (trimmed && !selectedTags.includes(trimmed)) {
      setSelectedTags((prev) => [...prev, trimmed]);
    }
    setTagInput("");
  }

  function removeTag(name: string) {
    setSelectedTags((prev) => prev.filter((t) => t !== name));
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.title.trim()) return;
    onSubmit({ ...form, categoryId, tagNames: selectedTags });
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="bg-card border-border max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Tạo album mới</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label htmlFor="title">Tiêu đề *</Label>
            <Input
              id="title"
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              placeholder="Tiêu đề album"
              className="bg-secondary border-border mt-1"
              required
            />
          </div>
          <div>
            <Label htmlFor="description">Mô tả</Label>
            <textarea
              id="description"
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              placeholder="Mô tả album"
              rows={3}
              className="w-full mt-1 px-3 py-2 rounded-lg bg-secondary border border-border text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary resize-none"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="cosplayer">Cosplayer</Label>
              <Input
                id="cosplayer"
                value={form.cosplayer}
                onChange={(e) => setForm({ ...form, cosplayer: e.target.value })}
                placeholder="Tên cosplayer"
                className="bg-secondary border-border mt-1"
              />
            </div>
            <div>
              <Label htmlFor="character">Nhân vật</Label>
              <Input
                id="character"
                value={form.character}
                onChange={(e) => setForm({ ...form, character: e.target.value })}
                placeholder="Tên nhân vật"
                className="bg-secondary border-border mt-1"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="series">Series / Franchise</Label>
              <Input
                id="series"
                value={form.series}
                onChange={(e) => setForm({ ...form, series: e.target.value })}
                placeholder="Anime, Game, v.v."
                className="bg-secondary border-border mt-1"
              />
            </div>
            <div>
              <Label htmlFor="category">Danh mục</Label>
              <select
                id="category"
                value={categoryId || ""}
                onChange={(e) => setCategoryId(e.target.value ? Number(e.target.value) : undefined)}
                className="w-full mt-1 h-10 px-3 rounded-lg bg-secondary border border-border text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              >
                <option value="">Không có danh mục</option>
                {categories?.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={form.isVip}
                onChange={(e) => setForm({ ...form, isVip: e.target.checked })}
                className="w-4 h-4 rounded border-border"
              />
              <span className="text-sm text-foreground flex items-center gap-1">
                <Crown className="w-3.5 h-3.5 text-primary" />
                VIP Album
              </span>
            </label>
            {form.isVip && (
              <div className="flex items-center gap-2">
                <Label className="text-xs">Xem trước miễn phí:</Label>
                <Input
                  type="number"
                  min={0}
                  max={20}
                  value={form.freePreviewCount}
                  onChange={(e) => setForm({ ...form, freePreviewCount: Number(e.target.value) })}
                  className="w-16 h-8 bg-secondary border-border text-center"
                />
              </div>
            )}
          </div>
          <div>
            <Label>Trạng thái</Label>
            <div className="flex gap-2 mt-1">
              {(["published", "draft"] as const).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setForm({ ...form, status: s })}
                  className={`px-3 py-1.5 rounded-lg text-sm border transition-all ${
                    form.status === s
                      ? "bg-primary/20 border-primary/50 text-primary"
                      : "bg-secondary border-border text-muted-foreground"
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
          {/* Tag picker */}
          <div>
            <Label className="flex items-center gap-1.5 mb-1">
              <Hash className="w-3.5 h-3.5" /> Tags
            </Label>
            <div className="flex flex-wrap gap-1.5 mb-2">
              {selectedTags.map((tag) => (
                <span key={tag} className="flex items-center gap-1 bg-primary/10 text-primary text-xs px-2 py-0.5 rounded-full border border-primary/20">
                  #{tag}
                  <button type="button" onClick={() => removeTag(tag)} className="hover:text-destructive transition-colors">
                    <X className="w-3 h-3" />
                  </button>
                </span>
              ))}
            </div>
            <div className="flex gap-2">
              <input
                type="text"
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === ",") { e.preventDefault(); addTag(tagInput); }
                  if (e.key === "Backspace" && !tagInput && selectedTags.length > 0) {
                    removeTag(selectedTags[selectedTags.length - 1]);
                  }
                }}
                placeholder="Nhập tag rồi Enter..."
                className="flex-1 px-3 py-1.5 rounded-lg bg-secondary border border-border text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                list="create-tag-suggestions"
              />
              <button
                type="button"
                onClick={() => addTag(tagInput)}
                disabled={!tagInput.trim()}
                className="px-3 py-1.5 rounded-lg bg-secondary border border-border text-sm text-muted-foreground hover:text-foreground disabled:opacity-40 transition-colors"
              >
                Thêm
              </button>
            </div>
            <datalist id="create-tag-suggestions">
              {allTags?.filter((t) => !selectedTags.includes(t.name.toLowerCase())).map((t) => (
                <option key={t.id} value={t.name} />
              ))}
            </datalist>
            <p className="text-xs text-muted-foreground mt-1">Nhấn Enter hoặc dấu phẩy để thêm tag. Có thể nhập tag mới hoặc chọn từ danh sách.</p>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={onClose}>Hủy</Button>
            <Button type="submit" disabled={loading} className="bg-primary text-primary-foreground hover:bg-primary/90">
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
              Tạo album
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function EditAlbumModal({
  album,
  onClose,
  onSubmit,
  loading,
}: {
  album: any;
  onClose: () => void;
  onSubmit: (data: any) => void;
  loading: boolean;
}) {
  // Use separate state per field to avoid stale closure / shared-object mutation bugs
  const [title, setTitle] = useState(album.title || "");
  const [description, setDescription] = useState(album.description || "");
  const [cosplayer, setCosplayer] = useState(album.cosplayer || "");
  const [character, setCharacter] = useState(album.character || "");
  const [series, setSeries] = useState(album.series || "");
  const [isVip, setIsVip] = useState<boolean>(album.isVip || false);
  const [freePreviewCount, setFreePreviewCount] = useState<number>(album.freePreviewCount || 5);
  const [status, setStatus] = useState(album.status || "published");
  const [categoryId, setCategoryId] = useState<number | undefined>(album.categoryId || undefined);
  const { data: categories } = trpc.albums.categories.useQuery();
  const { data: allTags } = trpc.albums.tags.useQuery();

  // Fetch full album detail to get accurate tags (adminList doesn't include tags)
  const { data: albumDetail } = trpc.albums.byId.useQuery({ id: album.id });

  // Tags: init from byId detail (accurate) or fallback to album.tags from list
  const [tagInput, setTagInput] = useState("");
  const [selectedTags, setSelectedTags] = useState<string[]>(
    () => (album.tags as Array<{ name: string }> | undefined)?.map((t) => t.name.toLowerCase()) ?? []
  );

  // Sync tags once albumDetail loads (overrides the empty initial state from adminList)
  const [tagsSynced, setTagsSynced] = useState(false);
  useEffect(() => {
    if (albumDetail && !tagsSynced) {
      const tags = (albumDetail as any).tags as Array<{ name: string }> | undefined;
      setSelectedTags(tags?.map((t) => t.name.toLowerCase()) ?? []);
      setTagsSynced(true);
    }
  }, [albumDetail, tagsSynced]);

  function addTag(name: string) {
    const trimmed = name.trim().toLowerCase();
    if (trimmed && !selectedTags.includes(trimmed)) {
      setSelectedTags((prev) => [...prev, trimmed]);
    }
    setTagInput("");
  }

  function removeTag(name: string) {
    setSelectedTags((prev) => prev.filter((t) => t !== name));
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit({ title, description, cosplayer, character, series, isVip, freePreviewCount, status, categoryId, tagNames: selectedTags });
  };

  return (
    <Dialog open={true} onOpenChange={onClose}>
      <DialogContent className="bg-card border-border max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Chỉnh sửa album</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4" autoComplete="off">
          <div>
            <Label htmlFor="edit-title">Tiêu đề</Label>
            <Input
              id="edit-title"
              autoComplete="off"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="bg-secondary border-border mt-1"
            />
          </div>
          <div>
            <Label htmlFor="edit-description">Mô tả</Label>
            <textarea
              id="edit-description"
              autoComplete="off"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              className="w-full mt-1 px-3 py-2 rounded-lg bg-secondary border border-border text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary resize-none"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="edit-cosplayer">Cosplayer</Label>
              <Input
                id="edit-cosplayer"
                autoComplete="off"
                value={cosplayer}
                onChange={(e) => setCosplayer(e.target.value)}
                className="bg-secondary border-border mt-1"
              />
            </div>
            <div>
              <Label htmlFor="edit-character">Nhân vật</Label>
              <Input
                id="edit-character"
                autoComplete="off"
                value={character}
                onChange={(e) => setCharacter(e.target.value)}
                className="bg-secondary border-border mt-1"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="edit-series">Series / Franchise</Label>
              <Input
                id="edit-series"
                autoComplete="off"
                value={series}
                onChange={(e) => setSeries(e.target.value)}
                placeholder="Anime, Game, v.v."
                className="bg-secondary border-border mt-1"
              />
            </div>
            <div>
              <Label htmlFor="edit-category">Danh mục</Label>
              <select
                id="edit-category"
                value={categoryId || ""}
                onChange={(e) => setCategoryId(e.target.value ? Number(e.target.value) : undefined)}
                className="w-full mt-1 h-10 px-3 rounded-lg bg-secondary border border-border text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              >
                <option value="">Không có danh mục</option>
                {categories?.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={isVip}
                onChange={(e) => setIsVip(e.target.checked)}
                className="w-4 h-4"
              />
              <span className="text-sm flex items-center gap-1">
                <Crown className="w-3.5 h-3.5 text-primary" />
                VIP Album
              </span>
            </label>
            {isVip && (
              <div className="flex items-center gap-2">
                <Label className="text-xs">Xem trước miễn phí:</Label>
                <Input
                  type="number"
                  min={0}
                  max={20}
                  value={freePreviewCount}
                  onChange={(e) => setFreePreviewCount(Number(e.target.value))}
                  className="w-16 h-8 bg-secondary border-border text-center"
                />
              </div>
            )}
          </div>
          <div>
            <Label>Trạng thái</Label>
            <div className="flex gap-2 mt-1">
              {(["published", "draft", "archived"] as const).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setStatus(s)}
                  className={`px-3 py-1.5 rounded-lg text-sm border transition-all ${
                    status === s
                      ? "bg-primary/20 border-primary/50 text-primary"
                      : "bg-secondary border-border text-muted-foreground"
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
          {/* Tag picker */}
          <div>
            <Label className="flex items-center gap-1.5 mb-1">
              <Hash className="w-3.5 h-3.5" /> Tags
            </Label>
            <div className="flex flex-wrap gap-1.5 mb-2">
              {selectedTags.map((tag) => (
                <span key={tag} className="flex items-center gap-1 bg-primary/10 text-primary text-xs px-2 py-0.5 rounded-full border border-primary/20">
                  #{tag}
                  <button type="button" onClick={() => removeTag(tag)} className="hover:text-destructive transition-colors">
                    <X className="w-3 h-3" />
                  </button>
                </span>
              ))}
              {selectedTags.length === 0 && (
                <span className="text-xs text-muted-foreground italic">Chưa có tag nào</span>
              )}
            </div>
            <div className="flex gap-2">
              <input
                type="text"
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === ",") { e.preventDefault(); addTag(tagInput); }
                  if (e.key === "Backspace" && !tagInput && selectedTags.length > 0) {
                    removeTag(selectedTags[selectedTags.length - 1]);
                  }
                }}
                placeholder="Nhập tag rồi Enter..."
                className="flex-1 px-3 py-1.5 rounded-lg bg-secondary border border-border text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                list="edit-tag-suggestions"
                autoComplete="off"
              />
              <button
                type="button"
                onClick={() => addTag(tagInput)}
                disabled={!tagInput.trim()}
                className="px-3 py-1.5 rounded-lg bg-secondary border border-border text-sm text-muted-foreground hover:text-foreground disabled:opacity-40 transition-colors"
              >
                Thêm
              </button>
            </div>
            <datalist id="edit-tag-suggestions">
              {allTags?.filter((t) => !selectedTags.includes(t.name.toLowerCase())).map((t) => (
                <option key={t.id} value={t.name} />
              ))}
            </datalist>
            <p className="text-xs text-muted-foreground mt-1">Nhấn Enter hoặc dấu phẩy để thêm tag. Có thể nhập tag mới hoặc chọn từ danh sách.</p>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={onClose}>Hủy</Button>
            <Button type="submit" disabled={loading} className="bg-primary text-primary-foreground hover:bg-primary/90">
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
              Lưu thay đổi
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
