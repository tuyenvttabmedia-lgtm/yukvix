import { useState } from "react";
import { AdminPageShell, AdminPageHeader } from "@/admin";
import { trpc } from "@/lib/trpc";
import AdminLayout from "../AdminLayout";
import { Button } from "@/components/ui/button";
import {
  Activity,
  Webhook,
  CheckCircle,
  XCircle,
  AlertCircle,
  RefreshCw,
  Copy,
} from "lucide-react";
import { toast } from "sonner";

const STATUS_FILTERS = [
  { value: "all", label: "Tất cả" },
  { value: "success", label: "Thành công" },
  { value: "failed", label: "Thất bại" },
  { value: "skipped", label: "Bỏ qua" },
] as const;

type StatusFilter = (typeof STATUS_FILTERS)[number]["value"];

const STATUS_LABELS: Record<string, string> = {
  success: "Thành công",
  failed: "Thất bại",
  skipped: "Bỏ qua",
};

function EventStatusIcon({ status }: { status: string }) {
  if (status === "success") return <CheckCircle className="w-4 h-4 text-green-500" />;
  if (status === "failed") return <XCircle className="w-4 h-4 text-red-500" />;
  return <AlertCircle className="w-4 h-4 text-yellow-500" />;
}

function EventStatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    success: "bg-green-500/10 text-green-400 border-green-500/20",
    failed: "bg-red-500/10 text-red-400 border-red-500/20",
    skipped: "bg-yellow-500/10 text-yellow-400 border-yellow-500/20",
  };
  return (
    <span
      className={`text-xs px-2 py-0.5 rounded-full border font-medium ${
        map[status] ?? "bg-secondary text-muted-foreground border-border/30"
      }`}
    >
      {STATUS_LABELS[status] ?? status}
    </span>
  );
}

