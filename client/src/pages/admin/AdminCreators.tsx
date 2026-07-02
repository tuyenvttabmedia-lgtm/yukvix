import AdminLayout from "./AdminLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { trpc } from "@/lib/trpc";
import { useState, useRef } from "react";
import { toast } from "sonner";
import { Users, Pencil, Trash2, Plus, Search, Upload, User, AlertCircle, ChevronRight, Sparkles, Loader2, Wand2, ImageIcon, X } from "lucide-react";

function slugify(text: string) {
  return text.toLowerCase().replace(/[^\w\s-]/g, "").replace(/\s+/g, "-").replace(/-+/g, "-").trim();
}

type Creator = {
  id: number;
  name: string;
  slug: string;
  bio: string | null;
  avatarUrl: string | null;
  bannerUrl: string | null;
  socialLinks: string | null;
  seoTitle: string | null;
  seoDescription: string | null;
  seoKeywords: string | null;
  focusKeyword: string | null;
  canonicalUrl: string | null;
  ogImage: string | null;
  robotsIndex: boolean | null;
  seoLanguage: string | null;
  albumCount: number;
  createdAt: Date;
};

const EMPTY_FORM = { name: "", slug: "", bio: "", seoTitle: "", seoDescription: "", seoKeywords: "", focusKeyword: "", canonicalUrl: "", ogImage: "", robotsIndex: true, seoLanguage: "en", twitter: "", instagram: "", website: "" };

