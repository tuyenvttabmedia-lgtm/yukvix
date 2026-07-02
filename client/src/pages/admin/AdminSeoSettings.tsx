import { useState, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Save, Search, Tag, Globe, AlertCircle, CheckCircle2, Loader2 } from "lucide-react";
import AdminLayout from "./AdminLayout";

export default function AdminSeoSettings() {
  const utils = trpc.useUtils();
  const { data: settings, isLoading } = trpc.seo.getSettings.useQuery();

  const [gtmId, setGtmId] = useState("");
  const [gscMeta, setGscMeta] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (settings) {
      setGtmId(settings.gtmContainerId ?? "");
      setGscMeta(settings.gscVerificationMeta ?? "");
    }
  }, [settings]);

  const updateMutation = trpc.seo.updateSettings.useMutation({
    onSuccess: () => {
      utils.seo.getSettings.invalidate();
      toast.success("Đã lưu cài đặt SEO tracking");
    },
    onError: (e) => toast.error(e.message),
  });

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await updateMutation.mutateAsync({
        gtmContainerId: gtmId || null,
        gscVerificationMeta: gscMeta || null,
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <AdminLayout>
      <div className="p-6 max-w-2xl mx-auto">
        <div className="mb-6">
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Search className="w-6 h-6" /> SEO Tracking Settings
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Cấu hình Google Tag Manager và Google Search Console
          </p>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <form onSubmit={handleSave} className="space-y-6">
            {/* GTM Section */}
            <div className="bg-card border border-border rounded-xl p-5 space-y-4">
              <div className="flex items-center gap-2">
                <Tag className="w-4 h-4 text-primary" />
                <h2 className="font-semibold">Google Tag Manager</h2>
                {gtmId && <span className="ml-auto text-xs text-emerald-400 flex items-center gap-1"><CheckCircle2 className="w-3 h-3" /> Active</span>}
              </div>

              <div>
                <Label className="text-sm mb-1.5 block">GTM Container ID</Label>
                <Input
                  value={gtmId}
                  onChange={(e) => setGtmId(e.target.value.trim())}
                  placeholder="GTM-XXXXXXX"
                  className="font-mono"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Tìm trong Google Tag Manager → Admin → Container ID. Ví dụ: <code className="text-primary">GTM-ABC1234</code>
                </p>
              </div>

              <div className="rounded-lg bg-secondary/50 border border-border/50 p-3 text-xs text-muted-foreground space-y-1">
                <p className="font-medium text-foreground/80">Hướng dẫn:</p>
                <p>1. Đăng nhập <a href="https://tagmanager.google.com" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">tagmanager.google.com</a></p>
                <p>2. Tạo container mới hoặc chọn container hiện có</p>
                <p>3. Copy Container ID (dạng GTM-XXXXXXX) và dán vào đây</p>
                <p>4. Trong GTM, thêm các tag: GA4, Facebook Pixel, TikTok Pixel, v.v.</p>
              </div>
            </div>

            {/* GSC Section */}
            <div className="bg-card border border-border rounded-xl p-5 space-y-4">
              <div className="flex items-center gap-2">
                <Globe className="w-4 h-4 text-primary" />
                <h2 className="font-semibold">Google Search Console</h2>
                {gscMeta && <span className="ml-auto text-xs text-emerald-400 flex items-center gap-1"><CheckCircle2 className="w-3 h-3" /> Configured</span>}
              </div>

              <div>
                <Label className="text-sm mb-1.5 block">Verification Meta Content</Label>
                <Input
                  value={gscMeta}
                  onChange={(e) => setGscMeta(e.target.value.trim())}
                  placeholder="abc123def456..."
                  className="font-mono text-sm"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Chỉ nhập phần <strong>content</strong> của meta tag, không cần nhập toàn bộ tag.
                </p>
              </div>

              <div className="rounded-lg bg-secondary/50 border border-border/50 p-3 text-xs text-muted-foreground space-y-1">
                <p className="font-medium text-foreground/80">Hướng dẫn:</p>
                <p>1. Đăng nhập <a href="https://search.google.com/search-console" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">Google Search Console</a></p>
                <p>2. Thêm property → chọn URL prefix → nhập <code className="text-primary">https://yukvix.com</code></p>
                <p>3. Chọn phương thức xác minh HTML tag</p>
                <p>4. Copy phần nội dung trong <code className="text-primary">content="..."</code> và dán vào đây</p>
                <p>5. Lưu cài đặt → quay lại GSC → nhấn Verify</p>
              </div>

              {gscMeta && (
                <div className="rounded-lg bg-muted/30 border border-border/50 p-3">
                  <p className="text-xs text-muted-foreground mb-1">Preview meta tag:</p>
                  <code className="text-xs text-primary break-all">
                    {`<meta name="google-site-verification" content="${gscMeta}" />`}
                  </code>
                </div>
              )}
            </div>

            {/* Sitemap info */}
            <div className="bg-card border border-border rounded-xl p-5 space-y-3">
              <div className="flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-amber-400" />
                <h2 className="font-semibold">Sitemap URLs</h2>
              </div>
              <div className="space-y-1.5 text-sm">
                {[
                  "/sitemap.xml",
                  "/sitemap-pages.xml",
                  "/sitemap-albums.xml",
                  "/sitemap-creators.xml",
                  "/sitemap-tags.xml",
                  "/sitemap-images.xml",
                ].map((path) => (
                  <div key={path} className="flex items-center gap-2">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0" />
                    <a
                      href={path}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary hover:underline font-mono text-xs"
                    >
                      https://yukvix.com{path}
                    </a>
                  </div>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">
                Thêm <code className="text-primary">https://yukvix.com/sitemap.xml</code> vào Google Search Console → Sitemaps.
              </p>
            </div>

            <Button type="submit" disabled={saving} className="w-full">
              {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Save className="w-4 h-4 mr-2" />}
              Lưu cài đặt SEO Tracking
            </Button>
          </form>
        )}
      </div>
    </AdminLayout>
  );
}
