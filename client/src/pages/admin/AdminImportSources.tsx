import { useState } from "react";
import { Link } from "wouter";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Plus, Edit, Trash2, Globe, Loader2, FlaskConical } from "lucide-react";
import AdminLayout from "./AdminLayout";

interface CategoryMapping {
  url: string;
  categoryId?: number;
}

interface TitleCleanupRule {
  find: string;
  replace: string;
}

interface SourceFormData {
  siteName: string;
  baseUrl: string;
  titleSelector: string;
  imageSelector: string;
  nextPageSelector: string;
  tagSelector: string;
  creatorSelector: string;
  publishDateSelector: string;
  paginationType: "next_page" | "numbered" | "infinite_scroll" | "none";
  pageUrlPattern: string;
  contentAreaSelector: string;
  requiresBrowser: boolean;
  userAgent: string;
  cookieString: string;
  crawlDelayMs: number;
  maxPages: number;
  keywordFilter: string;
  creatorFilter: string;
  enabled: boolean;
  publishMode: "draft" | "published";
  defaultVip: boolean;
  // null = use Album Defaults; number = override for this source
  freePreviewCount: number | null;
  autoSchedule: boolean;
  scheduleIntervalHours: number;
  // categoryUrls stored as JSON array trong {url, categoryId?} internally, but UI uses categoryMappings
  categoryMappings: CategoryMapping[];
  titleCleanupRules: TitleCleanupRule[];
}

const DEFAULT_FORM: SourceFormData = {
  siteName: "",
  baseUrl: "",
  titleSelector: "",
  imageSelector: "",
  nextPageSelector: "",
  tagSelector: "",
  creatorSelector: "",
  publishDateSelector: "",
  paginationType: "next_page",
  pageUrlPattern: "",
  contentAreaSelector: "",
  requiresBrowser: false,
  userAgent: "",
  cookieString: "",
  crawlDelayMs: 1500,
  maxPages: 50,
  keywordFilter: "",
  creatorFilter: "",
  enabled: true,
  publishMode: "draft",
  defaultVip: false,
  freePreviewCount: null,
  autoSchedule: false,
  scheduleIntervalHours: 6,
  categoryMappings: [{ url: "", categoryId: undefined }],
  titleCleanupRules: [],
};

/** Parse categoryUrls string (JSON or plain text) into CategoryMapping[] */
function parseCategoryUrls(raw: string | null | undefined): CategoryMapping[] {
  if (!raw) return [{ url: "", categoryId: undefined }];
  const trimmed = raw.trim();
  if (trimmed.startsWith("[")) {
    try {
      const parsed = JSON.parse(trimmed) as Array<{ url: string; categoryId?: number }>;
      const result = parsed.map((e) => ({ url: e.url || "", categoryId: e.categoryId }));
      return result.length > 0 ? result : [{ url: "", categoryId: undefined }];
    } catch {}
  }
  // Legacy plain text
  const lines = trimmed.split(/[\n,]+/).map((u) => u.trim()).filter(Boolean);
  return lines.length > 0 ? lines.map((url) => ({ url, categoryId: undefined })) : [{ url: "", categoryId: undefined }];
}

/** Serialize CategoryMapping[] to JSON string for storage */
function serializeCategoryUrls(mappings: CategoryMapping[]): string | undefined {
  const valid = mappings.filter((m) => m.url.trim());
  if (valid.length === 0) return undefined;
  return JSON.stringify(valid.map((m) => ({ url: m.url.trim(), ...(m.categoryId ? { categoryId: m.categoryId } : {}) })));
}

