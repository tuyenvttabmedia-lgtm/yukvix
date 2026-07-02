import { trpc } from "@/lib/trpc";
import AdminLayout from "./AdminLayout";
import { useState, useEffect, useRef } from "react";
import { CheckCircle2, Crown, ExternalLink, Search, Shield, User, Users, XCircle, X } from "lucide-react";
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
import { useLocation } from "wouter";

type RoleFilter = "all" | "admin" | "vip" | "user";
type VerifiedFilter = "all" | "verified" | "unverified";

export default function AdminUsers() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<RoleFilter>("all");
  const [verifiedFilter, setVerifiedFilter] = useState<VerifiedFilter>("all");
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const utils = trpc.useUtils();
  const [, navigate] = useLocation();

  // Debounce search input
  useEffect(() => {
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(1);
    }, 350);
    return () => { if (searchTimer.current) clearTimeout(searchTimer.current); };
  }, [search]);

  // Reset page when filters change
  useEffect(() => { setPage(1); }, [roleFilter, verifiedFilter]);

  const { data, isLoading } = trpc.users.adminList.useQuery({
    page,
    limit: 20,
    search: debouncedSearch || undefined,
    role: roleFilter === "all" ? undefined : roleFilter,
    emailVerified: verifiedFilter === "all" ? undefined : verifiedFilter === "verified",
  });

  const setRole = trpc.users.setRole.useMutation({
    onSuccess: () => {
      utils.users.adminList.invalidate();
      toast.success("Cập nhật vai trò thành công");
    },
    onError: (e) => toast.error(e.message),
  });

  const [grantVipOpen, setGrantVipOpen] = useState(false);
  const [grantVipUserId, setGrantVipUserId] = useState<number | null>(null);
  const [grantVipUserName, setGrantVipUserName] = useState("");
  const [grantVipDays, setGrantVipDays] = useState("30");

  const grantVip = trpc.subscriptions.grantVip.useMutation({
    onSuccess: () => {
      utils.users.adminList.invalidate();
      utils.payments.adminListActiveVips.invalidate();
      toast.success(`Đã cấp VIP trong ${grantVipDays} days`);
      setGrantVipOpen(false);
    },
    onError: (e) => toast.error(e.message),
  });

  function openGrantVip(userId: number, userName: string) {
    setGrantVipUserId(userId);
    setGrantVipUserName(userName);
    setGrantVipDays("30");
    setGrantVipOpen(true);
  }

  const totalPages = data ? Math.ceil(data.total / 20) : 1;
  const hasFilters = debouncedSearch || roleFilter !== "all" || verifiedFilter !== "all";

  const clearFilters = () => {
    setSearch("");
    setDebouncedSearch("");
    setRoleFilter("all");
    setVerifiedFilter("all");
    setPage(1);
  };

  const ROLE_TABS: { value: RoleFilter; label: string }[] = [
    { value: "all", label: "All" },
    { value: "admin", label: "Admin" },
    { value: "vip", label: "VIP" },
    { value: "user", label: "User" },
  ];

  const VERIFIED_TABS: { value: VerifiedFilter; label: string }[] = [
    { value: "all", label: "All" },
    { value: "verified", label: "Verified" },
    { value: "unverified", label: "Unverified" },
  ];

  return (
    <AdminLayout>
      <div className="p-6">
        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <Users className="w-6 h-6 text-primary" />
          <h1 className="text-2xl font-bold text-foreground" style={{ fontFamily: "'Playfair Display', serif" }}>
            Quản lý người dùng
          </h1>
          {data && (
            <span className="ml-auto text-sm text-muted-foreground">
              {data.total} users
            </span>
          )}
        </div>

        {/* Filters */}
        <div className="bg-card border border-border/50 rounded-xl p-4 mb-4 space-y-3">
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name or email..."
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

          {/* Role + Verified filters */}
          <div className="flex flex-wrap gap-3 items-center">
            <div className="flex items-center gap-1">
              <span className="text-xs text-muted-foreground mr-1">Role:</span>
              {ROLE_TABS.map((t) => (
                <button
                  key={t.value}
                  onClick={() => setRoleFilter(t.value)}
                  className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
                    roleFilter === t.value
                      ? "bg-primary text-primary-foreground"
                      : "bg-secondary text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-1">
              <span className="text-xs text-muted-foreground mr-1">Email:</span>
              {VERIFIED_TABS.map((t) => (
                <button
                  key={t.value}
                  onClick={() => setVerifiedFilter(t.value)}
                  className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
                    verifiedFilter === t.value
                      ? "bg-primary text-primary-foreground"
                      : "bg-secondary text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
            {hasFilters && (
              <button
                onClick={clearFilters}
                className="ml-auto flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                <X className="w-3.5 h-3.5" /> Xóa bộ lọc
              </button>
            )}
          </div>
        </div>

        {/* Table */}
        <div className="rounded-xl border border-border/50 overflow-hidden bg-card">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border/50 bg-secondary/30">
                  <th className="text-left px-4 py-3 text-muted-foreground font-medium">Người dùng</th>
                  <th className="text-left px-4 py-3 text-muted-foreground font-medium hidden sm:table-cell">Email</th>
                  <th className="text-left px-4 py-3 text-muted-foreground font-medium hidden lg:table-cell">Xác thực</th>
                  <th className="text-left px-4 py-3 text-muted-foreground font-medium">Role</th>
                  <th className="text-left px-4 py-3 text-muted-foreground font-medium hidden md:table-cell">Ngày tham gia</th>
                  <th className="text-right px-4 py-3 text-muted-foreground font-medium">Hành động</th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  Array.from({ length: 8 }).map((_, i) => (
                    <tr key={i} className="border-b border-border/30">
                      <td className="px-4 py-3"><div className="h-4 skeleton rounded w-3/4" /></td>
                      <td className="px-4 py-3 hidden sm:table-cell"><div className="h-4 skeleton rounded w-full" /></td>
                      <td className="px-4 py-3 hidden lg:table-cell"><div className="h-4 skeleton rounded w-20" /></td>
                      <td className="px-4 py-3"><div className="h-4 skeleton rounded w-16" /></td>
                      <td className="px-4 py-3 hidden md:table-cell"><div className="h-4 skeleton rounded w-24" /></td>
                      <td className="px-4 py-3"><div className="h-4 skeleton rounded w-20 ml-auto" /></td>
                    </tr>
                  ))
                ) : data?.items.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-16 text-center">
                      <div className="flex flex-col items-center gap-2">
                        <Users className="w-10 h-10 text-muted-foreground/30" />
                        <p className="text-muted-foreground">
                          {hasFilters ? "No users match your filters" : "No users yet"}
                        </p>
                        {hasFilters && (
                          <button onClick={clearFilters} className="text-xs text-primary hover:underline">
                            Xóa bộ lọc
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ) : (
                  data?.items.map((u) => (
                    <tr key={u.id} className="border-b border-border/30 hover:bg-secondary/20 transition-colors">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <div className="w-8 h-8 rounded-full bg-secondary border border-border flex items-center justify-center shrink-0">
                            <User className="w-4 h-4 text-muted-foreground" />
                          </div>
                          <span className="font-medium text-foreground">{u.name || "Ẩn danh"}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 hidden sm:table-cell text-muted-foreground">
                        {u.email || "—"}
                      </td>
                      <td className="px-4 py-3 hidden lg:table-cell">
                        {u.emailVerified ? (
                          <span className="inline-flex items-center gap-1 text-xs text-green-400">
                            <CheckCircle2 className="w-3.5 h-3.5" /> Verified
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                            <XCircle className="w-3.5 h-3.5" /> Unverified
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`text-xs px-2 py-0.5 rounded-full ${
                          u.role === "admin" ? "bg-red-400/10 text-red-400"
                          : u.role === "vip" ? "bg-primary/10 text-primary"
                          : "bg-secondary text-muted-foreground"
                        }`}>
                          {u.role}
                        </span>
                      </td>
                      <td className="px-4 py-3 hidden md:table-cell text-muted-foreground text-xs">
                        {new Date(u.createdAt).toLocaleDateString("vi-VN")}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => navigate(`/admin/users/${u.id}`)}
                            className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs bg-secondary text-muted-foreground hover:bg-secondary/80 hover:text-foreground transition-colors"
                          >
                            <ExternalLink className="w-3 h-3" /> Details
                          </button>
                          {u.role !== "vip" && u.role !== "admin" && (
                            <button
                              onClick={() => openGrantVip(u.id, u.name || "User")}
                              className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs bg-primary/10 text-primary hover:bg-primary/20 transition-colors"
                            >
                              <Crown className="w-3 h-3" /> VIP
                            </button>
                          )}
                          {u.role !== "admin" && (
                            <button
                              onClick={() => {
                                const newRole = u.role === "vip" ? "user" : "vip";
                                setRole.mutate({ userId: u.id, role: newRole });
                              }}
                              className="p-1.5 rounded-lg hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors"
                              title={u.role === "vip" ? "Hủy VIP" : "Cấp VIP"}
                            >
                              <Shield className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {data && data.total > 20 && (
            <div className="flex items-center justify-between px-4 py-3 border-t border-border/50">
              <span className="text-sm text-muted-foreground">
                Trang {page}/{totalPages} · {data.total} người dùng
              </span>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}>
                  Trước
                </Button>
                <Button variant="outline" size="sm" onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page >= totalPages}>
                  Tiếp
                </Button>
              </div>
            </div>
          )}
        </div>
      {/* Cấp VIP Dialog */}
      <Dialog open={grantVipOpen} onOpenChange={setGrantVipOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Cấp VIP</DialogTitle>
            <DialogDescription>
              Cấp VIP cho <strong className="text-foreground">{grantVipUserName}</strong>.
              Nếu người dùng đã có đăng ký, thời gian sẽ được cộng thêm từ ngày hết hạn hiện tại.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <label className="text-sm text-muted-foreground">Số ngày</label>
            <Input
              type="number"
              min={1}
              max={3650}
              value={grantVipDays}
              onChange={(e) => setGrantVipDays(e.target.value)}
              placeholder="30"
            />
            <div className="flex flex-wrap gap-1.5">
              {[7, 14, 30, 60, 90, 180, 365].map((d) => (
                <button
                  key={d}
                  onClick={() => setGrantVipDays(String(d))}
                  className={`text-xs px-2.5 py-1 rounded-md border transition-colors ${
                    grantVipDays === String(d)
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
            <Button variant="outline" onClick={() => setGrantVipOpen(false)}>Hủy</Button>
            <Button
              onClick={() => {
                if (!grantVipUserId) return;
                grantVip.mutate({ userId: grantVipUserId, days: Number(grantVipDays) });
              }}
              disabled={grantVip.isPending || !grantVipDays || Number(grantVipDays) < 1}
            >
              {grantVip.isPending ? "Đang cấp..." : `Cấp VIP ${grantVipDays} ngày`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      </div>
    </AdminLayout>
  );
}
