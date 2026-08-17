import { cn } from "@/lib/utils";

export interface AdminLoadingSkeletonProps {
  variant: "table" | "grid" | "form" | "metric" | "page";
  rows?: number;
  cols?: number;
  className?: string;
}

export function AdminLoadingSkeleton({
  variant,
  rows = 6,
  cols = 3,
  className,
}: AdminLoadingSkeletonProps) {
  if (variant === "metric") {
    return (
      <div className={cn("grid grid-cols-2 lg:grid-cols-4 gap-4", className)}>
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-24 rounded-xl bg-muted animate-pulse" />
        ))}
      </div>
    );
  }

  if (variant === "grid") {
    return (
      <div className={cn("admin-grid", className)}>
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="h-24 rounded-lg bg-muted animate-pulse" />
        ))}
      </div>
    );
  }

  if (variant === "form") {
    return (
      <div className={cn("space-y-4", className)}>
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="h-10 rounded-md bg-muted animate-pulse" />
        ))}
      </div>
    );
  }

  if (variant === "page") {
    return (
      <div className={cn("space-y-6", className)}>
        <div className="h-10 w-64 rounded bg-muted animate-pulse" />
        <div className="h-10 rounded bg-muted animate-pulse" />
        <div className="h-48 rounded-xl bg-muted animate-pulse" />
      </div>
    );
  }

  return (
    <div className={cn("admin-table-wrap p-4 space-y-2", className)}>
      {Array.from({ length: rows }).map((_, i) => (
        <div
          key={i}
          className="h-10 rounded bg-muted animate-pulse"
          style={{ opacity: 1 - i * 0.08 }}
        />
      ))}
    </div>
  );
}
