import { cn } from "@/lib/utils";
import { AdminLoadingSkeleton } from "../feedback/AdminLoadingSkeleton";

export interface DataTableColumn<T> {
  id: string;
  header: string;
  cell: (row: T) => React.ReactNode;
  className?: string;
  hideBelow?: "sm" | "md" | "lg";
}

const HIDE_CLASS = {
  sm: "hidden sm:table-cell",
  md: "hidden md:table-cell",
  lg: "hidden lg:table-cell",
} as const;

export interface DataTableProps<T> {
  columns: DataTableColumn<T>[];
  data: T[];
  rowKey: (row: T) => string | number;
  isLoading?: boolean;
  skeletonRows?: number;
  stickyHeader?: boolean;
  onRowClick?: (row: T) => void;
  actionsColumn?: (row: T) => React.ReactNode;
  actionsHeader?: string;
}

export function DataTable<T>({
  columns,
  data,
  rowKey,
  isLoading,
  skeletonRows = 8,
  stickyHeader = true,
  onRowClick,
  actionsColumn,
  actionsHeader = "Hành động",
}: DataTableProps<T>) {
  if (isLoading) {
    return <AdminLoadingSkeleton variant="table" rows={skeletonRows} />;
  }

  return (
    <div className={cn("admin-table-wrap overflow-x-auto", stickyHeader && "max-h-[70vh]")}>
      <table className="admin-table">
        <thead className={cn("admin-thead", stickyHeader && "sticky top-0 z-10")}>
          <tr>
            {columns.map((col) => (
              <th
                key={col.id}
                className={cn("admin-th", col.hideBelow && HIDE_CLASS[col.hideBelow], col.className)}
              >
                {col.header}
              </th>
            ))}
            {actionsColumn && (
              <th className="admin-th text-right">{actionsHeader}</th>
            )}
          </tr>
        </thead>
        <tbody>
          {data.map((row) => (
            <tr
              key={rowKey(row)}
              className={cn(
                "border-b border-border/30 admin-tr-hover",
                onRowClick && "cursor-pointer"
              )}
              onClick={onRowClick ? () => onRowClick(row) : undefined}
            >
              {columns.map((col) => (
                <td
                  key={col.id}
                  className={cn("admin-td", col.hideBelow && HIDE_CLASS[col.hideBelow], col.className)}
                >
                  {col.cell(row)}
                </td>
              ))}
              {actionsColumn && (
                <td className="admin-td text-right" onClick={(e) => e.stopPropagation()}>
                  {actionsColumn(row)}
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
