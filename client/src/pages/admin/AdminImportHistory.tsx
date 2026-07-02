import { useState } from "react";
import { Link } from "wouter";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, Search, RefreshCw, ExternalLink, FileText, Ban, CheckCircle, XCircle, Trash2, CheckSquare, Square } from "lucide-react";
import AdminLayout from "./AdminLayout";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

const STATUS_COLORS: Record<string, string> = {
  queued: "text-slate-400",
  crawling: "text-blue-400",
  downloading: "text-indigo-400",
  processing: "text-purple-400",
  seo: "text-amber-400",
  done: "text-green-400",
  failed: "text-red-400",
  cancelled: "text-gray-400",
};

function AdminImportHistoryContent() {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);
  const [confirmBulkDelete, setConfirmBulkDelete] = useState(false);

  const utils = trpc.useUtils();

  const { data, refetch, isLoading } = trpc.importJobs.list.useQuery({
    page,
    limit: 50,
    status: statusFilter !== "all" ? (statusFilter as any) : undefined,
    search: search || undefined,
  });

  const retryMutation = trpc.importJobs.retry.useMutation({
    onSuccess: () => { refetch(); toast.success("Job re-queued"); },
    onError: (err) => toast.error("Error", { description: err.message }),
  });

  const deleteMutation = trpc.importJobs.delete.useMutation({
    onSuccess: () => {
      toast.success("Job deleted");
      setConfirmDeleteId(null);
      utils.importJobs.list.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  const bulkDeleteMutation = trpc.importJobs.bulkDelete.useMutation({
    onSuccess: (res) => {
      toast.success(`Deleted ${res.deleted} jobs`);
      setSelected(new Set());
      setConfirmBulkDelete(false);
      utils.importJobs.list.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  const jobs = data?.jobs || [];

  const toggleSelect = (id: number) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (selected.size === jobs.length) setSelected(new Set());
    else setSelected(new Set(jobs.map(j => j.id)));
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/admin/import">
          <Button variant="ghost" size="sm" className="text-slate-400 gap-1">
          <ArrowLeft className="w-4 h-4" /> Quay lại
        </Button>
        </Link>
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-white">Lịch sử Import</h1>
          <p className="text-slate-400 text-sm">Tất cả công việc import, hiện tại và trong quá khứ</p>
        </div>
        <Button variant="ghost" size="sm" onClick={() => refetch()} className="text-slate-400">
          <RefreshCw className="w-4 h-4" />
        </Button>
      </div>

      {/* Filters */}
      <div className="flex gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
          <Input
            placeholder="Tìm theo URL..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            className="bg-slate-800 border-slate-600 text-white pl-9"
          />
        </div>
        <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(1); }}>
          <SelectTrigger className="w-40 bg-slate-800 border-slate-600 text-white">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tất cả</SelectItem>
            <SelectItem value="done">Hoàn thành</SelectItem>
            <SelectItem value="failed">Thất bại</SelectItem>
            <SelectItem value="cancelled">Đã hủy</SelectItem>
            <SelectItem value="queued">Trong hàng chờ</SelectItem>
            <SelectItem value="crawling">Đang chạy</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Bulk actions bar */}
      {selected.size > 0 && (
        <div className="flex items-center gap-3 bg-red-950/40 border border-red-800/50 rounded-lg px-4 py-2">
          <span className="text-red-300 text-sm font-medium">Đã chọn {selected.size} công việc</span>
          <Button
            variant="destructive"
            size="sm"
            onClick={() => setConfirmBulkDelete(true)}
            disabled={bulkDeleteMutation.isPending}
            className="ml-auto"
          >
            <Trash2 className="w-3.5 h-3.5 mr-1" />
            Xóa đã chọn
          </Button>
          <Button variant="ghost" size="sm" className="text-slate-400" onClick={() => setSelected(new Set())}>
            Bỏ chọn
          </Button>
        </div>
      )}

      <Card className="bg-slate-800 border-slate-700">
        <CardContent className="p-0">
          {isLoading ? (
            <div className="py-12 text-center text-slate-500">Đang tải...</div>
          ) : jobs.length === 0 ? (
            <div className="py-12 text-center text-slate-500">Không tìm thấy công việc nào</div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-700 text-slate-400 text-xs uppercase">
                  <th className="p-3 w-10">
                    <button onClick={toggleAll} className="text-slate-400 hover:text-white">
                      {selected.size === jobs.length && jobs.length > 0
                        ? <CheckSquare className="w-4 h-4" />
                        : <Square className="w-4 h-4" />}
                    </button>
                  </th>
                  <th className="text-left p-3 w-12">#</th>
                  <th className="text-left p-3">URL / Title</th>
                  <th className="text-left p-3 w-24">Trạng thái</th>
                  <th className="text-left p-3 w-20">Ảnh</th>
                  <th className="text-left p-3 w-36">Ngày</th>
                  <th className="text-right p-3 w-28">Hành động</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-700/50">
                {jobs.map((job) => (
                  <tr key={job.id} className={`hover:bg-slate-750 transition-colors ${selected.has(job.id) ? 'bg-slate-700/40' : ''}`}>
                    <td className="p-3">
                      <button onClick={() => toggleSelect(job.id)} className="text-slate-400 hover:text-white">
                        {selected.has(job.id)
                          ? <CheckSquare className="w-4 h-4 text-primary" />
                          : <Square className="w-4 h-4" />}
                      </button>
                    </td>
                    <td className="p-3 text-slate-500 font-mono">{job.id}</td>
                    <td className="p-3">
                      <p className="text-white truncate max-w-xs">{job.extractedTitle || job.sourceUrl}</p>
                      {job.extractedTitle && (
                        <p className="text-slate-500 text-xs truncate max-w-xs">{job.sourceUrl}</p>
                      )}
                      {job.extractedCreator && (
                        <p className="text-slate-400 text-xs">bởi {job.extractedCreator}</p>
                      )}
                    </td>
                    <td className="p-3">
                      <span className={`font-medium ${STATUS_COLORS[job.status] || "text-slate-400"}`}>
                        {job.status}
                      </span>
                    </td>
                    <td className="p-3 text-slate-300">{job.totalImages || "—"}</td>
                    <td className="p-3 text-slate-400 text-xs">
                      {new Date(job.createdAt).toLocaleDateString()}
                    </td>
                    <td className="p-3">
                      <div className="flex items-center justify-end gap-1">
                        {job.albumId && (
                          <Link href={`/admin/albums/${job.albumId}`}>
                            <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-green-400">
                              <ExternalLink className="w-3.5 h-3.5" />
                            </Button>
                          </Link>
                        )}
                        <Link href={`/admin/import/logs/${job.id}`}>
                          <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-slate-400">
                            <FileText className="w-3.5 h-3.5" />
                          </Button>
                        </Link>
                        {job.status === "failed" && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 w-7 p-0 text-blue-400"
                            onClick={() => retryMutation.mutate({ id: job.id })}
                            disabled={retryMutation.isPending}
                          >
                            <RefreshCw className="w-3.5 h-3.5" />
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 w-7 p-0 text-red-400 hover:text-red-300"
                          onClick={() => setConfirmDeleteId(job.id)}
                          title="Xóa công việc"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {/* Pagination */}
          {(jobs.length === 50 || page > 1) && (
            <div className="flex justify-center gap-2 p-4 border-t border-slate-700">
              <Button variant="outline" size="sm" disabled={page === 1} onClick={() => setPage(p => p - 1)}>Trước</Button>
              <span className="text-slate-400 text-sm self-center">Trang {page}</span>
              <Button variant="outline" size="sm" disabled={jobs.length < 50} onClick={() => setPage(p => p + 1)}>Tiếp</Button>
            </div>
          )}
        </CardContent>
      </Card>
      {/* Xác nhận single delete dialog */}
      <AlertDialog open={confirmDeleteId !== null} onOpenChange={(o) => !o && setConfirmDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Xóa công việc import?</AlertDialogTitle>
            <AlertDialogDescription>
              Công việc #{confirmDeleteId} và tất cả log sẽ bị xóa vĩnh viễn. Các album đã tạo từ công việc này sẽ không bị ảnh hưởng.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Hủy</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700"
              onClick={() => confirmDeleteId !== null && deleteMutation.mutate({ id: confirmDeleteId })}
              disabled={deleteMutation.isPending}
            >
              Xóa
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Xác nhận bulk delete dialog */}
      <AlertDialog open={confirmBulkDelete} onOpenChange={setConfirmBulkDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Xóa {selected.size} công việc?</AlertDialogTitle>
            <AlertDialogDescription>
              Tất cả {selected.size} công việc đã chọn và log của chúng sẽ bị xóa vĩnh viễn.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Hủy</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700"
              onClick={() => bulkDeleteMutation.mutate({ ids: Array.from(selected) })}
              disabled={bulkDeleteMutation.isPending}
            >
              Xóa tất cả
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

export default function AdminImportHistory() {
  return (
    <AdminLayout>
      <AdminImportHistoryContent />
    </AdminLayout>
  );
}
