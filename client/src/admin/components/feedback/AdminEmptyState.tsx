import { Button } from "@/components/ui/button";
import type { LucideIcon } from "lucide-react";

export interface AdminEmptyStateProps {
  icon: LucideIcon;
  title: string;
  description?: string;
  action?: { label: string; onClick: () => void };
}

export function AdminEmptyState({ icon: Icon, title, description, action }: AdminEmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      <Icon className="w-8 h-8 text-muted-foreground/30 mb-3" />
      <p className="text-sm font-medium text-foreground">{title}</p>
      {description && <p className="admin-caption mt-1 max-w-sm">{description}</p>}
      {action && (
        <Button size="sm" className="mt-4" onClick={action.onClick}>
          {action.label}
        </Button>
      )}
    </div>
  );
}
