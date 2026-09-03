import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { Bookmark, Crown, LogOut, Menu, Search, Settings, Shield, User, Users, Hash, X } from "lucide-react";
import { useState } from "react";
import { Link, useLocation } from "wouter";
import { Button } from "./ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";
import { useTranslation } from "react-i18next";
import { LanguageSwitcher } from "./LanguageSwitcher";
import { cmsDisplayUrl } from "@/lib/cms-media";

export default function Navbar() {
  const { user, isAuthenticated, logout } = useAuth();
  const [location, navigate] = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const { data: siteSettings } = trpc.cms.getPublicSettings.useQuery();
  const { t } = useTranslation();
  const logoUrl = cmsDisplayUrl(siteSettings?.["logo_url"]) || "/manus-storage/yukvix-logo_cfb9338f.png";
  const siteName = siteSettings?.["site_name"] || "Yukvix";

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      navigate(`/search?q=${encodeURIComponent(searchQuery.trim())}`);
      setMobileOpen(false);
    }
  };

  const isVip = user?.role === "vip" || user?.role === "admin" || user?.role === "super_admin";
  const isAdmin = user?.role === "admin" || user?.role === "super_admin";

  return (
    <header className="sticky top-0 z-50 w-full border-b border-border/50 bg-background/90 backdrop-blur-xl">
      <div className="container">
        <div className="flex h-16 items-center justify-between gap-4">
          {/* Logo */}
          <Link href="/" className="flex items-center shrink-0">
            <img
              src={logoUrl}
              alt={siteName}
              className="h-9 w-auto object-contain"
            />
          </Link>

          {/* Desktop Nav Links */}
          <nav className="hidden md:flex items-center gap-6 text-sm">
            <Link
              href="/gallery"
              className={`transition-colors hover:text-primary ${location === "/gallery" ? "text-primary" : "text-muted-foreground"}`}
            >
              {t("nav.gallery")}
            </Link>
            <Link
              href="/search"
              className={`transition-colors hover:text-primary ${location.startsWith("/search") ? "text-primary" : "text-muted-foreground"}`}
            >
              {t("nav.browse")}
            </Link>
            <Link
              href="/creators"
              className={`flex items-center gap-1 transition-colors hover:text-primary ${location.startsWith("/creator") ? "text-primary" : "text-muted-foreground"}`}
            >
              <Users className="w-3.5 h-3.5" />
              {t("nav.creators")}
            </Link>
            <Link
              href="/tags"
              className={`flex items-center gap-1 transition-colors hover:text-primary ${location.startsWith("/tag") ? "text-primary" : "text-muted-foreground"}`}
            >
              <Hash className="w-3.5 h-3.5" />
              {t("nav.tags")}
            </Link>
            <Link
              href="/vip"
              className={`flex items-center gap-1.5 transition-colors hover:text-primary ${location === "/vip" ? "text-primary" : "text-muted-foreground"}`}
            >
              <Crown className="w-3.5 h-3.5" />
              {t("nav.vip")}
            </Link>
          </nav>

          {/* Search Bar */}
          <form onSubmit={handleSearch} className="hidden sm:flex flex-1 max-w-sm">
            <div className="relative w-full">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={t("nav.searchPlaceholder")}
                className="w-full h-9 pl-9 pr-4 rounded-lg bg-secondary border border-border text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary transition-colors"
              />
            </div>
          </form>

          {/* Right Actions */}
          <div className="flex items-center gap-2 shrink-0">
            {/* Language Switcher */}
            <LanguageSwitcher variant="icon" />

            {isAuthenticated && user ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button className="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-secondary transition-colors">
                    <div className="w-8 h-8 rounded-full bg-secondary border border-border flex items-center justify-center overflow-hidden">
                      {user.avatarUrl ? (
                        <img src={user.avatarUrl} alt={user.name || ""} className="w-full h-full object-cover" />
                      ) : (
                        <User className="w-4 h-4 text-muted-foreground" />
                      )}
                    </div>
                    <div className="hidden sm:flex flex-col items-start">
                      <span className="text-xs font-medium text-foreground leading-none">
                        {user.name || "User"}
                      </span>
                      {isVip && (
                        <span className="vip-badge mt-0.5">
                          {isAdmin ? "Admin" : "VIP"}
                        </span>
                      )}
                    </div>
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-48 bg-card border-border">
                  <DropdownMenuItem asChild>
                    <Link href="/account" className="flex items-center gap-2 cursor-pointer">
                      <User className="w-4 h-4" />
                      {t("nav.myAccount")}
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <Link href="/bookmarks" className="flex items-center gap-2 cursor-pointer">
                      <Bookmark className="w-4 h-4" />
                      {t("nav.myBookmarks")}
                    </Link>
                  </DropdownMenuItem>
                  {!isVip && (
                    <DropdownMenuItem asChild>
                      <Link href="/vip" className="flex items-center gap-2 cursor-pointer text-primary">
                        <Crown className="w-4 h-4" />
                        {t("nav.upgradeVip")}
                      </Link>
                    </DropdownMenuItem>
                  )}
                  {isAdmin && (
                    <>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem asChild>
                        <Link href="/admin" className="flex items-center gap-2 cursor-pointer">
                          <Shield className="w-4 h-4" />
                          {t("nav.adminDashboard")}
                        </Link>
                      </DropdownMenuItem>
                    </>
                  )}
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={() => logout()}
                    className="flex items-center gap-2 cursor-pointer text-destructive focus:text-destructive"
                  >
                    <LogOut className="w-4 h-4" />
                    {t("nav.signOut")}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : (
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  className="hidden sm:flex bg-amber-500 text-black hover:bg-amber-400 font-semibold"
                  onClick={() => navigate("/vip")}
                >
                  <Crown className="w-3.5 h-3.5" />
                  {t("nav.upgradeVip")}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="hidden sm:flex border-border text-foreground hover:bg-secondary"
                  onClick={() => navigate("/login")}
                >
                  {t("nav.signIn")}
                </Button>
                <Button
                  size="sm"
                  className="bg-primary text-primary-foreground hover:bg-primary/90"
                  onClick={() => navigate("/register")}
                >
                  {t("nav.joinFree")}
                </Button>
              </div>
            )}

            {/* Mobile menu toggle */}
            <button
              className="md:hidden p-2 rounded-lg hover:bg-secondary transition-colors"
              onClick={() => setMobileOpen(!mobileOpen)}
            >
              {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </div>

        {/* Mobile Menu */}
        {mobileOpen && (
          <div className="md:hidden border-t border-border/50 py-4 space-y-3 animate-slide-up">
            <form onSubmit={handleSearch}>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder={t("nav.searchPlaceholderMobile")}
                  className="w-full h-10 pl-9 pr-4 rounded-lg bg-secondary border border-border text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>
            </form>
            <nav className="flex flex-col gap-1">
              {[
                { href: "/gallery", label: t("nav.gallery") },
                { href: "/search", label: t("nav.browse") },
                { href: "/vip", label: t("nav.vip"), icon: <Crown className="w-4 h-4" /> },
              ].map(({ href, label, icon }) => (
                <Link
                  key={href}
                  href={href}
                  className="flex items-center gap-2 px-3 py-2.5 rounded-lg hover:bg-secondary text-sm text-foreground transition-colors"
                  onClick={() => setMobileOpen(false)}
                >
                  {icon}
                  {label}
                </Link>
              ))}
            </nav>
            {/* Language switcher in mobile menu */}
            <div className="px-3 pt-1 border-t border-border/50">
              <LanguageSwitcher variant="full" className="w-full justify-start" />
            </div>
          </div>
        )}
      </div>
    </header>
  );
}
