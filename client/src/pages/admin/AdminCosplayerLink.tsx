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
  const [quickName, setQuickName] = useState("");
  const [rowName, setRowName] = useState<Record<number, string>>({});
  const [linkCreatorId, setLinkCreatorId] = useState("");
  const [creatorQuery, setCreatorQuery] = useState("");

  const { data: counts } = trpc.cosplayerLink.counts.useQuery();
  const { data, isLoading } = trpc.cosplayerLink.list.useQuery({
    bucket,
    page,
    limit: 30,
    search: search.trim() || undefined,
  });
  const { data: creatorsData } = trpc.creators.adminNameList.useQuery({
    limit: 500,
  });
  const creators = useMemo(() => {
    const q = creatorQuery.trim().toLowerCase();
    const items = creatorsData?.items ?? [];
    if (!q) return items;
    return items.filter(c => c.name.toLowerCase().includes(q));
  }, [creatorsData, creatorQuery]);

  const invalidate = () => {
    utils.cosplayerLink.counts.invalidate();
    utils.cosplayerLink.list.invalidate();
    utils.creators.adminNameList.invalidate();
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
  const createQuick = trpc.cosplayerLink.createQuick.useMutation({
    onSuccess: (res, vars) => {
      if (res.linked > 0) {
        toast.success(
          (res.created ? `Đã tạo ${res.name}` : `Đã dùng ${res.name}`) +
            ` — gắn ${res.linked} album`
        );
      } else {
        toast.success(
          (res.created ? `Đã tạo ${res.name}` : `${res.name} đã có`) +
            ". Bấm Tạo trên từng album bên dưới để gắn."
        );
      }
      setRowName(prev => {
        const next = { ...prev };
        for (const id of vars.albumIds ?? []) delete next[id];
        return next;
      });
      if ((vars.albumIds?.length ?? 0) > 1) setQuickName("");
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
  const unmatchedOnPage = items.filter(row => row.hint && !row.suggested).map(row => row.id);

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
    createQuick.isPending ||
    link.isPending ||
    skip.isPending ||
    unskip.isPending;

  const pastedName = quickName.trim();
  const runQuick = (albumIds: number[]) => {
    if (!pastedName || busy) return;
    createQuick.mutate({ name: pastedName, albumIds });
  };

  const nameForRow = (id: number) => (rowName[id] ?? "").trim() || pastedName;

  return (
    <AdminLayout>
      <AdminPageShell mode="wide">
        <AdminPageHeader
          icon={Link2}
          title="Gắn Cosplayer"
          subtitle="Dán tên là bấm Tạo được ngay. Gắn từng album bằng nút trên dòng, hoặc tick nhiều album rồi gắn một lần."
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

        {bucket !== "skipped" && (
          <div className="mt-4 rounded-md border bg-muted/20 p-3">
            <p className="text-sm font-medium">Tạo nhanh</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Dán tên rồi bấm <span className="font-medium text-foreground">Tạo</span> trên
              từng album. Tick nhiều dòng nếu muốn gắn cùng một tên.
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <Input
                value={quickName}
                onChange={e => setQuickName(e.target.value)}
                placeholder="Dán tên cosplayer…"
                className="max-w-xs"
                autoFocus
                onKeyDown={e => {
                  if (e.key !== "Enter") return;
                  e.preventDefault();
                  runQuick(selected);
                }}
              />
              <Button
                size="sm"
                disabled={busy || !pastedName}
                onClick={() => runQuick(selected)}
              >
                {selected.length > 0
                  ? `Tạo & gắn ${selected.length} album`
                  : "Tạo hồ sơ"}
              </Button>
              {!pastedName ? (
                <span className="text-xs text-muted-foreground">Dán tên để bật nút Tạo</span>
              ) : selected.length === 0 ? (
                <span className="text-xs text-muted-foreground">
                  Chưa tick album — tạo hồ sơ, rồi bấm Tạo trên từng dòng
                </span>
              ) : (
                <span className="text-xs text-muted-foreground">
                  {selected.length} album sẽ gắn vào tên này
                </span>
              )}
            </div>
          </div>
        )}

        <div className="mt-3 flex flex-wrap items-center gap-2">
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
              Gắn hết khớp tên
            </Button>
          )}
          {bucket === "named" && (
            <Button
              size="sm"
              variant="secondary"
              disabled={busy || (selected.length === 0 && unmatchedOnPage.length === 0)}
              onClick={() =>
                createAndLink.mutate({
                  albumIds: selected.length ? selected : unmatchedOnPage,
                })
              }
            >
              {selected.length > 0
                ? `Tạo từ tên (${selected.length})`
                : `Tạo hết chưa khớp (${unmatchedOnPage.length})`}
            </Button>
          )}
          {bucket !== "skipped" && (
            <>
              <Input
                value={creatorQuery}
                onChange={e => setCreatorQuery(e.target.value)}
                placeholder="Tìm cosplayer có sẵn…"
                className="max-w-[180px]"
              />
              <select
                className="h-9 max-w-[220px] rounded-md border bg-background px-2 text-sm"
                value={linkCreatorId}
                onChange={e => setLinkCreatorId(e.target.value)}
              >
                <option value="">Chọn để gắn hàng loạt…</option>
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
                Gắn đã chọn
              </Button>
              <Button
                size="sm"
                variant="ghost"
                disabled={busy || selected.length === 0}
                onClick={() => skip.mutate({ albumIds: selected })}
              >
                Bỏ qua đã chọn
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
                  <th className="p-2 w-14">Ảnh</th>
                  <th className="p-2">Album</th>
                  <th className="p-2">Tên</th>
                  <th className="p-2">Thao tác</th>
                </tr>
              </thead>
              <tbody>
                {items.map(row => {
                  const rowCreateName = nameForRow(row.id);
                  return (
                    <tr
                      key={row.id}
                      className="border-t hover:bg-muted/30"
                      onClick={() => toggleOne(row.id, !selected.includes(row.id))}
                    >
                      <td className="p-2" onClick={e => e.stopPropagation()}>
                        <Checkbox
                          checked={selected.includes(row.id)}
                          onCheckedChange={v => toggleOne(row.id, v === true)}
                        />
                      </td>
                      <td className="p-2">
                        {row.coverUrl ? (
                          <img
                            src={row.coverUrl}
                            alt=""
                            className="h-12 w-12 rounded object-cover"
                          />
                        ) : (
                          <div className="h-12 w-12 rounded bg-muted" />
                        )}
                      </td>
                      <td className="p-2">
                        <a
                          href={`/admin/albums/${row.id}`}
                          className="font-medium hover:underline"
                          onClick={e => e.stopPropagation()}
                        >
                          {row.title}
                        </a>
                        <div className="text-[11px] text-muted-foreground">
                          #{row.id} · {row.status}
                        </div>
                      </td>
                      <td className="p-2" onClick={e => e.stopPropagation()}>
                        {row.hint ? (
                          <span>{row.hint}</span>
                        ) : bucket === "skipped" ? (
                          <span className="text-muted-foreground">—</span>
                        ) : (
                          <Input
                            value={rowName[row.id] ?? ""}
                            placeholder={pastedName || "Dán tên…"}
                            className="h-8 max-w-[200px]"
                            onChange={e =>
                              setRowName(prev => ({ ...prev, [row.id]: e.target.value }))
                            }
                            onKeyDown={e => {
                              if (e.key !== "Enter") return;
                              e.preventDefault();
                              const name = nameForRow(row.id);
                              if (!name || busy) return;
                              createQuick.mutate({ name, albumIds: [row.id] });
                            }}
                          />
                        )}
                      </td>
                      <td className="p-2" onClick={e => e.stopPropagation()}>
                        <div className="flex flex-wrap items-center gap-1.5">
                          {row.suggested && (
                            <Button
                              size="sm"
                              disabled={busy}
                              onClick={() =>
                                link.mutate({
                                  albumIds: [row.id],
                                  creatorId: row.suggested!.id,
                                })
                              }
                            >
                              Gắn {row.suggested.name}
                            </Button>
                          )}
                          {!row.suggested && row.hint && bucket !== "skipped" && (
                            <Button
                              size="sm"
                              variant="secondary"
                              disabled={busy}
                              onClick={() =>
                                createAndLink.mutate({ albumIds: [row.id] })
                              }
                            >
                              Tạo {row.hint}
                            </Button>
                          )}
                          {!row.hint && bucket !== "skipped" && (
                            <Button
                              size="sm"
                              disabled={busy || !rowCreateName}
                              onClick={() =>
                                createQuick.mutate({
                                  name: rowCreateName,
                                  albumIds: [row.id],
                                })
                              }
                            >
                              Tạo
                            </Button>
                          )}
                          {bucket === "skipped" ? (
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={busy}
                              onClick={() => unskip.mutate({ albumIds: [row.id] })}
                            >
                              Đưa lại
                            </Button>
                          ) : (
                            <Button
                              size="sm"
                              variant="ghost"
                              disabled={busy}
                              onClick={() => skip.mutate({ albumIds: [row.id] })}
                            >
                              Bỏ qua
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
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
              Trang {page}/{pages} · {total} album
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
