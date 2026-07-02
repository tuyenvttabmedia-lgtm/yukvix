import { useState, useEffect, useRef } from "react";
import { trpc } from "@/lib/trpc";
import AdminLayout from "../AdminLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  Crown,
  ChevronLeft,
  ChevronRight,
  CalendarPlus,
  XCircle,
  Clock,
  Bell,
  Search,
  X,
  ExternalLink,
} from "lucide-react";
import { Link } from "wouter";

function DaysLeftBadge({ expiresAt }: { expiresAt: Date | null | string }) {
  if (!expiresAt) return <span className="text-muted-foreground text-xs">—</span>;
  const d = new Date(expiresAt);
  const now = new Date();
  const daysLeft = Math.ceil((d.getTime() - now.getTime()) / 86400000);

  if (daysLeft < 0)
    return (
      <div className="flex flex-col gap-0.5">
        <span className="text-xs text-red-400 font-semibold">Đã hết hạn</span>
        <span className="text-xs text-muted-foreground">{d.toLocaleDateString("vi-VN")}</span>
      </div>
    );
  if (daysLeft <= 3)
    return (
      <div className="flex flex-col gap-0.5">
        <span className="text-xs bg-red-500/15 text-red-400 font-semibold px-1.5 py-0.5 rounded w-fit">
          Còn {daysLeft} ngày
        </span>
        <span className="text-xs text-muted-foreground">{d.toLocaleDateString("vi-VN")}</span>
      </div>
    );
  if (daysLeft <= 7)
    return (
      <div className="flex flex-col gap-0.5">
        <span className="text-xs bg-yellow-500/15 text-yellow-400 font-semibold px-1.5 py-0.5 rounded w-fit">
          Còn {daysLeft} ngày
        </span>
        <span className="text-xs text-muted-foreground">{d.toLocaleDateString("vi-VN")}</span>
      </div>
    );
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-xs bg-green-500/10 text-green-400 font-medium px-1.5 py-0.5 rounded w-fit">
        Còn {daysLeft} ngày
      </span>
      <span className="text-xs text-muted-foreground">{d.toLocaleDateString("vi-VN")}</span>
    </div>
  );
}

