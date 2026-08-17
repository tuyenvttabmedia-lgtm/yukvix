#!/usr/bin/env python3
"""Migrate admin pages to Yukvix Design System Phases 2-5."""
from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path("/var/www/cosplay-gallery")
ADMIN = ROOT / "client/src/pages/admin"


def read(rel: str) -> str:
    return (ADMIN / rel).read_text(encoding="utf-8")


def write(rel: str, text: str) -> None:
    p = ADMIN / rel
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(text, encoding="utf-8")
    print(f"  wrote {rel}")


def ensure_import(text: str, imports: str) -> str:
    if "@/admin" in text and "EntityPage" in imports and "EntityPage" in text:
        return text
    if 'from "@/admin"' in text:
        # extend existing import
        m = re.search(r'import \{([^}]+)\} from "@/admin";', text)
        if m:
            existing = {x.strip() for x in m.group(1).split(",") if x.strip()}
            for item in imports.replace("import {", "").replace("} from", "").split(","):
                item = item.strip()
                if item:
                    existing.add(item)
            new_import = "import {\n  " + ",\n  ".join(sorted(existing)) + ',\n} from "@/admin";'
            return re.sub(r'import \{[^}]+\} from "@/admin";', new_import, text, count=1)
    # insert after first import block
    block = imports.strip() + "\n"
    idx = text.find("\n\n")
    if idx == -1:
        return block + text
    return text[: idx + 1] + block + text[idx + 1 :]


def strip_playfair(text: str) -> str:
    text = re.sub(r'\s*style=\{\{ fontFamily: "\'Playfair Display\', serif" \}\}', "", text)
    text = re.sub(r"\s*style=\{\{ fontFamily: 'Playfair Display', serif \}\}", "", text)
    return text


# ─── Phase 2: AdminTags ───────────────────────────────────────────────────────

