import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { RefreshCw, Search } from "lucide-react";
import type { LucideIcon } from "lucide-react";

export interface EntityToolbarProps {
  search?: {
    value: string;
    onChange: (value: string) => void;
    placeholder?: string;
  };
  filters?: React.ReactNode;
  sort?: React.ReactNode;
  bulkActions?: React.ReactNode;
  onRefresh?: () => void;
  primaryAction?: {
    label: string;
    onClick: () => void;
    icon?: LucideIcon;
  };
}

export function EntityToolbar({
  search,
  filters,
  sort,
  bulkActions,
  onRefresh,
  primaryAction,
}: EntityToolbarProps) {
  return (
    <div className="flex flex-col gap-3 mb-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex flex-1 flex-col gap-2 sm:flex-row sm:items-center">
        {search && (
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search.value}
              onChange={(e) => search.onChange(e.target.value)}
              placeholder={search.placeholder ?? "Tìm kiếm..."}
              className="pl-9 h-9"
            />
          </div>
        )}
        {filters}
        {sort}
        {onRefresh && (
          <Button variant="outline" size="sm" className="h-9 gap-1.5" onClick={onRefresh}>
            <RefreshCw className="h-3.5 w-3.5" />
            Làm mới
          </Button>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {bulkActions}
        {primaryAction && (
          <Button size="sm" className="gap-1.5" onClick={primaryAction.onClick}>
            {primaryAction.icon && <primaryAction.icon className="h-4 w-4" />}
            {primaryAction.label}
          </Button>
        )}
      </div>
    </div>
  );
}