export default function AdminVipManagement() {
  const utils = trpc.useUtils();
  const [page, setPage] = useState(1);
  const [showExpired, setShowExpired] = useState(false);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const LIMIT = 20;

  // Debounce search
  useEffect(() => {
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(1);
    }, 350);
    return () => { if (searchTimer.current) clearTimeout(searchTimer.current); };
  }, [search]);

  useEffect(() => { setPage(1); }, [showExpired]);

  const { data, isLoading } = trpc.payments.adminListActiveVips.useQuery({
    page,
    limit: LIMIT,
    includeExpired: showExpired,
    search: debouncedSearch || undefined,
  });

  const extendVip = trpc.payments.adminExtendVip.useMutation({
    onSuccess: (res) => {
      utils.payments.adminListActiveVips.invalidate();
      toast.success(`VIP đã gia hạn đến ${new Date(res.newExpiry).toLocaleDateString("en-US")}`);  
      setExtendOpen(false);
    },
    onError: (e) => toast.error(e.message),
  });

  const cancelVip = trpc.payments.adminCancelVip.useMutation({
    onSuccess: () => {
      utils.payments.adminListActiveVips.invalidate();
      toast.success("Đã hủy đăng ký VIP");
      setCancelOpen(false);
    },
    onError: (e) => toast.error(e.message),
  });

  const triggerNotification = trpc.payments.adminTriggerVipExpiryNotification.useMutation({
    onSuccess: (res) => {
      if (res.dryRun) {
        toast.info(`Dry run: ${res.total} subscriptions would receive reminder emails.`);
      } else {
        toast.success(`Sent ${res.notified} emails. Skipped: ${res.skipped}. Errors: ${res.errors}.`);
      }
      setNotifyOpen(false);
    },
    onError: (e) => toast.error(`Thất bại: ${e.message}`),
  });

  const [extendOpen, setExtendOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [notifyOpen, setNotifyOpen] = useState(false);
  const [selectedSubId, setSelectedSubId] = useState<number | null>(null);
  const [selectedUserId, setSelectedUserId] = useState<number | null>(null);
  const [selectedUserName, setSelectedUserName] = useState("");
  const [extendDays, setExtendDays] = useState("30");
  const [notifyDryRun, setNotifyDryRun] = useState(false);

  function openExtend(subId: number, userId: number, userName: string) {
    setSelectedSubId(subId);
    setSelectedUserId(userId);
    setSelectedUserName(userName);
    setExtendDays("30");
    setExtendOpen(true);
  }

  function openCancel(subId: number, userId: number, userName: string) {
    setSelectedSubId(subId);
    setSelectedUserId(userId);
    setSelectedUserName(userName);
    setCancelOpen(true);
  }

  const totalPages = Math.ceil((data?.total ?? 0) / LIMIT);
  const hasSearch = debouncedSearch.length > 0;

  return (
    <AdminLayout>
      <div className="p-6">
        {/* Header */}
        <div className="flex items-start justify-between mb-4 gap-3 flex-wrap">
          <div className="flex items-center gap-3">
            <Crown className="w-6 h-6 text-primary" />
            <div>
              <h1
                className="text-2xl font-bold text-foreground"
                style={{ fontFamily: "'Playfair Display', serif" }}
              >
                Thành viên VIP
              </h1>
              <p className="text-sm text-muted-foreground mt-0.5">
                Quản lý gia hạn, hủy bỏ và thông báo cho thành viên VIP.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setNotifyOpen(true)}
              className="text-amber-400 border-amber-500/30 hover:border-amber-500/60 hover:text-amber-300"
            >
              <Bell className="w-3.5 h-3.5 mr-1.5" />
              Gửi thông báo hết hạn
            </Button>
            <button
              onClick={() => { setShowExpired((v) => !v); setPage(1); }}
              className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
                showExpired
                  ? "bg-primary text-primary-foreground border-primary"
                  : "border-border/50 text-muted-foreground hover:text-foreground"
              }`}
            >
              <Clock className="w-3 h-3 inline mr-1" />
              {showExpired ? "Đang xem: Hết hạn" : "Xem hết hạn"}
            </button>
          </div>
        </div>

        {/* Search bar */}
        <div className="bg-card border border-border/50 rounded-xl p-3 mb-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Tìm theo tên hoặc email..."
              className="pl-9 pr-9"
            />
            {search && (
              <button
                onClick={() => { setSearch(""); setDebouncedSearch(""); }}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
          {hasSearch && data && (
            <p className="text-xs text-muted-foreground mt-2 pl-1">
              Tìm thấy {data.total} kết quả cho "{debouncedSearch}"
            </p>
          )}
        </div>

        {/* Table */}
        <div className="rounded-xl border border-border/50 overflow-hidden bg-card">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border/50 bg-secondary/30">
                  <th className="text-left px-4 py-3 text-muted-foreground font-medium">Người dùng</th>
                  <th className="text-left px-4 py-3 text-muted-foreground font-medium hidden sm:table-cell">Gói</th>
                  <th className="text-left px-4 py-3 text-muted-foreground font-medium hidden md:table-cell">Ngày bắt đầu</th>
                  <th className="text-left px-4 py-3 text-muted-foreground font-medium">Ngày còn lại</th>
                  <th className="text-right px-4 py-3 text-muted-foreground font-medium">Hành động</th>
                </tr>
              </thead>
              <tbody>
                {isLoading
                  ? Array.from({ length: 8 }).map((_, i) => (
                      <tr key={i} className="border-b border-border/30">
                        <td className="px-4 py-3"><div className="h-4 skeleton rounded w-3/4" /></td>
                        <td className="px-4 py-3 hidden sm:table-cell"><div className="h-4 skeleton rounded w-20" /></td>
                        <td className="px-4 py-3 hidden md:table-cell"><div className="h-4 skeleton rounded w-24" /></td>
                        <td className="px-4 py-3"><div className="h-4 skeleton rounded w-20" /></td>
                        <td className="px-4 py-3"><div className="h-4 skeleton rounded w-24 ml-auto" /></td>
                      </tr>
                    ))
                  : data?.items.length === 0
                  ? (
                    <tr>
                      <td colSpan={5} className="px-4 py-16 text-center">
                        <div className="flex flex-col items-center gap-2">
                          <Crown className="w-10 h-10 text-muted-foreground/30" />
                          <p className="text-muted-foreground">
                            {hasSearch
                              ? `Không tìm thấy VIP nào cho "${debouncedSearch}"`
                              : showExpired ? "Không có đăng ký đã hết hạn" : "Không có thành viên VIP đang hoạt động"}
                          </p>
                        </div>
                      </td>
                    </tr>
                  )
                  : data?.items.map((row) => (
                    <tr
                      key={row.subId}
                      className="border-b border-border/30 hover:bg-secondary/20 transition-colors"
                    >
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <div>
                            <p className="font-medium text-foreground">{row.userName ?? "Không rõ"}</p>
                            <p className="text-xs text-muted-foreground">{row.userEmail ?? "—"}</p>
                          </div>
                          <Link
                            href={`/admin/users/${row.userId}`}
                            className="ml-1 text-muted-foreground hover:text-primary transition-colors"
                            title="Xem chi tiết"
                          >
                            <ExternalLink className="w-3.5 h-3.5" />
                          </Link>
                        </div>
                      </td>
                      <td className="px-4 py-3 hidden sm:table-cell">
                        <div>
                          <span className="text-foreground">{row.planName ?? "Thủ công"}</span>
                          {row.planPrice && (
                            <p className="text-xs text-muted-foreground">
                              {Number(row.planPrice).toFixed(2)} {(row.planCurrency ?? "usd").toUpperCase()}
                            </p>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 hidden md:table-cell">
                        <span className="text-xs text-muted-foreground">
                          {row.startedAt ? new Date(row.startedAt).toLocaleDateString("en-US") : "—"}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <DaysLeftBadge expiresAt={row.expiresAt} />
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => openExtend(row.subId, row.userId, row.userName ?? "Người dùng")}
                          >
                            <CalendarPlus className="w-3.5 h-3.5 mr-1" />
                            Gia hạn
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            className="text-red-400 hover:text-red-300 border-red-500/20 hover:border-red-500/40"
                            onClick={() => openCancel(row.subId, row.userId, row.userName ?? "Người dùng")}
                          >
                            <XCircle className="w-3.5 h-3.5 mr-1" />
                            Hủy VIP
                          </Button>
                        </div>
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
                Trang {page} trong {totalPages} · {data?.total} thành viên
              </span>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}>
                  <ChevronLeft className="w-4 h-4" />
                </Button>
                <Button variant="outline" size="sm" onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page === totalPages}>
                  <ChevronRight className="w-4 h-4" />
                </Button>
              </div>
            </div>
          )}
        </div>

        {/* Extend Dialog */}
        <Dialog open={extendOpen} onOpenChange={setExtendOpen}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle>Gia hạn VIP</DialogTitle>
              <DialogDescription>
                Gia hạn VIP cho <strong className="text-foreground">{selectedUserName}</strong>.
                Thời gian được tính từ ngày hết hạn hiện tại.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3 py-2">
              <label className="text-sm text-muted-foreground">Số ngày gia hạn</label>
              <Input
                type="number"
                min={1}
                max={3650}
                value={extendDays}
                onChange={(e) => setExtendDays(e.target.value)}
                placeholder="30"
              />
              <div className="flex flex-wrap gap-1.5">
                {[7, 14, 30, 60, 90, 180, 365].map((d) => (
                  <button
                    key={d}
                    onClick={() => setExtendDays(String(d))}
                    className={`text-xs px-2.5 py-1 rounded-md border transition-colors ${
                      extendDays === String(d)
                        ? "bg-primary text-primary-foreground border-primary"
                        : "border-border/50 text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {d} ngày
                  </button>
                ))}
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setExtendOpen(false)}>Hủy</Button>
              <Button
                onClick={() => {
                  if (!selectedSubId) return;
                  extendVip.mutate({ subscriptionId: selectedSubId, days: Number(extendDays) });
                }}
                disabled={extendVip.isPending || !extendDays || Number(extendDays) < 1}
              >
                {extendVip.isPending ? "Đang xử lý…" : `Gia hạn ${extendDays} ngày`}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Cancel Dialog */}
        <Dialog open={cancelOpen} onOpenChange={setCancelOpen}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle>Hủy đăng ký VIP</DialogTitle>
              <DialogDescription>
                Hủy đăng ký VIP của{" "}
                <strong className="text-foreground">{selectedUserName}</strong>.
                Người dùng sẽ mất quyền truy cập VIP ngay lập tức.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={() => setCancelOpen(false)}>Giữ VIP</Button>
              <Button
                variant="destructive"
                onClick={() => { if (selectedSubId) cancelVip.mutate({ subscriptionId: selectedSubId }); }}
                disabled={cancelVip.isPending}
              >
                {cancelVip.isPending ? "Đang hủy…" : "Hủy VIP"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Notify VIP Expiry Dialog */}
        <Dialog open={notifyOpen} onOpenChange={setNotifyOpen}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle>Gửi thông báo hết hạn VIP</DialogTitle>
              <DialogDescription>
                Gửi email nhắc nhở tới tất cả thành viên VIP sắp hết hạn trong{" "}
                <strong className="text-foreground">3 ngày tới</strong>.
                Mỗi người dùng nhận tối đa 1 email mỗi 20 giờ.
              </DialogDescription>
            </DialogHeader>
            <div className="py-2">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={notifyDryRun}
                  onChange={(e) => setNotifyDryRun(e.target.checked)}
                  className="rounded"
                />
                <span className="text-sm text-muted-foreground">
                  Thử nghiệm — chỉ đếm, không gửi email
                </span>
              </label>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setNotifyOpen(false)}>Hủy</Button>
              <Button
                onClick={() => triggerNotification.mutate({ dryRun: notifyDryRun })}
                disabled={triggerNotification.isPending}
                className={notifyDryRun ? "bg-blue-600 hover:bg-blue-700 text-white" : ""}
              >
                {triggerNotification.isPending
                  ? "Đang xử lý…"
                  : notifyDryRun
                  ? "Chạy thử (không gửi)"
                  : "Gửi email"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </AdminLayout>
  );
}
