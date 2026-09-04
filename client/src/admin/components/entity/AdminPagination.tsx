import { Button } from "@/components/ui/button";
import { adminGlossary } from "@/admin/glossary";

export const ADMIN_PAGE_SIZES = [10, 20, 50, 100] as const;
export type AdminPageSize = (typeof ADMIN_PAGE_SIZES)[number];

export interface AdminPaginationProps {
  page: number;
  totalPages: number;
  total: number;
  pageSize?: number;
  pageSizeOptions?: readonly number[];
  onPageChange: (page: number) => void;
  onPageSizeChange?: (size: number) => void;
  itemLabel?: string;
}

export function AdminPagination({
  page,
  totalPages,
  total,
  pageSize,
  pageSizeOptions = ADMIN_PAGE_SIZES,
  onPageChange,
  onPageSizeChange,
  itemLabel = "mục",
}: AdminPaginationProps) {
  if (total <= 0) return null;

  const size = pageSize || Math.max(1, Math.ceil(total / Math.max(1, totalPages)));
  const from = total === 0 ? 0 : (page - 1) * size + 1;
  const to = Math.min(page * size, total);

  return (
    <div className="flex flex-col gap-3 mt-6 pt-4 border-t border-border sm:flex-row sm:items-center sm:justify-between">
      <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
        <span>
          {adminGlossary.pagination.range(from, to, total, itemLabel)}
        </span>
        {onPageSizeChange && (
          <label className="inline-flex items-center gap-2">
            <span>{adminGlossary.pagination.pageSize}</span>
            <select
              value={size}
              onChange={(e) => onPageSizeChange(Number(e.target.value))}
              className="h-8 rounded-lg border border-border bg-background px-2 text-xs text-foreground"
            >
              {pageSizeOptions.map((opt) => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => onPageChange(Math.max(1, page - 1))}
          disabled={page <= 1}
        >
          {adminGlossary.pagination.prev}
        </Button>
        <span className="min-w-[4.5rem] text-center text-xs text-muted-foreground tabular-nums">
          {page}/{Math.max(1, totalPages)}
        </span>
        <Button
          variant="outline"
          size="sm"
          onClick={() => onPageChange(Math.min(Math.max(1, totalPages), page + 1))}
          disabled={page >= totalPages}
        >
          {adminGlossary.pagination.next}
        </Button>
      </div>
    </div>
  );
}
