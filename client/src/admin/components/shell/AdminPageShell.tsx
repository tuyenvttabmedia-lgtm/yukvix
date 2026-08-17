import { cn } from "@/lib/utils";

export type AdminShellMode = "wide" | "default" | "narrow" | "full";

const SHELL_CLASS: Record<AdminShellMode, string> = {
  wide: "admin-page-shell-wide",
  default: "admin-page-shell-default",
  narrow: "admin-page-shell-narrow",
  full: "admin-page-shell-full",
};

export interface AdminPageShellProps {
  mode: AdminShellMode;
  children: React.ReactNode;
  className?: string;
}

export function AdminPageShell({ mode, children, className }: AdminPageShellProps) {
  return <div className={cn(SHELL_CLASS[mode], className)}>{children}</div>;
}
