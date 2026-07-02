import AdminLayout from "./AdminLayout";
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
import { useState } from "react";
import { toast } from "sonner";
import { Tag, Pencil, Trash2, Merge, Plus, Search, Loader2, AlertTriangle, X } from "lucide-react";

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

export default function AdminTags() {
  const utils = trpc.useUtils();
  const [search, setSearch] = useState("");
  const [editTag, setEditTag] = useState<TagWithCount | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [showMerge, setShowMerge] = useState(false);
  const [mergeSource, setMergeSource] = useState<TagWithCount | null>(null);
  const [mergeTargetId, setMergeTargetId] = useState<string>("");
  const [deleteConfirmId, setDeleteConfirmId] = useState<number | null>(null);

  const [form, setForm] = useState({ name: "", slug: "", seoTitle: "", seoDescription: "" });

  const { data: tags = [], isLoading } = trpc.tags.adminList.useQuery();

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

  const filtered = tags.filter(
    (t) =>
      t.name.toLowerCase().includes(search.toLowerCase()) ||
      t.slug.toLowerCase().includes(search.toLowerCase())
  );

  function openEdit(tag: TagWithCount) {
    setEditTag(tag);
    setForm({ name: tag.name, slug: tag.slug, seoTitle: tag.seoTitle || "", seoDescription: tag.seoDescription || "" });
  }

  const deleteTarget = tags.find((t) => t.id === deleteConfirmId);

  return (
    <AdminLayout>
      <div className="p-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-foreground flex items-center gap-2" style={{ fontFamily: "'Playfair Display', serif" }}>
              <Tag className="w-6 h-6 text-primary" /> Quản lý thẻ tag
            </h1>
            <p className="text-muted-foreground text-sm mt-1">
              {isLoading ? "Đang tải..." : `${tags.length} thẻ tag`}
            </p>
          </div>
          <Button
            onClick={() => { setShowCreate(true); setForm({ name: "", slug: "", seoTitle: "", seoDescription: "" }); }}
            className="bg-primary text-primary-foreground hover:bg-primary/90 gap-2"
          >
            <Plus className="w-4 h-4" /> Tạo thẻ tag
          </Button>
        </div>

        {/* Search */}
        <div className="relative mb-4">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Tìm thẻ tag theo tên hoặc slug..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 pr-9"
          />
          {search && (
            <button
              onClick={() => setSearch("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Table */}
        <div className="rounded-xl border border-border/50 overflow-hidden bg-card">
          {isLoading ? (
            <div className="p-6 space-y-2">
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="h-10 skeleton rounded" />
              ))}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border/50 bg-secondary/30">
                    <th className="text-left px-4 py-3 text-muted-foreground font-medium">Tên</th>
                    <th className="text-left px-4 py-3 text-muted-foreground font-medium hidden sm:table-cell">Slug</th>
                    <th className="text-left px-4 py-3 text-muted-foreground font-medium">Albums</th>
                    <th className="text-left px-4 py-3 text-muted-foreground font-medium hidden md:table-cell">SEO</th>
                    <th className="text-right px-4 py-3 text-muted-foreground font-medium">Hành động</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((tag) => (
                    <tr key={tag.id} className="border-b border-border/30 hover:bg-secondary/20 transition-colors">
                      <td className="px-4 py-3 font-medium text-foreground">
                        <span className="text-primary">#</span>{tag.name}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground hidden sm:table-cell font-mono text-xs">
                        {tag.slug}
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant="secondary" className="tabular-nums">{tag.albumCount}</Badge>
                      </td>
                      <td className="px-4 py-3 hidden md:table-cell">
                        {tag.seoTitle ? (
                          <Badge variant="outline" className="text-xs text-emerald-400 border-emerald-400/30">SEO</Badge>
                        ) : (
                          <span className="text-muted-foreground text-xs">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
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
                      </td>
                    </tr>
                  ))}
                  {filtered.length === 0 && (
                    <tr>
                      <td colSpan={5} className="px-4 py-12 text-center">
                        <Tag className="w-8 h-8 text-muted-foreground/30 mx-auto mb-2" />
                        <p className="text-muted-foreground text-sm">
                          {search ? "Không tìm thấy thẻ tag phù hợp" : "Chưa có thẻ tag nào"}
                        </p>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>

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
                  {tags
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
      </div>
    </AdminLayout>
  );
}
