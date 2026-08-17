import { trpc } from "@/lib/trpc";
import AdminLayout from "./AdminLayout";
import { EntityPage, EntityToolbar, DataTable, AdminStatusBadge, adminGlossary } from "@/admin";
import { useState, useEffect, useRef } from "react";
import { CheckCircle2, Crown, ExternalLink, Shield, User, Users, XCircle, X } from "lucide-react";
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

  useEffect(() => {
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(1);
    }, 350);
    return () => { if (searchTimer.current) clearTimeout(searchTimer.current); };
  }, [search]);

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
      toast.success(`Đã cấp VIP trong ${grantVipDays} ngày`);
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
    { value: "all", label: "Tất cả" },
    { value: "admin", label: "Admin" },
    { value: "vip", label: "VIP" },
    { value: "user", label: "Người dùng" },
  ];

  const VERIFIED_TABS: { value: VerifiedFilter; label: string }[] = [
    { value: "all", label: "Tất cả" },
    { value: "verified", label: "Đã xác thực" },
    { value: "unverified", label: "Chưa xác thực" },
  ];

  const users = data?.items ?? [];

  return (
    <AdminLayout>
      <EntityPage
        shell="full"
        header={{
          icon: Users,
          title: "Quản lý người dùng",
          subtitle: "Tài khoản và phân quyền",
          metrics: data ? [{ label: "Tổng", value: data.total }] : undefined,
        }}
        toolbar={
          <EntityToolbar
            search={{
              value: search,
              onChange: setSearch,
              placeholder: "Tìm theo tên hoặc email...",
            }}
            filters={
              <div className="flex flex-wrap gap-3 items-center">
                <div className="flex items-center gap-1">
                  <span className="text-xs text-muted-foreground mr-1">Vai trò:</span>
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
            }
          />
        }
        pagination={
          data && data.total > 20
            ? { page, totalPages, total: data.total, onPageChange: setPage, itemLabel: "người dùng" }
            : undefined
        }
        isEmpty={!isLoading && users.length === 0}
        emptyState={{
          icon: Users,
          title: hasFilters ? adminGlossary.empty.search : "Chưa có người dùng",
          action: hasFilters ? { label: "Xóa bộ lọc", onClick: clearFilters } : undefined,
        }}
      >
        <div className="rounded-xl border border-border/50 overflow-hidden bg-card">
          <DataTable
            columns={[
              {
                id: "user",
                header: "Người dùng",
                cell: (u) => (
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-full bg-secondary border border-border flex items-center justify-center shrink-0">
                      <User className="w-4 h-4 text-muted-foreground" />
                    </div>
                    <span className="font-medium text-foreground">{u.name || "Ẩn danh"}</span>
                  </div>
                ),
              },
              {
                id: "email",
                header: "Email",
                hideBelow: "sm",
                cell: (u) => <span className="text-muted-foreground">{u.email || "—"}</span>,
              },
              {
                id: "verified",
                header: "Xác thực",
                hideBelow: "lg",
                cell: (u) =>
                  u.emailVerified ? (
                    <span className="inline-flex items-center gap-1 text-xs text-green-400">
                      <CheckCircle2 className="w-3.5 h-3.5" /> Đã xác thực
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                      <XCircle className="w-3.5 h-3.5" /> Chưa xác thực
                    </span>
                  ),
              },
              {
                id: "role",
                header: "Vai trò",
                cell: (u) => (
                  <AdminStatusBadge
                    status={u.role === "vip" ? "vip" : u.role === "admin" ? "failed" : "draft"}
                    label={u.role}
                  />
                ),
              },
              {
                id: "joined",
                header: "Ngày tham gia",
                hideBelow: "md",
                cell: (u) => (
                  <span className="text-muted-foreground text-xs">
                    {new Date(u.createdAt).toLocaleDateString("vi-VN")}
                  </span>
                ),
              },
            ]}
            data={users}
            rowKey={(u) => u.id}
            isLoading={isLoading}
            actionsColumn={(u) => (
              <div className="flex items-center justify-end gap-1">
                <button
                  onClick={() => navigate(`/admin/users/${u.id}`)}
                  className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs bg-secondary text-muted-foreground hover:bg-secondary/80 hover:text-foreground transition-colors"
                >
                  <ExternalLink className="w-3 h-3" /> Chi tiết
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
            )}
          />
        </div>
      </EntityPage>

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
    </AdminLayout>
  );
}
