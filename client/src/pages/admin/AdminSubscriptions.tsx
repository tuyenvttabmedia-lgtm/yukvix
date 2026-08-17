import { trpc } from "@/lib/trpc";
import { AdminPageShell, AdminPageHeader } from "@/admin";
import AdminLayout from "./AdminLayout";
import { useState, useEffect, useRef } from "react";
import { Crown, Search, X, ExternalLink, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Link } from "wouter";

type StatusFilter = "all" | "active" | "pending" | "expired" | "cancelled";

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    active: "bg-green-400/10 text-green-400",
    pending: "bg-yellow-400/10 text-yellow-400",
    expired: "bg-red-400/10 text-red-400",
    cancelled: "bg-muted text-muted-foreground",
  };
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full ${map[status] ?? "bg-secondary text-muted-foreground"}`}>
      {status}
    </span>
  );
}

function ProviderBadge({ provider, method }: { provider?: string; method?: string }) {
  const p = provider || "unknown";
  const colorMap: Record<string, string> = {
    stripe: "bg-violet-400/10 text-violet-400",
    crypto: "bg-orange-400/10 text-orange-400",
    manual: "bg-blue-400/10 text-blue-400",
    ccbill: "bg-pink-400/10 text-pink-400",
  };
  const color = colorMap[p] ?? "bg-secondary text-muted-foreground";
  return (
    <div className="flex flex-col gap-0.5">
      <span className={`text-xs px-2 py-0.5 rounded-full w-fit ${color}`}>{p}</span>
      {method && method !== "card" && (
        <span className="text-xs text-muted-foreground">{method}</span>
      )}
    </div>
  );
}

export default function AdminSubscriptions() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => { setDebouncedSearch(search); setPage(1); }, 350);
    return () => { if (searchTimer.current) clearTimeout(searchTimer.current); };
  }, [search]);

  useEffect(() => { setPage(1); }, [statusFilter]);

  const { data, isLoading } = trpc.subscriptions.adminList.useQuery({
    page,
    limit: 20,
    search: debouncedSearch || undefined,
    status: statusFilter === "all" ? undefined : statusFilter,
  });

  const totalPages = data ? Math.ceil(data.total / 20) : 1;
  const hasFilters = debouncedSearch || statusFilter !== "all";

  const STATUS_TABS: { value: StatusFilter; label: string }[] = [
    { value: "all", label: "All" },
    { value: "active", label: "Đang hoạt động" },
    { value: "pending", label: "Chờ xử lý" },
    { value: "expired", label: "Đã hết hạn" },
    { value: "cancelled", label: "Đã hủy" },
  ];

  return (
    <AdminLayout>
      <AdminPageShell mode="full">
        <AdminPageHeader icon={Crown} title="Lịch sử đăng ký" />

        {/* Table */}
        <div className="rounded-xl border border-border/50 overflow-hidden bg-card">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border/50 bg-secondary/30">
                  <th className="text-left px-4 py-3 text-muted-foreground font-medium">Người dùng</th>
                  <th className="text-left px-4 py-3 text-muted-foreground font-medium hidden sm:table-cell">Gói</th>
                  <th className="text-left px-4 py-3 text-muted-foreground font-medium">Trạng thái</th>
                  <th className="text-left px-4 py-3 text-muted-foreground font-medium hidden md:table-cell">Provider</th>
                  <th className="text-left px-4 py-3 text-muted-foreground font-medium hidden lg:table-cell">Ngày bắt đầu</th>
                  <th className="text-left px-4 py-3 text-muted-foreground font-medium hidden lg:table-cell">Hết hạn</th>
                  <th className="text-right px-4 py-3 text-muted-foreground font-medium">Chi tiết</th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  Array.from({ length: 8 }).map((_, i) => (
                    <tr key={i} className="border-b border-border/30">
                      <td className="px-4 py-3"><div className="h-4 skeleton rounded w-3/4" /></td>
                      <td className="px-4 py-3 hidden sm:table-cell"><div className="h-4 skeleton rounded w-20" /></td>
                      <td className="px-4 py-3"><div className="h-4 skeleton rounded w-16" /></td>
                      <td className="px-4 py-3 hidden md:table-cell"><div className="h-4 skeleton rounded w-16" /></td>
                      <td className="px-4 py-3 hidden lg:table-cell"><div className="h-4 skeleton rounded w-24" /></td>
                      <td className="px-4 py-3 hidden lg:table-cell"><div className="h-4 skeleton rounded w-24" /></td>
                      <td className="px-4 py-3"><div className="h-4 skeleton rounded w-16 ml-auto" /></td>
                    </tr>
                  ))
                ) : data?.items.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-16 text-center">
                      <div className="flex flex-col items-center gap-2">
                        <Crown className="w-10 h-10 text-muted-foreground/30" />
                        <p className="text-muted-foreground">
                          {hasFilters ? "Không có đăng ký nào phù hợp" : "Chưa có đăng ký nào"}
                        </p>
                      </div>
                    </td>
                  </tr>
                ) : (
                  data?.items.map((sub) => (
                    <tr key={sub.id} className="border-b border-border/30 hover:bg-secondary/20 transition-colors">
                      <td className="px-4 py-3">
                        <div>
                          <p className="font-medium text-foreground">{sub.userName || "Không rõ"}</p>
                          <p className="text-xs text-muted-foreground">{sub.userEmail || "—"}</p>
                        </div>
                      </td>
                      <td className="px-4 py-3 hidden sm:table-cell text-muted-foreground">{sub.planName || "—"}</td>
                      <td className="px-4 py-3"><StatusBadge status={sub.status} /></td>
                      <td className="px-4 py-3 hidden md:table-cell">
                        <ProviderBadge provider={sub.provider ?? undefined} method={sub.paymentMethod ?? undefined} />
                      </td>
                      <td className="px-4 py-3 hidden lg:table-cell text-muted-foreground text-xs">
                        {sub.startedAt ? new Date(sub.startedAt).toLocaleDateString("en-US") : "—"}
                      </td>
                      <td className="px-4 py-3 hidden lg:table-cell text-xs">
                        {sub.expiresAt ? (
                          <span className={new Date(sub.expiresAt) < new Date() ? "text-red-400" : "text-green-400"}>
                            {new Date(sub.expiresAt).toLocaleDateString("en-US")}
                          </span>
                        ) : "—"}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1">
                          {/* Link to user detail */}
                          <Link
                            href={`/admin/users/${sub.userId}`}
                            className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs bg-secondary text-muted-foreground hover:text-foreground hover:bg-secondary/80 transition-colors"
                            title="View user"
                          >
                            <ExternalLink className="w-3 h-3" /> User
                          </Link>
                          {/* Link to VIP management if active */}
                          {sub.status === "active" && (
                            <Link
                              href="/admin/payments/vip"
                              className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs bg-primary/10 text-primary hover:bg-primary/20 transition-colors"
                              title="Manage VIP"
                            >
                              <Crown className="w-3 h-3" /> Quản lý VIP
                            </Link>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {data && data.total > 20 && (
            <div className="flex items-center justify-between px-4 py-3 border-t border-border/50">
              <span className="text-sm text-muted-foreground">Trang {page}/{totalPages} · {data.total} bản ghi</span>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}>Trước</Button>
                <Button variant="outline" size="sm" onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page >= totalPages}>Tiếp</Button>
              </div>
            </div>
          )}
        </div>
      </AdminPageShell>
    </AdminLayout>
  );
}
