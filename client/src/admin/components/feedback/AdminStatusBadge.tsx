import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export type AdminStatus =
  | "draft"
  | "published"
  | "processing"
  | "waiting"
  | "scheduled"
  | "running"
  | "completed"
  | "failed"
  | "cancelled"
  | "expired"
  | "skipped"
  | "pending"
  | "active"
  | "vip"
  | "ready_for_review"
  | "uploaded";

type Semantic = "success" | "warning" | "info" | "danger" | "neutral" | "vip";

const STATUS_SEMANTIC: Record<AdminStatus, Semantic> = {
  draft: "neutral",
  published: "success",
  processing: "info",
  waiting: "warning",
  scheduled: "info",
  running: "info",
  completed: "success",
  failed: "danger",
  cancelled: "danger",
  expired: "neutral",
  skipped: "neutral",
  pending: "warning",
  active: "success",
  vip: "vip",
  ready_for_review: "warning",
  uploaded: "warning",
};

const STATUS_LABEL: Record<AdminStatus, string> = {
  draft: "Nháp",
  published: "Đã xuất bản",
  processing: "Đang xử lý",
  waiting: "Đang chờ",
  scheduled: "Đã lên lịch",
  running: "Đang chạy",
  completed: "Hoàn thành",
  failed: "Thất bại",
  cancelled: "Đã hủy",
  expired: "Hết hạn",
  skipped: "Bỏ qua",
  pending: "Chờ xử lý",
  active: "Hoạt động",
  vip: "VIP",
  ready_for_review: "Chờ duyệt",
  uploaded: "Đã tải lên",
};

const SEMANTIC_CLASS: Record<Semantic, string> = {
  success: "bg-emerald-500/10 text-emerald-400 border-emerald-500/30",
  warning: "bg-amber-500/10 text-amber-400 border-amber-500/30",
  info: "bg-blue-500/10 text-blue-400 border-blue-500/30",
  danger: "bg-red-500/10 text-red-400 border-red-500/30",
  neutral: "bg-muted text-muted-foreground border-border",
  vip: "bg-primary/10 text-primary border-primary/30",
};

export interface AdminStatusBadgeProps {
  status: AdminStatus;
  label?: string;
  size?: "sm" | "md";
  className?: string;
}

export function AdminStatusBadge({ status, label, size = "sm", className }: AdminStatusBadgeProps) {
  const semantic = STATUS_SEMANTIC[status];
  return (
    <Badge
      variant="outline"
      className={cn(
        SEMANTIC_CLASS[semantic],
        size === "sm" && "text-xs px-2 py-0.5",
        className
      )}
    >
      {label ?? STATUS_LABEL[status]}
    </Badge>
  );
}