export default function AdminCreators() {
  const utils = trpc.useUtils();
  const [search, setSearch] = useState("");
  const [editCreator, setEditCreator] = useState<Creator | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const bannerInputRef = useRef<HTMLInputElement>(null);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [uploadingBanner, setUploadingBanner] = useState(false);

  const { data, isLoading } = trpc.creators.adminList.useQuery({ page: 1, limit: 100 });
  const creators: Creator[] = (data?.items ?? []) as Creator[];

  const createMutation = trpc.creators.adminCreate.useMutation({
    onSuccess: () => { utils.creators.adminList.invalidate(); setShowCreate(false); setForm(EMPTY_FORM); toast.success("Tạo cosplayer thành công"); },
    onError: (e) => toast.error(e.message),
  });

  const updateMutation = trpc.creators.adminUpdate.useMutation({
    onSuccess: () => { utils.creators.adminList.invalidate(); setEditCreator(null); toast.success("Cập nhật cosplayer thành công"); },
    onError: (e) => toast.error(e.message),
  });

  const deleteMutation = trpc.creators.adminDelete.useMutation({
    onSuccess: () => { utils.creators.adminList.invalidate(); toast.success("Xóa cosplayer thành công"); },
    onError: (e) => toast.error(e.message),
  });

  const uploadMutation = trpc.creators.adminPresignedUpload.useMutation({
    onSuccess: () => { utils.creators.adminList.invalidate(); },
    onError: (e) => toast.error(e.message),
  });

  const suggestCreatorSeoMutation = trpc.seo.suggestCreator.useMutation();
  const [aiSuggestLoading, setAiSuggestLoading] = useState(false);

  // Auto-pick avatar/banner from albums
  const autoPickMutation = trpc.creators.adminAutoPickImages.useMutation({
    onSuccess: (res) => {
      utils.creators.adminList.invalidate();
      if (res.applied) {
        setEditCreator(prev => prev ? {
          ...prev,
          avatarUrl: res.avatarUrl ?? prev.avatarUrl,
          bannerUrl: res.bannerUrl ?? prev.bannerUrl,
        } : prev);
        toast.success("Đã tự động chọn ảnh từ album!");
      } else {
        toast.error("Không tìm thấy ảnh phù hợp trong album");
      }
    },
    onError: (e) => toast.error(e.message || "Không thể tự động chọn ảnh"),
  });
  const [autoPickLoading, setAutoPickLoading] = useState(false);

  // Photo picker modal
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerTarget, setPickerTarget] = useState<"avatar" | "banner">("avatar");
  const [pickerPage, setPickerPage] = useState(1);
  const pickerQuery = trpc.creators.adminListPhotosForPicker.useQuery(
    { creatorId: editCreator?.id ?? 0, page: pickerPage, limit: 24 },
    { enabled: pickerOpen && !!editCreator }
  );

  async function handleAutoPick(creatorId: number) {
    setAutoPickLoading(true);
    try {
      await autoPickMutation.mutateAsync({ creatorId, applyAvatar: true, applyBanner: true });
    } finally {
      setAutoPickLoading(false);
    }
  }

  async function handlePickerSelect(photoUrl: string) {
    if (!editCreator) return;
    setPickerOpen(false);
    const type = pickerTarget;
    try {
      await updateMutation.mutateAsync({
        id: editCreator.id,
        ...(type === "avatar" ? { avatarUrl: photoUrl, avatarKey: "manual-picked" } : { bannerUrl: photoUrl, bannerKey: "manual-picked" }),
      });
      setEditCreator(prev => prev ? {
        ...prev,
        ...(type === "avatar" ? { avatarUrl: photoUrl } : { bannerUrl: photoUrl }),
      } : prev);
      toast.success(`Đã cập nhật ${type === "avatar" ? "ảnh đại diện" : "ảnh bìa"}!`);
    } catch (e: any) {
      toast.error(e.message);
    }
  }

  async function handleAiSuggestCreator(creatorId: number) {
    setAiSuggestLoading(true);
    try {
      const result = await suggestCreatorSeoMutation.mutateAsync({ creatorId });
      setForm(f => ({
        ...f,
        focusKeyword: result.focusKeyword || f.focusKeyword,
        seoTitle: result.metaTitle || f.seoTitle,
        seoDescription: result.metaDescription || f.seoDescription,
      }));
      toast.success("AI đã gợi ý SEO thành công!");
    } catch (err: any) {
      toast.error(err?.message || "AI gợi ý thất bại");
    } finally {
      setAiSuggestLoading(false);
    }
  }

  const filtered = creators.filter(c =>
    c.name.toLowerCase().includes(search.toLowerCase()) ||
    c.slug.toLowerCase().includes(search.toLowerCase())
  );

  function openEdit(creator: Creator) {
    setEditCreator(creator);
    const social = (() => { try { return creator.socialLinks ? JSON.parse(creator.socialLinks) : {}; } catch { return {}; } })();
    setForm({ name: creator.name, slug: creator.slug, bio: creator.bio || "", seoTitle: creator.seoTitle || "", seoDescription: creator.seoDescription || "", seoKeywords: creator.seoKeywords || "", focusKeyword: creator.focusKeyword || "", canonicalUrl: creator.canonicalUrl || "", ogImage: creator.ogImage || "", robotsIndex: creator.robotsIndex !== false, seoLanguage: creator.seoLanguage || "en", twitter: social.twitter || "", instagram: social.instagram || "", website: social.website || "" });
  }

  async function handleImageUpload(creatorId: number, type: "avatar" | "banner", file: File, setLoading: (v: boolean) => void) {
    setLoading(true);
    try {
      const reader = new FileReader();
      const base64 = await new Promise<string>((res, rej) => {
        reader.onload = () => res((reader.result as string).split(",")[1]);
        reader.onerror = rej;
        reader.readAsDataURL(file);
      });
      await uploadMutation.mutateAsync({ creatorId, type, filename: file.name, contentType: file.type, fileBase64: base64 });
      toast.success(`${type === "avatar" ? "Avatar" : "Banner"} uploaded`);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setLoading(false);
    }
  }

  function buildSocialLinks() {
    const social: Record<string, string> = {};
    if (form.twitter) social.twitter = form.twitter;
    if (form.instagram) social.instagram = form.instagram;
    if (form.website) social.website = form.website;
    return Object.keys(social).length > 0 ? social : undefined;
  }

  return (
    <AdminLayout>
      <div className="p-6 max-w-5xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2"><Users className="w-6 h-6" /> Quản lý Cosplayer</h1>
            <p className="text-muted-foreground text-sm mt-1">{creators.length} creators total</p>
          </div>
          <Button onClick={() => { setShowCreate(true); setForm(EMPTY_FORM); }}>
            <Plus className="w-4 h-4 mr-2" /> New Creator
          </Button>
        </div>

        {/* Search */}
        <div className="relative mb-4">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Tìm cosplayer..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
        </div>

        {/* Grid */}
        {isLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {Array.from({ length: 6 }).map((_, i) => <div key={i} className="h-24 bg-muted animate-pulse rounded-lg" />)}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {filtered.map(creator => (
              <div key={creator.id} className="border rounded-lg p-4 flex items-center gap-3 hover:bg-muted/30 transition-colors">
                <div className="w-12 h-12 rounded-full bg-muted overflow-hidden flex-shrink-0">
                  {creator.avatarUrl ? (
                    <img src={creator.avatarUrl} alt={creator.name} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center"><User className="w-6 h-6 text-muted-foreground" /></div>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium truncate">{creator.name}</p>
                  <p className="text-xs text-muted-foreground">{creator.slug}</p>
                  <Badge variant="secondary" className="text-xs mt-1">{creator.albumCount} album</Badge>
                </div>
                <div className="flex gap-1">
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(creator)}>
                    <Pencil className="w-3.5 h-3.5" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive"
                    onClick={() => { if (confirm(`Delete creator "${creator.name}"?`)) deleteMutation.mutate({ id: creator.id }); }}>
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </div>
            ))}
            {filtered.length === 0 && (
              <div className="col-span-3 text-center py-12 text-muted-foreground">Không tìm thấy cosplayer</div>
            )}
          </div>
        )}

        {/* Create Dialog */}
        <Dialog open={showCreate} onOpenChange={setShowCreate}>
          <DialogContent className="max-w-lg">
            <DialogHeader><DialogTitle>Tạo cosplayer mới</DialogTitle></DialogHeader>
            <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-1">
              <div><Label>Name *</Label><Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value, slug: slugify(e.target.value) }))} /></div>
              <div><Label>Slug</Label><Input value={form.slug} onChange={e => setForm(f => ({ ...f, slug: e.target.value }))} /></div>
              <div><Label>Giới thiệu</Label><Textarea value={form.bio} onChange={e => setForm(f => ({ ...f, bio: e.target.value }))} rows={3} /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Twitter</Label><Input value={form.twitter} onChange={e => setForm(f => ({ ...f, twitter: e.target.value }))} placeholder="@username" /></div>
                <div><Label>Instagram</Label><Input value={form.instagram} onChange={e => setForm(f => ({ ...f, instagram: e.target.value }))} placeholder="@username" /></div>
              </div>
              <div><Label>Website</Label><Input value={form.website} onChange={e => setForm(f => ({ ...f, website: e.target.value }))} placeholder="https://..." /></div>
              <div><Label>Tiêu đề SEO</Label><Input value={form.seoTitle} onChange={e => setForm(f => ({ ...f, seoTitle: e.target.value }))} /></div>
              <div><Label>SEO Description</Label><Textarea value={form.seoDescription} onChange={e => setForm(f => ({ ...f, seoDescription: e.target.value }))} rows={2} /></div>
              <div><Label>Focus Keyword</Label><Input value={form.focusKeyword} onChange={e => setForm(f => ({ ...f, focusKeyword: e.target.value }))} placeholder="e.g. cosplayer name" /></div>
              <div><Label>SEO Keywords</Label><Input value={form.seoKeywords} onChange={e => setForm(f => ({ ...f, seoKeywords: e.target.value }))} placeholder="keyword1, keyword2, ..." /></div>
              <div>
                <Label>Ngôn ngữ nội dung</Label>
                <select value={form.seoLanguage} onChange={e => setForm(f => ({ ...f, seoLanguage: e.target.value }))} className="w-full mt-1 px-3 py-2 rounded-lg bg-background border border-input text-sm focus:outline-none focus:ring-1 focus:ring-ring">
                  <option value="en">English</option>
                  <option value="ja">Japanese (日本語)</option>
                  <option value="ko">Korean (한국어)</option>
                  <option value="zh-CN">Chinese Simplified (简体中文)</option>
                  <option value="zh-TW">Chinese Traditional (繁體中文)</option>
                  <option value="vi">Vietnamese (Tiếng Việt)</option>
                </select>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowCreate(false)}>Hủy</Button>
              <Button onClick={() => createMutation.mutate({ name: form.name, slug: form.slug || undefined, bio: form.bio || undefined, socialLinks: buildSocialLinks(), seoTitle: form.seoTitle || undefined, seoDescription: form.seoDescription || undefined, seoKeywords: form.seoKeywords || undefined, focusKeyword: form.focusKeyword || undefined, canonicalUrl: form.canonicalUrl || undefined, ogImage: form.ogImage || undefined, robotsIndex: form.robotsIndex, seoLanguage: form.seoLanguage || undefined })} disabled={!form.name || createMutation.isPending}>
                {createMutation.isPending ? "Đang tạo..." : "Create"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Edit Dialog */}
        <Dialog open={!!editCreator} onOpenChange={v => !v && setEditCreator(null)}>
          <DialogContent className="max-w-lg">
            <DialogHeader><DialogTitle>Chỉnh sửa cosplayer: {editCreator?.name}</DialogTitle></DialogHeader>
            <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-1">
              {/* Avatar/Banner upload */}
              {editCreator && (
                <div className="space-y-2">
                  {/* Auto-pick button */}
                  <div className="flex items-center justify-between">
                    <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Ảnh đại diện & Ảnh bìa</Label>
                    <Button
                      variant="outline" size="sm"
                      onClick={() => handleAutoPick(editCreator.id)}
                      disabled={autoPickLoading}
                      className="h-7 text-xs gap-1.5 border-primary/40 text-primary hover:bg-primary/10"
                      title="Tự động chọn ảnh đại diện và ảnh bìa từ album"
                    >
                      {autoPickLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Wand2 className="w-3 h-3" />}
                      {autoPickLoading ? "Đang chọn..." : "Tự động từ album"}
                    </Button>
                  </div>
                  <div className="flex gap-3">
                    <div className="flex-1">
                      <Label className="text-xs">Ảnh đại diện</Label>
                      <div className="flex items-center gap-2 mt-1">
                        <div className="w-12 h-12 rounded-full bg-muted overflow-hidden flex-shrink-0 border border-border">
                          {editCreator.avatarUrl ? <img src={editCreator.avatarUrl} alt="" className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center"><User className="w-5 h-5 text-muted-foreground" /></div>}
                        </div>
                        <div className="flex flex-col gap-1">
                          <Button variant="outline" size="sm" className="h-6 text-xs px-2" onClick={() => avatarInputRef.current?.click()} disabled={uploadingAvatar}>
                            <Upload className="w-3 h-3 mr-1" />{uploadingAvatar ? "..." : "Upload"}
                          </Button>
                          <Button variant="outline" size="sm" className="h-6 text-xs px-2" onClick={() => { setPickerTarget("avatar"); setPickerPage(1); setPickerOpen(true); }}>
                            <ImageIcon className="w-3 h-3 mr-1" />Chọn từ album
                          </Button>
                        </div>
                        <input ref={avatarInputRef} type="file" accept="image/*" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f && editCreator) handleImageUpload(editCreator.id, "avatar", f, setUploadingAvatar); }} />
                      </div>
                    </div>
                    <div className="flex-1">
                      <Label className="text-xs">Ảnh bìa</Label>
                      <div className="flex items-center gap-2 mt-1">
                        <div className="w-20 h-12 rounded bg-muted overflow-hidden flex-shrink-0 border border-border">
                          {editCreator.bannerUrl ? <img src={editCreator.bannerUrl} alt="" className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center text-xs text-muted-foreground">Chưa có</div>}
                        </div>
                        <div className="flex flex-col gap-1">
                          <Button variant="outline" size="sm" className="h-6 text-xs px-2" onClick={() => bannerInputRef.current?.click()} disabled={uploadingBanner}>
                            <Upload className="w-3 h-3 mr-1" />{uploadingBanner ? "..." : "Upload"}
                          </Button>
                          <Button variant="outline" size="sm" className="h-6 text-xs px-2" onClick={() => { setPickerTarget("banner"); setPickerPage(1); setPickerOpen(true); }}>
                            <ImageIcon className="w-3 h-3 mr-1" />Chọn từ album
                          </Button>
                        </div>
                        <input ref={bannerInputRef} type="file" accept="image/*" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f && editCreator) handleImageUpload(editCreator.id, "banner", f, setUploadingBanner); }} />
                      </div>
                    </div>
                  </div>
                </div>
              )}
              <div><Label>Name *</Label><Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} /></div>
              <div><Label>Slug</Label><Input value={form.slug} onChange={e => setForm(f => ({ ...f, slug: e.target.value }))} /></div>
              <div><Label>Giới thiệu</Label><Textarea value={form.bio} onChange={e => setForm(f => ({ ...f, bio: e.target.value }))} rows={3} /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Twitter</Label><Input value={form.twitter} onChange={e => setForm(f => ({ ...f, twitter: e.target.value }))} placeholder="@username" /></div>
                <div><Label>Instagram</Label><Input value={form.instagram} onChange={e => setForm(f => ({ ...f, instagram: e.target.value }))} placeholder="@username" /></div>
              </div>
              <div><Label>Website</Label><Input value={form.website} onChange={e => setForm(f => ({ ...f, website: e.target.value }))} placeholder="https://..." /></div>
              <div className="flex items-center justify-between pt-1">
                <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">SEO</Label>
                {editCreator && (
                  <button
                    type="button"
                    disabled={aiSuggestLoading}
                    onClick={() => handleAiSuggestCreator(editCreator.id)}
                    className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-primary/10 border border-primary/30 text-primary text-xs font-medium hover:bg-primary/20 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    title="AI tự động gợi ý SEO dựa trên thông tin creator"
                  >
                    {aiSuggestLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
                    {aiSuggestLoading ? "Đang gợi ý..." : "AI Suggest"}
                  </button>
                )}
              </div>
              <div><Label>Tiêu đề SEO</Label><Input value={form.seoTitle} onChange={e => setForm(f => ({ ...f, seoTitle: e.target.value }))} /></div>
              <div><Label>SEO Description</Label><Textarea value={form.seoDescription} onChange={e => setForm(f => ({ ...f, seoDescription: e.target.value }))} rows={2} /></div>
              <div><Label>Focus Keyword</Label><Input value={form.focusKeyword} onChange={e => setForm(f => ({ ...f, focusKeyword: e.target.value }))} placeholder="e.g. cosplayer name" /></div>
              <div><Label>SEO Keywords</Label><Input value={form.seoKeywords} onChange={e => setForm(f => ({ ...f, seoKeywords: e.target.value }))} placeholder="keyword1, keyword2, ..." /></div>
              <div>
                <Label>Ngôn ngữ nội dung</Label>
                <select value={form.seoLanguage} onChange={e => setForm(f => ({ ...f, seoLanguage: e.target.value }))} className="w-full mt-1 px-3 py-2 rounded-lg bg-background border border-input text-sm focus:outline-none focus:ring-1 focus:ring-ring">
                  <option value="en">English</option>
                  <option value="ja">Japanese (日本語)</option>
                  <option value="ko">Korean (한국어)</option>
                  <option value="zh-CN">Chinese Simplified (简体中文)</option>
                  <option value="zh-TW">Chinese Traditional (繁體中文)</option>
                  <option value="vi">Vietnamese (Tiếng Việt)</option>
                </select>
              </div>
              <div className="flex items-center justify-between">
                <Label>Cho phép Google index</Label>
                <button type="button" onClick={() => setForm(f => ({ ...f, robotsIndex: !f.robotsIndex }))} className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${form.robotsIndex ? "bg-primary" : "bg-muted"}`}>
                  <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${form.robotsIndex ? "translate-x-4.5" : "translate-x-0.5"}`} />
                </button>
              </div>
              <details className="group">
                <summary className="text-xs text-muted-foreground cursor-pointer hover:text-foreground flex items-center gap-1 select-none list-none">
                  <ChevronRight className="w-3 h-3 transition-transform group-open:rotate-90" />
                  Nâng cao (Canonical, OG Image)
                </summary>
                <div className="mt-2 space-y-2">
                  <div><Label>Canonical URL</Label><Input value={form.canonicalUrl} onChange={e => setForm(f => ({ ...f, canonicalUrl: e.target.value }))} placeholder="https://yukvix.com/creator/..." className="font-mono text-sm" /></div>
                  <div><Label>OG Image URL</Label><Input value={form.ogImage} onChange={e => setForm(f => ({ ...f, ogImage: e.target.value }))} placeholder="https://..." className="font-mono text-sm" /></div>
                </div>
              </details>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setEditCreator(null)}>Hủy</Button>
              <Button onClick={() => editCreator && updateMutation.mutate({ id: editCreator.id, name: form.name, slug: form.slug || undefined, bio: form.bio || undefined, socialLinks: buildSocialLinks(), seoTitle: form.seoTitle || undefined, seoDescription: form.seoDescription || undefined, seoKeywords: form.seoKeywords || undefined, focusKeyword: form.focusKeyword || undefined, canonicalUrl: form.canonicalUrl || undefined, ogImage: form.ogImage || undefined, robotsIndex: form.robotsIndex, seoLanguage: form.seoLanguage || undefined })} disabled={updateMutation.isPending}>
                {updateMutation.isPending ? "Đang lưu..." : "Save"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      {/* Photo Picker Modal */}
      <Dialog open={pickerOpen} onOpenChange={setPickerOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ImageIcon className="w-4 h-4" />
              Chọn {pickerTarget === "avatar" ? "ảnh đại diện" : "ảnh bìa"} từ album
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            {pickerQuery.isLoading && (
              <div className="flex items-center justify-center h-48">
                <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
              </div>
            )}
            {!pickerQuery.isLoading && pickerQuery.data?.photos.length === 0 && (
              <div className="flex flex-col items-center justify-center h-48 text-muted-foreground gap-2">
                <ImageIcon className="w-8 h-8" />
                <p className="text-sm">Cosplayer này chưa có ảnh trong album</p>
              </div>
            )}
            {pickerQuery.data && pickerQuery.data.photos.length > 0 && (
              <>
                <p className="text-xs text-muted-foreground">
                  {pickerQuery.data.albumCount} album • Click vào ảnh để chọn
                </p>
                <div className="grid grid-cols-6 gap-2 max-h-[50vh] overflow-y-auto">
                  {pickerQuery.data.photos.map((photo) => {
                    const url = photo.mediumUrl || photo.webpUrl || photo.thumbUrl;
                    if (!url) return null;
                    return (
                      <button
                        key={photo.id}
                        onClick={() => handlePickerSelect(url)}
                        className="relative aspect-square rounded overflow-hidden border-2 border-transparent hover:border-primary transition-all group"
                      >
                        <img src={photo.thumbUrl || url} alt="" className="w-full h-full object-cover group-hover:scale-105 transition-transform" />
                        {pickerTarget === "banner" && photo.width && photo.height && photo.width > photo.height * 1.3 && (
                          <span className="absolute top-0.5 right-0.5 bg-primary text-primary-foreground text-[9px] px-1 rounded">Ngang</span>
                        )}
                      </button>
                    );
                  })}
                </div>
                <div className="flex items-center justify-between pt-1">
                  <Button variant="outline" size="sm" onClick={() => setPickerPage(p => Math.max(1, p - 1))} disabled={pickerPage === 1}>
                    Trang trước
                  </Button>
                  <span className="text-xs text-muted-foreground">Trang {pickerPage}</span>
                  <Button variant="outline" size="sm" onClick={() => setPickerPage(p => p + 1)} disabled={(pickerQuery.data?.photos.length ?? 0) < 24}>
                    Trang sau
                  </Button>
                </div>
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>
      </div>
    </AdminLayout>
  );
}
