import { useState, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import AdminLayout from "../AdminLayout";
import {
  CreditCard,
  Bitcoin,
  CheckCircle,
  XCircle,
  AlertCircle,
  Shield,
  ExternalLink,
  Settings,
  RefreshCw,
  Webhook,
  Save,
  Info,
  AlertTriangle,
  Wifi,
  WifiOff,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";

function StatusRow({
  label,
  value,
  ok,
}: {
  label: string;
  value: string;
  ok: boolean | null;
}) {
  return (
    <div className="flex items-center justify-between py-3 border-b border-border/30 last:border-0">
      <span className="text-sm text-muted-foreground">{label}</span>
      <div className="flex items-center gap-2">
        <span className="text-sm font-mono text-foreground/80 bg-muted/30 px-2 py-0.5 rounded text-xs">
          {value}
        </span>
        {ok === true && <CheckCircle className="w-4 h-4 text-green-400 shrink-0" />}
        {ok === false && <XCircle className="w-4 h-4 text-red-400 shrink-0" />}
        {ok === null && <AlertCircle className="w-4 h-4 text-yellow-400 shrink-0" />}
      </div>
    </div>
  );
}

function WebhookEndpoint({ label, url }: { label: string; url: string }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground mb-1 font-medium">{label}</p>
      <div className="flex items-center gap-2 bg-secondary/30 rounded-lg px-3 py-2">
        <code className="text-xs font-mono text-foreground/80 flex-1 truncate">{url}</code>
        <button
          className="text-muted-foreground hover:text-foreground transition-colors shrink-0"
          onClick={() => {
            navigator.clipboard.writeText(url);
            toast.success("Đã sao chép");
          }}
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
          </svg>
        </button>
      </div>
    </div>
  );
}

export default function AdminPaymentSettings() {
  const { data, isLoading, refetch } = trpc.payments.stripeStatus.useQuery();
  const { data: cfgData, refetch: refetchCfg } = trpc.payments.getPaymentConfig.useQuery();
  const saveConfig = trpc.payments.savePaymentConfig.useMutation({
    onSuccess: () => { toast.success("Đã lưu cài đặt"); refetch(); refetchCfg(); },
    onError: (err) => toast.error(`Lưu thất bại: ${err.message}`),
  });

  // CCBill form state
  const [ccbillEnabled, setCcbillEnabled] = useState(false);
  const [ccbillAccountNum, setCcbillAccountNum] = useState("");
  const [ccbillSubAccountNum, setCcbillSubAccountNum] = useState("0000");
  const [ccbillFlexId, setCcbillFlexId] = useState("");
  const [ccbillSalt, setCcbillSalt] = useState("");
  const [ccbillCurrencyCode, setCcbillCurrencyCode] = useState("840");
  // NOWPayments form state
  const [nowApiKey, setNowApiKey] = useState("");
  const [nowIpnSecret, setNowIpnSecret] = useState("");
  const [nowCurrency, setNowCurrency] = useState("usdttrc20");
  // Active provider
  const [activeProviderState, setActiveProviderState] = useState<"ccbill" | "crypto">("crypto");

  // Kiểm tra kết nối state
  const [nowTestResult, setNowTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [ccbillTestResult, setCcbillTestResult] = useState<{ success: boolean; message: string } | null>(null);

  // Gửi webhook thử state
  const [nowWebhookResult, setNowWebhookResult] = useState<{ success: boolean; message: string; logged?: boolean } | null>(null);
  const [ccbillWebhookResult, setCcbillWebhookResult] = useState<{ success: boolean; message: string; logged?: boolean } | null>(null);

  const sendTestWebhook = trpc.payments.sendTestWebhook.useMutation({
    onSuccess: (res, vars) => {
      const result = { success: res.success, message: res.message, logged: res.logged };
      if (vars.provider === "nowpayments") setNowWebhookResult(result);
      else setCcbillWebhookResult(result);
      if (res.success) toast.success(res.message);
      else toast.error(res.message);
    },
    onError: (err, vars) => {
      const result = { success: false, message: err.message, logged: false };
      if (vars.provider === "nowpayments") setNowWebhookResult(result);
      else setCcbillWebhookResult(result);
      toast.error(`Kiểm tra webhook thất bại: ${err.message}`);
    },
  });

  const testNow = trpc.payments.testNowpaymentsConnection.useMutation({
    onSuccess: (res) => {
      setNowTestResult({ success: res.success, message: res.message });
      if (res.success) toast.success(res.message);
      else toast.error(res.message);
    },
    onError: (err) => {
      setNowTestResult({ success: false, message: err.message });
      toast.error(`Kiểm tra thất bại: ${err.message}`);
    },
  });

  const testCcbill = trpc.payments.testCcbillConnection.useMutation({
    onSuccess: (res) => {
      setCcbillTestResult({ success: res.success, message: res.message });
      if (res.success) toast.success(res.message);
      else toast.error(res.message);
    },
    onError: (err) => {
      setCcbillTestResult({ success: false, message: err.message });
      toast.error(`Kiểm tra thất bại: ${err.message}`);
    },
  });

  useEffect(() => {
    if (!cfgData) return;
    const c = cfgData as any;
    setActiveProviderState(c.activeProvider ?? "crypto");
    setCcbillEnabled(c.ccbill?.enabled !== false);
    setCcbillAccountNum(c.ccbill?.accountNum ?? "");
    setCcbillSubAccountNum(c.ccbill?.subAccountNum ?? "0000");
    setCcbillFlexId(c.ccbill?.flexId ?? "");
    setCcbillSalt(c.ccbill?.salt ?? "");
    setCcbillCurrencyCode(c.ccbill?.currencyCode ?? "840");
    setNowApiKey(c.nowpayments?.apiKey ?? "");
    setNowIpnSecret(c.nowpayments?.ipnSecret ?? "");
    setNowCurrency(c.nowpayments?.currency ?? "usdttrc20");
  }, [cfgData]);

  const handleSetActiveProvider = (p: "ccbill" | "crypto") => {
    setActiveProviderState(p);
    saveConfig.mutate({ activeProvider: p });
  };

  const handleToggleCcbill = (val: boolean) => {
    setCcbillEnabled(val);
    saveConfig.mutate({ ccbillEnabled: val });
    toast.success(val ? "Đã bật CCBill" : "Đã tắt CCBill");
  };

  const handleSaveCCBill = () => saveConfig.mutate({
    ccbillEnabled,
    ccbillAccountNum,
    ccbillSubAccountNum,
    ccbillFlexId,
    ccbillSalt: ccbillSalt.includes("••••") ? undefined : ccbillSalt,
    ccbillCurrencyCode,
  });

  const handleSaveNOWPayments = () => saveConfig.mutate({
    nowApiKey: nowApiKey.includes("••••") ? undefined : nowApiKey,
    nowIpnSecret: nowIpnSecret.includes("••••") ? undefined : nowIpnSecret,
    nowCurrency,
  });

  const activeProvider = activeProviderState;
  const isCCBill = activeProvider === "ccbill";
  const isCrypto = activeProvider === "crypto";

  const origin = typeof window !== "undefined" ? window.location.origin : "https://yukvix.com";

  const providerBadgeColor = isCCBill
    ? "bg-orange-500/10 text-orange-400 border-orange-500/20"
    : "bg-blue-500/10 text-blue-400 border-blue-500/20";

  return (
    <AdminLayout>
      <div className="p-6 max-w-3xl space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <CreditCard className="w-6 h-6 text-primary" />
            <div>
              <h1
                className="text-2xl font-bold text-foreground"
                style={{ fontFamily: "'Playfair Display', serif" }}
              >
                Cài đặt thanh toán
              </h1>
              <p className="text-sm text-muted-foreground mt-0.5">
                Trạng thái nhà cung cấp thanh toán — khóa bí mật không bao giờ hiển thị đầy đủ
              </p>
            </div>
          </div>
          <Button variant="outline" size="sm" className="gap-1.5" onClick={() => refetch()}>
            <RefreshCw className="w-3.5 h-3.5" />
            Làm mới
          </Button>
        </div>

        {isLoading ? (
          <div className="space-y-4">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-32 skeleton rounded-xl" />
            ))}
          </div>
        ) : (
          <>
            {/* Nhà cung cấp đang hoạt động Banner */}
            <div className="rounded-xl border border-border/50 bg-card p-5">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <Settings className="w-4 h-4 text-primary" />
                  <h2 className="font-semibold text-foreground">Nhà cung cấp đang hoạt động</h2>
                </div>
                <div className="flex items-center gap-2">
                  <span
                    className={`text-xs font-semibold px-3 py-1 rounded-full border uppercase tracking-wide ${providerBadgeColor}`}
                  >
                    {activeProvider}
                  </span>
                  {data?.configured ? (
                    <Badge className="bg-green-500/15 text-green-400 border-green-500/20 gap-1">
                      <CheckCircle className="w-3 h-3" />
                      Đã cấu hình
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="text-muted-foreground gap-1">
                      <XCircle className="w-3 h-3" />
                      Chưa cấu hình
                    </Badge>
                  )}
                </div>
              </div>

              <p className="text-sm text-muted-foreground">
                {!data?.configured
                  ? "Chưa có nhà cung cấp thanh toán. Hãy cấu hình CCBill hoặc NOWPayments bên dưới."
                  : isCCBill
                  ? "CCBill đang hoạt động. Thanh toán thẻ tín dụng/ghi nợ qua CCBill FlexForms đã bật."
                  : "NOWPayments crypto đang hoạt động. Thanh toán USDT TRC20/BEP20 đã bật."}
              </p>

              <div className="mt-3 pt-3 border-t border-border/30 flex gap-2">
                <Button size="sm" variant={isCrypto ? "default" : "outline"} onClick={() => handleSetActiveProvider("crypto")} disabled={saveConfig.isPending}>
                  <Bitcoin className="w-3.5 h-3.5 mr-1.5" />Dùng NOWPayments
                </Button>
                <Button size="sm" variant={isCCBill ? "default" : "outline"} onClick={() => handleSetActiveProvider("ccbill")} disabled={saveConfig.isPending || !ccbillEnabled} title={!ccbillEnabled ? "Bật CCBill trước khi chọn" : undefined}>
                  <CreditCard className="w-3.5 h-3.5 mr-1.5" />Dùng CCBill
                  {!ccbillEnabled && <span className="ml-1 text-xs opacity-60">(tắt)</span>}
                </Button>
              </div>
            </div>

            {/* CCBill Config Form */}
            <div className="rounded-xl border border-border/50 bg-card p-5">
              <div className="flex items-center justify-between gap-2 mb-4">
                <div className="flex items-center gap-2">
                  <CreditCard className="w-4 h-4 text-primary" />
                  <h2 className="font-semibold text-foreground">Cấu hình CCBill</h2>
                  {(cfgData as any)?.ccbill?.configured
                    ? <Badge className="bg-green-600 text-xs">Đã cấu hình</Badge>
                    : <Badge variant="secondary" className="text-xs">Chưa cấu hình</Badge>}
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">{ccbillEnabled ? "Đang bật" : "Đang tắt"}</span>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={ccbillEnabled}
                    onClick={() => handleToggleCcbill(!ccbillEnabled)}
                    className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                      ccbillEnabled ? "bg-primary" : "bg-muted"
                    }`}
                  >
                    <span
                      className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                        ccbillEnabled ? "translate-x-4" : "translate-x-0"
                      }`}
                    />
                  </button>
                </div>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1">
                  <Label className="text-xs">Số tài khoản</Label>
                  <Input placeholder="900000" value={ccbillAccountNum} onChange={e => setCcbillAccountNum(e.target.value)} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Số tài khoản phụ</Label>
                  <Input placeholder="0000" value={ccbillSubAccountNum} onChange={e => setCcbillSubAccountNum(e.target.value)} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Flex ID (UUID)</Label>
                  <Input placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" value={ccbillFlexId} onChange={e => setCcbillFlexId(e.target.value)} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Mã tiền tệ</Label>
                  <Input placeholder="840" value={ccbillCurrencyCode} onChange={e => setCcbillCurrencyCode(e.target.value)} />
                </div>
                <div className="space-y-1 sm:col-span-2">
                  <Label className="text-xs">Salt / Khóa mã hóa</Label>
                  <Input type="password" placeholder={(cfgData as any)?.ccbill?.saltConfigured ? "••••••••••••••••" : "Nhập CCBill salt"} value={ccbillSalt} onChange={e => setCcbillSalt(e.target.value)} />
                </div>
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                <Button size="sm" onClick={handleSaveCCBill} disabled={saveConfig.isPending}>
                  {saveConfig.isPending ? <RefreshCw className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Save className="w-3.5 h-3.5 mr-1.5" />}
                  Lưu CCBill
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => testCcbill.mutate({ accountNum: ccbillAccountNum, subAccountNum: ccbillSubAccountNum })}
                  disabled={testCcbill.isPending}
                  className="gap-1.5"
                >
                  {testCcbill.isPending
                    ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    : ccbillTestResult?.success === true
                    ? <Wifi className="w-3.5 h-3.5 text-green-400" />
                    : ccbillTestResult?.success === false
                    ? <WifiOff className="w-3.5 h-3.5 text-red-400" />
                    : <Wifi className="w-3.5 h-3.5" />}
                  Kiểm tra kết nối
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => sendTestWebhook.mutate({ provider: "ccbill", origin: window.location.origin })}
                  disabled={sendTestWebhook.isPending && sendTestWebhook.variables?.provider === "ccbill"}
                  className="gap-1.5"
                >
                  {sendTestWebhook.isPending && sendTestWebhook.variables?.provider === "ccbill"
                    ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    : <Webhook className="w-3.5 h-3.5" />}
                  Gửi webhook thử
                </Button>
                <Button variant="outline" size="sm" onClick={() => window.open("https://admin.ccbill.com", "_blank")}>
                  <ExternalLink className="w-3.5 h-3.5 mr-1.5" />CCBill Admin
                </Button>
              </div>
              {ccbillWebhookResult && (
                <div className={`mt-2 flex items-start gap-2 rounded-lg px-3 py-2 text-xs ${
                  ccbillWebhookResult.success
                    ? "bg-green-500/10 border border-green-500/20 text-green-300"
                    : "bg-red-500/10 border border-red-500/20 text-red-300"
                }`}>
                  {ccbillWebhookResult.success
                    ? <CheckCircle className="w-3.5 h-3.5 shrink-0 mt-0.5 text-green-400" />
                    : <XCircle className="w-3.5 h-3.5 shrink-0 mt-0.5 text-red-400" />}
                  <span>{ccbillWebhookResult.message}{ccbillWebhookResult.logged ? " ✓ Đã ghi log" : ""}</span>
                </div>
              )}
              {ccbillTestResult && (
                <div className={`mt-3 flex items-start gap-2 rounded-lg px-3 py-2 text-xs ${
                  ccbillTestResult.success
                    ? "bg-green-500/10 border border-green-500/20 text-green-300"
                    : "bg-red-500/10 border border-red-500/20 text-red-300"
                }`}>
                  {ccbillTestResult.success
                    ? <CheckCircle className="w-3.5 h-3.5 shrink-0 mt-0.5 text-green-400" />
                    : <XCircle className="w-3.5 h-3.5 shrink-0 mt-0.5 text-red-400" />}
                  <span>{ccbillTestResult.message}</span>
                </div>
              )}
            </div>

            {/* NOWPayments Config Form */}
            <div className="rounded-xl border border-border/50 bg-card p-5">
              <div className="flex items-center gap-2 mb-4">
                <Bitcoin className="w-4 h-4 text-primary" />
                <h2 className="font-semibold text-foreground">Cấu hình NOWPayments</h2>
                {(cfgData as any)?.nowpayments?.configured
                  ? <Badge className="bg-green-600 text-xs">Đã cấu hình</Badge>
                  : <Badge variant="destructive" className="text-xs">Chưa cấu hình</Badge>}
              </div>
              <div className="grid gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">API Key</Label>
                  <Input type="password" placeholder={(cfgData as any)?.nowpayments?.apiKeyConfigured ? "••••••••••••••••" : "Nhập NOWPayments API key"} value={nowApiKey} onChange={e => setNowApiKey(e.target.value)} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">IPN Secret</Label>
                  <Input type="password" placeholder={(cfgData as any)?.nowpayments?.ipnSecretConfigured ? "••••••••••••••••" : "Nhập IPN secret"} value={nowIpnSecret} onChange={e => setNowIpnSecret(e.target.value)} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Tiền tệ mặc định</Label>
                  <Input placeholder="usdttrc20" value={nowCurrency} onChange={e => setNowCurrency(e.target.value)} />
                  <p className="text-xs text-muted-foreground">Ví dụ: usdttrc20, usdtbsc</p>
                </div>
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                <Button size="sm" onClick={handleSaveNOWPayments} disabled={saveConfig.isPending}>
                  {saveConfig.isPending ? <RefreshCw className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Save className="w-3.5 h-3.5 mr-1.5" />}
                  Lưu NOWPayments
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => testNow.mutate({ apiKey: nowApiKey.includes("••••") ? undefined : nowApiKey })}
                  disabled={testNow.isPending}
                  className="gap-1.5"
                >
                  {testNow.isPending
                    ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    : nowTestResult?.success === true
                    ? <Wifi className="w-3.5 h-3.5 text-green-400" />
                    : nowTestResult?.success === false
                    ? <WifiOff className="w-3.5 h-3.5 text-red-400" />
                    : <Wifi className="w-3.5 h-3.5" />}
                  Kiểm tra kết nối
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => sendTestWebhook.mutate({ provider: "nowpayments", origin: window.location.origin })}
                  disabled={sendTestWebhook.isPending && sendTestWebhook.variables?.provider === "nowpayments"}
                  className="gap-1.5"
                >
                  {sendTestWebhook.isPending && sendTestWebhook.variables?.provider === "nowpayments"
                    ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    : <Webhook className="w-3.5 h-3.5" />}
                  Gửi webhook thử
                </Button>
                <Button variant="outline" size="sm" onClick={() => window.open("https://nowpayments.io/dashboard", "_blank")}>
                  <ExternalLink className="w-3.5 h-3.5 mr-1.5" />NOWPayments Dashboard
                </Button>
              </div>
              {nowWebhookResult && (
                <div className={`mt-2 flex items-start gap-2 rounded-lg px-3 py-2 text-xs ${
                  nowWebhookResult.success
                    ? "bg-green-500/10 border border-green-500/20 text-green-300"
                    : "bg-red-500/10 border border-red-500/20 text-red-300"
                }`}>
                  {nowWebhookResult.success
                    ? <CheckCircle className="w-3.5 h-3.5 shrink-0 mt-0.5 text-green-400" />
                    : <XCircle className="w-3.5 h-3.5 shrink-0 mt-0.5 text-red-400" />}
                  <span>{nowWebhookResult.message}{nowWebhookResult.logged ? " ✓ Đã ghi log" : ""}</span>
                </div>
              )}
              {nowTestResult && (
                <div className={`mt-3 flex items-start gap-2 rounded-lg px-3 py-2 text-xs ${
                  nowTestResult.success
                    ? "bg-green-500/10 border border-green-500/20 text-green-300"
                    : "bg-red-500/10 border border-red-500/20 text-red-300"
                }`}>
                  {nowTestResult.success
                    ? <CheckCircle className="w-3.5 h-3.5 shrink-0 mt-0.5 text-green-400" />
                    : <XCircle className="w-3.5 h-3.5 shrink-0 mt-0.5 text-red-400" />}
                  <span>{nowTestResult.message}</span>
                </div>
              )}
            </div>

            {/* Webhook Events Stats */}
            <div className="rounded-xl border border-border/50 bg-card p-5">
              <div className="flex items-center gap-2 mb-4">
                <Webhook className="w-4 h-4 text-primary" />
                <h2 className="font-semibold text-foreground">Thống kê Webhook</h2>
              </div>
              <StatusRow
                label="Tổng sự kiện webhook"
                value={String(data?.webhookEventCount ?? 0)}
                ok={null}
              />
              <StatusRow
                label="Sự kiện webhook thất bại"
                value={String(data?.failedWebhookCount ?? 0)}
                ok={(data?.failedWebhookCount ?? 0) === 0}
              />
            </div>

            {/* Webhook Endpoints */}
            <div className="rounded-xl border border-border/50 bg-card p-5">
              <h2 className="font-semibold text-foreground mb-4">Địa chỉ Webhook</h2>
              <div className="space-y-3">
                <WebhookEndpoint label="CCBill (chính)" url={`${origin}/api/ccbill/webhook`} />
                <WebhookEndpoint label="NOWPayments / Crypto IPN" url={`${origin}/api/crypto/webhook`} />

              </div>
              <p className="text-xs text-muted-foreground mt-4">
                Đăng ký các URL này trong dashboard của nhà cung cấp thanh toán để nhận sự kiện.
              </p>
            </div>

            {/* Security note */}
            <div className="flex items-start gap-3 rounded-xl border border-yellow-500/20 bg-yellow-500/5 px-4 py-3 text-sm text-yellow-300">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-yellow-400" />
              <div>
                <strong className="text-yellow-200">Bảo mật:</strong> Các giá trị nhạy cảm (API key, salt) được lưu trong cơ sở dữ liệu và ẩn sau khi lưu. Chúng không bao giờ được trả về frontend đầy đủ. Để đặt lại, chỉ cần nhập giá trị mới và lưu.
              </div>
            </div>
          </>
        )}
      </div>
    </AdminLayout>
  );
}
