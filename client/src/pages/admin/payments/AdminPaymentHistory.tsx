import { useState } from "react";
import { trpc } from "@/lib/trpc";
import AdminLayout from "../AdminLayout";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import {
  History,
  ChevronLeft,
  ChevronRight,
  TrendingUp,
  Users,
  Clock,
  XCircle,
  Trash2,
  AlertTriangle,
  Loader2,
} from "lucide-react";

const STATUS_OPTIONS = [
  { value: "all", label: "Tất cả" },
  { value: "active", label: "Đang hoạt động" },
  { value: "pending", label: "Chờ xử lý" },
  { value: "expired", label: "Đã hết hạn" },
  { value: "cancelled", label: "Đã hủy" },
] as const;

type StatusFilter = (typeof STATUS_OPTIONS)[number]["value"];

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    active: "bg-green-500/10 text-green-400 border-green-500/20",
    pending: "bg-yellow-500/10 text-yellow-400 border-yellow-500/20",
    expired: "bg-secondary text-muted-foreground border-border/30",
    cancelled: "bg-red-500/10 text-red-400 border-red-500/20",
  };
  const labels: Record<string, string> = {
    active: "Đang hoạt động",
    pending: "Chờ xử lý",
    expired: "Đã hết hạn",
    cancelled: "Đã hủy",
  };
  return (
    <span
      className={`text-xs px-2 py-0.5 rounded-full border font-medium ${
        map[status] ?? "bg-secondary text-muted-foreground border-border/30"
      }`}
    >
      {labels[status] ?? status}
    </span>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  sub,
}: {
  icon: React.ElementType;
  label: string;
  value: string | number;
  sub?: string;
}) {
  return (
    <div className="rounded-xl border border-border/50 bg-card p-4">
      <div className="flex items-center gap-2 mb-2">
        <Icon className="w-4 h-4 text-primary" />
        <span className="text-xs text-muted-foreground">{label}</span>
      </div>
      <p className="text-2xl font-bold text-foreground">{value}</p>
      {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
    </div>
  );
}

export default function AdminPaymentHistory() {
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [expiring, setExpiring] = useState(false);
  const LIMIT = 20;

  const utils = trpc.useUtils();

  const { data, isLoading } = trpc.payments.adminListPayments.useQuery({
    page,
    limit: LIMIT,
    status: statusFilter,
  });

  const { data: stats } = trpc.payments.adminPaymentStats.useQuery();

  const deleteSubscription = trpc.payments.adminDeleteSubscription.useMutation({
    onSuccess: () => {
      toast.success("Đã xóa phiên");
      utils.payments.adminListPayments.invalidate();
      utils.payments.adminPaymentStats.invalidate();
      setDeletingId(null);
    },
    onError: (e) => { toast.error(e.message); setDeletingId(null); },
  });

  const expirePending = trpc.payments.adminExpirePendingSessions.useMutation({
    onSuccess: (res) => {
      toast.success(`Đã hủy ${res.affected} pending sessions`);
      utils.payments.adminListPayments.invalidate();
      utils.payments.adminPaymentStats.invalidate();
      setExpiring(false);
    },
    onError: (e) => { toast.error(e.message); setExpiring(false); },
  });

  const totalPages = Math.ceil((data?.total ?? 0) / LIMIT);

  return (
    <AdminLayout>
      <div className="p-6">
        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <History className="w-6 h-6 text-primary" />
          <h1
            className="text-2xl font-bold text-foreground"
            style={{ fontFamily: "'Playfair Display', serif" }}
          >
            Lịch sử thanh toán
          </h1>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <StatCard
            icon={TrendingUp}
            label="Tổng doanh thu"
            value={`$${stats?.revenue ?? "0.00"}`}
            sub="từ các gói đã thanh toán"
          />
          <StatCard
            icon={Users}
            label="Đăng ký đang hoạt động"
            value={stats?.active ?? 0}
          />
          <StatCard
            icon={Clock}
            label="Chờ xử lý"
            value={stats?.pending ?? 0}
          />
          <StatCard
            icon={XCircle}
            label="Đã hủy"
            value={stats?.cancelled ?? 0}
          />
        </div>

        {/* Filter Tabs */}
        <div className="flex gap-2 mb-4 flex-wrap">
          {STATUS_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => {
                setStatusFilter(opt.value);
                setPage(1);
              }}
              className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
                statusFilter === opt.value
                  ? "bg-primary text-primary-foreground border-primary"
                  : "border-border/50 text-muted-foreground hover:text-foreground hover:border-border"
              }`}
            >
              {opt.label}
              {opt.value !== "all" && stats && (
                <span className="ml-1 opacity-70">
                  ({stats[opt.value as keyof typeof stats] ?? 0})
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Table */}
        <div className="rounded-xl border border-border/50 overflow-hidden bg-card">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border/50 bg-secondary/30">
                  <th className="text-left px-4 py-3 text-muted-foreground font-medium">Người dùng</th>
                  <th className="text-left px-4 py-3 text-muted-foreground font-medium hidden sm:table-cell">Gói</th>
                  <th className="text-left px-4 py-3 text-muted-foreground font-medium">Trạng thái</th>
                  <th className="text-left px-4 py-3 text-muted-foreground font-medium hidden md:table-cell">Số tiền</th>
                  <th className="text-left px-4 py-3 text-muted-foreground font-medium hidden lg:table-cell">Session ID</th>
                  <th className="text-left px-4 py-3 text-muted-foreground font-medium hidden lg:table-cell">Hết hạn</th>
                  <th className="text-left px-4 py-3 text-muted-foreground font-medium hidden xl:table-cell">Ngày tạo</th>
                </tr>
              </thead>
              <tbody>
                {isLoading
                  ? Array.from({ length: 8 }).map((_, i) => (
                      <tr key={i} className="border-b border-border/30">
                        <td className="px-4 py-3"><div className="h-4 skeleton rounded w-3/4" /></td>
                        <td className="px-4 py-3 hidden sm:table-cell"><div className="h-4 skeleton rounded w-20" /></td>
                        <td className="px-4 py-3"><div className="h-4 skeleton rounded w-16" /></td>
                        <td className="px-4 py-3 hidden md:table-cell"><div className="h-4 skeleton rounded w-16" /></td>
                        <td className="px-4 py-3 hidden lg:table-cell"><div className="h-4 skeleton rounded w-32" /></td>
                        <td className="px-4 py-3 hidden lg:table-cell"><div className="h-4 skeleton rounded w-24" /></td>
                        <td className="px-4 py-3 hidden xl:table-cell"><div className="h-4 skeleton rounded w-24" /></td>
                      </tr>
                    ))
                  : data?.items.length === 0
                  ? (
                    <tr>
                      <td colSpan={7} className="px-4 py-12 text-center text-muted-foreground">
                        Không tìm thấy bản ghi thanh toán
                      </td>
                    </tr>
                  )
                  : data?.items.map((row) => (
                    <tr
                      key={row.id}
                      className="border-b border-border/30 hover:bg-secondary/20 transition-colors"
                    >
                      <td className="px-4 py-3">
                        <p className="font-medium text-foreground">{row.userName ?? "Không rõ"}</p>
                        <p className="text-xs text-muted-foreground">{row.userEmail ?? "—"}</p>
                      </td>
                      <td className="px-4 py-3 hidden sm:table-cell">
                        <span className="text-foreground">{row.planName ?? "—"}</span>
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge status={row.status} />
                      </td>
                      <td className="px-4 py-3 hidden md:table-cell">
                        {row.planPrice ? (
                          <span className="text-foreground font-mono">
                            {Number(row.planPrice).toFixed(2)}{" "}
                            <span className="text-muted-foreground text-xs uppercase">
                              {row.planCurrency}
                            </span>
                          </span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 hidden lg:table-cell">
                        {row.stripeSessionId ? (
                          <span className="text-xs font-mono text-muted-foreground truncate max-w-[140px] block">
                            {row.stripeSessionId}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 hidden lg:table-cell">
                        {row.expiresAt ? (
                          <span
                            className={`text-xs ${
                              new Date(row.expiresAt) < new Date()
                                ? "text-red-400"
                                : "text-green-400"
                            }`}
                          >
                            {new Date(row.expiresAt).toLocaleDateString("vi-VN")}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 hidden xl:table-cell">
                        <span className="text-xs text-muted-foreground">
                          {new Date(row.createdAt).toLocaleDateString("vi-VN")}
                        </span>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between px-4 py-3 border-t border-border/30">
              <span className="text-xs text-muted-foreground">
                Trang {page} trong {totalPages} · {data?.total} bản ghi
              </span>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                >
                  <ChevronLeft className="w-4 h-4" />
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                >
                  <ChevronRight className="w-4 h-4" />
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </AdminLayout>
  );
}
