import { useAuth } from "@/_core/hooks/useAuth";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { trpc } from "@/lib/trpc";
import {
  AlertTriangle,
  ArrowLeft,
  Ban,
  BookmarkIcon,
  Calendar,
  CheckCircle,
  Crown,
  ImageIcon,
  KeyRound,
  Loader2,
  Mail,
  Shield,
  Trash2,
  User,
  UserCheck,
  UserX,
} from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useLocation, useParams } from "wouter";
import AdminLayout from "./AdminLayout";
import { AdminPageShell, AdminPageHeader } from "@/admin";

export default function AdminUserDetail() {
  const { user: currentUser } = useAuth();
  const params = useParams<{ id: string }>();
  const userId = parseInt(params.id ?? "0", 10);
  const [, navigate] = useLocation();
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showResetResult, setShowResetResult] = useState<{
    tempPassword: string;
    emailSent: boolean;
    devPreviewUrl?: string;
  } | null>(null);

  const utils = trpc.useUtils();

  // Redirect non-admins (using useEffect to avoid render-phase side effects)
  useEffect(() => {
    if (currentUser && currentUser.role !== "admin") {
      navigate("/");
    }
  }, [currentUser, navigate]);

  const { data: userDetail, isLoading, error } = trpc.users.adminGetDetail.useQuery(
    { userId },
    { enabled: !!userId }
  );

  const grantVip = trpc.users.grantVip.useMutation({
    onSuccess: () => {
      toast.success("Đã cấp VIP thành công");
      utils.users.adminGetDetail.invalidate({ userId });
      utils.users.adminList.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const removeVip = trpc.users.removeVip.useMutation({
    onSuccess: () => {
      toast.success("Đã xóa VIP");
      utils.users.adminGetDetail.invalidate({ userId });
      utils.users.adminList.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const ban = trpc.users.ban.useMutation({
    onSuccess: () => {
      toast.success("Đã khóa tài khoản");
      utils.users.adminGetDetail.invalidate({ userId });
      utils.users.adminList.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const unban = trpc.users.unban.useMutation({
    onSuccess: () => {
      toast.success("Đã mở khóa tài khoản");
      utils.users.adminGetDetail.invalidate({ userId });
      utils.users.adminList.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const resetPassword = trpc.users.adminResetPassword.useMutation({
    onSuccess: (data) => {
      setShowResetResult({
        tempPassword: data.tempPassword,
        emailSent: data.emailSent,
        devPreviewUrl: data._devPreviewUrl ?? undefined,
      });
    },
    onError: (e) => toast.error(e.message),
  });

  const deleteUser = trpc.users.adminDelete.useMutation({
    onSuccess: () => {
      toast.success("Đã xóa tài khoản");
      navigate("/admin/users");
    },
    onError: (e) => toast.error(e.message),
  });

  if (isLoading) {
    return (
      <AdminLayout>
        <div className="flex items-center justify-center min-h-[60vh]">
          <Loader2 className="w-8 h-8 text-primary animate-spin" />
        </div>
      </AdminLayout>
    );
  }

  if (error || !userDetail) {
    return (
      <AdminLayout>
        <div className="p-6">
          <Button variant="ghost" size="sm" onClick={() => navigate("/admin/users")} className="mb-4">
            <ArrowLeft className="w-4 h-4 mr-2" /> Quay lại danh sách
          </Button>
          <div className="rounded-xl bg-card border border-border/50 p-12 text-center">
            <AlertTriangle className="w-10 h-10 text-destructive/50 mx-auto mb-3" />
            <p className="text-muted-foreground">Không tìm thấy người dùng</p>
          </div>
        </div>
      </AdminLayout>
    );
  }

  const isVip = userDetail.role === "vip";
  const isBanned = userDetail.status === "banned";
  const isAdmin = userDetail.role === "admin";
  const isSelf = currentUser?.id === userDetail.id;

  const roleBadge = () => {
    if (isAdmin) return <Badge className="bg-purple-600 text-white">Admin</Badge>;
    if (isVip) return <Badge className="bg-amber-500 text-black font-bold"><Crown className="w-3 h-3 mr-1" />VIP</Badge>;
    return <Badge variant="secondary">Người dùng</Badge>;
  };

  const statusBadge = () => {
    if (isBanned) return <Badge variant="destructive"><Ban className="w-3 h-3 mr-1" />Đã khóa</Badge>;
    return <Badge className="bg-emerald-600 text-white"><CheckCircle className="w-3 h-3 mr-1" />Hoạt động</Badge>;
  };

  return (
    <AdminLayout>
      <AdminPageShell mode="full">
        <AdminPageHeader icon={User} title="Chi tiết người dùng" subtitle={`ID #${userDetail.id}`} />
        <div className="space-y-6">
          <Button variant="ghost" size="sm" onClick={() => navigate("/admin/users")} className="-mt-2">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Quay lại danh sách
          </Button>
          {/* Profile Card */}
          <Card className="bg-card border-border">
            <CardContent className="pt-6">
              <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
                <div className="w-16 h-16 rounded-full bg-gradient-to-br from-orange-500 to-amber-600 flex items-center justify-center text-2xl font-bold text-white flex-shrink-0">
                  {userDetail.name ? userDetail.name.charAt(0).toUpperCase() : <User className="w-7 h-7" />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2 mb-1">
                    <h1 className="text-xl font-bold text-foreground truncate">
                      {userDetail.name ?? "Chưa đặt tên"}
                    </h1>
                    {roleBadge()}
                    {statusBadge()}
                  </div>
                  {userDetail.email && (
                    <div className="flex items-center gap-2 text-muted-foreground text-sm">
                      <Mail className="w-4 h-4" />
                      <span>{userDetail.email}</span>
                    </div>
                  )}
                  <div className="flex items-center gap-2 text-muted-foreground text-xs mt-1">
                    <Calendar className="w-3 h-3" />
                    <span>Tham gia {new Date(userDetail.createdAt).toLocaleDateString("vi-VN")}</span>
                    {userDetail.lastSignedIn && (
                      <>
                        <span className="text-border">·</span>
                        <span>Đăng nhập lần cuối {new Date(userDetail.lastSignedIn).toLocaleDateString("vi-VN")}</span>
                      </>
                    )}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Stats */}
            <Card className="bg-card border-border">
              <CardHeader className="pb-3">
                <CardTitle className="text-base font-semibold text-foreground">Thống kê tài khoản</CardTitle>
              </CardHeader>
              <CardContent className="space-y-0">
                {[
                  { icon: <BookmarkIcon className="w-4 h-4" />, label: "Đã lưu", value: userDetail.bookmarksCount },
                  { icon: <ImageIcon className="w-4 h-4" />, label: "Album đã tải lên", value: userDetail.albumsCount },
                  { icon: <Shield className="w-4 h-4" />, label: "Phương thức đăng nhập", value: userDetail.loginMethod ?? "email" },
                ].map(({ icon, label, value }, i, arr) => (
                  <div key={label} className={`flex items-center justify-between py-2.5 ${i < arr.length - 1 ? "border-b border-border/50" : ""}`}>
                    <div className="flex items-center gap-2 text-muted-foreground text-sm">
                      {icon}
                      <span>{label}</span>
                    </div>
                    <span className="font-semibold text-foreground text-sm capitalize">{value}</span>
                  </div>
                ))}
                <div className="flex items-center justify-between py-2.5">
                  <div className="flex items-center gap-2 text-muted-foreground text-sm">
                    <User className="w-4 h-4" />
                    <span>Trạng thái</span>
                  </div>
                  {statusBadge()}
                </div>
              </CardContent>
            </Card>

            {/* Subscription */}
            <Card className="bg-card border-border">
              <CardHeader className="pb-3">
                <CardTitle className="text-base font-semibold text-foreground flex items-center gap-2">
                  <Crown className="w-4 h-4 text-amber-500" />
                  Đăng ký VIP
                </CardTitle>
              </CardHeader>
              <CardContent>
                {userDetail.subscription ? (
                  <div className="space-y-0">
                    {[
                      { label: "Trạng thái", value: <Badge className="bg-emerald-600 text-white capitalize">{userDetail.subscription.status}</Badge> },
                      { label: "Ngày bắt đầu", value: new Date(userDetail.subscription.startedAt!).toLocaleDateString("vi-VN") },
                      ...(userDetail.subscription.expiresAt ? [{
                        label: "Hết hạn",
                        value: <span className={new Date(userDetail.subscription.expiresAt!) < new Date() ? "text-destructive text-sm font-medium" : "text-foreground text-sm font-medium"}>
                          {new Date(userDetail.subscription.expiresAt!).toLocaleDateString("vi-VN")}
                        </span>
                      }] : []),
                      ...(userDetail.subscription.stripeSubscriptionId ? [{
                        label: "Provider Ref",
                        value: <code className="text-xs text-muted-foreground font-mono truncate max-w-[140px] block">{userDetail.subscription.stripeSubscriptionId}</code>
                      }] : []),
                    ].map(({ label, value }, i, arr) => (
                      <div key={label} className={`flex items-center justify-between py-2.5 ${i < arr.length - 1 ? "border-b border-border/50" : ""}`}>
                        <span className="text-sm text-muted-foreground">{label}</span>
                        <span className="text-sm font-medium text-foreground">{value}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-6 text-muted-foreground">
                    <Crown className="w-8 h-8 mx-auto mb-2 opacity-30" />
                    <p className="text-sm">Chưa có đăng ký VIP</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Registration History */}
          <Card className="bg-card border-border">
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-semibold text-foreground">Lịch sử tài khoản</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                {[
                  { label: "Đã đăng ký", value: new Date(userDetail.createdAt).toLocaleString("vi-VN") },
                  { label: "Cập nhật lần cuối", value: new Date(userDetail.updatedAt).toLocaleString("vi-VN") },
                  { label: "Đăng nhập lần cuối", value: userDetail.lastSignedIn ? new Date(userDetail.lastSignedIn).toLocaleString("vi-VN") : "Chưa có" },
                ].map(({ label, value }) => (
                  <div key={label} className="bg-muted/30 rounded-lg p-4">
                    <p className="text-xs text-muted-foreground mb-1">{label}</p>
                    <p className="font-semibold text-foreground text-sm">{value}</p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Admin Actions */}
          {!isSelf && (
            <Card className="bg-card border-border">
              <CardHeader className="pb-3">
                <CardTitle className="text-base font-semibold text-foreground">Thao tác quản trị</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* VIP Actions */}
                {!isAdmin && (
                  <div>
                    <p className="text-xs text-muted-foreground mb-2 font-medium uppercase tracking-wide">Quyền VIP</p>
                    <div className="flex flex-wrap gap-2">
                      {!isVip ? (
                        <Button
                          onClick={() => grantVip.mutate({ userId })}
                          disabled={grantVip.isPending}
                          className="bg-amber-500 hover:bg-amber-600 text-black font-semibold"
                        >
                          {grantVip.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Crown className="w-4 h-4 mr-2" />}
                          Cấp VIP
                        </Button>
                      ) : (
                        <Button
                          onClick={() => removeVip.mutate({ userId })}
                          disabled={removeVip.isPending}
                          variant="outline"
                          className="border-amber-500/50 text-amber-400 hover:bg-amber-500/10"
                        >
                          {removeVip.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Crown className="w-4 h-4 mr-2" />}
                          Xóa VIP
                        </Button>
                      )}
                    </div>
                  </div>
                )}

                <Separator className="bg-border/50" />

                {/* Ban / Reset */}
                <div>
                  <p className="text-xs text-muted-foreground mb-2 font-medium uppercase tracking-wide">Tài khoản</p>
                  <div className="flex flex-wrap gap-2">
                    {!isBanned ? (
                      <Button
                        onClick={() => ban.mutate({ userId })}
                        disabled={ban.isPending}
                        variant="outline"
                        className="border-destructive/50 text-destructive hover:bg-destructive/10"
                      >
                        {ban.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <UserX className="w-4 h-4 mr-2" />}
                        Khóa tài khoản
                      </Button>
                    ) : (
                      <Button
                        onClick={() => unban.mutate({ userId })}
                        disabled={unban.isPending}
                        className="bg-emerald-600 hover:bg-emerald-700 text-white"
                      >
                        {unban.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <UserCheck className="w-4 h-4 mr-2" />}
                        Mở khóa
                      </Button>
                    )}
                    <Button
                      onClick={() => resetPassword.mutate({ userId })}
                      disabled={resetPassword.isPending}
                      variant="outline"
                      className="border-border"
                    >
                      {resetPassword.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <KeyRound className="w-4 h-4 mr-2" />}
                      Đặt lại mật khẩu
                    </Button>
                  </div>
                </div>

                {/* Reset Password Result */}
                {showResetResult && (
                  <div className="bg-muted/30 border border-border rounded-lg p-4 space-y-2">
                    <div className="flex items-center gap-2 text-emerald-400 text-sm font-semibold">
                      <CheckCircle className="w-4 h-4" />
                      Đặt lại mật khẩu thành công
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground">Mật khẩu tạm:</span>
                      <code className="text-sm font-mono font-bold text-orange-400 bg-black/30 px-2 py-0.5 rounded">
                        {showResetResult.tempPassword}
                      </code>
                    </div>
                    {showResetResult.emailSent ? (
                      <p className="text-xs text-emerald-400">Đã gửi email cho người dùng.</p>
                    ) : (
                      <p className="text-xs text-amber-400">Không gửi được email (không có địa chỉ email). Hãy chia sẻ mật khẩu tạm thủ công.</p>
                    )}
                    {showResetResult.devPreviewUrl && (
                      <a
                        href={showResetResult.devPreviewUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-blue-400 underline"
                      >
                        Xem trước email (chỉ dev)
                      </a>
                    )}
                    <Button size="sm" variant="ghost" onClick={() => setShowResetResult(null)} className="text-xs">
                      Đóng
                    </Button>
                  </div>
                )}

                <Separator className="bg-border/50" />

                {/* Delete */}
                <div>
                  <p className="text-xs text-muted-foreground mb-2 font-medium uppercase tracking-wide">Vùng nguy hiểm</p>
                  {!showDeleteConfirm ? (
                    <Button
                      onClick={() => setShowDeleteConfirm(true)}
                      variant="outline"
                      className="border-destructive/50 text-destructive hover:bg-destructive/10"
                    >
                      <Trash2 className="w-4 h-4 mr-2" />
                      Xóa tài khoản
                    </Button>
                  ) : (
                    <div className="bg-destructive/5 border border-destructive/30 rounded-lg p-4 space-y-3">
                      <div className="flex items-start gap-2">
                        <AlertTriangle className="w-4 h-4 text-destructive mt-0.5 shrink-0" />
                        <p className="text-sm text-destructive">
                          Hành động này không thể hoàn tác. Tài khoản và tất cả dữ liệu liên quan sẽ bị xóa vĩnh viễn.
                        </p>
                      </div>
                      <div className="flex gap-2">
                        <Button
                          onClick={() => deleteUser.mutate({ userId })}
                          disabled={deleteUser.isPending}
                          variant="destructive"
                          size="sm"
                        >
                          {deleteUser.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Trash2 className="w-4 h-4 mr-2" />}
                          Xác nhận xóa
                        </Button>
                        <Button
                          onClick={() => setShowDeleteConfirm(false)}
                          variant="outline"
                          size="sm"
                        >
                          Hủy
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </AdminPageShell>
    </AdminLayout>
  );
}
