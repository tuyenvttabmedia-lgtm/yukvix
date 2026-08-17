import { cn } from "@/lib/utils";
import { AdminLoadingSkeleton } from "../feedback/AdminLoadingSkeleton";

export interface EntityGridProps<T> {
  items: T[];
  renderCard: (item: T) => React.ReactNode;
  isLoading?: boolean;
  skeletonCount?: number;
  columns?: "default" | "dense";
  className?: string;
}

export function EntityGrid<T>({
  items,
  renderCard,
  isLoading,
  skeletonCount = 6,
  columns = "default",
  className,
}: EntityGridProps<T>) {
  if (isLoading) {
    return <AdminLoadingSkeleton variant="grid" rows={skeletonCount} className={className} />;
  }

  return (
    <div className={cn(columns === "dense" ? "admin-grid-dense" : "admin-grid", className)}>
      {items.map((item, i) => (
        <div key={i}>{renderCard(item)}</div>
      ))}
    </div>
  );
}
