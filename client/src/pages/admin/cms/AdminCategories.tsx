/**
 * Admin CMS — Category Management
 * Full CRUD for categories: name, slug, description, SEO title/description, cover image.
 */
import { trpc } from "@/lib/trpc";
import { EntityPage, DataTable, adminGlossary } from "@/admin";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { useRef, useState } from "react";
import { Edit2, FolderOpen, Loader2, Plus, Save, Trash2, Upload, X } from "lucide-react";
import { cmsDisplayUrl, CMS_MAX_UPLOAD_BYTES, fileToBase64 } from "@/lib/cms-media";
import AdminLayout from "../AdminLayout";

// -- Types ---------------------------------------------------------------------
interface CategoryForm {
  id?: number;
  name: string;
  slug: string;
  description: string;
  coverUrl: string;
  coverKey: string;
  seoTitle: string;
  seoDescription: string;
  sortOrder: number;
}

const emptyForm = (): CategoryForm => ({
  name: "", slug: "", description: "", coverUrl: "", coverKey: "",
  seoTitle: "", seoDescription: "", sortOrder: 0,
});

function slugify(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

// -- Cover upload --------------------------------------------------------------
function CoverUpload({
  currentUrl,
  onUploaded,
}: {
  currentUrl?: string;
  onUploaded: (url: string, key: string) => void;
}) {
  const [uploading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const uploadAsset = trpc.cms.uploadAsset.useMutation();
  const previewUrl = cmsDisplayUrl(currentUrl);

  const handleFile = async (file: File) => {
    setError(null);
    if (file.size > CMS_MAX_UPLOAD_BYTES) {
      const msg = "File quá lớn (tối đa 2MB)";
      setError(msg);
      toast.error(msg);
      return;
    }
    setLoading(true);
    try {
      const fileBase64 = await fileToBase64(file);
      const { publicUrl, key } = await uploadAsset.mutateAsync({
        filename: file.name,
        contentType: file.type || undefined,
        folder: "cms/categories",
        fileBase64,
      });
      if (!publicUrl) throw new Error("Server không trả URL ảnh");
      onUploaded(publicUrl, key);
      toast.success("Đã tải ảnh cover");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Không upload được cover";
      setError(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-2">
      <Label>Cover Image</Label>
      {previewUrl && (
        <div className="w-full h-28 rounded-lg overflow-hidden border border-border bg-secondary">
          <img src={previewUrl} alt="Cover" className="w-full h-full object-cover" />
        </div>
      )}
      {error && <p className="text-xs text-destructive">{error}</p>}
      <Button type="button" variant="outline" size="sm" disabled={uploading} onClick={() => inputRef.current?.click()}>
        {uploading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Upload className="w-4 h-4 mr-2" />}
        {currentUrl ? "Replace" : "Upload Cover"}
      </Button>
      <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])} />
    </div>
  );
}

// -- Category Form (uses LOCAL state to prevent focus loss on re-render) -------
function CategoryFormPanel({
  initialForm,
  onSave,
  onCancel,
  isSaving,
}: {
  initialForm: CategoryForm;
  onSave: (f: CategoryForm) => void;
  onCancel: () => void;
  isSaving: boolean;
}) {
  // Local state — changes here do NOT re-render the parent, so inputs keep focus
  const [form, setForm] = useState<CategoryForm>(initialForm);

  const set = (field: keyof CategoryForm, value: string | number) =>
    setForm((prev) => ({ ...prev, [field]: value }));

  return (
    <div className="bg-card border border-border rounded-xl p-5 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-foreground">{form.id ? "Edit Category" : "New Category"}</h2>
        <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
          <X className="w-4 h-4" />
        </Button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label htmlFor="cat-name">Name *</Label>
          <Input
            id="cat-name"
            value={form.name}
            onChange={(e) => {
              set("name", e.target.value);
              if (!form.id) set("slug", slugify(e.target.value));
            }}
            placeholder="Anime Cosplay"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="cat-slug">Slug *</Label>
          <Input
            id="cat-slug"
            value={form.slug}
            onChange={(e) => set("slug", slugify(e.target.value))}
            placeholder="anime-cosplay"
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="cat-desc">Mô tả</Label>
        <Textarea
          id="cat-desc"
          value={form.description}
          onChange={(e) => set("description", e.target.value)}
          placeholder="Short description in this category"
          rows={2}
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label htmlFor="cat-seo-title">Tiêu đề SEO</Label>
          <Input
            id="cat-seo-title"
            value={form.seoTitle}
            onChange={(e) => set("seoTitle", e.target.value)}
            placeholder="Anime Cosplay Gallery — Yukvix"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="cat-sort">Sort Order</Label>
          <Input
            id="cat-sort"
            type="number"
            value={form.sortOrder}
            onChange={(e) => set("sortOrder", parseInt(e.target.value) || 0)}
            placeholder="0"
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="cat-seo-desc">SEO Description</Label>
        <Textarea
          id="cat-seo-desc"
          value={form.seoDescription}
          onChange={(e) => set("seoDescription", e.target.value)}
          placeholder="Browse the best anime cosplay photos on Yukvix"
          rows={2}
        />
      </div>

      <CoverUpload
        currentUrl={form.coverUrl}
        onUploaded={(url, key) => setForm((prev) => ({ ...prev, coverUrl: url, coverKey: key }))}
      />

      <div className="flex gap-2 pt-1">
        <Button onClick={() => onSave(form)} disabled={isSaving || !form.name || !form.slug}>
          {isSaving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Save className="w-4 h-4 mr-2" />}
          {form.id ? "Update" : "Create"} Category
        </Button>
        <Button type="button" variant="outline" onClick={onCancel}>Hủy</Button>
      </div>
    </div>
  );
}

// -- Main Component ------------------------------------------------------------
export default function AdminCategories() {
  const utils = trpc.useUtils();
  const { data: categories, isLoading } = trpc.cms.listCategories.useQuery();
  const saveCategory = trpc.cms.saveCategory.useMutation({
    onSuccess: () => {
      toast.success("Category saved");
      utils.cms.listCategories.invalidate();
      setEditingForm(null);
    },
    onError: () => toast.error("Failed to save category"),
  });
  const deleteCategory = trpc.cms.deleteCategory.useMutation({
    onSuccess: () => {
      toast.success("Category deleted");
      utils.cms.listCategories.invalidate();
    },
    onError: () => toast.error("Failed to delete category"),
  });

  // editingForm = null means form is hidden; non-null means form is open
  const [editingForm, setEditingForm] = useState<CategoryForm | null>(null);

  const handleSave = (form: CategoryForm) => {
    saveCategory.mutate({
      id: form.id,
      name: form.name,
      slug: form.slug,
      description: form.description || undefined,
      coverUrl: form.coverUrl || undefined,
      coverKey: form.coverKey || undefined,
      seoTitle: form.seoTitle || undefined,
      seoDescription: form.seoDescription || undefined,
      sortOrder: form.sortOrder,
    });
  };

  const cats = categories ?? [];

  const editBanner = editingForm ? (
    <div className="mb-5">
      <CategoryFormPanel
        initialForm={editingForm}
        onSave={handleSave}
        onCancel={() => setEditingForm(null)}
        isSaving={saveCategory.isPending}
      />
    </div>
  ) : undefined;

  return (
    <AdminLayout>
      <EntityPage
        shell="full"
        header={{
          icon: FolderOpen,
          title: "Danh mục",
          subtitle: isLoading ? adminGlossary.loading.page : `${cats.length} danh mục`,
          actions: !editingForm ? (
            <Button onClick={() => setEditingForm(emptyForm())}>
              <Plus className="w-4 h-4 mr-2" /> Tạo danh mục
            </Button>
          ) : undefined,
        }}
        banner={editBanner}
        isEmpty={!isLoading && cats.length === 0 && !editingForm}
        emptyState={{
          icon: FolderOpen,
          title: "Chưa có danh mục nào",
          action: { label: "Tạo danh mục", onClick: () => setEditingForm(emptyForm()) },
        }}
      >
        <DataTable
          columns={[
            {
              id: "cover",
              header: "Ảnh bìa",
              cell: (cat) =>
                cat.coverUrl ? (
                  <img src={cat.coverUrl} alt={cat.name} className="w-12 h-12 rounded-lg object-cover" />
                ) : (
                  <div className="w-12 h-12 rounded-lg bg-secondary flex items-center justify-center">
                    <FolderOpen className="w-5 h-5 text-muted-foreground/40" />
                  </div>
                ),
            },
            {
              id: "name",
              header: "Tên",
              cell: (cat) => (
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground">{cat.name}</p>
                  <p className="text-xs text-muted-foreground">/{cat.slug}</p>
                  {cat.description && (
                    <p className="text-xs text-muted-foreground/70 truncate mt-0.5">{cat.description}</p>
                  )}
                </div>
              ),
            },
            {
              id: "sort",
              header: "Thứ tự",
              hideBelow: "sm",
              cell: (cat) => <span className="text-muted-foreground tabular-nums">{cat.sortOrder}</span>,
            },
          ]}
          data={cats}
          rowKey={(cat) => cat.id}
          isLoading={isLoading}
          actionsColumn={(cat) => (
            <div className="flex gap-1 justify-end">
              <Button
                variant="ghost"
                size="sm"
                onClick={() =>
                  setEditingForm({
                    id: cat.id,
                    name: cat.name,
                    slug: cat.slug,
                    description: cat.description ?? "",
                    coverUrl: cat.coverUrl ?? "",
                    coverKey: cat.coverKey ?? "",
                    seoTitle: cat.seoTitle ?? "",
                    seoDescription: cat.seoDescription ?? "",
                    sortOrder: cat.sortOrder,
                  })
                }
              >
                <Edit2 className="w-4 h-4" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  if (confirm(`Xóa "${cat.name}"?`)) deleteCategory.mutate({ id: cat.id });
                }}
              >
                <Trash2 className="w-4 h-4 text-destructive" />
              </Button>
            </div>
          )}
        />
      </EntityPage>
    </AdminLayout>
  );
}
