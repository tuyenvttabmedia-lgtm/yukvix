/**
 * Admin page: Yêu cầu DMCA — list, view, and update status.
 */
import { useState } from "react";
import AdminLayout from "./AdminLayout";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ShieldAlert, Eye, Clock, CheckCircle2, XCircle, AlertCircle, ExternalLink } from "lucide-react";

type DmcaStatus = "pending" | "reviewing" | "resolved" | "rejected";

type DmcaSubmission = {
  id: number;
  name: string;
  email: string;
  reporterUrl?: string | null;
  infringingUrl: string;
  originalWorkUrl?: string | null;
  description: string;
  declaration?: boolean;
  status: DmcaStatus;
  createdAt: Date;
};

const statusConfig: Record<string, { label: string; color: string; icon: React.ElementType }> = {
  pending:    { label: "Chờ xử lý",    color: "bg-yellow-400/10 text-yellow-400 border-yellow-400/20", icon: AlertCircle },
  reviewing:  { label: "Đang xem xét",  color: "bg-blue-400/10 text-blue-400 border-blue-400/20",       icon: Eye },
  actioned:   { label: "Đã xử lý",   color: "bg-green-400/10 text-green-400 border-green-400/20",    icon: CheckCircle2 },
  rejected:   { label: "Từ chối",   color: "bg-red-400/10 text-red-400 border-red-400/20",          icon: XCircle },
};