def migrate_admin_tags() -> None:
    text = strip_playfair(read("AdminTags.tsx"))
    admin_import = """import {
  EntityPage,
  EntityToolbar,
  DataTable,
  AdminStatusBadge,
  adminGlossary,
} from "@/admin";"""
    text = ensure_import(text, admin_import)
    # Remove unused Search if toolbar handles it — keep Search out of lucide if unused
    text = text.replace(
        "import { Tag, Pencil, Trash2, Merge, Plus, Search, Loader2, AlertTriangle, X, Sparkles }",
        "import { Tag, Pencil, Trash2, Merge, Plus, Loader2, AlertTriangle, Sparkles }",
    )

    old_return_start = """  return (
    <AdminLayout>
      <div className="p-6">

        {/* Tag SEO bulk tool (Phase C — manual only) */}
        <div className="mb-6 rounded-lg border border-border bg-card/40 p-4">"""

    banner = """  const tagSeoBanner = (
        <div className="mb-6 rounded-lg border border-border bg-card/40 p-4">"""

    if old_return_start not in text:
        print("  WARN AdminTags: anchor not found, skipping body patch")
        write("AdminTags.tsx", text)
        return

    # Extract banner through closing div before Header comment
    text = text.replace(old_return_start, "  " + banner.strip())

    # Remove old header/search/table/pagination block - replace with EntityPage
    text = re.sub(
        r"        \{/\* Header \*/\}.*?\{!isLoading && data && data\.total > PAGE_SIZE && \(\s*<div className=\"flex items-center justify-between mt-4\">.*?</div>\s*\)\}",
        "",
        text,
        count=1,
        flags=re.DOTALL,
    )

    entity_block = """
      );

  return (
    <AdminLayout>
      <EntityPage
        shell="default"
        header={{
          icon: Tag,
          title: "Quản lý thẻ tag",
          subtitle: isLoading ? adminGlossary.loading.page : `${data?.total ?? 0} thẻ tag`,
          actions: (
            <Button
              onClick={() => { setShowCreate(true); setForm({ name: "", slug: "", seoTitle: "", seoDescription: "" }); }}
              className="bg-primary text-primary-foreground hover:bg-primary/90 gap-2"
            >
              <Plus className="w-4 h-4" /> {adminGlossary.action.createTag}
            </Button>
          ),
        }}
        banner={tagSeoBanner}
        toolbar={
          <EntityToolbar
            search={{
              value: search,
              onChange: setSearch,
              placeholder: "Tìm thẻ tag theo tên hoặc slug...",
            }}
          />
        }
        pagination={
          data && data.total > PAGE_SIZE
            ? {
                page,
                totalPages,
                total: data.total,
                onPageChange: setPage,
                itemLabel: "thẻ tag",
              }
            : undefined
        }
        isEmpty={!isLoading && tags.length === 0}
        emptyState={{
          icon: Tag,
          title: debouncedSearch ? adminGlossary.empty.search : "Chưa có thẻ tag nào",
          action: !debouncedSearch
            ? {
                label: adminGlossary.action.createTag,
                onClick: () => {
                  setShowCreate(true);
                  setForm({ name: "", slug: "", seoTitle: "", seoDescription: "" });
                },
              }
            : undefined,
        }}
      >
        <div className="rounded-xl border border-border/50 overflow-hidden bg-card">
          <DataTable
            columns={[
              {
                id: "name",
                header: "Tên",
                cell: (tag) => (
                  <span className="font-medium text-foreground">
                    <span className="text-primary">#</span>
                    {tag.name}
                  </span>
                ),
              },
              {
                id: "slug",
                header: "Slug",
                hideBelow: "sm",
                cell: (tag) => (
                  <span className="text-muted-foreground font-mono text-xs">{tag.slug}</span>
                ),
              },
              {
                id: "albums",
                header: "Albums",
                cell: (tag) => (
                  <Badge variant="secondary" className="tabular-nums">
                    {tag.albumCount}
                  </Badge>
                ),
              },
              {
                id: "seo",
                header: "SEO",
                hideBelow: "md",
                cell: (tag) =>
                  tag.seoTitle ? (
                    <AdminStatusBadge status="completed" label="SEO" size="sm" />
                  ) : (
                    <span className="text-muted-foreground text-xs">—</span>
                  ),
              },
            ]}
            data={tags}
            rowKey={(tag) => tag.id}
            isLoading={isLoading}
            actionsColumn={(tag) => (
              <div className="flex items-center justify-end gap-1">
                <button
                  onClick={() => openEdit(tag)}
                  className="p-1.5 rounded-lg hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors"
                  title="Chỉnh sửa"
                >
                  <Pencil className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => { setMergeSource(tag); setShowMerge(true); }}
                  className="p-1.5 rounded-lg hover:bg-blue-400/10 text-muted-foreground hover:text-blue-400 transition-colors"
                  title="Gộp thẻ tag"
                >
                  <Merge className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => setDeleteConfirmId(tag.id)}
                  className="p-1.5 rounded-lg hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
                  title="Xóa"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
          />
        </div>
      </EntityPage>
"""

    # Fix banner closing - find where banner ends (before old dialogs)
    text = text.replace(
        "        </div>\n\n        {/* Create Dialog */}",
        entity_block + "\n        {/* Create Dialog */}",
        1,
    )
    text = text.replace("      </div>\n    </AdminLayout>", "    </AdminLayout>", 1)
    write("AdminTags.tsx", text)


# ─── Phase 2: AdminUsers ──────────────────────────────────────────────────────

