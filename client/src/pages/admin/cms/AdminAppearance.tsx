/**
 * Admin CMS — Appearance Management
 * Manages: logo, mobile logo, favicon, homepage banners, footer text, social links
 * Uploads branding images through the server (private Wasabi bucket).
 */
import { trpc } from "@/lib/trpc";
import { SettingsPage } from "@/admin";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { useEffect, useRef, useState } from "react";
import { Image, Link2, Loader2, Palette, Plus, Save, Trash2, Upload } from "lucide-react";
import { cmsDisplayUrl, CMS_MAX_UPLOAD_BYTES, fileToBase64 } from "@/lib/cms-media";
import AdminLayout from "../AdminLayout";

// -- Types ---------------------------------------------------------------------
interface Banner {
  id: string;
  imageUrl: string;
  title: string;
  subtitle: string;
  linkUrl: string;
  linkLabel: string;
  sortOrder?: number;
}

interface SocialLink {
  id: string;
  platform: string;
  url: string;
}

// -- Helpers -------------------------------------------------------------------
function parseBanners(raw: string | null | undefined): Banner[] {
  try { return JSON.parse(raw || "[]"); } catch { return []; }
}
function parseSocials(raw: string | null | undefined): SocialLink[] {
  try { return JSON.parse(raw || "[]"); } catch { return []; }
}
function uid() { return Math.random().toString(36).slice(2, 9); }

// -- Media upload helper -------------------------------------------------------
function MediaUpload({
  label,
  currentUrl,
  folder,
  onUploaded,
  accept = "image/*",
}: {
  label: string;
  currentUrl?: string | null;
  folder: string;
  onUploaded: (url: string, key: string) => void;
  accept?: string;
}) {
  const [uploading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [broken, setBroken] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const uploadAsset = trpc.cms.uploadAsset.useMutation();
  const previewUrl = cmsDisplayUrl(currentUrl);

  const handleFile = async (file: File) => {
    setError(null);
    setBroken(false);
    if (file.size > CMS_MAX_UPLOAD_BYTES) {
      const msg = "File quá lớn (tối đa 2MB)";
      setError(msg);
      toast.error(`${label}: ${msg}`);
      return;
    }
    setLoading(true);
    try {
      const fileBase64 = await fileToBase64(file);
      const { publicUrl, key } = await uploadAsset.mutateAsync({
        filename: file.name,
        contentType: file.type || undefined,
        folder,
        fileBase64,
      });
      if (!publicUrl) throw new Error("Server không trả URL ảnh");
      onUploaded(publicUrl, key);
      toast.success(`Đã tải ${label}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Không upload được";
      setError(msg);
      toast.error(`${label}: ${msg}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      {previewUrl && (
        <div className="relative w-32 h-16 rounded-lg overflow-hidden border border-border bg-secondary">
          <img
            src={previewUrl}
            alt={label}
            className="w-full h-full object-contain p-1"
            onError={() => setBroken(true)}
            onLoad={() => setBroken(false)}
          />
        </div>
      )}
      {(error || broken) && (
        <p className="text-xs text-destructive">
          {error || "Ảnh không hiển thị. Upload lại hoặc kiểm tra cấu hình Wasabi."}
        </p>
      )}
      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={uploading}
          onClick={() => inputRef.current?.click()}
        >
          {uploading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Upload className="w-4 h-4 mr-2" />}
          {currentUrl ? "Replace" : "Upload"}
        </Button>
        <input ref={inputRef} type="file" accept={accept} className="hidden" onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])} />
        {previewUrl && <span className="text-xs text-muted-foreground truncate max-w-[200px]">{previewUrl}</span>}
      </div>
    </div>
  );
}

