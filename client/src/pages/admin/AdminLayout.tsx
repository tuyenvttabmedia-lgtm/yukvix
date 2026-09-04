import { useAuth } from "@/_core/hooks/useAuth";
import { isAdmin } from "@shared/const";
import SeoHead from "@/components/SeoHead";
import { BarChart3, Crown, Download, FileText, FolderOpen, HardDrive, History, Home, ImageIcon, Layers, Library, Link2, Loader2, Mail, Menu, MessageSquare, Package, Palette, Search, Share2, Shield, ShieldAlert, Sparkles, Tag, TrendingUp, Users, UserSquare2, Webhook, Zap, ClipboardList, MoreHorizontal, X } from "lucide-react";
import { useState } from "react";
import { Link, useLocation } from "wouter";

const navSections = [
  {
    label: "Nội dung",
    items: [
      { href: "/admin", label: "Tổng quan", icon: <BarChart3 className="w-4 h-4" /> },
      { href: "/admin/analytics", label: "Thống kê", icon: <TrendingUp className="w-4 h-4" /> },
      { href: "/admin/albums", label: "Album", icon: <ImageIcon className="w-4 h-4" /> },
      { href: "/admin/media", label: "Thư viện Media", icon: <Library className="w-4 h-4" /> },
      { href: "/admin/users", label: "Người dùng", icon: <Users className="w-4 h-4" /> },
      { href: "/admin/subscriptions", label: "Đăng ký VIP", icon: <Crown className="w-4 h-4" /> },
      { href: "/admin/tags", label: "Thẻ tag", icon: <Tag className="w-4 h-4" /> },
      { href: "/admin/creators", label: "Cosplayer", icon: <UserSquare2 className="w-4 h-4" /> },
      { href: "/admin/creators/link", label: "Gắn Cosplayer", icon: <Link2 className="w-4 h-4" /> },
    ],
  },
  {
    label: "CMS",
    items: [
      { href: "/admin/cms/appearance", label: "Giao diện", icon: <Palette className="w-4 h-4" /> },
      { href: "/admin/cms/menus", label: "Menu", icon: <Menu className="w-4 h-4" /> },
      { href: "/admin/cms/categories", label: "Danh mục", icon: <FolderOpen className="w-4 h-4" /> },
      { href: "/admin/cms/pages", label: "Trang tĩnh", icon: <FileText className="w-4 h-4" /> },
    ],
  },
  {
    label: "Thanh toán",
    items: [
      { href: "/admin/payments/settings", label: "Cài đặt", icon: <Zap className="w-4 h-4" /> },
      { href: "/admin/payments/plans", label: "Gói VIP", icon: <Package className="w-4 h-4" /> },
      { href: "/admin/payments/history", label: "Lịch sử", icon: <History className="w-4 h-4" /> },
      { href: "/admin/payments/vip", label: "Thành viên VIP", icon: <Crown className="w-4 h-4" /> },
      { href: "/admin/payments/webhooks", label: "Webhooks", icon: <Webhook className="w-4 h-4" /> },
    ],
  },
  {
    label: "Import",
    items: [
      { href: "/admin/zip-import", label: "ZIP Import", icon: <Sparkles className="w-4 h-4" /> },
      { href: "/admin/import", label: "Công việc Import", icon: <Download className="w-4 h-4" /> },
      { href: "/admin/import/sources", label: "Nguồn dữ liệu", icon: <Layers className="w-4 h-4" /> },
      { href: "/admin/import/history", label: "Lịch sử", icon: <History className="w-4 h-4" /> },
    ],
  },
  {
    label: "Hệ thống",
    items: [
      { href: "/admin/storage", label: "Lưu trữ (Wasabi)", icon: <HardDrive className="w-4 h-4" /> },
      { href: "/admin/smtp", label: "Email (SMTP)", icon: <Mail className="w-4 h-4" /> },
      { href: "/admin/email-logs", label: "Nhật ký Email", icon: <ClipboardList className="w-4 h-4" /> },
      { href: "/admin/contact-submissions", label: "Tin nhắn liên hệ", icon: <MessageSquare className="w-4 h-4" /> },
      { href: "/admin/dmca-submissions", label: "Yêu cầu DMCA", icon: <ShieldAlert className="w-4 h-4" /> },
      { href: "/admin/seo", label: "SEO Tracking", icon: <Search className="w-4 h-4" /> },
      { href: "/admin/seo/bulk", label: "Bulk Generate SEO", icon: <Sparkles className="w-4 h-4" /> },
      { href: "/admin/settings/ai", label: "AI Settings", icon: <Shield className="w-4 h-4" /> },
      { href: "/admin/social", label: "Social Distribution", icon: <Share2 className="w-4 h-4" /> },
    ],
  },
];

