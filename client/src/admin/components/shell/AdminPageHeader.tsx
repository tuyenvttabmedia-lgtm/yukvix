import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";

export interface AdminPageHeaderMetric {
  label: string;
  value: string | number;
}

export interface AdminPageHeaderProps {
  icon?: LucideIcon;
  title: string;
  subtitle?: string;
  metrics?: AdminPageHeaderMetric[];
  actions?: React.ReactNode;
  breadcrumbs?: Array<{ label: string; href?: string }>;
  className?: string;
}

export function AdminPageHeader({
  icon: Icon,
  title,
  subtitle,
  metrics,
  actions,
  breadcrumbs,
  className,
}: AdminPageHeaderProps) {
  return (
    <header className={cn("mb-6", className)}>
      {breadcrumbs && breadcrumbs.length > 0 && (
        <nav className="admin-caption mb-2 flex flex-wrap items-center gap-1">
          {breadcrumbs.map((crumb, i) => (
            <span key={`${crumb.label}-${i}`} className="flex items-center gap-1">
              {i > 0 && <span className="text-muted-foreground/50">/</span>}
              {crumb.href ? (
                <a href={crumb.href} className="hover:text-foreground transition-colors">
                  {crumb.label}
                </a>
              ) : (
                <span>{crumb.label}</span>
              )}
            </span>
          ))}
        </nav>
      )}

      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 space-y-1">
          <h1 className="admin-page-title flex items-center gap-2">
            {Icon && <Icon className="w-6 h-6 shrink-0 text-primary" />}
            <span className="truncate">{title}</span>
          </h1>
          {subtitle && <p className="admin-caption">{subtitle}</p>}
          {metrics && metrics.length > 0 && (
            <div className="flex flex-wrap gap-x-4 gap-y-1 pt-1">
              {metrics.map((m) => (
                <span key={m.label} className="admin-caption">
                  <span className="text-foreground font-medium tabular-nums">{m.value}</span>{" "}
                  {m.label}
                </span>
              ))}
            </div>
          )}
        </div>
        {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
      </div>
    </header>
  );
}