// -- Main Component ------------------------------------------------------------
export default function AdminAppearance() {
  const { data: settings, isLoading, refetch } = trpc.cms.getSettings.useQuery();
  const updateSettings = trpc.cms.updateSettings.useMutation({
    onSuccess: () => { toast.success("Đã lưu cài đặt"); refetch(); },
    onError: () => toast.error("Failed to save settings"),
  });

  // Logo / favicon state
  const [logoUrl, setLogoUrl] = useState("");
  const [logoMobileUrl, setLogoMobileUrl] = useState("");
  const [faviconUrl, setFaviconUrl] = useState("");
  const [siteName, setSiteName] = useState("");
  const [tagline, setTagline] = useState("");

  // Footer
  const [footerText, setFooterText] = useState("");

  // Album defaults
  const [defaultFreePreview, setDefaultFreePreview] = useState(5);

  // Banners
  const [banners, setBanners] = useState<Banner[]>([]);

  // Social links
  const [socials, setSocials] = useState<SocialLink[]>([]);

  useEffect(() => {
    if (!settings) return;
    setLogoUrl(settings["logo_url"] || "");
    setLogoMobileUrl(settings["logo_mobile_url"] || "");
    setFaviconUrl(settings["favicon_url"] || "");
    setSiteName(settings["site_name"] || "Yukvix");
    setTagline(settings["site_tagline"] || "");
    setFooterText(settings["footer_text"] || "");
    setBanners(parseBanners(settings["homepage_banners"]));
    setSocials(parseSocials(settings["social_links"]));
    setDefaultFreePreview(Number(settings["default_free_preview_count"]) || 5);
  }, [settings]);

  const handleSave = () => {
    updateSettings.mutate({
      settings: {
        logo_url: logoUrl,
        logo_mobile_url: logoMobileUrl,
        favicon_url: faviconUrl,
        site_name: siteName,
        site_tagline: tagline,
        footer_text: footerText,
        homepage_banners: JSON.stringify(banners),
        social_links: JSON.stringify(socials),
        default_free_preview_count: String(defaultFreePreview),
      },
    });
  };

  // Banner helpers
  const addBanner = () =>
    setBanners((b) => [...b, { id: uid(), imageUrl: "", title: "", subtitle: "", linkUrl: "", linkLabel: "", sortOrder: b.length }]);
  const removeBanner = (id: string) => setBanners((b) => b.filter((x) => x.id !== id));
  const updateBanner = (id: string, field: keyof Banner, value: string | number) =>
    setBanners((b) => b.map((x) => (x.id === id ? { ...x, [field]: value } : x)));

  // Social helpers
  const addSocial = () => setSocials((s) => [...s, { id: uid(), platform: "", url: "" }]);
  const removeSocial = (id: string) => setSocials((s) => s.filter((x) => x.id !== id));
  const updateSocial = (id: string, field: keyof SocialLink, value: string) =>
    setSocials((s) => s.map((x) => (x.id === id ? { ...x, [field]: value } : x)));

  if (isLoading) {
    return (
      <AdminLayout>
        <div className="flex items-center justify-center h-64">
          <Loader2 className="w-8 h-8 text-primary animate-spin" />
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <SettingsPage
        header={{ icon: Palette, title: "Giao diện", subtitle: "Logo, favicon, banners, footer và social links" }}
        onSave={handleSave}
        isSaving={updateSettings.isPending}
        sections={[{ id: "main", title: "Giao diện trang", content: (
      <div className="space-y-6">
        <section className="bg-card border border-border rounded-xl p-5 mb-5">
          <h2 className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
            <Image className="w-4 h-4 text-primary" /> Branding
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            <div className="space-y-2">
              <Label htmlFor="site-name">Site Name</Label>
              <Input id="site-name" value={siteName} onChange={(e) => setSiteName(e.target.value)} placeholder="Yukvix" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="tagline">Tagline</Label>
              <Input id="tagline" value={tagline} onChange={(e) => setTagline(e.target.value)} placeholder="Premium Cosplay Gallery" />
            </div>
          </div>
          <div className="mt-5 grid grid-cols-1 sm:grid-cols-3 gap-5">
            <MediaUpload label="Logo (Desktop)" currentUrl={logoUrl} folder="cms/logos" onUploaded={(url) => setLogoUrl(url)} />
            <MediaUpload label="Logo (Mobile)" currentUrl={logoMobileUrl} folder="cms/logos" onUploaded={(url) => setLogoMobileUrl(url)} />
            <MediaUpload label="Favicon" currentUrl={faviconUrl} folder="cms/favicon" onUploaded={(url) => setFaviconUrl(url)} accept="image/x-icon,image/png,image/svg+xml" />
          </div>
        </section>

        {/* -- Homepage Banners ------------------------------------------------ */}
        <section className="bg-card border border-border rounded-xl p-5 mb-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
              <Image className="w-4 h-4 text-primary" /> Homepage Banners
            </h2>
            <Button type="button" variant="outline" size="sm" onClick={addBanner}>
              <Plus className="w-4 h-4 mr-1" /> Add Banner
            </Button>
          </div>
          {banners.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-6">Chưa có ảnh bìas yet. Add one above.</p>
          )}
          <div className="space-y-4">
            {banners.map((banner, idx) => (
              <div key={banner.id} className="border border-border rounded-lg p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-muted-foreground">Banner {idx + 1}</span>
                  <Button type="button" variant="ghost" size="sm" onClick={() => removeBanner(banner.id)}>
                    <Trash2 className="w-4 h-4 text-destructive" />
                  </Button>
                </div>
                <MediaUpload
                  label="Banner Image"
                  currentUrl={banner.imageUrl}
                  folder="cms/banners"
                  onUploaded={(url) => updateBanner(banner.id, "imageUrl", url)}
                />
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs">Tiêu đề</Label>
                    <Input value={banner.title} onChange={(e) => updateBanner(banner.id, "title", e.target.value)} placeholder="Banner title" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Subtitle</Label>
                    <Input value={banner.subtitle} onChange={(e) => updateBanner(banner.id, "subtitle", e.target.value)} placeholder="Subtitle text" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Link URL</Label>
                    <Input value={banner.linkUrl} onChange={(e) => updateBanner(banner.id, "linkUrl", e.target.value)} placeholder="/gallery" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Link Label</Label>
                    <Input value={banner.linkLabel} onChange={(e) => updateBanner(banner.id, "linkLabel", e.target.value)} placeholder="Explore" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Display Order</Label>
                    <Input
                      type="number"
                      min={0}
                      value={banner.sortOrder ?? idx}
                      onChange={(e) => updateBanner(banner.id, "sortOrder", parseInt(e.target.value) || 0)}
                      placeholder="0"
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* -- Album Defaults ------------------------------------------------- */}
        <section className="bg-card border border-border rounded-xl p-5 mb-5">
          <h2 className="text-sm font-semibold text-foreground mb-1">Album Defaults</h2>
          <p className="text-xs text-muted-foreground mb-4">Default values when creating a new VIP album</p>
          <div className="space-y-2 max-w-xs">
            <Label htmlFor="default-free-preview">Default Free Preview (number trong photos)</Label>
            <input
              id="default-free-preview"
              type="number"
              min={0}
              max={50}
              value={defaultFreePreview}
              onChange={(e) => setDefaultFreePreview(Math.max(0, Math.min(50, Number(e.target.value))))}
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            />
            <p className="text-xs text-muted-foreground">Number trong free photos regular users can preview before needing VIP. Applied when creating new album.</p>
          </div>
        </section>

        {/* -- Footer --------------------------------------------------------- */}
        <section className="bg-card border border-border rounded-xl p-5 mb-5">
          <h2 className="text-sm font-semibold text-foreground mb-4">Footer</h2>
          <div className="space-y-2">
            <Label htmlFor="footer-text">Footer Text / Copyright</Label>
            <Textarea
              id="footer-text"
              value={footerText}
              onChange={(e) => setFooterText(e.target.value)}
              placeholder="© 2026 Yukvix. All rights reserved."
              rows={2}
            />
          </div>
        </section>

        {/* -- Social Links ---------------------------------------------------- */}
        <section className="bg-card border border-border rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
              <Link2 className="w-4 h-4 text-primary" /> Social Links
            </h2>
            <Button type="button" variant="outline" size="sm" onClick={addSocial}>
              <Plus className="w-4 h-4 mr-1" /> Add Link
            </Button>
          </div>
          {socials.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-4">No social links yet.</p>
          )}
          <div className="space-y-2">
            {socials.map((s) => (
              <div key={s.id} className="flex items-center gap-2">
                <Input
                  value={s.platform}
                  onChange={(e) => updateSocial(s.id, "platform", e.target.value)}
                  placeholder="Platform (e.g. Twitter)"
                  className="w-36"
                />
                <Input
                  value={s.url}
                  onChange={(e) => updateSocial(s.id, "url", e.target.value)}
                  placeholder="https://..."
                  className="flex-1"
                />
                <Button type="button" variant="ghost" size="sm" onClick={() => removeSocial(s.id)}>
                  <Trash2 className="w-4 h-4 text-destructive" />
                </Button>
              </div>
            ))}
          </div>
        </section>
      </div>
        )}]}
      />
    </AdminLayout>
  );
}
