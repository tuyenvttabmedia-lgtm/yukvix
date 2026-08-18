import { useState, useEffect } from "react";
import { SettingsPage } from "@/admin";
import { trpc } from "@/lib/trpc";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Search, Tag, Globe, AlertCircle, CheckCircle2, Loader2 } from "lucide-react";
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

  async function handleSave() {
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
      <SettingsPage
        header={{ icon: Search, title: "Cấu hình SEO", subtitle: "Google Tag Manager và Google Search Console" }}
        onSave={handleSave}
        isSaving={saving}
        sections={isLoading ? [] : [
          {
            id: "gtm",
            title: "Google Tag Manager",
            content: (
              <div className="space-y-4">
              <div>
                <Label className="text-sm mb-1.5 block">GTM Container ID</Label>
                <Input value={gtmId} onChange={(e) => setGtmId(e.target.value.trim())} placeholder="GTM-XXXXXXX" className="font-mono" />
                <p className="text-xs text-muted-foreground mt-1">Ví dụ: <code className="text-primary">GTM-ABC1234</code></p>
              </div>
              </div>
            ),
          },
          {
            id: "gsc",
            title: "Google Search Console",
            content: (
              <div className="space-y-4">
              <div>
                <Label className="text-sm mb-1.5 block">Verification Meta Content</Label>
                <Input value={gscMeta} onChange={(e) => setGscMeta(e.target.value.trim())} placeholder="abc123def456..." className="font-mono text-sm" />
              </div>
              {gscMeta && (
                <code className="text-xs text-primary break-all block">
                  {`<meta name="google-site-verification" content="${gscMeta}" />`}
                </code>
              )}
              </div>
            ),
          },
          {
            id: "sitemap",
            title: "Sitemap URLs",
            content: (
              <div className="space-y-1.5 text-sm">
                {["/sitemap.xml", "/sitemap-pages.xml", "/sitemap-albums.xml", "/sitemap-creators.xml", "/sitemap-tags.xml", "/sitemap-categories.xml", "/sitemap-images.xml"].map((path) => (
                  <div key={path} className="flex items-center gap-2">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0" />
                    <a href={path} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline font-mono text-xs">https://yukvix.com{path}</a>
                  </div>
                ))}
              </div>
            ),
          },
        ]}
      />
    </AdminLayout>
  );
}
