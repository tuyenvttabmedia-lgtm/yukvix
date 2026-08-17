import { useState } from "react";
import { AdminPageShell, AdminPageHeader } from "@/admin";
import { trpc } from "@/lib/trpc";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { RefreshCw, RotateCcw, Mail, Clock, CheckCircle, XCircle, AlertCircle } from "lucide-react";
import AdminLayout from "./AdminLayout";

const EMAIL_TYPES = [
  { value: "all", label: "All Types" },
  { value: "password_reset", label: "Password Reset" },
  { value: "password_changed", label: "Password Changed" },
  { value: "temp_password", label: "Temp Password" },
  { value: "email_verify", label: "Email Verify" },
  { value: "vip_expiry_reminder", label: "VIP Expiry Reminder" },
];

function StatusBadge({ status }: { status: string }) {
  if (status === "sent") return <Badge className="bg-green-600 text-white"><CheckCircle className="w-3 h-3 mr-1" />Sent</Badge>;
  if (status === "failed") return <Badge variant="destructive"><XCircle className="w-3 h-3 mr-1" />Thất bại</Badge>;
  if (status === "pending") return <Badge className="bg-yellow-600 text-white"><Clock className="w-3 h-3 mr-1" />Pending</Badge>;
  if (status === "processing") return <Badge className="bg-blue-600 text-white"><RefreshCw className="w-3 h-3 mr-1 animate-spin" />Đang xử lý</Badge>;
  return <Badge variant="outline">{status}</Badge>;
}

function formatDate(d: Date | string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" });
}

// --- Nhật ký Email Tab ---
function EmailLogsTab() {
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState<"all" | "sent" | "failed">("all");
  const [type, setType] = useState("all");
  const [recipient, setRecipient] = useState("");
  const [recipientInput, setRecipientInput] = useState("");

  const { data, isLoading, refetch } = trpc.emailLogs.getLogs.useQuery({
    page,
    limit: 50,
    status: status === "all" ? undefined : status,
    type: type === "all" ? undefined : type,
    recipient: recipient || undefined,
  });

  const totalPages = data ? Math.ceil(data.total / 50) : 1;

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-center">
        <Select value={status} onValueChange={(v) => { setStatus(v as any); setPage(1); }}>
          <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="sent">Sent</SelectItem>
            <SelectItem value="failed">Thất bại</SelectItem>
          </SelectContent>
        </Select>
        <Select value={type} onValueChange={(v) => { setType(v); setPage(1); }}>
          <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
          <SelectContent>
            {EMAIL_TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
          </SelectContent>
        </Select>
        <div className="flex gap-2">
          <Input
            placeholder="Filter by recipient..."
            value={recipientInput}
            onChange={(e) => setRecipientInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { setRecipient(recipientInput); setPage(1); } }}
            className="w-52"
          />
          <Button variant="outline" size="sm" onClick={() => { setRecipient(recipientInput); setPage(1); }}>Tìm kiếm</Button>
          {recipient && <Button variant="ghost" size="sm" onClick={() => { setRecipient(""); setRecipientInput(""); setPage(1); }}>Clear</Button>}
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()} className="ml-auto">
          <RefreshCw className="w-4 h-4 mr-1" /> Refresh
        </Button>
      </div>

      {/* Stats */}
      {data && (
        <p className="text-sm text-muted-foreground">
          Showing {data.items.length} trong {data.total} bản ghi
        </p>
      )}

      {/* Table */}
      <div className="rounded-md border overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-12">#</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Người nhận</TableHead>
              <TableHead>Chủ đề</TableHead>
              <TableHead>Trạng thái</TableHead>
              <TableHead className="w-16">Tries</TableHead>
              <TableHead>Thời gian gửi</TableHead>
              <TableHead>Error</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow><TableCell colSpan={8} className="text-center py-8 text-muted-foreground">Đang tải...</TableCell></TableRow>
            ) : data?.items.length === 0 ? (
              <TableRow><TableCell colSpan={8} className="text-center py-8 text-muted-foreground">Không tìm thấy nhật ký email</TableCell></TableRow>
            ) : data?.items.map((log) => (
              <TableRow key={log.id}>
                <TableCell className="text-muted-foreground text-xs">{log.id}</TableCell>
                <TableCell>
                  <code className="text-xs bg-muted px-1 py-0.5 rounded">{log.type}</code>
                </TableCell>
                <TableCell className="text-sm max-w-[180px] truncate">{log.recipient}</TableCell>
                <TableCell className="text-sm max-w-[220px] truncate">{log.subject}</TableCell>
                <TableCell><StatusBadge status={log.status} /></TableCell>
                <TableCell className="text-center text-sm">{log.attempts}</TableCell>
                <TableCell className="text-xs text-muted-foreground whitespace-nowrap">{formatDate(log.sentAt)}</TableCell>
                <TableCell className="text-xs text-red-400 max-w-[200px] truncate">{log.error ?? "—"}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex gap-2 items-center justify-center">
          <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>Prev</Button>
          <span className="text-sm text-muted-foreground">Trang {page} / {totalPages}</span>
          <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>Tiếp</Button>
        </div>
      )}
    </div>
  );
}

