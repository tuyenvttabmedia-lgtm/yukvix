import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";
import { AdminPageShell } from "../shell/AdminPageShell";
import { AdminPageHeader, type AdminPageHeaderProps } from "../shell/AdminPageHeader";

export interface MetricCardProps {
  label: string;
  value: string | number;
  icon?: LucideIcon;
  href?: string;
  variant?: "default" | "success" | "warning" | "danger";
}

const VARIANT_BORDER = {
  default: "border-border/50",
  success: "border-emerald-500/30",
  warning: "border-amber-500/30",
  danger: "border-red-500/30",
};

export function MetricCard({ label, value, icon: Icon, href, variant = "default" }: MetricCardProps) {
  const inner = (
    <div
      className={cn(
        "admin-card p-4 transition-colors hover:bg-card/80",
        VARIANT_BORDER[variant],
        href && "cursor-pointer"
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="admin-caption">{label}</p>
          <p className="text-2xl font-semibold tabular-nums mt-1">{value}</p>
        </div>
        {Icon && <Icon className="w-5 h-5 text-primary shrink-0" />}
      </div>
    </div>
  );

  if (href) {
    return (
      <a href={href} className="block">
        {inner}
      </a>
    );
  }
  return inner;
}

export interface DashboardPageProps {
  header: AdminPageHeaderProps;
  metrics: MetricCardProps[];
  children?: React.ReactNode;
}

export function DashboardPage({ header, metrics, children }: DashboardPageProps) {
  return (
    <AdminPageShell mode="full">
      <AdminPageHeader {...header} />
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {metrics.map((m) => (
          <MetricCard key={m.label} {...m} />
        ))}
      </div>
      {children}
    </AdminPageShell>
  );
}
