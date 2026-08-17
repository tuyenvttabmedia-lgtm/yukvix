import { useState, useEffect } from "react";
import { SettingsPage } from "@/admin";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { AlertCircle, CheckCircle2, Loader2, Mail, Send, TestTube2 } from "lucide-react";
import AdminLayout from "./AdminLayout";

export default function AdminSmtp() {
  const { data: settings, isLoading } = trpc.smtp.getSettings.useQuery();
  const saveMutation = trpc.smtp.saveSettings.useMutation();
  const testMutation = trpc.smtp.testConnection.useMutation();

  const [form, setForm] = useState({
    host: "",
    port: 587,
    secure: false,
    user: "",
    password: "",
    fromName: "Yukvix",
    fromEmail: "",
    enabled: true,
  });

  const [testResult, setTestResult] = useState<{ success: boolean; error?: string } | null>(null);
  const [saveResult, setSaveResult] = useState<{ success: boolean } | null>(null);

  useEffect(() => {
    if (settings) {
      setForm({
        host: settings.host,
        port: settings.port,
        secure: settings.secure,
        user: settings.user,
        password: settings.password,
        fromName: settings.fromName,
        fromEmail: settings.fromEmail,
        enabled: settings.enabled,
      });
    }
  }, [settings]);

  const handleTest = async () => {
    setTestResult(null);
    try {
      const result = await testMutation.mutateAsync({
        host: form.host,
        port: form.port,
        secure: form.secure,
        user: form.user,
        password: form.password,
      });
      setTestResult(result);
    } catch (err: any) {
      setTestResult({ success: false, error: err.message });
    }
  };

  const handleSave = async () => {
    setSaveResult(null);
    try {
      await saveMutation.mutateAsync(form);
      setSaveResult({ success: true });
    } catch (err: any) {
      setSaveResult({ success: false });
    }
  };

  if (isLoading) {
    return (
      <AdminLayout>
        <div className="p-6 flex items-center justify-center min-h-[400px]">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <SettingsPage
        header={{ icon: Mail, title: "Cấu hình SMTP", subtitle: "Gửi email xác thực và thông báo" }}
        onSave={handleSave}
        isSaving={saveMutation.isPending}
        sections={[
          {
            id: "smtp",
            title: "Cấu hình SMTP",
            description: "Gmail: smtp.gmail.com, port 587, App Password (không dùng mật khẩu thường).",
            content: (
              <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="col-span-2">
              <Label htmlFor="host">SMTP Host</Label>
              <Input
                id="host"
                placeholder="smtp.gmail.com"
                value={form.host}
                onChange={(e) => setForm({ ...form, host: e.target.value })}
              />
            </div>
            <div>
              <Label htmlFor="port">Port</Label>
              <Input
                id="port"
                type="number"
                placeholder="587"
                value={form.port}
                onChange={(e) => setForm({ ...form, port: parseInt(e.target.value) || 587 })}
              />
            </div>
          </div>

          {/* Secure toggle */}
          <div className="flex items-center gap-3">
            <Switch
              id="secure"
              checked={form.secure}
              onCheckedChange={(checked) => setForm({ ...form, secure: checked })}
            />
            <Label htmlFor="secure" className="cursor-pointer">
              Use SSL/TLS (port 465). Leave trongf for STARTTLS (port 587).
            </Label>
          </div>

          {/* Username & Password */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="user">Username / Email</Label>
              <Input
                id="user"
                placeholder="your@gmail.com"
                value={form.user}
                onChange={(e) => setForm({ ...form, user: e.target.value })}
              />
            </div>
            <div>
              <Label htmlFor="password">Password / App Password</Label>
              <Input
                id="password"
                type="password"
                placeholder="••••••••"
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
              />
            </div>
          </div>

          {/* From Name & Email */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="fromName">From Name</Label>
              <Input
                id="fromName"
                placeholder="Yukvix"
                value={form.fromName}
                onChange={(e) => setForm({ ...form, fromName: e.target.value })}
              />
            </div>
            <div>
              <Label htmlFor="fromEmail">From Email</Label>
              <Input
                id="fromEmail"
                type="email"
                placeholder="noreply@yukvix.com"
                value={form.fromEmail}
                onChange={(e) => setForm({ ...form, fromEmail: e.target.value })}
              />
            </div>
          </div>

          {/* Enabled toggle */}
          <div className="flex items-center gap-3">
            <Switch
              id="enabled"
              checked={form.enabled}
              onCheckedChange={(checked) => setForm({ ...form, enabled: checked })}
            />
            <Label htmlFor="enabled" className="cursor-pointer">
              Enable email sending
            </Label>
          </div>

          {/* Test Result */}
          {testResult && (
            <div
              className={`flex items-center gap-2 p-3 rounded-lg text-sm ${
                testResult.success
                  ? "bg-green-500/10 text-green-400 border border-green-500/20"
                  : "bg-red-500/10 text-red-400 border border-red-500/20"
              }`}
            >
              {testResult.success ? (
                <CheckCircle2 className="w-4 h-4 shrink-0" />
              ) : (
                <AlertCircle className="w-4 h-4 shrink-0" />
              )}
              <span>
                {testResult.success
                  ? "Connection successful! SMTP server is reachable."
                  : `Connection failed: ${testResult.error}`}
              </span>
            </div>
          )}

          {/* Save Result */}
          {saveResult?.success && (
            <div className="flex items-center gap-2 p-3 rounded-lg text-sm bg-green-500/10 text-green-400 border border-green-500/20">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>Đã lưu cài đặt successfully!</span>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex gap-3 pt-2">
            <Button
              variant="outline"
              onClick={handleTest}
              disabled={testMutation.isPending || !form.host || !form.user || !form.password}
            >
              {testMutation.isPending ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <TestTube2 className="w-4 h-4 mr-2" />
              )}
              Kiểm tra kết nối
            </Button>
          </div>
              </div>
            ),
          },
          {
            id: "help",
            title: "Hướng dẫn Gmail",
            content: (
              <div className="text-sm text-muted-foreground space-y-2">
          <p>1. Vào Google Account → Security → Bật 2-Step Verification.</p>
          <p>2. Security → App Passwords → Tạo mật khẩu ứng dụng cho "Mail".</p>
          <p>3. Dùng cấu hình:</p>
          <div className="bg-secondary/50 rounded-lg p-3 font-mono text-xs space-y-1">
            <p>Host: smtp.gmail.com</p>
            <p>Port: 587</p>
            <p>Secure: Off (STARTTLS)</p>
            <p>Username: your.email@gmail.com</p>
            <p>Password: (16-char app password)</p>
          </div>
              </div>
            ),
          },
        ]}
      />
    </AdminLayout>
  );
}