function SourceForm({
  form,
  onChange,
  categories,
}: {
  form: SourceFormData;
  onChange: (f: SourceFormData) => void;
  categories: Array<{ id: number; name: string }>;
}) {
  const set = (key: keyof SourceFormData, value: any) => onChange({ ...form, [key]: value });

  return (
    <div className="space-y-4 max-h-[70vh] overflow-y-auto pr-1">
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label className="text-slate-300 text-xs">Site Name *</Label>
          <Input value={form.siteName} onChange={(e) => set("siteName", e.target.value)} className="bg-slate-900 border-slate-600 text-white h-8 text-sm" placeholder="Everia Club" />
        </div>
        <div className="space-y-1">
          <Label className="text-slate-300 text-xs">Base URL *</Label>
          <Input value={form.baseUrl} onChange={(e) => set("baseUrl", e.target.value)} className="bg-slate-900 border-slate-600 text-white h-8 text-sm" placeholder="https://everia.club" />
        </div>
      </div>

      <div className="border-t border-slate-700 pt-3">
        <p className="text-slate-400 text-xs mb-2 font-medium uppercase tracking-wide">CSS Selectors</p>
        <div className="grid grid-cols-2 gap-3">
          {[
            { key: "titleSelector", label: "Title", placeholder: "h1.entry-title" },
            { key: "imageSelector", label: "Images", placeholder: ".entry-content img" },
            ...(form.paginationType !== "numbered" ? [{ key: "nextPageSelector", label: "Next Page", placeholder: "a.next" }] : []),
            { key: "tagSelector", label: "Tags", placeholder: ".tags a" },
            { key: "creatorSelector", label: "Creator", placeholder: ".author-name" },
            { key: "publishDateSelector", label: "Publish Date", placeholder: "time.published" },
          ].map(({ key, label, placeholder }) => (
            <div key={key} className="space-y-1">
              <Label className="text-slate-300 text-xs">{label}</Label>
              <Input
                value={(form as any)[key]}
                onChange={(e) => set(key as keyof SourceFormData, e.target.value)}
                className="bg-slate-900 border-slate-600 text-white h-8 text-sm font-mono"
                placeholder={placeholder}
              />
            </div>
          ))}
        </div>

        {/* Content Area Selector — full width */}
        <div className="mt-3 space-y-1">
          <Label className="text-slate-300 text-xs">
            Content Area Selector{" "}
            <span className="text-slate-500 font-normal">(limit images to main content, prevent sidebar/related picks)</span>
          </Label>
          <Input
            value={form.contentAreaSelector}
            onChange={(e) => set("contentAreaSelector", e.target.value)}
            className="bg-slate-900 border-slate-600 text-white h-8 text-sm font-mono"
            placeholder=".entry-content, .post-content, article.post"
          />
        </div>
      </div>

      <div className="border-t border-slate-700 pt-3">
        <p className="text-slate-400 text-xs mb-2 font-medium uppercase tracking-wide">Crawl Settings</p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="space-y-1">
            <Label className="text-slate-300 text-xs">Pagination</Label>
            <Select value={form.paginationType} onValueChange={(v) => set("paginationType", v)}>
              <SelectTrigger className="bg-slate-900 border-slate-600 text-white h-8 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="next_page">Next Page Link</SelectItem>
                <SelectItem value="numbered">Numbered Trangs</SelectItem>
                <SelectItem value="infinite_scroll">Infinite Scroll</SelectItem>
                <SelectItem value="none">Single Trang</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-slate-300 text-xs">Delay (ms)</Label>
            <Input type="number" value={form.crawlDelayMs} onChange={(e) => set("crawlDelayMs", parseInt(e.target.value) || 0)} className="bg-slate-900 border-slate-600 text-white h-8 text-sm" />
          </div>
          <div className="space-y-1">
            <Label className="text-slate-300 text-xs">Max Trangs</Label>
            <Input type="number" value={form.maxPages} onChange={(e) => set("maxPages", parseInt(e.target.value) || 1)} className="bg-slate-900 border-slate-600 text-white h-8 text-sm" />
          </div>
        </div>

        {/* Trang URL Pattern — shown when numbered pagination selected */}
        {form.paginationType === "numbered" && (
          <div className="mt-3 space-y-1">
            <Label className="text-slate-300 text-xs">
              Trang URL Pattern{" "}
              <span className="text-slate-500 font-normal">(use [url] and [page] as placeholders)</span>
            </Label>
            <Input
              value={form.pageUrlPattern}
              onChange={(e) => set("pageUrlPattern", e.target.value)}
              className="bg-slate-900 border-slate-600 text-white h-8 text-sm font-mono"
              placeholder="[url]/[page]/"
            />
            <p className="text-slate-500 text-xs">
              Examples: <code className="text-violet-400">[url]/[page]/</code> → post/2/, post/3/ &nbsp;|&nbsp;
              <code className="text-violet-400">[url]/page/[page]/</code> → post/page/2/
            </p>
          </div>
        )}

        <div className="flex items-center gap-2 mt-3">
          <Switch checked={form.requiresBrowser} onCheckedChange={(v) => set("requiresBrowser", v)} />
          <Label className="text-slate-300 text-sm">Requires Browser (JS rendering)</Label>
        </div>
      </div>

      <div className="border-t border-slate-700 pt-3">
        <p className="text-slate-400 text-xs mb-2 font-medium uppercase tracking-wide">Filters</p>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label className="text-slate-300 text-xs">Keyword Filter</Label>
            <Input value={form.keywordFilter} onChange={(e) => set("keywordFilter", e.target.value)} className="bg-slate-900 border-slate-600 text-white h-8 text-sm" placeholder="cosplay" />
          </div>
          <div className="space-y-1">
            <Label className="text-slate-300 text-xs">Creator Filter</Label>
            <Input value={form.creatorFilter} onChange={(e) => set("creatorFilter", e.target.value)} className="bg-slate-900 border-slate-600 text-white h-8 text-sm" placeholder="model name" />
          </div>
        </div>
      </div>

      <div className="border-t border-slate-700 pt-3">
        <p className="text-slate-400 text-xs mb-2 font-medium uppercase tracking-wide">Publish Settings</p>
        <div className="grid grid-cols-2 gap-3 mb-3">
          <div className="space-y-1">
            <Label className="text-slate-300 text-xs">Publish Mode</Label>
            <Select value={form.publishMode} onValueChange={(v) => set("publishMode", v)}>
              <SelectTrigger className="bg-slate-900 border-slate-600 text-white h-8 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="draft">Draft (review before publish)</SelectItem>
                <SelectItem value="published">Auto-publish</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-slate-300 text-xs">Schedule Interval (hours)</Label>
            <Input type="number" min={1} max={168} value={form.scheduleIntervalHours} onChange={(e) => set("scheduleIntervalHours", parseInt(e.target.value) || 6)} className="bg-slate-900 border-slate-600 text-white h-8 text-sm" disabled={!form.autoSchedule} />
          </div>
        </div>
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Switch checked={form.autoSchedule} onCheckedChange={(v) => set("autoSchedule", v)} />
            <Label className="text-slate-300 text-sm">Auto-schedule crawl</Label>
          </div>
          <div className="flex items-center gap-2">
            <Switch checked={form.defaultVip} onCheckedChange={(v) => set("defaultVip", v)} />
            <div>
              <Label className="text-slate-300 text-sm">Album VIP mặc định</Label>
              <p className="text-slate-500 text-xs">Album được tạo từ nguồn này sẽ tự động đánh dấu VIP</p>
            </div>
          </div>
        </div>

        {/* Free Preview Count */}
        <div className="mt-3 space-y-1">
          <Label className="text-slate-300 text-xs">Số ảnh xem miễn phí</Label>
          <div className="flex items-center gap-2">
            <Select
              value={form.freePreviewCount === null ? "default" : String(form.freePreviewCount)}
              onValueChange={(v) => set("freePreviewCount", v === "default" ? null : parseInt(v))}
            >
              <SelectTrigger className="bg-slate-900 border-slate-600 text-white h-8 text-sm w-56">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="default">Dùng Album Defaults (mặc định)</SelectItem>
                <SelectItem value="0">0 — Tất cả ảnh cần VIP</SelectItem>
                <SelectItem value="1">1 ảnh</SelectItem>
                <SelectItem value="2">2 ảnh</SelectItem>
                <SelectItem value="3">3 ảnh</SelectItem>
                <SelectItem value="5">5 ảnh</SelectItem>
                <SelectItem value="10">10 ảnh</SelectItem>
                <SelectItem value="15">15 ảnh</SelectItem>
                <SelectItem value="20">20 ảnh</SelectItem>
              </SelectContent>
            </Select>
            {form.freePreviewCount !== null && (
              <p className="text-slate-500 text-xs">
                {form.freePreviewCount === 0
                  ? "Không có ảnh xem miễn phí — yêu cầu VIP để xem tất cả"
                  : `${form.freePreviewCount} ảnh đầu tiên hiển thị miễn phí`}
              </p>
            )}
            {form.freePreviewCount === null && (
              <p className="text-slate-500 text-xs">Dùng cấu hình Album Defaults trong CMS → Appearance</p>
            )}
          </div>
        </div>
      </div>

      <div className="border-t border-slate-700 pt-3">
        <p className="text-slate-400 text-xs mb-2 font-medium uppercase tracking-wide">Category URLs</p>
        <p className="text-slate-500 text-xs mb-2">Map source category URLs to local site categories. Articles crawled from each URL will be assigned to the selected category.</p>
        <div className="space-y-2">
          {form.categoryMappings.map((mapping, idx) => (
            <div key={idx} className="flex gap-2 items-center">
              <Input
                value={mapping.url}
                onChange={(e) => {
                  const updated = [...form.categoryMappings];
                  updated[idx] = { ...updated[idx], url: e.target.value };
                  onChange({ ...form, categoryMappings: updated });
                }}
                className="bg-slate-900 border-slate-600 text-white h-8 text-sm font-mono flex-1"
                placeholder="https://everia.club/category/korea/"
              />
              <select
                value={mapping.categoryId ?? ""}
                onChange={(e) => {
                  const updated = [...form.categoryMappings];
                  updated[idx] = { ...updated[idx], categoryId: e.target.value ? parseInt(e.target.value) : undefined };
                  onChange({ ...form, categoryMappings: updated });
                }}
                className="bg-slate-900 border border-slate-600 text-white text-sm rounded-md h-8 px-2 w-40"
              >
                <option value="">Không có danh mục</option>
                {categories.map((cat) => (
                  <option key={cat.id} value={cat.id}>{cat.name}</option>
                ))}
              </select>
              <Button
                type="button" variant="ghost" size="sm"
                className="h-8 w-8 p-0 text-red-400 hover:text-red-300"
                onClick={() => {
                  const updated = form.categoryMappings.filter((_, i) => i !== idx);
                  onChange({ ...form, categoryMappings: updated.length > 0 ? updated : [{ url: "", categoryId: undefined }] });
                }}
              >
                <Trash2 className="w-3 h-3" />
              </Button>
            </div>
          ))}
          <Button
            type="button" variant="ghost" size="sm"
            className="text-violet-400 hover:text-violet-300 h-7 text-xs gap-1"
            onClick={() => onChange({ ...form, categoryMappings: [...form.categoryMappings, { url: "", categoryId: undefined }] })}
          >
            <Plus className="w-3 h-3" /> Add URL
          </Button>
        </div>
      </div>

      <div className="border-t border-slate-700 pt-3">
        <p className="text-slate-400 text-xs mb-2 font-medium uppercase tracking-wide">Title Cleanup Rules</p>
        <p className="text-slate-500 text-xs mb-2">Strip brand suffixes or replace text in raw titles before SEO generation. E.g. remove " – EVERIA.CLUB".</p>
        <div className="space-y-2">
          {form.titleCleanupRules.map((rule, idx) => (
            <div key={idx} className="flex gap-2 items-center">
              <Input
                value={rule.find}
                onChange={(e) => {
                  const updated = [...form.titleCleanupRules];
                  updated[idx] = { ...updated[idx], find: e.target.value };
                  onChange({ ...form, titleCleanupRules: updated });
                }}
                className="bg-slate-900 border-slate-600 text-white h-8 text-sm font-mono flex-1"
                placeholder="Find: – EVERIA.CLUB"
              />
              <span className="text-slate-500 text-xs">→</span>
              <Input
                value={rule.replace}
                onChange={(e) => {
                  const updated = [...form.titleCleanupRules];
                  updated[idx] = { ...updated[idx], replace: e.target.value };
                  onChange({ ...form, titleCleanupRules: updated });
                }}
                className="bg-slate-900 border-slate-600 text-white h-8 text-sm font-mono w-28"
                placeholder="Replace: (empty)"
              />
              <Button
                type="button" variant="ghost" size="sm"
                className="h-8 w-8 p-0 text-red-400 hover:text-red-300"
                onClick={() => {
                  const updated = form.titleCleanupRules.filter((_, i) => i !== idx);
                  onChange({ ...form, titleCleanupRules: updated });
                }}
              >
                <Trash2 className="w-3 h-3" />
              </Button>
            </div>
          ))}
          <Button
            type="button" variant="ghost" size="sm"
            className="text-violet-400 hover:text-violet-300 h-7 text-xs gap-1"
            onClick={() => onChange({ ...form, titleCleanupRules: [...form.titleCleanupRules, { find: "", replace: "" }] })}
          >
            <Plus className="w-3 h-3" /> Add Rule
          </Button>
        </div>
      </div>

      <div className="border-t border-slate-700 pt-3">
        <p className="text-slate-400 text-xs mb-2 font-medium uppercase tracking-wide">Advanced</p>
        <div className="space-y-2">
          <div className="space-y-1">
            <Label className="text-slate-300 text-xs">User Agent</Label>
            <Input value={form.userAgent} onChange={(e) => set("userAgent", e.target.value)} className="bg-slate-900 border-slate-600 text-white h-8 text-sm font-mono text-xs" placeholder="Mozilla/5.0 ..." />
          </div>
          <div className="space-y-1">
            <Label className="text-slate-300 text-xs">Cookie String</Label>
            <Input value={form.cookieString} onChange={(e) => set("cookieString", e.target.value)} className="bg-slate-900 border-slate-600 text-white h-8 text-sm font-mono text-xs" placeholder="session=abc; token=xyz" />
          </div>
        </div>
      </div>
    </div>
  );
}