def migrate_admin_users() -> None:
    text = strip_playfair(read("AdminUsers.tsx"))
    text = ensure_import(
        text,
        'import { EntityPage, EntityToolbar, DataTable, AdminStatusBadge, adminGlossary } from "@/admin";',
    )

    old = """  return (
    <AdminLayout>
      <div className="p-6">
        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <Users className="w-6 h-6 text-primary" />
          <h1 className="text-2xl font-bold text-foreground">
            Quản lý người dùng
          </h1>
          {data && (
            <span className="ml-auto text-sm text-muted-foreground">
              {data.total} users
            </span>
          )}
        </div>

        {/* Filters */}
        <div className="bg-card border border-border/50 rounded-xl p-4 mb-4 space-y-3">"""

    filters_inner = """        <div className="bg-card border border-border/50 rounded-xl p-4 space-y-3">"""

    if old not in text:
        print("  WARN AdminUsers: anchor not found")
        write("AdminUsers.tsx", text)
        return

    text = text.replace(old, """  const filterPanel = (
        <div className="bg-card border border-border/50 rounded-xl p-4 space-y-3">""")

    # Close filterPanel and remove table wrapper opening
    text = text.replace(
        """        </div>

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
        </div>""",
        """        </div>
  );

  const ROLE_TABS_VI: { value: RoleFilter; label: string }[] = [
    { value: "all", label: "Tất cả" },
    { value: "admin", label: "Admin" },
    { value: "vip", label: "VIP" },
    { value: "user", label: "Người dùng" },
  ];

  const VERIFIED_TABS_VI: { value: VerifiedFilter; label: string }[] = [
    { value: "all", label: "Tất cả" },
    { value: "verified", label: "Đã xác thực" },
    { value: "unverified", label: "Chưa xác thực" },
  ];

  return (
    <AdminLayout>
      <EntityPage
        shell="default"
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
            filters={filterPanel}
          />
        }
        pagination={
          data && data.total > 20
            ? { page, totalPages, total: data.total, onPageChange: setPage, itemLabel: "người dùng" }
            : undefined
        }
        isEmpty={!isLoading && (data?.items.length ?? 0) === 0}
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
                    status={u.role === "vip" ? "vip" : u.role === "admin" ? "active" : "pending"}
                    label={u.role}
                    size="sm"
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
            data={data?.items ?? []}
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
      </EntityPage>""",
    )

    # Fix ROLE_TABS to use VI labels in filter panel
    text = text.replace("ROLE_TABS.map", "ROLE_TABS_VI.map")
    text = text.replace("VERIFIED_TABS.map", "VERIFIED_TABS_VI.map")
    text = text.replace('label: "Role:"', 'label: "Vai trò:"')
    text = text.replace("      </div>\n    </AdminLayout>", "    </AdminLayout>", 1)
    write("AdminUsers.tsx", text)


# ─── Phase 3: AdminOverview ───────────────────────────────────────────────────

def migrate_admin_overview() -> None:
    text = strip_playfair(read("AdminOverview.tsx"))
    text = ensure_import(text, 'import { DashboardPage, MetricCard, AdminLoadingSkeleton } from "@/admin";')

    text = re.sub(
        r"  const statCards = analytics\s*\?\s*\[\s*\{[^]]+\}\s*\]\s*:\s*\[\];",
        "",
        text,
        count=1,
        flags=re.DOTALL,
    )

    old_return = """  return (
    <AdminLayout>
      <div className="p-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold text-foreground">
            Tổng quan
          </h1>
        </div>

        {/* Quick Actions */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">"""

    new_return = """  const metrics = analytics
    ? [
        { label: "Tổng album", value: analytics.totalAlbums.toLocaleString(), icon: ImageIcon, href: "/admin/albums" },
        { label: "Tổng ảnh", value: analytics.totalPhotos.toLocaleString(), icon: BarChart3, href: "/admin/media" },
        { label: "Tổng người dùng", value: analytics.totalUsers.toLocaleString(), icon: Users, href: "/admin/users" },
        { label: "Thành viên VIP", value: analytics.vipUsers.toLocaleString(), icon: Crown, href: "/admin/payments/vip", variant: "success" as const },
        { label: "Tổng lượt xem", value: analytics.totalViews.toLocaleString(), icon: Eye, href: "/admin/analytics" },
        { label: "Đăng ký hoạt động", value: analytics.activeSubscriptions.toLocaleString(), icon: TrendingUp, href: "/admin/subscriptions", variant: "success" as const },
      ]
    : [];

  return (
    <AdminLayout>
      <DashboardPage
        header={{ icon: BarChart3, title: "Tổng quan", subtitle: "Thống kê hệ thống Yukvix" }}
        metrics={isLoading ? [] : metrics}
      >
        {isLoading && <AdminLoadingSkeleton variant="metric" rows={6} />}

        {/* Quick Actions */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">"""

    if old_return in text:
        text = text.replace(old_return, new_return)
        # Remove old stat cards section
        text = re.sub(
            r"\{/\* Stat Cards \*/\}.*?\) : \(\s*<div className=\"grid grid-cols-2 md:grid-cols-3 gap-4 mb-6\">.*?</div>\s*\)\}",
            "",
            text,
            count=1,
            flags=re.DOTALL,
        )
        text = text.replace("      </div>\n    </AdminLayout>", "      </DashboardPage>\n    </AdminLayout>")
    write("AdminOverview.tsx", text)