function CopyableEndpoint({ label, url }: { label: string; url: string }) {
  return (
    <div className="mb-2 last:mb-0">
      <p className="text-xs text-muted-foreground mb-1">{label}</p>
      <div className="flex items-center gap-2 bg-secondary/30 rounded-lg px-3 py-2">
        <code className="text-xs font-mono text-foreground flex-1 break-all">{url}</code>
        <button
          className="text-muted-foreground hover:text-foreground transition-colors shrink-0 ml-2"
          onClick={() => {
            navigator.clipboard.writeText(url);
            toast.success("Đã sao chép");
          }}
          title="Sao chép"
        >
          <Copy className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}

export default function AdminWebhookMonitor() {
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");

  const { data, isLoading, refetch, isFetching } = trpc.payments.adminWebhookEvents.useQuery({
    limit: 50,
    status: statusFilter,
  });

  const { data: stripeStatus } = trpc.payments.stripeStatus.useQuery();

  const isHealthy = (data?.failedCount ?? 0) === 0 && (data?.totalCount ?? 0) > 0;
  const hasFailures = (data?.failedCount ?? 0) > 0;
  const noEvents = (data?.totalCount ?? 0) === 0;

  return (
    <AdminLayout>
      <AdminPageShell mode="full">
        <AdminPageHeader icon={Activity} title="Webhook" />
        <div className="flex justify-end mb-4">
          <Button
            variant="outline"
            size="sm"
            onClick={() => refetch()}
            disabled={isFetching}
          >
            <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${isFetching ? "animate-spin" : ""}`} />
            Làm mới
          </Button>
        </div>

        {/* Health Summary */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
          {/* Overall Health */}
          <div
            className={`rounded-xl border p-4 flex items-center gap-3 ${
              noEvents
                ? "border-border/50 bg-card"
                : isHealthy
                ? "border-green-500/20 bg-green-500/5"
                : "border-red-500/20 bg-red-500/5"
            }`}
          >
            {noEvents ? (
              <AlertCircle className="w-8 h-8 text-muted-foreground flex-shrink-0" />
            ) : isHealthy ? (
              <CheckCircle className="w-8 h-8 text-green-500 flex-shrink-0" />
            ) : (
              <XCircle className="w-8 h-8 text-red-500 flex-shrink-0" />
            )}
            <div>
              <p className="font-semibold text-foreground text-sm">
                {noEvents ? "Chưa có sự kiện" : isHealthy ? "Hoạt động tốt" : "Có lỗi xảy ra"}
              </p>
              <p className="text-xs text-muted-foreground">
                {noEvents
                  ? "Chưa nhận được sự kiện webhook nào"
                  : isHealthy
                  ? "Tất cả sự kiện đã xử lý thành công"
                  : `${data?.failedCount} sự kiện thất bại`}
              </p>
            </div>
          </div>

          {/* Total Events */}
          <div className="rounded-xl border border-border/50 bg-card p-4">
            <p className="text-xs text-muted-foreground mb-1">Tổng sự kiện</p>
            <p className="text-2xl font-bold text-foreground">{data?.totalCount ?? 0}</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Webhook: {stripeStatus?.webhookConfigured ? "đã cấu hình" : "chưa cấu hình"}
            </p>
          </div>

          {/* Failed Events */}
          <div
            className={`rounded-xl border p-4 ${
              hasFailures ? "border-red-500/20 bg-red-500/5" : "border-border/50 bg-card"
            }`}
          >
            <p className="text-xs text-muted-foreground mb-1">Sự kiện thất bại</p>
            <p
              className={`text-2xl font-bold ${
                hasFailures ? "text-red-400" : "text-foreground"
              }`}
            >
              {data?.failedCount ?? 0}
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {hasFailures ? "Xem chi tiết bên dưới" : "Không có lỗi"}
            </p>
          </div>
        </div>

        {/* Webhook Endpoint Info */}
        <div className="rounded-xl border border-border/50 bg-card p-4 mb-6">
          <p className="text-sm font-medium text-foreground mb-3">Địa chỉ Webhook</p>
          <CopyableEndpoint
            label="NOWPayments IPN"
            url={`${window.location.origin}/api/crypto/webhook`}
          />
          <CopyableEndpoint
            label="CCBill Webhook"
            url={`${window.location.origin}/api/ccbill/webhook`}
          />
          <p className="text-xs text-muted-foreground mt-3">
            Đăng ký IPN URL tại{" "}
            <a
              href="https://nowpayments.io/dashboard"
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary hover:underline"
            >
              NOWPayments Dashboard → IPN Settings
            </a>
            {" "}và CCBill webhook URL tại{" "}
            <a
              href="https://admin.ccbill.com"
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary hover:underline"
            >
              CCBill Admin → Thông tin tài khoản → Approval Post URL
            </a>
          </p>
        </div>

        {/* Filter Tabs */}
        <div className="flex gap-2 mb-4 flex-wrap">
          {STATUS_FILTERS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => setStatusFilter(opt.value)}
              className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
                statusFilter === opt.value
                  ? "bg-primary text-primary-foreground border-primary"
                  : "border-border/50 text-muted-foreground hover:text-foreground hover:border-border"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>

        {/* Events Table */}
        <div className="rounded-xl border border-border/50 overflow-hidden bg-card">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border/50 bg-secondary/30">
                  <th className="text-left px-4 py-3 text-muted-foreground font-medium w-8"></th>
                  <th className="text-left px-4 py-3 text-muted-foreground font-medium">Loại sự kiện</th>
                  <th className="text-left px-4 py-3 text-muted-foreground font-medium">Trạng thái</th>
                  <th className="text-left px-4 py-3 text-muted-foreground font-medium hidden md:table-cell">Event ID</th>
                  <th className="text-left px-4 py-3 text-muted-foreground font-medium hidden lg:table-cell">Session</th>
                  <th className="text-left px-4 py-3 text-muted-foreground font-medium hidden xl:table-cell">Lỗi</th>
                  <th className="text-left px-4 py-3 text-muted-foreground font-medium">Thời gian</th>
                </tr>
              </thead>
              <tbody>
                {isLoading
                  ? Array.from({ length: 8 }).map((_, i) => (
                      <tr key={i} className="border-b border-border/30">
                        <td className="px-4 py-3"><div className="h-4 w-4 skeleton rounded-full" /></td>
                        <td className="px-4 py-3"><div className="h-4 skeleton rounded w-40" /></td>
                        <td className="px-4 py-3"><div className="h-4 skeleton rounded w-16" /></td>
                        <td className="px-4 py-3 hidden md:table-cell"><div className="h-4 skeleton rounded w-32" /></td>
                        <td className="px-4 py-3 hidden lg:table-cell"><div className="h-4 skeleton rounded w-32" /></td>
                        <td className="px-4 py-3 hidden xl:table-cell"><div className="h-4 skeleton rounded w-24" /></td>
                        <td className="px-4 py-3"><div className="h-4 skeleton rounded w-24" /></td>
                      </tr>
                    ))
                  : data?.events.length === 0
                  ? (
                    <tr>
                      <td colSpan={7} className="px-4 py-16 text-center">
                        <div className="flex flex-col items-center gap-2 text-muted-foreground">
                          <Webhook className="w-8 h-8 opacity-30" />
                          <p className="text-sm">
                            {statusFilter === "all"
                              ? "Chưa có sự kiện webhook nào. Sự kiện sẽ xuất hiện sau khi NOWPayments hoặc CCBill gửi đến."
                              : `Không tìm thấy sự kiện "${STATUS_LABELS[statusFilter] ?? statusFilter}"`}
                          </p>
                        </div>
                      </td>
                    </tr>
                  )
                  : data?.events.map((ev) => (
                    <tr
                      key={ev.id}
                      className={`border-b border-border/30 hover:bg-secondary/20 transition-colors ${
                        ev.status === "failed" ? "bg-red-500/5" : ""
                      }`}
                    >
                      <td className="px-4 py-3">
                        <EventStatusIcon status={ev.status} />
                      </td>
                      <td className="px-4 py-3">
                        <code className="text-xs text-foreground">{ev.type}</code>
                      </td>
                      <td className="px-4 py-3">
                        <EventStatusBadge status={ev.status} />
                      </td>
                      <td className="px-4 py-3 hidden md:table-cell">
                        <span className="text-xs font-mono text-muted-foreground truncate max-w-[140px] block">
                          {ev.providerEventId}
                        </span>
                      </td>
                      <td className="px-4 py-3 hidden lg:table-cell">
                        {ev.relatedSessionId ? (
                          <span className="text-xs font-mono text-muted-foreground truncate max-w-[140px] block">
                            {ev.relatedSessionId}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 hidden xl:table-cell">
                        {ev.errorMessage ? (
                          <span className="text-xs text-red-400 truncate max-w-[200px] block" title={ev.errorMessage}>
                            {ev.errorMessage}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-xs text-muted-foreground">
                          {new Date(ev.processedAt).toLocaleString("vi-VN")}
                        </span>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </div>
      </AdminPageShell>
    </AdminLayout>
  );
}
