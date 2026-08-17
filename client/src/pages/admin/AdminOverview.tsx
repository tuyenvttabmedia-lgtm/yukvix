import { trpc } from "@/lib/trpc";
import { DashboardPage } from "@/admin";
import AdminLayout from "./AdminLayout";
import {
  BarChart3,
  Crown,
  Eye,
  ImageIcon,
  Plus,
  TrendingUp,
  Upload,
  Users,
} from "lucide-react";
import { Link } from "wouter";

export default function AdminOverview() {
  const { data: analytics, isLoading } = trpc.analytics.overview.useQuery();

  const statCards = analytics
    ? [
        {
          label: "Tổng album",
          value: analytics.totalAlbums.toLocaleString(),
          icon: <ImageIcon className="w-5 h-5" />,
          color: "text-blue-400",
          bg: "bg-blue-400/10",
          href: "/admin/albums",
        },
        {
          label: "Tổng ảnh",
          value: analytics.totalPhotos.toLocaleString(),
          icon: <BarChart3 className="w-5 h-5" />,
          color: "text-purple-400",
          bg: "bg-purple-400/10",
          href: "/admin/media",
        },
        {
          label: "Tổng người dùng",
          value: analytics.totalUsers.toLocaleString(),
          icon: <Users className="w-5 h-5" />,
          color: "text-green-400",
          bg: "bg-green-400/10",
          href: "/admin/users",
        },
        {
          label: "Thành viên VIP",
          value: analytics.vipUsers.toLocaleString(),
          icon: <Crown className="w-5 h-5" />,
          color: "text-primary",
          bg: "bg-primary/10",
          href: "/admin/payments/vip",
        },
        {
          label: "Tổng lượt xem",
          value: analytics.totalViews.toLocaleString(),
          icon: <Eye className="w-5 h-5" />,
          color: "text-orange-400",
          bg: "bg-orange-400/10",
          href: "/admin/analytics",
        },
        {
          label: "Đăng ký hoạt động",
          value: analytics.activeSubscriptions.toLocaleString(),
          icon: <TrendingUp className="w-5 h-5" />,
          color: "text-emerald-400",
          bg: "bg-emerald-400/10",
          href: "/admin/subscriptions",
        },
      ]
    : [];

  const quickActions = [
    {
      label: "Tạo album mới",
      icon: <Plus className="w-4 h-4" />,
      href: "/admin/albums",
      color: "bg-primary/10 text-primary hover:bg-primary/20 border-primary/20",
    },
    {
      label: "Import ảnh",
      icon: <Upload className="w-4 h-4" />,
      href: "/admin/import",
      color: "bg-blue-400/10 text-blue-400 hover:bg-blue-400/20 border-blue-400/20",
    },
    {
      label: "Quản lý VIP",
      icon: <Crown className="w-4 h-4" />,
      href: "/admin/payments/vip",
      color: "bg-amber-400/10 text-amber-400 hover:bg-amber-400/20 border-amber-400/20",
    },
    {
      label: "Xem thống kê",
      icon: <TrendingUp className="w-4 h-4" />,
      href: "/admin/analytics",
      color: "bg-emerald-400/10 text-emerald-400 hover:bg-emerald-400/20 border-emerald-400/20",
    },
  ];

  return (
    <AdminLayout>
      <DashboardPage
        header={{ icon: BarChart3, title: "Tổng quan", subtitle: "Thống kê hệ thống" }}
        metrics={
          isLoading
            ? []
            : statCards.slice(0, 4).map((s) => ({
                label: s.label,
                value: s.value,
                href: s.href,
              }))
        }
      >
        {/* Quick Actions */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
          {quickActions.map(({ label, icon, href, color }) => (
            <Link key={href} href={href}>
              <div className={`flex items-center gap-2.5 px-4 py-3 rounded-xl border cursor-pointer transition-colors ${color}`}>
                {icon}
                <span className="text-sm font-medium">{label}</span>
              </div>
            </Link>
          ))}
        </div>

        {/* Stat Cards (extended) */}
        {isLoading ? (
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-6">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-24 skeleton rounded-xl" />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-6">
            {statCards.map(({ label, value, icon, color, bg, href }) => (
              <Link key={label} href={href}>
                <div className="rounded-xl bg-card border border-border/50 p-4 hover:border-border transition-colors cursor-pointer group">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-sm text-muted-foreground group-hover:text-foreground transition-colors">{label}</span>
                    <div className={`w-8 h-8 rounded-lg ${bg} flex items-center justify-center ${color}`}>
                      {icon}
                    </div>
                  </div>
                  <p className="text-2xl font-bold text-foreground">{value}</p>
                </div>
              </Link>
            ))}
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Top Albums */}
          {(isLoading || (analytics?.topAlbums && analytics.topAlbums.length > 0)) && (
            <div className="rounded-xl bg-card border border-border/50 p-5">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-base font-semibold text-foreground">Album xem nhiều nhất</h2>
                <Link href="/admin/analytics" className="text-xs text-primary hover:underline">Xem thêm</Link>
              </div>
              {isLoading ? (
                <div className="space-y-3">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <div key={i} className="h-8 skeleton rounded" />
                  ))}
                </div>
              ) : (
                <div className="space-y-3">
                  {analytics!.topAlbums.map((album, i) => (
                    <div key={album.id} className="flex items-center gap-3">
                      <span className="w-5 text-xs text-muted-foreground font-mono text-right">{i + 1}</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-foreground truncate">{album.title}</p>
                        <div className="mt-1 h-1 rounded-full bg-secondary overflow-hidden">
                          <div
                            className="h-full rounded-full bg-primary/50"
                            style={{
                              width: `${(album.viewCount / (analytics!.topAlbums[0]?.viewCount || 1)) * 100}%`,
                            }}
                          />
                        </div>
                      </div>
                      <span className="text-xs text-muted-foreground shrink-0 tabular-nums">
                        {album.viewCount.toLocaleString()}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Recent Users */}
          {(isLoading || (analytics?.recentUsers && analytics.recentUsers.length > 0)) && (
            <div className="rounded-xl bg-card border border-border/50 p-5">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-base font-semibold text-foreground">Người dùng mới nhất</h2>
                <Link href="/admin/users" className="text-xs text-primary hover:underline">Xem tất cả</Link>
              </div>
              {isLoading ? (
                <div className="space-y-3">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <div key={i} className="h-10 skeleton rounded" />
                  ))}
                </div>
              ) : (
                <div className="space-y-2">
                  {analytics!.recentUsers.map((u) => (
                    <Link key={u.id} href={`/admin/users/${u.id}`}>
                      <div className="flex items-center gap-3 p-2 rounded-lg hover:bg-secondary/50 transition-colors cursor-pointer">
                        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-orange-500/30 to-amber-600/30 border border-border flex items-center justify-center shrink-0">
                          <span className="text-xs font-semibold text-foreground">
                            {u.name ? u.name.charAt(0).toUpperCase() : "?"}
                          </span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-foreground truncate">{u.name || "Ẩn danh"}</p>
                          <p className="text-xs text-muted-foreground truncate">{u.email || "Không có email"}</p>
                        </div>
                        <span
                          className={`text-xs px-2 py-0.5 rounded-full shrink-0 ${
                            u.role === "admin"
                              ? "bg-red-400/10 text-red-400"
                              : u.role === "vip"
                              ? "bg-primary/10 text-primary"
                              : "bg-secondary text-muted-foreground"
                          }`}
                        >
                          {u.role}
                        </span>
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </DashboardPage>
    </AdminLayout>
  );
}