# ─── Phase 3: AdminZipImport shell wrap ───────────────────────────────────────

def migrate_admin_zip_import() -> None:
    text = read("AdminZipImport.tsx")
    text = ensure_import(text, 'import { AdminPageShell, AdminPageHeader } from "@/admin";')
    text = text.replace(
        """  return (
    <AdminLayout>
      <div className="p-6 max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-foreground">ZIP Import</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Import album từ file ZIP/RAR — tách biệt hoàn toàn với Media Library và crawler cũ.
        </p>
      </div>

      {/* Tabs */}""",
        """  return (
    <AdminLayout>
      <AdminPageShell mode="full">
        <AdminPageHeader
          icon={FileArchive}
          title="ZIP Import"
          subtitle="Import album từ file ZIP/RAR — tách biệt hoàn toàn với Media Library và crawler cũ."
        />

      {/* Tabs */}""",
    )
    text = text.replace("      </div>\n    </AdminLayout>", "      </AdminPageShell>\n    </AdminLayout>")
    write("AdminZipImport.tsx", text)


# ─── Phase 4: AdminSmtp ───────────────────────────────────────────────────────

def migrate_admin_smtp() -> None:
    text = read("AdminSmtp.tsx")
    text = ensure_import(text, 'import { SettingsPage } from "@/admin";')
    text = text.replace("Card, CardContent, CardDescription, CardHeader, CardTitle", "CardContent")

    old_loading = """  if (isLoading) {
    return (
      <AdminLayout>
        <div className="p-6 flex items-center justify-center min-h-[400px]">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      </AdminLayout>
    );
  }"""

    new_loading = """  if (isLoading) {
    return (
      <AdminLayout>
        <SettingsPage header={{ icon: Mail, title: "Cấu hình SMTP", subtitle: "Đang tải..." }} sections={[]} />
      </AdminLayout>
    );
  }"""

    text = text.replace(old_loading, new_loading)

    old_return = """  return (
    <AdminLayout>
    <div className="p-6 max-w-2xl">
      <div className="flex items-center gap-3 mb-6">
        <Mail className="w-6 h-6 text-primary" />
        <div>
          <h1 className="text-xl font-bold text-foreground">Email (SMTP) Settings</h1>
          <p className="text-sm text-muted-foreground">
            Configure SMTP for sending verification emails, password resets, and notifications.
          </p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">SMTP Configuration</CardTitle>
          <CardDescription>
            For Gmail: use smtp.gmail.com, port 587, and an App Password (not your regular password).
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">"""

    smtp_form = """  return (
    <AdminLayout>
      <SettingsPage
        header={{
          icon: Mail,
          title: "Cấu hình SMTP",
          subtitle: "Gửi email xác thực, đặt lại mật khẩu và thông báo",
        }}
        onSave={handleSave}
        isSaving={saveMutation.isPending}
        sections={[
          {
            id: "smtp",
            title: "Cấu hình SMTP",
            description: "Gmail: smtp.gmail.com, cổng 587, dùng App Password (không phải mật khẩu thường).",
            content: (
              <div className="space-y-4">"""

    if old_return in text:
        text = text.replace(old_return, smtp_form)
        # Close sections and SettingsPage
        text = text.replace(
            """        </CardContent>
      </Card>

      {/* Help section */}
      <Card className="mt-4">
        <CardHeader>
          <CardTitle className="text-base">Gmail Setup Guide</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground space-y-2">""",
            """              </div>
            ),
          },
          {
            id: "help",
            title: "Hướng dẫn Gmail",
            content: (
              <div className="text-sm text-muted-foreground space-y-2">""",
        )
        text = text.replace(
            """        </CardContent>
      </Card>
    </div>
    </AdminLayout>""",
            """              </div>
            ),
          },
        ]}
      />
    </AdminLayout>""",
        )
        text = text.replace("Save Settings", "Lưu cấu hình")
        text = text.replace("Enable email sending", "Bật gửi email")
    write("AdminSmtp.tsx", text)


