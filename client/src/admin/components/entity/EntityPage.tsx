import { AdminPageShell, type AdminShellMode } from "../shell/AdminPageShell";
import { AdminPageHeader, type AdminPageHeaderProps } from "../shell/AdminPageHeader";
import { AdminEmptyState, type AdminEmptyStateProps } from "../feedback/AdminEmptyState";
import { AdminPagination, type AdminPaginationProps } from "./AdminPagination";

export interface EntityPageProps {
  shell?: AdminShellMode;
  header: AdminPageHeaderProps;
  banner?: React.ReactNode;
  toolbar?: React.ReactNode;
  pagination?: AdminPaginationProps;
  isEmpty?: boolean;
  emptyState?: AdminEmptyStateProps;
  children: React.ReactNode;
}

export function EntityPage({
  shell = "full",
  header,
  banner,
  toolbar,
  pagination,
  isEmpty,
  emptyState,
  children,
}: EntityPageProps) {
  return (
    <AdminPageShell mode={shell}>
      <AdminPageHeader {...header} />
      {banner}
      {toolbar}
      {isEmpty && emptyState ? <AdminEmptyState {...emptyState} /> : children}
      {pagination && !isEmpty && <AdminPagination {...pagination} />}
    </AdminPageShell>
  );
}
