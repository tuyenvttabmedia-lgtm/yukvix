/**
 * Admin page: Tin nhắn liên hệ — list, view, and update status.
 */
import { useState } from "react";
import { AdminPageShell, AdminPageHeader } from "@/admin";
import AdminLayout from "./AdminLayout";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
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
import { Mail, Eye, Clock, CheckCircle2, XCircle, AlertCircle } from "lucide-react";

type ContactStatus = "new" | "read" | "replied" | "closed";

type Submission = {
  id: number;
  name: string;
  email: string;
  subject: string;
  message: string;
  status: ContactStatus;
  createdAt: Date;
};

const statusConfig: Record<string, { label: string; color: string; icon: React.ElementType }> = {
  new:        { label: "Mới",        color: "bg-blue-400/10 text-blue-400 border-blue-400/20",   icon: AlertCircle },
  read:       { label: "Đã đọc",       color: "bg-muted text-muted-foreground border-border",       icon: Eye },
  replied:    { label: "Đã trả lời",    color: "bg-green-400/10 text-green-400 border-green-400/20", icon: CheckCircle2 },
  closed:     { label: "Đã đóng",     color: "bg-zinc-400/10 text-zinc-400 border-zinc-400/20",   icon: XCircle },
};

function StatusBadge({ status }: { status: string }) {
  const cfg = statusConfig[status] ?? statusConfig.new;
  const Icon = cfg.icon;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border ${cfg.color}`}>
      <Icon className="w-3 h-3" />
      {cfg.label}
    </span>
  );
}

export default function AdminContactSubmissions() {
  const [selected, setSelected] = useState<Submission | null>(null);

  const { data, isLoading, refetch } = trpc.cms.adminListContacts.useQuery({ page: 1, limit: 100 });

  const updateStatus = trpc.cms.adminUpdateContactStatus.useMutation({
    onSuccess: () => {
      toast.success("Cập nhật trạng thái thành công");
      refetch();
      if (selected) setSelected((prev) => prev ? { ...prev, status: selected.status } : null);
    },
    onError: (err) => toast.error(err.message),
  });

  const handleStatusChange = (id: number, status: string) => {
    updateStatus.mutate({ id, status: status as ContactStatus });
    if (selected?.id === id) setSelected((prev) => prev ? { ...prev, status: status as ContactStatus } : null);
  };

  const submissions = data ?? [];
  const newCount = submissions.filter((s) => s.status === "new").length;

  return (
    <AdminLayout>
      <AdminPageShell mode="full">
        <AdminPageHeader icon={Mail} title="Liên hệ" />

        {/* Table */}
        {isLoading ? (
          <div className="space-y-2">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="h-14 rounded-lg bg-muted/30 animate-pulse" />
            ))}
          </div>
        ) : submissions.length === 0 ? (
          <div className="text-center py-16 text-muted-foreground">
            <Mail className="w-10 h-10 mx-auto mb-3 opacity-30" />
            <p>Chưa có tin nhắn liên hệ nào.</p>
          </div>
        ) : (
          <div className="rounded-xl border border-border/50 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/30 border-b border-border/50">
                <tr>
                  <th className="text-left px-4 py-3 text-muted-foreground font-medium">Từ</th>
                  <th className="text-left px-4 py-3 text-muted-foreground font-medium">Chủ đề</th>
                  <th className="text-left px-4 py-3 text-muted-foreground font-medium">Trạng thái</th>
                  <th className="text-left px-4 py-3 text-muted-foreground font-medium">Ngày</th>
                  <th className="text-left px-4 py-3 text-muted-foreground font-medium">Hành động</th>
                </tr>
              </thead>
              <tbody>
                {submissions.map((sub, i) => (
                  <tr
                    key={sub.id}
                    className={`border-b border-border/30 last:border-0 hover:bg-muted/20 transition-colors ${
                      sub.status === "new" ? "bg-blue-400/5" : ""
                    }`}
                  >
                    <td className="px-4 py-3">
                      <div className="font-medium text-foreground">{sub.name}</div>
                      <div className="text-xs text-muted-foreground">{sub.email}</div>
                    </td>
                    <td className="px-4 py-3 text-foreground max-w-xs truncate">{sub.subject}</td>
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
                          onClick={() => {
                            setSelected(sub as unknown as Submission);
                            if (sub.status === "new") handleStatusChange(sub.id, "read");
                          }}
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
                            <SelectItem value="new">New</SelectItem>
                            <SelectItem value="read">Read</SelectItem>
                            <SelectItem value="replied">Replied</SelectItem>
                            <SelectItem value="closed">Closed</SelectItem>
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
                <Mail className="w-4 h-4 text-primary" />
                Tin nhắn liên hệ
              </DialogTitle>
            </DialogHeader>
            {selected && (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <p className="text-xs text-muted-foreground mb-0.5">Từ</p>
                    <p className="font-medium text-foreground">{selected.name}</p>
                    <p className="text-muted-foreground">{selected.email}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground mb-0.5">Ngày</p>
                    <p className="text-foreground">{new Date(selected.createdAt).toLocaleString()}</p>
                  </div>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-0.5">Chủ đề</p>
                  <p className="font-medium text-foreground">{selected.subject}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Nội dung</p>
                  <div className="p-3 rounded-lg bg-muted/30 border border-border/50 text-sm text-foreground whitespace-pre-wrap leading-relaxed max-h-60 overflow-y-auto">
                    {selected.message}
                  </div>
                </div>
                <div className="flex items-center justify-between pt-2">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">Status:</span>
                    <StatusBadge status={selected.status} />
                  </div>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        window.open(`mailto:${selected.email}?subject=Re: ${encodeURIComponent(selected.subject)}`, "_blank");
                        handleStatusChange(selected.id, "replied");
                      }}
                    >
                      Trả lời qua Email
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setSelected(null)}>
                      Close
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </AdminPageShell>
    </AdminLayout>
  );
}
