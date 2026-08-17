import { cn } from "@/lib/utils";
import { AdminPageShell, type AdminShellMode } from "../shell/AdminPageShell";
import { AdminPageHeader, type AdminPageHeaderProps } from "../shell/AdminPageHeader";

export interface OperationsPageProps {
  shell?: AdminShellMode;
  header: AdminPageHeaderProps;
  healthStrip?: React.ReactNode;
  primary: React.ReactNode;
  secondary?: React.ReactNode;
  footer?: React.ReactNode;
}

export function OperationsPage({
  shell = "full",
  header,
  healthStrip,
  primary,
  secondary,
  footer,
}: OperationsPageProps) {
  return (
    <AdminPageShell mode={shell}>
      <AdminPageHeader {...header} />
      {healthStrip && <div className="mb-6 grid grid-cols-2 lg:grid-cols-4 gap-4">{healthStrip}</div>}
      <div className={cn("grid gap-6", secondary ? "lg:grid-cols-3" : "grid-cols-1")}>
        <div className={secondary ? "lg:col-span-2 space-y-6" : "space-y-6"}>{primary}</div>
        {secondary && <div className="space-y-6">{secondary}</div>}
      </div>
      {footer && <div className="mt-6">{footer}</div>}
    </AdminPageShell>
  );
}
