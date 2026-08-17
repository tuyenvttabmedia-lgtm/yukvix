import { Button } from "@/components/ui/button";
import { adminGlossary } from "@/admin/glossary";

export interface AdminPaginationProps {
  page: number;
  totalPages: number;
  total: number;
  onPageChange: (page: number) => void;
  itemLabel?: string;
}

export function AdminPagination({
  page,
  totalPages,
  total,
  onPageChange,
  itemLabel = "mục",
}: AdminPaginationProps) {
  if (totalPages <= 1 && total <= 0) return null;

  return (
    <div className="flex items-center justify-between mt-6 pt-4 border-t border-border">
      <span className="text-sm text-muted-foreground">
        {adminGlossary.pagination.summary(page, totalPages, total, itemLabel)}
      </span>
      <div className="flex gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => onPageChange(Math.max(1, page - 1))}
          disabled={page === 1}
        >
          {adminGlossary.pagination.prev}
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => onPageChange(Math.min(totalPages, page + 1))}
          disabled={page >= totalPages}
        >
          {adminGlossary.pagination.next}
        </Button>
      </div>
    </div>
  );
}