function AdminImportSourcesContent() {
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [form, setForm] = useState<SourceFormData>(DEFAULT_FORM);

  // Selector Tester state
  const [testUrl, setTestUrl] = useState("");
  const [testSourceId, setTestSourceId] = useState<string>("none");
  const [testResult, setTestResult] = useState<any>(null);

  const { data: sources, refetch } = trpc.importSources.list.useQuery();
  const { data: categoriesData } = trpc.albums.categories.useQuery();
  const siteCategories = (categoriesData || []) as Array<{ id: number; name: string; slug: string }>;

  const createMutation = trpc.importSources.create.useMutation({
    onSuccess: () => { refetch(); setShowForm(false); setForm(DEFAULT_FORM); toast.success("Source created"); },
    onError: (err) => toast.error("Error", { description: err.message }),
  });

  const updateMutation = trpc.importSources.update.useMutation({
    onSuccess: () => { refetch(); setShowForm(false); setEditId(null); setForm(DEFAULT_FORM); toast.success("Source updated"); },
    onError: (err) => toast.error("Error", { description: err.message }),
  });

  const deleteMutation = trpc.importSources.delete.useMutation({
    onSuccess: () => { refetch(); toast.success("Source deleted"); },
    onError: (err) => toast.error("Error", { description: err.message }),
  });

  const toggleMutation = trpc.importSources.toggleEnabled.useMutation({
    onSuccess: () => refetch(),
    onError: (err) => toast.error("Error", { description: err.message }),
  });

  const testMutation = trpc.importSources.testSelectors.useMutation({
    onSuccess: (data) => {
      setTestResult(data);
      if (data.success) toast.success(`Found ${data.imageCount} images`);
      else toast.error("Test failed", { description: data.error });
    },
    onError: (err) => toast.error("Test failed", { description: err.message }),
  });

  const handleSave = () => {
    const payload = {
      siteName: form.siteName,
      baseUrl: form.baseUrl,
      titleSelector: form.titleSelector || undefined,
      imageSelector: form.imageSelector || undefined,
      nextPageSelector: form.nextPageSelector || undefined,
      tagSelector: form.tagSelector || undefined,
      creatorSelector: form.creatorSelector || undefined,
      publishDateSelector: form.publishDateSelector || undefined,
      paginationType: form.paginationType,
      pageUrlPattern: form.pageUrlPattern || undefined,
      contentAreaSelector: form.contentAreaSelector || undefined,
      requiresBrowser: form.requiresBrowser,
      userAgent: form.userAgent || undefined,
      cookieString: form.cookieString || undefined,
      crawlDelayMs: form.crawlDelayMs,
      maxPages: form.maxPages,
      keywordFilter: form.keywordFilter || undefined,
      creatorFilter: form.creatorFilter || undefined,
      enabled: form.enabled,
      publishMode: form.publishMode,
      defaultVip: form.defaultVip,
      freePreviewCount: form.freePreviewCount,
      autoSchedule: form.autoSchedule,
      scheduleIntervalHours: form.scheduleIntervalHours,
      categoryUrls: serializeCategoryUrls(form.categoryMappings),
      titleCleanupRules: form.titleCleanupRules.filter((r) => r.find).length > 0
        ? JSON.stringify(form.titleCleanupRules.filter((r) => r.find))
        : undefined,
    };

    if (editId) {
      updateMutation.mutate({ id: editId, data: payload });
    } else {
      createMutation.mutate(payload);
    }
  };

  const handleEdit = (source: any) => {
    setEditId(source.id);
    setForm({
      siteName: source.siteName || "",
      baseUrl: source.baseUrl || "",
      titleSelector: source.titleSelector || "",
      imageSelector: source.imageSelector || "",
      nextPageSelector: source.nextPageSelector || "",
      tagSelector: source.tagSelector || "",
      creatorSelector: source.creatorSelector || "",
      publishDateSelector: source.publishDateSelector || "",
      paginationType: source.paginationType || "next_page",
      pageUrlPattern: source.pageUrlPattern || "",
      contentAreaSelector: source.contentAreaSelector || "",
      requiresBrowser: source.requiresBrowser || false,
      userAgent: source.userAgent || "",
      cookieString: source.cookieString || "",
      crawlDelayMs: source.crawlDelayMs ?? 1500,
      maxPages: source.maxPages ?? 50,
      keywordFilter: source.keywordFilter || "",
      creatorFilter: source.creatorFilter || "",
      enabled: source.enabled ?? true,
      publishMode: source.publishMode || "draft",
      defaultVip: source.defaultVip ?? false,
      freePreviewCount: source.freePreviewCount ?? null,
      autoSchedule: source.autoSchedule ?? false,
      scheduleIntervalHours: source.scheduleIntervalHours ?? 6,
      categoryMappings: parseCategoryUrls(source.categoryUrls),
      titleCleanupRules: source.titleCleanupRules
        ? (() => { try { return JSON.parse(source.titleCleanupRules); } catch { return []; } })()
        : [],
    });
    setShowForm(true);
  };

  const handleRunTest = () => {
    const srcId = testSourceId !== "none" ? parseInt(testSourceId) : undefined;
    testMutation.mutate({
      url: testUrl,
      sourceId: srcId,
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/admin/import">
          <Button variant="ghost" size="sm" className="text-slate-400 gap-1">
            <ArrowLeft className="w-4 h-4" /> Back
          </Button>
        </Link>
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-white">Nguồn dữ liệu</h1>
          <p className="text-slate-400 text-sm">Configure crawler templates for known sites</p>
        </div>
        <Button onClick={() => { setEditId(null); setForm(DEFAULT_FORM); setShowForm(true); }} className="gap-2 bg-violet-600 hover:bg-violet-700">
          <Plus className="w-4 h-4" /> Thêm nguồn
        </Button>
      </div>

      {/* Test Selectors */}
      <Card className="bg-slate-800 border-slate-700">
        <CardHeader>
          <CardTitle className="text-white text-base flex items-center gap-2">
            <FlaskConical className="w-4 h-4 text-amber-400" /> Selector Tester
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_auto_auto]">
            <Input
              placeholder="https://everia.club/2024/01/example/"
              value={testUrl}
              onChange={(e) => setTestUrl(e.target.value)}
              className="bg-slate-900 border-slate-600 text-white"
            />
            {/* Source config selector */}
            <Select value={testSourceId} onValueChange={setTestSourceId}>
              <SelectTrigger className="bg-slate-900 border-slate-600 text-white w-48">
                <SelectValue placeholder="Use source config..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No source config</SelectItem>
                {(sources || []).map((src) => (
                  <SelectItem key={src.id} value={String(src.id)}>
                    {src.siteName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              onClick={handleRunTest}
              disabled={!testUrl || testMutation.isPending}
              variant="outline"
              className="gap-2"
            >
              {testMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <FlaskConical className="w-4 h-4" />}
              Test
            </Button>
          </div>

          {testSourceId !== "none" && (
            <p className="text-slate-500 text-xs">
              Using selectors from <span className="text-violet-400">{sources?.find(s => String(s.id) === testSourceId)?.siteName}</span> — including content area filter and pagination settings.
            </p>
          )}

          {testResult && (
            <div className="bg-slate-900 rounded p-3 text-sm space-y-1">
              <div className="flex items-center gap-2">
                <span className={testResult.success ? "text-green-400" : "text-red-400"}>
                  {testResult.success ? "✓" : "✗"} {testResult.success ? `${testResult.imageCount} images found` : testResult.error}
                </span>
              </div>
              {testResult.title && <p className="text-slate-300">Title: <span className="text-white">{testResult.title}</span></p>}
              {testResult.creator && <p className="text-slate-300">Creator: <span className="text-white">{testResult.creator}</span></p>}
              {testResult.nextTrangUrl && <p className="text-slate-300">Next page: <span className="text-violet-300 text-xs">{testResult.nextTrangUrl}</span></p>}
              {testResult.images?.slice(0, 5).map((img: any, i: number) => (
                <p key={i} className="text-slate-500 text-xs truncate">{img.url}</p>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Sources list */}
      {!sources || sources.length === 0 ? (
        <Card className="bg-slate-800 border-slate-700">
          <CardContent className="py-12 text-center text-slate-500">
            <Globe className="w-10 h-10 mx-auto mb-3 opacity-30" />
            <p>Chưa có nguồn nào. Add one to get started.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {sources.map((source) => (
            <Card key={source.id} className="bg-slate-800 border-slate-700">
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="text-white font-medium">{source.siteName}</h3>
                      <Badge variant={source.enabled ? "default" : "secondary"} className="text-xs">
                        {source.enabled ? "Đang hoạt động" : "Disabled"}
                      </Badge>
                      {source.requiresBrowser && (
                        <Badge variant="outline" className="text-xs border-amber-500 text-amber-400">Browser</Badge>
                      )}
                      {source.autoSchedule && (
                        <Badge variant="outline" className="text-xs border-green-500 text-green-400">
                          Auto every {source.scheduleIntervalHours}h
                        </Badge>
                      )}
                    </div>
                    <p className="text-slate-400 text-sm truncate">{source.baseUrl}</p>
                    <div className="flex flex-wrap gap-2 mt-2">
                      {source.imageSelector && <code className="text-xs bg-slate-900 px-1.5 py-0.5 rounded text-violet-300">{source.imageSelector}</code>}
                      {source.contentAreaSelector && <code className="text-xs bg-slate-900 px-1.5 py-0.5 rounded text-cyan-300" title="Content area">{source.contentAreaSelector}</code>}
                      {source.paginationType && <span className="text-xs text-slate-500">{source.paginationType}</span>}
                      {source.pageUrlPattern && <code className="text-xs bg-slate-900 px-1.5 py-0.5 rounded text-amber-300">{source.pageUrlPattern}</code>}
                      <span className="text-xs text-slate-500">max {source.maxPages} pages</span>
                      <span className="text-xs text-slate-500">{source.crawlDelayMs}ms delay</span>
                      <Badge variant="outline" className={`text-xs ${source.publishMode === "published" ? "border-green-600 text-green-400" : "border-slate-600 text-slate-400"}`}>
                        {source.publishMode === "published" ? "Auto-publish" : "Draft"}
                      </Badge>
                      {source.defaultVip && (
                        <Badge variant="outline" className="text-xs border-amber-500 text-amber-400">
                          👑 VIP mặc định
                        </Badge>
                      )}
                      {source.freePreviewCount !== null && source.freePreviewCount !== undefined ? (
                        <Badge variant="outline" className="text-xs border-cyan-600 text-cyan-400">
                          🖼️ {source.freePreviewCount} ảnh miễn phí
                        </Badge>
                      ) : (
                        <span className="text-xs text-slate-600">preview: Album Defaults</span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <Switch
                      checked={source.enabled ?? true}
                      onCheckedChange={(v) => toggleMutation.mutate({ id: source.id, enabled: v })}
                    />
                    <Button variant="ghost" size="sm" onClick={() => handleEdit(source)} className="text-slate-400 h-8 w-8 p-0">
                      <Edit className="w-4 h-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-red-400 h-8 w-8 p-0"
                      onClick={() => {
                        if (confirm(`Delete "${source.siteName}"?`)) deleteMutation.mutate({ id: source.id });
                      }}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Create/Edit Dialog */}
      <Dialog open={showForm} onOpenChange={(o) => { if (!o) { setShowForm(false); setEditId(null); setForm(DEFAULT_FORM); } }}>
        <DialogContent className="bg-slate-800 border-slate-700 text-white max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editId ? "Edit Source" : "Thêm nguồn"}</DialogTitle>
          </DialogHeader>
          <SourceForm form={form} onChange={setForm} categories={siteCategories} />
          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowForm(false); setEditId(null); setForm(DEFAULT_FORM); }}>Hủy</Button>
            <Button
              onClick={handleSave}
              disabled={!form.siteName || !form.baseUrl || createMutation.isPending || updateMutation.isPending}
              className="bg-violet-600 hover:bg-violet-700"
            >
              {(createMutation.isPending || updateMutation.isPending) && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
              {editId ? "Lưu thay đổi" : "Create Source"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default function AdminImportSources() {
  return (
    <AdminLayout>
      <AdminImportSourcesContent />
    </AdminLayout>
  );
}
