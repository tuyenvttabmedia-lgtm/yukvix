import AdminLayout from "./AdminLayout";
import { Button } from "@/components/ui/button";
import {
  AdminPageShell,
  AdminPageHeader,
  EntityPage,
  EntityToolbar,
  DataTable,
  EntityGrid,
  AdminPagination,
  AdminStatusBadge,
  AdminEmptyState,
  AdminLoadingSkeleton,
  MetricCard,
  DashboardPage,
  SettingsPage,
  OperationsPage,
} from "@/admin";
import { BarChart3, Tag, Users } from "lucide-react";

/** Dev-only preview of Admin Design System V1 components */
export default function AdminDesignPreview() {
  return (
    <AdminLayout>
      <AdminPageShell mode="wide">
        <AdminPageHeader
          icon={BarChart3}
          title="Admin Design System — Preview"
          subtitle="Route nội bộ kiểm tra component V1"
          actions={<Button size="sm" variant="outline">Hành động mẫu</Button>}
        />

        <div className="space-y-12">
          <section>
            <h2 className="admin-section-title mb-4">Shell modes</h2>
            <div className="grid gap-4 lg:grid-cols-2">
              {(["wide", "default", "narrow", "full"] as const).map((mode) => (
                <AdminPageShell key={mode} mode={mode} className="admin-card !p-4 !max-w-none">
                  <p className="text-sm font-medium">mode=&quot;{mode}&quot;</p>
                  <p className="admin-caption">Nội dung trong shell {mode}</p>
                </AdminPageShell>
              ))}
            </div>
          </section>

          <section>
            <h2 className="admin-section-title mb-4">Status badges</h2>
            <div className="flex flex-wrap gap-2">
              <AdminStatusBadge status="completed" />
              <AdminStatusBadge status="waiting" />
              <AdminStatusBadge status="processing" />
              <AdminStatusBadge status="failed" />
              <AdminStatusBadge status="draft" />
              <AdminStatusBadge status="published" />
            </div>
          </section>

          <section>
            <h2 className="admin-section-title mb-4">Metric cards</h2>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <MetricCard label="Album" value={156} icon={BarChart3} />
              <MetricCard label="Người dùng" value="1.2k" icon={Users} variant="success" />
            </div>
          </section>

          <section>
            <h2 className="admin-section-title mb-4">EntityPage (table)</h2>
            <EntityPage
              shell="default"
              header={{ icon: Tag, title: "Mẫu EntityPage", subtitle: "Table + toolbar" }}
              toolbar={
                <EntityToolbar
                  search={{ value: "", onChange: () => {}, placeholder: "Tìm..." }}
                  primaryAction={{ label: "Tạo mới", onClick: () => {} }}
                />
              }
              pagination={{ page: 1, totalPages: 3, total: 60, onPageChange: () => {}, itemLabel: "mục" }}
            >
              <DataTable
                columns={[
                  { id: "name", header: "Tên", cell: () => "Ví dụ" },
                  { id: "count", header: "Số lượng", cell: () => "12" },
                ]}
                data={[{ id: 1 }, { id: 2 }]}
                rowKey={(r) => r.id}
              />
            </EntityPage>
          </section>

          <section>
            <h2 className="admin-section-title mb-4">Loading skeletons</h2>
            <AdminLoadingSkeleton variant="table" rows={3} />
          </section>
        </div>
      </AdminPageShell>
    </AdminLayout>
  );
}