// Mobile nav: only 5 most important items + "More" button
const mobileNavPrimary = [
  { href: "/admin", label: "Tổng quan", icon: <BarChart3 className="w-5 h-5" /> },
  { href: "/admin/albums", label: "Album", icon: <ImageIcon className="w-5 h-5" /> },
  { href: "/admin/users", label: "Users", icon: <Users className="w-5 h-5" /> },
  { href: "/admin/media", label: "Media", icon: <Library className="w-5 h-5" /> },
  { href: "/admin/analytics", label: "Thống kê", icon: <TrendingUp className="w-5 h-5" /> },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const { user, isAuthenticated, loading } = useAuth();
  const [location] = useLocation();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-primary animate-spin" />
      </div>
    );
  }

  if (!isAuthenticated || !isAdmin(user?.role)) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <Shield className="w-12 h-12 text-muted-foreground/30 mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-foreground mb-2">Yêu cầu quyền Admin</h2>
          <p className="text-muted-foreground mb-4">Bạn không có quyền truy cập khu vực này.</p>
          <Link href="/" className="text-primary hover:underline">Về trang chủ</Link>
        </div>
      </div>
    );
  }

  const isActive = (href: string) => {
    if (href === "/admin") return location === "/admin";
    if (href === "/admin/creators") return location === "/admin/creators";
    // Avoid /admin/analytics matching /admin/albums etc.
    return location === href || location.startsWith(href + "/");
  };

  return (
    <div className="min-h-screen flex">
      <SeoHead title="Admin Dashboard" noIndex />
      {/* Sidebar */}
      <aside className="w-56 shrink-0 border-r border-border/50 bg-card/50 hidden md:flex flex-col">
        <div className="p-4 border-b border-border/50">
          <div className="flex items-center gap-2">
            <Shield className="w-5 h-5 text-primary" />
            <span className="font-semibold text-foreground text-sm">Quản trị</span>
          </div>
        </div>
        <nav className="flex-1 p-3 space-y-4 overflow-y-auto">
          {navSections.map((section) => (
            <div key={section.label}>
              <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/50 px-3 mb-1">
                {section.label}
              </p>
              <div className="space-y-0.5">
                {section.items.map(({ href, label, icon }) => (
                  <Link
                    key={href}
                    href={href}
                    className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-all ${
                      isActive(href)
                        ? "bg-primary/10 text-primary border border-primary/20"
                        : "text-muted-foreground hover:text-foreground hover:bg-secondary"
                    }`}
                  >
                    {icon}
                    {label}
                  </Link>
                ))}
              </div>
            </div>
          ))}
        </nav>
        <div className="p-3 border-t border-border/50">
          <Link
            href="/"
            className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm text-muted-foreground hover:text-foreground hover:bg-secondary transition-all"
          >
            <Home className="w-4 h-4" />
            Về trang web
          </Link>
        </div>
      </aside>

      {/* Mobile nav */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-card border-t border-border/50 flex">
        {mobileNavPrimary.map(({ href, label, icon }) => (
          <Link
            key={href}
            href={href}
            className={`flex-1 flex flex-col items-center gap-1 py-2 text-[10px] transition-colors ${
              isActive(href) ? "text-primary" : "text-muted-foreground"
            }`}
          >
            {icon}
            <span className="truncate max-w-[48px] text-center">{label}</span>
          </Link>
        ))}
        <button
          onClick={() => setMobileMenuOpen(v => !v)}
          className="flex-1 flex flex-col items-center gap-1 py-2 text-[10px] text-muted-foreground"
        >
          {mobileMenuOpen ? <X className="w-5 h-5" /> : <MoreHorizontal className="w-5 h-5" />}
          <span>Thêm</span>
        </button>
      </div>

      {/* Mobile full-screen menu overlay */}
      {mobileMenuOpen && (
        <div className="md:hidden fixed inset-0 z-30 bg-background/95 backdrop-blur-sm overflow-y-auto pb-20">
          <div className="p-4">
            <div className="flex items-center gap-2 mb-6 pt-2">
              <Shield className="w-5 h-5 text-primary" />
              <span className="font-semibold text-foreground">Quản trị</span>
            </div>
            {navSections.map((section) => (
              <div key={section.label} className="mb-4">
                <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/50 px-2 mb-1">
                  {section.label}
                </p>
                <div className="grid grid-cols-2 gap-1">
                  {section.items.map(({ href, label, icon }) => (
                    <Link
                      key={href}
                      href={href}
                      onClick={() => setMobileMenuOpen(false)}
                      className={`flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm transition-all ${
                        isActive(href)
                          ? "bg-primary/10 text-primary border border-primary/20"
                          : "text-muted-foreground hover:text-foreground hover:bg-secondary"
                      }`}
                    >
                      {icon}
                      <span className="truncate">{label}</span>
                    </Link>
                  ))}
                </div>
              </div>
            ))}
            <div className="mt-4 border-t border-border/50 pt-4">
              <Link
                href="/"
                onClick={() => setMobileMenuOpen(false)}
                className="flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm text-muted-foreground hover:text-foreground hover:bg-secondary"
              >
                <Home className="w-4 h-4" />
                Về trang web
              </Link>
            </div>
          </div>
        </div>
      )}

      {/* Content */}
      <main data-admin className="flex-1 overflow-auto pb-16 md:pb-0">
        {children}
      </main>
    </div>
  );
}