// --- Email Queue Tab ---
function EmailQueueTab() {
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState<"all" | "pending" | "processing" | "sent" | "failed">("all");

  const { data, isLoading, refetch } = trpc.emailLogs.getQueue.useQuery({
    page,
    limit: 50,
    status: status === "all" ? undefined : status,
  });

  const retryMutation = trpc.emailLogs.retryQueueItem.useMutation({
    onSuccess: () => {
      toast.success("Queued for retry — email will be retried shortly.");
      refetch();
    },
    onError: (e) => toast.error(e.message),
  });

  const totalPages = data ? Math.ceil(data.total / 50) : 1;

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-center">
        <Select value={status} onValueChange={(v) => { setStatus(v as any); setPage(1); }}>
          <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="processing">Đang xử lý</SelectItem>
            <SelectItem value="sent">Sent</SelectItem>
            <SelectItem value="failed">Thất bại</SelectItem>
          </SelectContent>
        </Select>
        <Button variant="outline" size="sm" onClick={() => refetch()} className="ml-auto">
          <RefreshCw className="w-4 h-4 mr-1" /> Refresh
        </Button>
      </div>

      {data && (
        <p className="text-sm text-muted-foreground">
          Showing {data.items.length} trong {data.total} bản ghi
        </p>
      )}

      <div className="rounded-md border overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-12">#</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Người nhận</TableHead>
              <TableHead>Chủ đề</TableHead>
              <TableHead>Trạng thái</TableHead>
              <TableHead>Attempts</TableHead>
              <TableHead>Priority</TableHead>
              <TableHead>Scheduled</TableHead>
              <TableHead>Error</TableHead>
              <TableHead className="w-20">Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow><TableCell colSpan={10} className="text-center py-8 text-muted-foreground">Đang tải...</TableCell></TableRow>
            ) : data?.items.length === 0 ? (
              <TableRow><TableCell colSpan={10} className="text-center py-8 text-muted-foreground">Queue is empty</TableCell></TableRow>
            ) : data?.items.map((item) => (
              <TableRow key={item.id}>
                <TableCell className="text-muted-foreground text-xs">{item.id}</TableCell>
                <TableCell><code className="text-xs bg-muted px-1 py-0.5 rounded">{item.type}</code></TableCell>
                <TableCell className="text-sm max-w-[160px] truncate">{item.recipient}</TableCell>
                <TableCell className="text-sm max-w-[200px] truncate">{item.subject}</TableCell>
                <TableCell><StatusBadge status={item.status} /></TableCell>
                <TableCell className="text-center text-sm">{item.attempts}/{item.maxAttempts}</TableCell>
                <TableCell className="text-center text-sm">{item.priority}</TableCell>
                <TableCell className="text-xs text-muted-foreground whitespace-nowrap">{formatDate(item.scheduledAt)}</TableCell>
                <TableCell className="text-xs text-red-400 max-w-[160px] truncate">{item.error ?? "—"}</TableCell>
                <TableCell>
                  {item.status === "failed" && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 px-2 text-xs"
                      disabled={retryMutation.isPending}
                      onClick={() => retryMutation.mutate({ id: item.id })}
                    >
                      <RotateCcw className="w-3 h-3 mr-1" /> Retry
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {totalPages > 1 && (
        <div className="flex gap-2 items-center justify-center">
          <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>Prev</Button>
          <span className="text-sm text-muted-foreground">Trang {page} / {totalPages}</span>
          <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>Tiếp</Button>
        </div>
      )}
    </div>
  );
}

// --- Main Trang ---
export default function AdminEmailLogs() {
  return (
    <AdminLayout>
      <AdminPageShell mode="full">
        <AdminPageHeader
          icon={Mail}
          title="Nhật ký Email"
          subtitle="Lịch sử gửi email và quản lý hàng đợi"
        />
        <Tabs defaultValue="logs">
          <TabsList>
            <TabsTrigger value="logs" className="flex items-center gap-1.5">
              <CheckCircle className="w-4 h-4" /> Sent History
            </TabsTrigger>
            <TabsTrigger value="queue" className="flex items-center gap-1.5">
              <AlertCircle className="w-4 h-4" /> Queue
            </TabsTrigger>
          </TabsList>
          <TabsContent value="logs" className="mt-4">
            <EmailLogsTab />
          </TabsContent>
          <TabsContent value="queue" className="mt-4">
            <EmailQueueTab />
          </TabsContent>
        </Tabs>
      </AdminPageShell>
    </AdminLayout>
  );
}