# ─── Phase 5: generic shell wrap ──────────────────────────────────────────────

PHASE5_PAGES: list[tuple[str, str, str, str]] = [
    ("AdminSubscriptions.tsx", "wide", "Crown", "Quản lý đăng ký"),
    ("AdminContactSubmissions.tsx", "default", "Mail", "Liên hệ"),
    ("AdminDmcaSubmissions.tsx", "default", "Shield", "DMCA"),
    ("AdminEmailLogs.tsx", "default", "Mail", "Nhật ký email"),
    ("AdminImportHistory.tsx", "default", "History", "Lịch sử import"),
    ("AdminImportSources.tsx", "narrow", "Link", "Nguồn import"),
    ("AdminImport.tsx", "full", "Upload", "Import crawler"),
    ("AdminSeoBulk.tsx", "full", "Sparkles", "SEO hàng loạt"),
    ("AdminMediaLibrary.tsx", "wide", "ImageIcon", "Thư viện media"),
    ("AdminUserDetail.tsx", "narrow", "User", "Chi tiết người dùng"),
    ("AdminAlbumEditor.tsx", "full", "ImageIcon", "Chỉnh sửa album"),
    ("AdminAlbumSeoReview.tsx", "full", "Search", "SEO album"),
    ("AdminImportLogs.tsx", "default", "FileText", "Nhật ký import"),
    ("cms/AdminAppearance.tsx", "narrow", "Palette", "Giao diện"),
    ("cms/AdminMenus.tsx", "narrow", "Menu", "Menu"),
    ("cms/AdminPages.tsx", "full", "FileText", "Trang CMS"),
    ("payments/AdminPlans.tsx", "default", "CreditCard", "Gói dịch vụ"),
    ("payments/AdminVipManagement.tsx", "default", "Crown", "Quản lý VIP"),
    ("payments/AdminPaymentHistory.tsx", "wide", "Receipt", "Lịch sử thanh toán"),
    ("payments/AdminWebhookMonitor.tsx", "wide", "Webhook", "Webhook"),
]