function StatusBadge({ status }: { status: string }) {
  const cfg = statusConfig[status] ?? statusConfig.pending;
  const Icon = cfg.icon;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border ${cfg.color}`}>
      <Icon className="w-3 h-3" />
      {cfg.label}
    </span>
  );
}

export default function AdminDmcaSubmissions() {
  const [selected, setSelected] = useState<DmcaSubmission | null>(null);

  const { data, isLoading, refetch } = trpc.cms.adminListDmca.useQuery({ page: 1, limit: 100 });

  const updateStatus = trpc.cms.adminUpdateDmcaStatus.useMutation({
    onSuccess: () => {
      toast.success("Cập nhật trạng thái thành công");
      refetch();
    },
    onError: (err) => toast.error(err.message),
  });

  const handleStatusChange = (id: number, status: string) => {
    updateStatus.mutate({ id, status: status as DmcaStatus });
    if (selected?.id === id) setSelected((prev) => prev ? { ...prev, status: status as DmcaStatus } : null);
  };

  const submissions = (data ?? []) as unknown as DmcaSubmission[];
  const pendingCount = submissions.filter((s) => s.status === "pending").length;

  return (
    <AdminLayout>
      <div className="p-6 max-w-5xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-red-400/10 border border-red-400/20 flex items-center justify-center">
              <ShieldAlert className="w-5 h-5 text-red-400" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-foreground">Yêu cầu DMCA</h1>
              <p className="text-sm text-muted-foreground">
                {submissions.length} total{pendingCount > 0 && `, ${pendingCount} pending`}
              </p>
            </div>
          </div>
        </div>

        {/* Info banner */}
        <div className="mb-5 p-3 rounded-lg bg-yellow-400/5 border border-yellow-400/20 text-sm text-yellow-400/90 flex items-start gap-2">
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
          <span>DMCA takedown requests must be reviewed and actioned within 24–48 hours to comply with the DMCA safe harbor provisions.</span>
        </div>

        {/* Table */}
        {isLoading ? (
          <div className="space-y-2">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="h-14 rounded-lg bg-muted/30 animate-pulse" />
            ))}
          </div>
        ) : submissions.length === 0 ? (
          <div className="text-center py-16 text-muted-foreground">
            <ShieldAlert className="w-10 h-10 mx-auto mb-3 opacity-30" />
            <p>Chưa có yêu cầu DMCA nào.</p>
          </div>
        ) : (
          <div className="rounded-xl border border-border/50 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/30 border-b border-border/50">
                <tr>
                  <th className="text-left px-4 py-3 text-muted-foreground font-medium">Người báo cáo</th>
                  <th className="text-left px-4 py-3 text-muted-foreground font-medium">URL vi phạm</th>
                  <th className="text-left px-4 py-3 text-muted-foreground font-medium">Trạng thái</th>
                  <th className="text-left px-4 py-3 text-muted-foreground font-medium">Ngày</th>
                  <th className="text-left px-4 py-3 text-muted-foreground font-medium">Hành động</th>
                </tr>
              </thead>
              <tbody>
                {submissions.map((sub) => (
                  <tr
                    key={sub.id}
                    className={`border-b border-border/30 last:border-0 hover:bg-muted/20 transition-colors ${
                      sub.status === "pending" ? "bg-yellow-400/5" : ""
                    }`}
                  >
                    <td className="px-4 py-3">
                      <div className="font-medium text-foreground">{sub.name}</div>
                      <div className="text-xs text-muted-foreground">{sub.email}</div>
                    </td>
                    <td className="px-4 py-3">
                      <a
                        href={sub.infringingUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-primary hover:underline flex items-center gap-1 text-xs max-w-xs truncate"
                      >
                        <ExternalLink className="w-3 h-3 shrink-0" />
                        {sub.infringingUrl}
                      </a>
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={sub.status} />
                    </td>
                    <td className="px-4 py-3 text-muted-foreground text-xs">
                      <div className="flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {new Date(sub.createdAt).toLocaleDateString()}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 px-2 text-xs"
                          onClick={() => setSelected(sub)}
                        >
                          <Eye className="w-3.5 h-3.5 mr-1" /> View
                        </Button>
                        <Select
                          value={sub.status}
                          onValueChange={(val) => handleStatusChange(sub.id, val)}
                        >
                          <SelectTrigger className="h-7 w-28 text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="pending">Pending</SelectItem>
                            <SelectItem value="reviewing">Reviewing</SelectItem>
                            <SelectItem value="actioned">Actioned</SelectItem>
                            <SelectItem value="rejected">Rejected</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Detail dialog */}
        <Dialog open={!!selected} onOpenChange={(open) => !open && setSelected(null)}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <ShieldAlert className="w-4 h-4 text-red-400" />
                Yêu cầu gỡ nội dung DMCA
              </DialogTitle>
            </DialogHeader>
            {selected && (
              <div className="space-y-4 text-sm">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <p className="text-xs text-muted-foreground mb-0.5">Người báo cáo</p>
                    <p className="font-medium text-foreground">{selected.name}</p>
                    <p className="text-muted-foreground">{selected.email}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground mb-0.5">Ngày gửi</p>
                    <p className="text-foreground">{new Date(selected.createdAt).toLocaleString()}</p>
                  </div>
                </div>

                <div>
                  <p className="text-xs text-muted-foreground mb-0.5">URL vi phạm</p>
                  <a
                    href={selected.infringingUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary hover:underline flex items-center gap-1 break-all"
                  >
                    <ExternalLink className="w-3.5 h-3.5 shrink-0" />
                    {selected.infringingUrl}
                  </a>
                </div>

                {selected.originalWorkUrl && (
                  <div>
                    <p className="text-xs text-muted-foreground mb-0.5">URL tác phẩm gốc</p>
                    <a
                      href={selected.originalWorkUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary hover:underline flex items-center gap-1 break-all"
                    >
                      <ExternalLink className="w-3.5 h-3.5 shrink-0" />
                      {selected.originalWorkUrl}
                    </a>
                  </div>
                )}

                {selected.reporterUrl && (
                  <div>
                    <p className="text-xs text-muted-foreground mb-0.5">Website người báo cáo</p>
                    <a
                      href={selected.reporterUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary hover:underline flex items-center gap-1 break-all"
                    >
                      <ExternalLink className="w-3.5 h-3.5 shrink-0" />
                      {selected.reporterUrl}
                    </a>
                  </div>
                )}

                <div>
                  <p className="text-xs text-muted-foreground mb-1">Mô tả</p>
                  <div className="p-3 rounded-lg bg-muted/30 border border-border/50 text-foreground whitespace-pre-wrap leading-relaxed max-h-48 overflow-y-auto">
                    {selected.description}
                  </div>
                </div>

                <div className="flex items-center justify-between pt-2 border-t border-border/50">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">Status:</span>
                    <StatusBadge status={selected.status} />
                  </div>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        window.open(`mailto:${selected.email}?subject=Re: Your Yêu cầu gỡ nội dung DMCA`, "_blank");
                      }}
                    >
                      Reply
                    </Button>
                    {selected.status === "pending" && (
                      <Button
                        size="sm"
                        className="bg-red-500 hover:bg-red-600 text-white"
                        onClick={() => handleStatusChange(selected.id, "actioned")}
                      >
                        Đánh dấu đã xử lý
                      </Button>
                    )}
                    <Button size="sm" variant="ghost" onClick={() => setSelected(null)}>
                      Close
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </AdminLayout>
  );
}
