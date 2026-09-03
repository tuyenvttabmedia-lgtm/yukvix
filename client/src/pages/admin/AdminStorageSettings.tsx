/**
 * AdminStorageSettings — Wasabi S3 configuration UI
 * Allows admin to set/update Wasabi credentials stored in DB.
 * Credentials saved here override environment variables at runtime.
 */
import { useState } from "react";
import { SettingsPage } from "@/admin";
import { trpc } from "@/lib/trpc";
import AdminLayout from "./AdminLayout";
import {
  CheckCircle,
  XCircle,
  AlertCircle,
  Save,
  RefreshCw,
  Eye,
  EyeOff,
  HardDrive,
  Info,
  Droplets,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { toast } from "sonner";

function StatusIcon({ ok }: { ok: boolean | null }) {
  if (ok === false) return <XCircle className="w-4 h-4 text-red-400 shrink-0" />;
  return <AlertCircle className="w-4 h-4 text-yellow-400 shrink-0" />;
}

function FieldRow({
  label,
  hint,
  value,
  onChange,
  placeholder,
  secret,
}: {
  label: string;
  hint?: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  secret?: boolean;
}) {
  const [show, setShow] = useState(false);
  return (
    <div className="space-y-1.5">
      <Label className="text-sm font-medium">{label}</Label>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      <div className="relative">
        <Input
          type={secret && !show ? "password" : "text"}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="font-mono text-sm pr-10"
        />
        {secret && (
          <button
            type="button"
            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
            onClick={() => setShow((s) => !s)}
          >
            {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </button>
        )}
      </div>
    </div>
  );
}

export default function AdminStorageSettings() {
  const { data, isLoading, refetch } = trpc.cms.getStorageConfig.useQuery();
  const saveMutation = trpc.cms.saveStorageConfig.useMutation({
    onSuccess: () => { toast.success("Storage configuration saved"); refetch(); },
    onError: (err) => { toast.error(err.message || "Failed to save"); },
  });

  // Watermark
  const { data: wmData, refetch: refetchWm } = trpc.cms.getWatermarkConfig.useQuery();
  const saveWmMutation = trpc.cms.saveWatermarkConfig.useMutation({
    onSuccess: () => { toast.success("Watermark settings saved"); refetchWm(); },
    onError: (err) => { toast.error(err.message || "Failed to save"); },
  });
  type WmPosition = "southeast" | "southwest" | "northeast" | "northwest" | "center";
  const [wm, setWm] = useState<{ enabled: boolean; key: string; opacity: number; position: WmPosition }>(
    { enabled: false, key: "", opacity: 0.4, position: "southeast" }
  );
  const [wmInit, setWmInit] = useState(false);
  if (wmData && !wmInit) {
    setWmInit(true);
    setWm({ enabled: wmData.enabled, key: wmData.key, opacity: wmData.opacity, position: wmData.position as WmPosition });
  }

  const [form, setForm] = useState({
    bucket: "",
    region: "",
    endpoint: "",
    cdnBaseUrl: "",
    cdnEnabled: true,
    accessKeyId: "",
    secretAccessKey: "",
  });
  const [initialized, setInitialized] = useState(false);

  // Initialize form from fetched data (only once)
  if (data && !initialized) {
    setInitialized(true);
    setForm({
      bucket: data.bucket,
      region: data.region,
      endpoint: data.endpoint,
      cdnBaseUrl: data.cdnBaseUrl,
      cdnEnabled: data.cdnEnabled ?? true,
      accessKeyId: data.accessKeyId, // masked if configured
      secretAccessKey: data.secretAccessKey, // masked if configured
    });
  }

  const set = (key: keyof typeof form) => (v: string) => setForm((f) => ({ ...f, [key]: v }));

  const handleSave = () => {
    saveMutation.mutate(form);
  };

  const handleRefresh = () => {
    setInitialized(false);
    refetch();
  };

  return (
    <AdminLayout>
      <SettingsPage
        header={{ icon: HardDrive, title: "Lưu trữ", subtitle: "Cấu hình Wasabi S3 và watermark" }}
        onSave={handleSave}
        isSaving={saveMutation.isPending}
        sections={[{ id: "main", title: "Cấu hình lưu trữ", content: (
      <div className="space-y-6">
        {data && (
          <div className="rounded-xl border border-border/50 bg-card p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Connection Status</span>
              <div className="flex items-center gap-2">
                <StatusIcon ok={data.configured ? true : false} />
                <span className="text-sm">
                  {data.configured ? "Đã cấu hình" : "Chưa cấu hình"}
                </span>
                {data.bucketSource !== "none" && (
                  <Badge variant="secondary" className="text-xs">
                    {data.bucketSource === "env" ? "from env" : "from DB"}
                  </Badge>
                )}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
              <div className="flex items-center gap-1.5">
                <StatusIcon ok={data.accessKeyIdConfigured ? true : null} />
                <span>Access Key ID</span>
              </div>
              <div className="flex items-center gap-1.5">
                <StatusIcon ok={data.secretAccessKeyConfigured ? true : null} />
                <span>Secret Access Key</span>
              </div>
            </div>
          </div>
        )}

        {/* Info alert */}
        <Alert>
          <Info className="w-4 h-4" />
          <AlertDescription className="text-sm">
            Values saved here override environment variables at runtime. Leave a field blank to fall
            back to the environment variable. Masked values (•••) are already configured — clear the
            field to remove, or type a new value to replace.
          </AlertDescription>
        </Alert>

        {/* Form */}
        <div className="rounded-xl border border-border/50 bg-card p-5 space-y-5">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
            Credentials
          </h2>

          <FieldRow
            label="Bucket Name"
            hint="The Wasabi bucket where media files are stored."
            value={form.bucket}
            onChange={set("bucket")}
            placeholder="my-cosplay-bucket"
          />

          <FieldRow
            label="Region"
            hint="Wasabi region, e.g. us-east-1, eu-central-1, ap-northeast-1."
            value={form.region}
            onChange={set("region")}
            placeholder="us-east-1"
          />

          <FieldRow
            label="Endpoint URL"
            hint="Direct Wasabi endpoint (not CDN). Used for presigned upload URLs."
            value={form.endpoint}
            onChange={set("endpoint")}
            placeholder="https://s3.us-east-1.wasabisys.com"
          />

          {/* CDN section with ON/OFF toggle */}
          <div className="space-y-3 rounded-lg border border-border/50 p-4">
            <div className="flex items-center justify-between">
              <div>
                <Label className="text-sm font-medium">CDN Delivery</Label>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {form.cdnEnabled
                    ? "Using CDN for media delivery"
                    : "Using direct Wasabi URLs (CDN disabled)"}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setForm((f) => ({ ...f, cdnEnabled: !f.cdnEnabled }))}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                  form.cdnEnabled ? "bg-primary" : "bg-secondary border border-border"
                }`}
              >
                <span className={`inline-block h-4 w-4 rounded-full bg-white shadow transition-transform ${
                  form.cdnEnabled ? "translate-x-6" : "translate-x-1"
                }`} />
              </button>
            </div>
            <div className={`transition-opacity ${
              form.cdnEnabled ? "opacity-100" : "opacity-40 pointer-events-none"
            }`}>
              <FieldRow
                label="CDN Base URL"
                hint="Public CDN domain for GET (thumbs/covers). CNAME tới s3.ap-southeast-1.wasabisys.com. Cloudflare phải bật Proxy (cam) để HTTPS có chứng chỉ media.yukvix.com — Proxy off sẽ lỗi SSL. Upload vẫn đi thẳng Wasabi, không qua CDN."
                value={form.cdnBaseUrl}
                onChange={set("cdnBaseUrl")}
                placeholder="https://cdn.yourdomain.com"
              />
            </div>
            {!form.cdnEnabled && (
              <p className="text-xs text-amber-500 flex items-center gap-1.5">
                <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                CDN is OFF — all media will be served directly from Wasabi.
              </p>
            )}
          </div>

          <FieldRow
            label="Access Key ID"
            hint="Wasabi IAM access key ID."
            value={form.accessKeyId}
            onChange={set("accessKeyId")}
            placeholder="Enter new access key ID…"
            secret
          />

          <FieldRow
            label="Secret Access Key"
            hint="Wasabi IAM secret access key."
            value={form.secretAccessKey}
            onChange={set("secretAccessKey")}
            placeholder="Enter new secret access key…"
            secret
          />
        </div>

        {/* Save button */}
        <div className="flex justify-end">
          <Button onClick={handleSave} disabled={saveMutation.isPending} className="min-w-[120px]">
            {saveMutation.isPending ? <RefreshCw className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
            Lưu thay đổi
          </Button>
        </div>

        {/* -- Watermark -- */}
        <div className="flex items-center gap-3 pt-4">
          <div className="p-2 rounded-lg bg-primary/10">
            <Droplets className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h2 className="text-xl font-semibold">Watermark</h2>
            <p className="text-sm text-muted-foreground">Automatically applied to uploaded photos</p>
          </div>
        </div>

        <div className="rounded-xl border border-border/50 bg-card p-5 space-y-5">
          {/* Enable toggle */}
          <div className="flex items-center justify-between">
            <div>
              <Label className="text-sm font-medium">Enable Watermark</Label>
              <p className="text-xs text-muted-foreground mt-0.5">Apply watermark image to all new uploads</p>
            </div>
            <button
              type="button"
              onClick={() => setWm((w) => ({ ...w, enabled: !w.enabled }))}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                wm.enabled ? "bg-primary" : "bg-secondary border border-border"
              }`}
            >
              <span className={`inline-block h-4 w-4 rounded-full bg-white shadow transition-transform ${
                wm.enabled ? "translate-x-6" : "translate-x-1"
              }`} />
            </button>
          </div>

          {/* Watermark image key */}
          <FieldRow
            label="Watermark Image Key"
            hint="Storage key in the watermark PNG/WebP (e.g. watermarks/logo.png). Upload via Files manager first."
            value={wm.key}
            onChange={(v) => setWm((w) => ({ ...w, key: v }))}
            placeholder="watermarks/logo.png"
          />

          {/* Opacity */}
          <div className="space-y-1.5">
            <Label className="text-sm font-medium">Opacity — {Math.round(wm.opacity * 100)}%</Label>
            <input
              type="range" min="0" max="1" step="0.05"
              value={wm.opacity}
              onChange={(e) => setWm((w) => ({ ...w, opacity: parseFloat(e.target.value) }))}
              className="w-full accent-primary"
            />
          </div>

          {/* Position */}
          <div className="space-y-1.5">
            <Label className="text-sm font-medium">Position</Label>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              {(["northwest","northeast","southwest","southeast","center"] as const).map((pos) => (
                <button
                  key={pos}
                  type="button"
                  onClick={() => setWm((w) => ({ ...w, position: pos }))}
                  className={`py-1.5 px-2 rounded-lg text-xs border transition-colors ${
                    wm.position === pos
                      ? "border-primary bg-primary/10 text-primary font-medium"
                      : "border-border text-muted-foreground hover:border-primary/50"
                  }`}
                >
                  {pos}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="flex justify-end">
          <Button onClick={() => saveWmMutation.mutate(wm)} disabled={saveWmMutation.isPending} className="min-w-[120px]">
            {saveWmMutation.isPending ? <RefreshCw className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
            Save Watermark
          </Button>
        </div>
      </div>
        )}]}
      />
    </AdminLayout>
  );
}