def wrap_page_shell(rel: str, mode: str, icon: str, title: str) -> None:
    path = ADMIN / rel
    if not path.exists():
        print(f"  skip {rel} (missing)")
        return
    text = strip_playfair(path.read_text(encoding="utf-8"))
    if "AdminPageShell" in text and f'mode="{mode}"' in text:
        print(f"  skip {rel} (already wrapped)")
        return
    text = ensure_import(text, 'import { AdminPageShell, AdminPageHeader } from "@/admin";')

    # Replace common root wrappers
    patterns = [
        (r'<AdminLayout>\s*<div className="p-6(?: max-w-[^"]*)?(?: mx-auto)?(?: w-full)?(?: space-y-\d+)?">', ""),
        (r'<AdminLayout>\s*<div className="p-6">', ""),
    ]
    for pat, _ in patterns:
        m = re.search(pat, text)
        if m:
            insert = f'<AdminLayout>\n      <AdminPageShell mode="{mode}">\n        <AdminPageHeader icon={{{icon}}} title="{title}" />\n'
            text = text[: m.start()] + insert + text[m.end() :]
            break
    else:
        if "<AdminLayout>" in text and "AdminPageShell" not in text:
            text = text.replace(
                "<AdminLayout>",
                f'<AdminLayout>\n      <AdminPageShell mode="{mode}">\n        <AdminPageHeader icon={{{icon}}} title="{title}" />',
                1,
            )

    # Close shell before AdminLayout end
    text = re.sub(
        r"</AdminLayout>\s*\);\s*\}",
        "      </AdminPageShell>\n    </AdminLayout>\n  );\n}",
        text,
        count=1,
    )
    if "</AdminPageShell>" not in text:
        text = text.replace("    </AdminLayout>", "      </AdminPageShell>\n    </AdminLayout>", 1)

    write(rel, text)


def migrate_admin_analytics() -> None:
    text = strip_playfair(read("AdminAnalytics.tsx"))
    text = ensure_import(text, 'import { DashboardPage, AdminLoadingSkeleton } from "@/admin";')
    text = re.sub(
        r"<AdminLayout>\s*<div className=\"p-6[^\"]*\">",
        '<AdminLayout>\n      <DashboardPage\n        header={{ icon: BarChart3, title: "Phân tích", subtitle: "Thống kê lượt xem và tương tác" }}\n        metrics={[]}\n      >',
        text,
        count=1,
    )
    text = text.replace("      </div>\n    </AdminLayout>", "      </DashboardPage>\n    </AdminLayout>", 1)
    write("AdminAnalytics.tsx", text)


def run_phase(phase: int) -> None:
    print(f"\n=== Phase {phase} ===")
    if phase == 2:
        migrate_admin_tags()
        migrate_admin_users()
        # Creators, Albums, Categories - shell wrap + key imports for now
        for rel, mode, icon, title in [
            ("AdminCreators.tsx", "default", "Users", "Quản lý cosplayer"),
            ("AdminAlbums.tsx", "wide", "ImageIcon", "Quản lý album"),
            ("cms/AdminCategories.tsx", "default", "FolderOpen", "Danh mục"),
        ]:
            wrap_page_shell(rel, mode, icon, title)
            t = strip_playfair(read(rel))
            t = ensure_import(
                t,
                'import { EntityPage, EntityToolbar, DataTable, EntityGrid, AdminPagination, adminGlossary } from "@/admin";',
            )
            write(rel, t)
    elif phase == 3:
        migrate_admin_overview()
        migrate_admin_analytics()
        migrate_admin_zip_import()
    elif phase == 4:
        migrate_admin_smtp()
        for rel, mode, icon, title in [
            ("AdminAiSettings.tsx", "narrow", "Sparkles", "Cấu hình AI"),
            ("AdminStorageSettings.tsx", "narrow", "HardDrive", "Lưu trữ"),
            ("AdminSeoSettings.tsx", "narrow", "Search", "Cấu hình SEO"),
            ("payments/AdminPaymentSettings.tsx", "narrow", "CreditCard", "Thanh toán"),
        ]:
            wrap_page_shell(rel, mode, icon, title)
            t = ensure_import(strip_playfair(read(rel)), 'import { SettingsPage } from "@/admin";')
            write(rel, t)
    elif phase == 5:
        for rel, mode, icon, title in PHASE5_PAGES:
            wrap_page_shell(rel, mode, icon, title)


def main() -> None:
    phases = [int(x) for x in sys.argv[1:]] if len(sys.argv) > 1 else [2, 3, 4, 5]
    for p in phases:
        run_phase(p)
    print("\nDone.")


if __name__ == "__main__":
    main()
