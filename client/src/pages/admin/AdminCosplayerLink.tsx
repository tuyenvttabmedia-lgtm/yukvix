import { useMemo, useState } from "react";
import { Link2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { AdminPageHeader, AdminPageShell } from "@/admin";
import AdminLayout from "./AdminLayout";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

type Bucket = "named" | "empty" | "skipped";

export default function AdminCosplayerLink() {
  const utils = trpc.useUtils();
  const [bucket, setBucket] = useState<Bucket>("named");
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<number[]>([]);
  const [linkCreatorId, setLinkCreatorId] = useState("");

  const { data: counts } = trpc.cosplayerLink.counts.useQuery();
  const { data, isLoading } = trpc.cosplayerLink.list.useQuery({
    bucket,
    page,
    limit: 30,
    search: search.trim() || undefined,
  });
  const { data: creatorsData } = trpc.creators.adminList.useQuery({
    page: 1,
    limit: 200,
  });
  const creators = creatorsData?.items ?? [];

  const invalidate = () => {
    utils.cosplayerLink.counts.invalidate();
    utils.cosplayerLink.list.invalidate();
    setSelected([]);
  };

  const linkMatches = trpc.cosplayerLink.linkMatches.useMutation({
    onSuccess: res => {
      toast.success(`Đã gắn ${res.linked} album khớp tên`);
      invalidate();
    },
    onError: e => toast.error(e.message),
  });
  const createAndLink = trpc.cosplayerLink.createAndLink.useMutation({
    onSuccess: res => {
      toast.success(
        `Tạo ${res.created} cosplayer, gắn ${res.linked} album` +
          (res.skipped ? ` (bỏ ${res.skipped} album không có tên)` : "")
      );
      invalidate();
    },
    onError: e => toast.error(e.message),
  });
  const link = trpc.cosplayerLink.link.useMutation({
    onSuccess: res => {
      toast.success(`Đã gắn ${res.linked} album`);
      invalidate();
    },
    onError: e => toast.error(e.message),
  });
  const skip = trpc.cosplayerLink.skip.useMutation({
    onSuccess: n => {
      toast.success(`Đã bỏ qua ${n} album`);
      invalidate();
    },
    onError: e => toast.error(e.message),
  });
  const unskip = trpc.cosplayerLink.unskip.useMutation({
    onSuccess: n => {
      toast.success(`Đã đưa lại ${n} album`);
      invalidate();
    },
    onError: e => toast.error(e.message),
  });

  const items = data?.items ?? [];
  const total = data?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / 30));
  const idsOnPage = useMemo(() => items.map(i => i.id), [items]);
  const allChecked =
    idsOnPage.length > 0 && idsOnPage.every(id => selected.includes(id));

  const toggleAll = (on: boolean) => {
    setSelected(on ? idsOnPage : []);
  };
  const toggleOne = (id: number, on: boolean) => {
    setSelected(prev =>
      on ? (prev.includes(id) ? prev : [...prev, id]) : prev.filter(x => x !== id)
    );
  };

  const busy =
    linkMatches.isPending ||
    createAndLink.isPending ||
    link.isPending ||
    skip.isPending ||
    unskip.isPending;

  return (
    <AdminLayout>
      <AdminPageShell mode="wide">
        <AdminPageHeader
          icon={Link2}
          title="Gắn Cosplayer"
          subtitle="Khớp album chưa có trong quản lý Cosplayer. Tạo mới chỉ khi bạn duyệt."
          metrics={[
            { label: "Có tên, chưa gắn", value: counts?.named ?? "—" },
            { label: "Không tên", value: counts?.empty ?? "—" },
            { label: "Bỏ qua", value: counts?.skipped ?? "—" },
          ]}
        />

        <Tabs
          value={bucket}
          onValueChange={v => {
            setBucket(v as Bucket);
            setPage(1);
            setSelected([]);
          }}
        >
          <TabsList>
            <TabsTrigger value="named">Có tên chưa gắn</TabsTrigger>
            <TabsTrigger value="empty">Không tên</TabsTrigger>
            <TabsTrigger value="skipped">Đã bỏ qua</TabsTrigger>
          </TabsList>
        </Tabs>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <Input
            value={search}
            onChange={e => {
              setSearch(e.target.value);
              setPage(1);
            }}
            placeholder="Tìm tiêu đề / tên…"
            className="max-w-xs"
          />
          {bucket === "named" && (
            <Button
              size="sm"
              disabled={busy}
              onClick={() =>
                linkMatches.mutate({
                  albumIds: selected.length ? selected : undefined,
                })
              }
            >
              Gắn các album khớp tên sẵn có
            </Button>
          )}
          {bucket !== "skipped" && (
            <>
              <Button
                size="sm"
                variant="secondary"
                disabled={busy || selected.length === 0}
                onClick={() => createAndLink.mutate({ albumIds: selected })}
              >
                Tạo Cosplayer mới và gắn
              </Button>
              <select
                className="h-9 rounded-md border bg-background px-2 text-sm"
                value={linkCreatorId}
                onChange={e => setLinkCreatorId(e.target.value)}
              >
                <option value="">Chọn Cosplayer có sẵn…</option>
                {creators.map(c => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
              <Button
                size="sm"
                variant="outline"
                disabled={busy || selected.length === 0 || !linkCreatorId}
                onClick={() =>
                  link.mutate({
                    albumIds: selected,
                    creatorId: Number(linkCreatorId),
                  })
                }
              >
                Gắn vào đã chọn
              </Button>
              <Button
                size="sm"
                variant="ghost"
                disabled={busy || selected.length === 0}
                onClick={() => skip.mutate({ albumIds: selected })}
              >
                Bỏ qua (không phải người)
              </Button>
            </>
          )}
          {bucket === "skipped" && (
            <Button
              size="sm"
              disabled={busy || selected.length === 0}
              onClick={() => unskip.mutate({ albumIds: selected })}
            >
              Đưa lại hàng duyệt
            </Button>
          )}
        </div>

        <div className="mt-4 overflow-auto rounded-md border">
          {isLoading ? (
            <div className="flex items-center gap-2 p-6 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Đang tải…
            </div>
          ) : items.length === 0 ? (
            <p className="p-6 text-sm text-muted-foreground">Không có album trong nhóm này.</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-left text-xs text-muted-foreground">
                <tr>
                  <th className="p-2 w-8">
                    <Checkbox
                      checked={allChecked}
                      onCheckedChange={v => toggleAll(v === true)}
                    />
                  </th>
                  <th className="p-2">Album</th>
                  <th className="p-2">Tên gợi ý</th>
                  <th className="p-2">Khớp sẵn</th>
                </tr>
              </thead>
              <tbody>
                {items.map(row => (
                  <tr key={row.id} className="border-t">
                    <td className="p-2">
                      <Checkbox
                        checked={selected.includes(row.id)}
                        onCheckedChange={v => toggleOne(row.id, v === true)}
                      />
                    </td>
                    <td className="p-2">
                      <a
                        href={`/admin/albums/${row.id}`}
                        className="font-medium hover:underline"
                      >
                        {row.title}
                      </a>
                      <div className="text-[11px] text-muted-foreground">
                        #{row.id} · {row.status}
                      </div>
                    </td>
                    <td className="p-2">{row.hint || "—"}</td>
                    <td className="p-2">
                      {row.suggested ? (
                        <button
                          type="button"
                          className="text-primary underline-offset-2 hover:underline"
                          disabled={busy}
                          onClick={() =>
                            link.mutate({
                              albumIds: [row.id],
                              creatorId: row.suggested!.id,
                            })
                          }
                        >
                          {row.suggested.name}
                        </button>
                      ) : (
                        <span className="text-muted-foreground">Chưa có</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {pages > 1 && (
          <div className="mt-3 flex items-center gap-2 text-sm">
            <Button
              size="sm"
              variant="outline"
              disabled={page <= 1}
              onClick={() => setPage(p => p - 1)}
            >
              Trước
            </Button>
            <span>
              Trang {page}/{pages}
            </span>
            <Button
              size="sm"
              variant="outline"
              disabled={page >= pages}
              onClick={() => setPage(p => p + 1)}
            >
              Sau
            </Button>
          </div>
        )}
      </AdminPageShell>
    </AdminLayout>
  );
}
