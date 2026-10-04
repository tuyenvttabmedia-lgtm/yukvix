import { useEffect, useMemo, useState } from "react";
import { ChevronsUpDown, Link2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { AdminPageHeader, AdminPageShell } from "@/admin";
import AdminLayout from "./AdminLayout";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

type Bucket = "named" | "empty" | "skipped";
type PickedCreator = { id: number; name: string };

export default function AdminCosplayerLink() {
  const utils = trpc.useUtils();
  const [bucket, setBucket] = useState<Bucket>("named");
  const [page, setPage] = useState(1);
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [includeLinked, setIncludeLinked] = useState(false);
  const [selected, setSelected] = useState<number[]>([]);
  const [quickName, setQuickName] = useState("");
  const [rowName, setRowName] = useState<Record<number, string>>({});
  const [picked, setPicked] = useState<PickedCreator | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [creatorQuery, setCreatorQuery] = useState("");
  const [debouncedCreatorQuery, setDebouncedCreatorQuery] = useState("");

  useEffect(() => {
    const t = setTimeout(() => {
      setSearch(searchInput.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedCreatorQuery(creatorQuery.trim()), 200);
    return () => clearTimeout(t);
  }, [creatorQuery]);

  useEffect(() => {
    setSelected([]);
  }, [search, bucket, includeLinked]);

  const { data: counts } = trpc.cosplayerLink.counts.useQuery();
  const { data, isLoading } = trpc.cosplayerLink.list.useQuery({
    bucket,
    page,
    limit: 30,
    search: search || undefined,
    includeLinked: bucket === "named" && includeLinked ? true : undefined,
  });
  const creatorSearch = debouncedCreatorQuery || search || undefined;
  const { data: creatorsData } = trpc.creators.adminNameList.useQuery({
    search: creatorSearch,
    limit: 40,
  });
  const creators = creatorsData?.items ?? [];

  useEffect(() => {
    if (picked || !search) return;
    const exact = creators.find(c => c.name === search);
    if (exact) setPicked(exact);
  }, [creators, picked, search]);

  const invalidate = () => {
    utils.cosplayerLink.counts.invalidate();
    utils.cosplayerLink.list.invalidate();
    utils.cosplayerLink.listIds.invalidate();
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
      setPicked({ id: res.creatorId, name: res.name });
      setCreatorQuery(res.name);
      if (res.linked > 0) {
        toast.success(
          (res.created ? `Đã tạo ${res.name}` : `Đã dùng ${res.name}`) +
            ` — gắn ${res.linked} album`
        );
      } else {
        toast.success(
          (res.created ? `Đã tạo ${res.name}` : `${res.name} đã có`) +
            ". Tìm album theo tên rồi chọn hàng loạt để gắn."
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
  const linkMatching = trpc.cosplayerLink.linkMatching.useMutation({
    onSuccess: res => {
      toast.success(`Đã gắn ${res.linked}/${res.matched} album`);
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
  const someChecked = idsOnPage.some(id => selected.includes(id));
  const unmatchedOnPage = items.filter(row => row.hint && !row.suggested).map(row => row.id);

  const toggleAll = (on: boolean) => {
    setSelected(prev => {
      if (on) {
        const next = new Set(prev);
        for (const id of idsOnPage) next.add(id);
        return Array.from(next);
      }
      return prev.filter(id => !idsOnPage.includes(id));
    });
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
    linkMatching.isPending ||
    skip.isPending ||
    unskip.isPending;

  const pastedName = quickName.trim();
  const runQuick = (albumIds: number[]) => {
    if (!pastedName || busy) return;
    createQuick.mutate({ name: pastedName, albumIds });
  };
  const nameForRow = (id: number) => (rowName[id] ?? "").trim() || pastedName;

  const selectAllMatching = async () => {
    const res = await utils.cosplayerLink.listIds.fetch({
      bucket,
      search: search || undefined,
      includeLinked: bucket === "named" && includeLinked ? true : undefined,
    });
    setSelected(res.ids);
    if (res.total > res.ids.length) {
      toast.message(`Đã chọn ${res.ids.length}/${res.total} album (tối đa 500)`);
    } else {
      toast.success(`Đã chọn ${res.ids.length} album`);
    }
  };

  const attachSelected = () => {
    if (!picked || selected.length === 0) return;
    link.mutate({ albumIds: selected, creatorId: picked.id });
  };

  const attachAllResults = () => {
    if (!picked || !search) return;
    linkMatching.mutate({
      creatorId: picked.id,
      bucket,
      search,
      includeLinked: bucket === "named" && includeLinked ? true : undefined,
    });
  };

  return (
    <AdminLayout>
      <AdminPageShell mode="wide">
        <AdminPageHeader
          icon={Link2}
          title="Gắn Cosplayer"
          subtitle="Tạo đúng tên, tìm album có tên đó, rồi gắn hàng loạt vào hồ sơ vừa tạo."
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
            <p className="text-sm font-medium">Tạo nhanh hồ sơ</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Dán đúng tên cosplayer. Để trống tick nếu chỉ tạo hồ sơ; sau đó tìm album theo tên
              đó và gắn hàng loạt.
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
            </div>
          </div>
        )}

        <div className="mt-3 space-y-2 rounded-md border p-3">
          <p className="text-sm font-medium">Gắn hàng loạt</p>
          <div className="flex flex-wrap items-center gap-2">
            <Input
              value={searchInput}
              onChange={e => setSearchInput(e.target.value)}
              placeholder="Tìm album theo tên cosplayer…"
              className="max-w-xs"
            />
            {bucket === "named" && (
              <label className="flex items-center gap-2 text-xs text-muted-foreground">
                <Checkbox
                  checked={includeLinked}
                  onCheckedChange={v => setIncludeLinked(v === true)}
                />
                Gồm album đã gắn (để gắn lại)
              </label>
            )}
            <span className="text-xs text-muted-foreground">
              {total} album khớp · đã chọn {selected.length}
            </span>
          </div>
          {bucket !== "skipped" && (
            <div className="flex flex-wrap items-center gap-2">
              <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
                <PopoverTrigger asChild>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="min-w-[240px] justify-between"
                  >
                    <span className="truncate">
                      {picked ? picked.name : "Chọn cosplayer đã tạo…"}
                    </span>
                    <ChevronsUpDown className="ml-2 h-3.5 w-3.5 shrink-0 opacity-60" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[280px] p-2" align="start">
                  <Input
                    value={creatorQuery}
                    onChange={e => setCreatorQuery(e.target.value)}
                    placeholder="Gõ tên cosplayer…"
                    autoFocus
                  />
                  <div className="mt-2 max-h-56 overflow-auto">
                    {creators.length === 0 ? (
                      <p className="px-2 py-3 text-xs text-muted-foreground">
                        Không thấy hồ sơ. Tạo nhanh ở trên rồi chọn lại.
                      </p>
                    ) : (
                      creators.map(c => (
                        <button
                          key={c.id}
                          type="button"
                          className={`block w-full rounded px-2 py-1.5 text-left text-sm hover:bg-muted ${
                            picked?.id === c.id ? "bg-muted font-medium" : ""
                          }`}
                          onClick={() => {
                            setPicked(c);
                            setCreatorQuery(c.name);
                            setPickerOpen(false);
                          }}
                        >
                          {c.name}
                        </button>
                      ))
                    )}
                  </div>
                </PopoverContent>
              </Popover>
              <Button
                size="sm"
                variant="secondary"
                disabled={busy || total === 0}
                onClick={() => void selectAllMatching()}
              >
                Chọn tất cả {total > 0 ? total : ""} kết quả
              </Button>
              <Button
                size="sm"
                disabled={busy || !picked || selected.length === 0}
                onClick={attachSelected}
              >
                Gắn đã chọn{picked ? ` → ${picked.name}` : ""}
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={busy || !picked || !search}
                onClick={attachAllResults}
              >
                Gắn tất cả kết quả tìm kiếm
              </Button>
            </div>
          )}
          <div className="flex flex-wrap items-center gap-2">
            {bucket === "named" && (
              <Button
                size="sm"
                variant="ghost"
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
                variant="ghost"
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
            {bucket !== "skipped" ? (
              <Button
                size="sm"
                variant="ghost"
                disabled={busy || selected.length === 0}
                onClick={() => skip.mutate({ albumIds: selected })}
              >
                Bỏ qua đã chọn
              </Button>
            ) : (
              <Button
                size="sm"
                disabled={busy || selected.length === 0}
                onClick={() => unskip.mutate({ albumIds: selected })}
              >
                Đưa lại hàng duyệt
              </Button>
            )}
          </div>
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
                      checked={allChecked ? true : someChecked ? "indeterminate" : false}
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
                          onClick={e => e.stopPropagation()}
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
                          {row.creatorId ? " · đã gắn" : ""}
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
                          {picked && !row.suggested && (
                            <Button
                              size="sm"
                              disabled={busy}
                              onClick={() =>
                                link.mutate({
                                  albumIds: [row.id],
                                  creatorId: picked.id,
                                })
                              }
                            >
                              Gắn {picked.name}
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
              Trang {page}/{pages} · {total} album · chọn {selected.length}
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
