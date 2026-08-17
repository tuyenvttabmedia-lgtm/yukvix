import AdminLayout from "./AdminLayout";
import {
  EntityPage,
  EntityToolbar,
  DataTable,
  AdminStatusBadge,
  adminGlossary,
} from "@/admin";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { trpc } from "@/lib/trpc";
import { useState, useEffect } from "react";
import { toast } from "sonner";
import { Tag, Pencil, Trash2, Merge, Plus, Loader2, AlertTriangle, Sparkles } from "lucide-react";

type TagWithCount = {
  id: number;
  name: string;
  slug: string;
  seoTitle: string | null;
  seoDescription: string | null;
  createdAt: Date;
  albumCount: number;
};

function slugify(text: string) {
  return text.toLowerCase().replace(/[^\w\s-]/g, "").replace(/\s+/g, "-").replace(/-+/g, "-").trim();
}

const PAGE_SIZE = 30;

export default function AdminTags() {
  const utils = trpc.useUtils();
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [page, setPage] = useState(1);
  const [editTag, setEditTag] = useState<TagWithCount | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [showMerge, setShowMerge] = useState(false);
  const [mergeSource, setMergeSource] = useState<TagWithCount | null>(null);
  const [mergeTargetId, setMergeTargetId] = useState<string>("");
  const [deleteConfirmId, setDeleteConfirmId] = useState<number | null>(null);

  const [form, setForm] = useState({ name: "", slug: "", seoTitle: "", seoDescription: "" });

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch]);

  const { data, isLoading } = trpc.tags.adminList.useQuery({
    page,
    limit: PAGE_SIZE,
    search: debouncedSearch || undefined,
    sortBy: "popular",
  });
  const tags: TagWithCount[] = data?.items ?? [];
  const totalPages = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1;

  const { data: mergeTargetsData } = trpc.tags.adminList.useQuery(
    { page: 1, limit: 100, sortBy: "name" },
    { enabled: showMerge }
  );
  const mergeTargets = mergeTargetsData?.items ?? [];
  const { data: tagSeoAudit, refetch: refetchTagSeoAudit } = trpc.seo.getTagSeoAudit.useQuery();
  const { data: tagSeoJob, refetch: refetchTagSeoJob } = trpc.seo.getTagSeoBulkStatus.useQuery(undefined, {
    refetchInterval: (q) => (q.state.data && !q.state.data.finished ? 2000 : false),
  });
  const startTagSeoBulk = trpc.seo.startTagSeoBulk.useMutation({
    onSuccess: (res) => {
      refetchTagSeoAudit();
      refetchTagSeoJob();
      toast.success(res.message || "Started tag SEO bulk job");
    },
    onError: (e) => toast.error(e.message),
  });
  const cancelTagSeoBulk = trpc.seo.cancelTagSeoBulk.useMutation({
    onSuccess: () => {
      refetchTagSeoJob();
      toast.success("Cancelled tag SEO bulk job");
    },
  });



  const createMutation = trpc.tags.adminCreate.useMutation({
    onSuccess: () => {
      utils.tags.adminList.invalidate();
      setShowCreate(false);
      setForm({ name: "", slug: "", seoTitle: "", seoDescription: "" });
      toast.success("Tạo thẻ tag thành công");
    },
    onError: (e) => toast.error(e.message),
  });

  const updateMutation = trpc.tags.adminUpdate.useMutation({
    onSuccess: () => {
      utils.tags.adminList.invalidate();
      setEditTag(null);
      toast.success("Cập nhật thẻ tag thành công");
    },
    onError: (e) => toast.error(e.message),
  });

  const deleteMutation = trpc.tags.adminDelete.useMutation({
    onSuccess: () => {
      utils.tags.adminList.invalidate();
      setDeleteConfirmId(null);
      toast.success("Đã xóa thẻ tag");
    },
    onError: (e) => toast.error(e.message),
  });

  const mergeMutation = trpc.tags.adminMerge.useMutation({
    onSuccess: () => {
      utils.tags.adminList.invalidate();
      setShowMerge(false);
      setMergeSource(null);
      setMergeTargetId("");
      toast.success("Đã gộp thẻ tag thành công");
    },
    onError: (e) => toast.error(e.message),
  });

  function openEdit(tag: TagWithCount) {
    setEditTag(tag);
    setForm({ name: tag.name, slug: tag.slug, seoTitle: tag.seoTitle || "", seoDescription: tag.seoDescription || "" });
  }

  const deleteTarget = tags.find((t) => t.id === deleteConfirmId) ?? null;

  const tagSeoBanner = (
        <div className="mb-6 rounded-lg border border-border bg-card/40 p-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <h2 className="font-semibold text-foreground flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-primary" /> Tag SEO (Bulk AI)
              </h2>
              <p className="text-sm text-muted-foreground mt-1">
                {tagSeoAudit
                  ? `${tagSeoAudit.missingAny} / ${tagSeoAudit.total} tags missing SEO title or description (intro).`
                  : "Audit loading..."}
              </p>
              {tagSeoJob && !tagSeoJob.finished && (
                <p className="text-xs text-amber-500 mt-1">
                  Running: {tagSeoJob.done}/{tagSeoJob.total} done, {tagSeoJob.failed} failed
                </p>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={startTagSeoBulk.isPending || (tagSeoJob && !tagSeoJob.finished)}
                onClick={() => startTagSeoBulk.mutate({ forceAll: false })}
              >
                Generate missing SEO
              </Button>
              <Button
                variant="ghost"
                size="sm"
                disabled={startTagSeoBulk.isPending || (tagSeoJob && !tagSeoJob.finished)}
                onClick={() => startTagSeoBulk.mutate({ forceAll: true })}
              >
                Regenerate all
              </Button>
              {tagSeoJob && !tagSeoJob.finished && (
                <Button variant="destructive" size="sm" onClick={() => cancelTagSeoBulk.mutate()}>
                  Cancel
                </Button>
              )}
            </div>
          </div>
        </div>
  );

  return (
    <AdminLayout>
      <EntityPage
        shell="full"
        header={{
          icon: Tag,
          title: "Quản lý thẻ tag",
          subtitle: isLoading ? adminGlossary.loading.page : `${data?.total ?? 0} thẻ tag`,
          actions: (
            <Button
              onClick={() => { setShowCreate(true); setForm({ name: "", slug: "", seoTitle: "", seoDescription: "" }); }}
              className="bg-primary text-primary-foreground hover:bg-primary/90 gap-2"
            >
              <Plus className="w-4 h-4" /> {adminGlossary.action.createTag}
            </Button>
          ),
        }}
        banner={tagSeoBanner}
        toolbar={
          <EntityToolbar
            search={{
              value: search,
              onChange: setSearch,
              placeholder: "Tìm thẻ tag theo tên hoặc slug...",
            }}
          />
        }
        pagination={
          data && data.total > PAGE_SIZE
            ? { page, totalPages, total: data.total, onPageChange: setPage, itemLabel: "thẻ tag" }
            : undefined
        }
        isEmpty={!isLoading && tags.length === 0}
        emptyState={{
          icon: Tag,
          title: debouncedSearch ? adminGlossary.empty.search : "Chưa có thẻ tag nào",
          action: !debouncedSearch
            ? {
                label: adminGlossary.action.createTag,
                onClick: () => {
                  setShowCreate(true);
                  setForm({ name: "", slug: "", seoTitle: "", seoDescription: "" });
                },
              }
            : undefined,
        }}
      >
        <div className="rounded-xl border border-border/50 overflow-hidden bg-card">
          <DataTable
            columns={[
              {
                id: "name",
                header: "Tên",
                cell: (tag) => (
                  <span className="font-medium text-foreground">
                    <span className="text-primary">#</span>
                    {tag.name}
                  </span>
                ),
              },
              {
                id: "slug",
                header: "Slug",
                hideBelow: "sm",
                cell: (tag) => (
                  <span className="text-muted-foreground font-mono text-xs">{tag.slug}</span>
                ),
              },
              {
                id: "albums",
                header: "Albums",
                cell: (tag) => (
                  <Badge variant="secondary" className="tabular-nums">{tag.albumCount}</Badge>
                ),
              },
              {
                id: "seo",
                header: "SEO",
                hideBelow: "md",
                cell: (tag) =>
                  tag.seoTitle ? (
                    <AdminStatusBadge status="completed" label="SEO" size="sm" />
                  ) : (
                    <span className="text-muted-foreground text-xs">—</span>
                  ),
              },
            ]}
            data={tags}
            rowKey={(tag) => tag.id}
            isLoading={isLoading}
            actionsColumn={(tag) => (
              <div className="flex items-center justify-end gap-1">
                <button
                  onClick={() => openEdit(tag)}
                  className="p-1.5 rounded-lg hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors"
                  title="Chỉnh sửa"
                >
                  <Pencil className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => { setMergeSource(tag); setShowMerge(true); }}
                  className="p-1.5 rounded-lg hover:bg-blue-400/10 text-muted-foreground hover:text-blue-400 transition-colors"
                  title="Gộp thẻ tag"
                >
                  <Merge className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => setDeleteConfirmId(tag.id)}
                  className="p-1.5 rounded-lg hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
                  title="Xóa"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
          />
        </div>
      </EntityPage>

        {/* Create Dialog */}
        <Dialog open={showCreate} onOpenChange={setShowCreate}>
          <DialogContent className="bg-card border-border max-w-lg">
            <DialogHeader>
              <DialogTitle>Tạo thẻ tag mới</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>Tên *</Label>
                <Input
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value, slug: slugify(e.target.value) }))}
                  placeholder="Ví dụ: Genshin Impact"
                  className="mt-1"
                />
              </div>
              <div>
                <Label>Slug</Label>
                <Input
                  value={form.slug}
                  onChange={(e) => setForm((f) => ({ ...f, slug: e.target.value }))}
                  placeholder="genshin-impact"
                  className="mt-1 font-mono text-sm"
                />
              </div>
              <div>
                <Label>Tiêu đề SEO</Label>
                <Input
                  value={form.seoTitle}
                  onChange={(e) => setForm((f) => ({ ...f, seoTitle: e.target.value }))}
                  className="mt-1"
                />
              </div>
              <div>
                <Label>Mô tả SEO</Label>
                <Textarea
                  value={form.seoDescription}
                  onChange={(e) => setForm((f) => ({ ...f, seoDescription: e.target.value }))}
                  rows={3}
                  className="mt-1 resize-none"
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowCreate(false)}>Hủy</Button>
              <Button
                onClick={() => createMutation.mutate({
                  name: form.name,
                  slug: form.slug || undefined,
                  seoTitle: form.seoTitle || undefined,
                  seoDescription: form.seoDescription || undefined,
                })}
                disabled={!form.name || createMutation.isPending}
                className="bg-primary text-primary-foreground hover:bg-primary/90"
              >
                {createMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Plus className="w-4 h-4 mr-2" />}
                Tạo thẻ tag
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Edit Dialog */}
        <Dialog open={!!editTag} onOpenChange={(v) => !v && setEditTag(null)}>
          <DialogContent className="bg-card border-border max-w-lg">
            <DialogHeader>
              <DialogTitle>Chỉnh sửa: #{editTag?.name}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>Tên *</Label>
                <Input
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  className="mt-1"
                />
              </div>
              <div>
                <Label>Slug</Label>
                <Input
                  value={form.slug}
                  onChange={(e) => setForm((f) => ({ ...f, slug: e.target.value }))}
                  className="mt-1 font-mono text-sm"
                />
              </div>
              <div>
                <Label>Tiêu đề SEO</Label>
                <Input
                  value={form.seoTitle}
                  onChange={(e) => setForm((f) => ({ ...f, seoTitle: e.target.value }))}
                  className="mt-1"
                />
              </div>
              <div>
                <Label>Mô tả SEO</Label>
                <Textarea
                  value={form.seoDescription}
                  onChange={(e) => setForm((f) => ({ ...f, seoDescription: e.target.value }))}
                  rows={3}
                  className="mt-1 resize-none"
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setEditTag(null)}>Hủy</Button>
              <Button
                onClick={() =>
                  editTag &&
                  updateMutation.mutate({
                    id: editTag.id,
                    name: form.name,
                    slug: form.slug || undefined,
                    seoTitle: form.seoTitle || undefined,
                    seoDescription: form.seoDescription || undefined,
                  })
                }
                disabled={updateMutation.isPending}
                className="bg-primary text-primary-foreground hover:bg-primary/90"
              >
                {updateMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                Lưu thay đổi
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Merge Dialog */}
        <Dialog
          open={showMerge}
          onOpenChange={(v) => { if (!v) { setShowMerge(false); setMergeSource(null); setMergeTargetId(""); } }}
        >
          <DialogContent className="bg-card border-border max-w-md">
            <DialogHeader>
              <DialogTitle>Gộp thẻ tag</DialogTitle>
              <DialogDescription>
                Gộp <strong className="text-foreground">#{mergeSource?.name}</strong> vào thẻ tag khác. Tất cả album sẽ được gắn lại thẻ mới và thẻ nguồn sẽ bị xóa.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              <Label>Gộp vào</Label>
              <Select value={mergeTargetId} onValueChange={setMergeTargetId}>
                <SelectTrigger>
                  <SelectValue placeholder="Chọn thẻ tag đích..." />
                </SelectTrigger>
                <SelectContent>
                  {mergeTargets
                    .filter((t) => t.id !== mergeSource?.id)
                    .map((t) => (
                      <SelectItem key={t.id} value={String(t.id)}>
                        #{t.name} ({t.albumCount} album)
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => { setShowMerge(false); setMergeSource(null); setMergeTargetId(""); }}>
                Hủy
              </Button>
              <Button
                variant="destructive"
                disabled={!mergeTargetId || mergeMutation.isPending}
                onClick={() =>
                  mergeSource &&
                  mergeTargetId &&
                  mergeMutation.mutate({ sourceId: mergeSource.id, targetId: Number(mergeTargetId) })
                }
              >
                {mergeMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Merge className="w-4 h-4 mr-2" />}
                Gộp và xóa thẻ nguồn
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Delete Confirm Dialog */}
        <Dialog open={deleteConfirmId !== null} onOpenChange={(v) => !v && setDeleteConfirmId(null)}>
          <DialogContent className="bg-card border-border max-w-sm">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-destructive">
                <AlertTriangle className="w-5 h-5" />
                Xác nhận xóa
              </DialogTitle>
              <DialogDescription>
                Xóa thẻ tag <strong className="text-foreground">#{deleteTarget?.name}</strong>? Thẻ tag sẽ bị gỡ khỏi tất cả album. Hành động này không thể hoàn tác.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDeleteConfirmId(null)}>Hủy</Button>
              <Button
                variant="destructive"
                disabled={deleteMutation.isPending}
                onClick={() => deleteConfirmId !== null && deleteMutation.mutate({ id: deleteConfirmId })}
              >
                {deleteMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Trash2 className="w-4 h-4 mr-2" />}
                Xóa thẻ tag
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
    </AdminLayout>
  );
}
