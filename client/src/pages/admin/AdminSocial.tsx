import { useEffect, useMemo, useState } from "react";
import { useSearch } from "wouter";
import { Loader2, Share2 } from "lucide-react";
import { toast } from "sonner";
import AdminLayout from "./AdminLayout";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

type DryRunResult = {
  skipped?: boolean;
  reason?: string;
  payload?: { caption?: string; media?: Array<{ url: string; type: string }> } | null;
  policy?: {
    allowed?: boolean;
    requiresSensitive?: boolean;
    reason?: string;
  };
  risk?: { level?: string };
  media?: {
    items?: Array<{ url: string; type: string }>;
    status?: string;
    truncated?: boolean;
    eligibleCount?: number;
    maxImages?: number;
  };
  duplicate?: { duplicate?: boolean; reason?: string };
};

function formatSocialPostError(lastError: string | null | undefined): string {
  if (!lastError) return "";
  if (/ambiguous publish/i.test(lastError)) {
    return "Unknown publish result — check Telegram before re-sharing.";
  }
  return lastError;
}

function parseConfig(raw: string | null | undefined) {
  if (!raw) return { chatId: "", maxImages: 10, disableNotification: false, protectContent: false };
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    return {
      chatId: String(parsed.chatId ?? parsed.chat_id ?? ""),
      maxImages: Number(parsed.maxImages ?? 10) || 10,
      disableNotification: Boolean(parsed.disableNotification),
      protectContent: Boolean(parsed.protectContent),
    };
  } catch {
    return { chatId: "", maxImages: 10, disableNotification: false, protectContent: false };
  }
}

function formatIntervalMinutes(total: number): string {
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (h > 0 && m > 0) return `${h} giờ ${m} phút`;
  if (h > 0) return `${h} giờ`;
  return `${m} phút`;
}

function formatSocialQueueStatus(
  status: string | null | undefined,
  lastError?: string | null
): string {
  switch (status) {
    case "pending":
      return "Đã xếp hàng, đang gửi";
    case "processing":
      return "Đang gửi";
    case "sent":
      return "Đã lên kênh";
    case "failed":
      return lastError ? `Gửi thất bại: ${formatSocialPostError(lastError)}` : "Gửi thất bại";
    case "skipped":
      return "Đã bỏ qua";
    case "awaiting_approval":
      return "Chờ duyệt";
    default:
      return status || "";
  }
}

const MIN_SCHEDULE_MINUTES = 5;
const MAX_SCHEDULE_MINUTES = 7 * 24 * 60;

function TelegramScheduleCard() {
  const utils = trpc.useUtils();
  const { data: status } = trpc.social.getScheduleStatus.useQuery(undefined, {
    refetchInterval: query => {
      const s = query.state.data?.lastPostStatus;
      return s === "pending" || s === "processing" ? 3000 : false;
    },
  });
  const saveSchedule = trpc.social.saveSchedule.useMutation();
  const runNow = trpc.social.runScheduleNow.useMutation();
  const [enabled, setEnabled] = useState(false);
  const [hours, setHours] = useState(4);
  const [minutes, setMinutes] = useState(0);

  useEffect(() => {
    if (!status) return;
    setEnabled(status.enabled);
  }, [status?.enabled]);

  useEffect(() => {
    if (!status) return;
    setHours(Math.floor(status.intervalMinutes / 60));
    setMinutes(status.intervalMinutes % 60);
  }, [status?.intervalMinutes]);

  const totalMinutes = hours * 60 + minutes;

  const persist = async (nextEnabled: boolean, nextMinutes = totalMinutes) => {
    if (nextEnabled) {
      if (nextMinutes < MIN_SCHEDULE_MINUTES) {
        toast.error(`Chu kỳ tối thiểu ${MIN_SCHEDULE_MINUTES} phút`);
        return false;
      }
      if (nextMinutes > MAX_SCHEDULE_MINUTES) {
        toast.error("Chu kỳ tối đa 7 ngày");
        return false;
      }
    }
    try {
      const saved = await saveSchedule.mutateAsync({
        enabled: nextEnabled,
        intervalMinutes: nextMinutes,
      });
      toast.success(
        nextEnabled
          ? `Đã bật lịch: mỗi ${formatIntervalMinutes(saved.intervalMinutes)} random 1 album chưa lên kênh`
          : "Đã tắt lịch tự share"
      );
      await utils.social.getScheduleStatus.invalidate();
      return true;
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Không lưu được lịch");
      return false;
    }
  };

  const saveInterval = async () => {
    if (totalMinutes < MIN_SCHEDULE_MINUTES) {
      toast.error(`Chu kỳ tối thiểu ${MIN_SCHEDULE_MINUTES} phút`);
      return;
    }
    if (totalMinutes > MAX_SCHEDULE_MINUTES) {
      toast.error("Chu kỳ tối đa 7 ngày");
      return;
    }
    try {
      const saved = await saveSchedule.mutateAsync({
        enabled,
        intervalMinutes: totalMinutes,
      });
      toast.success(`Đã lưu chu kỳ: mỗi ${formatIntervalMinutes(saved.intervalMinutes)}`);
      await utils.social.getScheduleStatus.invalidate();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Không lưu được chu kỳ");
    }
  };

  return (
    <section className="rounded-xl border border-border p-4 space-y-4">
      <h2 className="font-medium">Lịch random Telegram</h2>
      <p className="text-sm text-muted-foreground">
        Không share khi publish album. Hệ thống chọn ngẫu nhiên 1 album
        <span className="text-foreground"> published</span> chưa từng lên kênh này theo chu kỳ bạn đặt
        (tối thiểu {MIN_SCHEDULE_MINUTES} phút, tối đa 7 ngày). Bật lịch xong bài đầu tiên chạy sau đúng
        1 chu kỳ — dùng “Chạy 1 bài ngay” để test.
      </p>
      <div className="flex flex-wrap gap-4 items-end">
        <label className="flex items-center gap-2 text-sm h-9">
          <Switch
            checked={enabled}
            disabled={saveSchedule.isPending}
            onCheckedChange={v => {
              const prev = enabled;
              setEnabled(v);
              void persist(v).then(ok => {
                if (!ok) setEnabled(prev);
              });
            }}
          />
          Bật lịch tự share
        </label>
        <div className="flex items-center gap-2 text-sm">
          <Label className="m-0">Mỗi</Label>
          <Input
            type="number"
            min={0}
            max={168}
            className="w-16 h-9"
            value={hours}
            disabled={saveSchedule.isPending}
            onChange={e => setHours(Math.max(0, Math.min(168, Number(e.target.value) || 0)))}
          />
          <span>giờ</span>
          <Input
            type="number"
            min={0}
            max={59}
            className="w-16 h-9"
            value={minutes}
            disabled={saveSchedule.isPending}
            onChange={e => setMinutes(Math.max(0, Math.min(59, Number(e.target.value) || 0)))}
          />
          <span>phút</span>
          <Button
            type="button"
            variant="secondary"
            disabled={saveSchedule.isPending}
            onClick={() => void saveInterval()}
          >
            Lưu chu kỳ
          </Button>
        </div>
        <Button
          type="button"
          variant="outline"
          disabled={runNow.isPending}
          onClick={async () => {
            try {
              const result = await runNow.mutateAsync();
              if (!result.ran) {
                toast.message(result.reason || "Không có bài để share");
              } else if (result.reason === "duplicate skipped") {
                toast.message("Album trùng — đã bỏ qua");
              } else {
                toast.success(
                  `Đã xếp album #${result.albumId} — worker đang gửi lên Telegram`
                );
              }
              await utils.social.getScheduleStatus.invalidate();
              await utils.social.listPosts.invalidate();
            } catch (err) {
              toast.error(err instanceof Error ? err.message : "Chạy lịch thất bại");
            }
          }}
        >
          {runNow.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
          Chạy 1 bài ngay
        </Button>
      </div>
      <div className="text-sm text-muted-foreground space-y-1">
        <p>Kênh: {status?.accountName || "chưa có tài khoản Telegram enabled"}</p>
        <p>Còn {status?.remaining ?? "—"} album chưa lên kênh</p>
        <p>
          Lần chạy gần nhất:{" "}
          {status?.lastRunAt ? new Date(status.lastRunAt).toLocaleString() : "chưa có"}
          {status?.lastAlbumId ? ` · album #${status.lastAlbumId}` : ""}
          {status?.lastStatusLabel ? ` · ${status.lastStatusLabel}` : ""}
          {status?.lastPostUrl ? (
            <>
              {" · "}
              <a
                href={status.lastPostUrl}
                target="_blank"
                rel="noreferrer"
                className="text-foreground underline"
              >
                mở trên Telegram
              </a>
            </>
          ) : null}
        </p>
        <p>
          Lần tới:{" "}
          {status?.enabled && status.nextRunAt
            ? new Date(status.nextRunAt).toLocaleString()
            : "—"}
        </p>
      </div>
    </section>
  );
}

export default function AdminSocial() {
  const search = useSearch();
  const albumFromQuery = Number(new URLSearchParams(search).get("albumId") || "") || 0;
  const utils = trpc.useUtils();
  const { data: accounts, isLoading } = trpc.social.listAccounts.useQuery();
  const { data: posts } = trpc.social.listPosts.useQuery(
    { limit: 30 },
    {
      refetchInterval: query => {
        const rows = query.state.data ?? [];
        return rows.some(p => p.status === "pending" || p.status === "processing")
          ? 3000
          : false;
      },
    }
  );
  const { data: keyStatus } = trpc.social.getCredentialsKeyStatus.useQuery();
  const upsert = trpc.social.upsertAccount.useMutation();
  const validate = trpc.social.validateAccount.useMutation();
  const dryRun = trpc.social.dryRun.useMutation();
  const share = trpc.social.createManualShare.useMutation();
  const saveKey = trpc.social.saveCredentialsKey.useMutation();
  const removeAccount = trpc.social.deleteAccount.useMutation();
  const [pasteKey, setPasteKey] = useState("");
  const [testedAccountId, setTestedAccountId] = useState<number | null>(null);

  const telegramAccounts = (accounts ?? []).filter(a => a.platform === "telegram");

  const [form, setForm] = useState({
    id: undefined as number | undefined,
    displayName: "Yukvix Telegram",
    botToken: "",
    chatId: "",
    maxImages: 10,
    isEnabled: true,
    disableNotification: false,
    protectContent: false,
  });
  const [albumId, setAlbumId] = useState(albumFromQuery || "");
  const [albumSearch, setAlbumSearch] = useState("");
  const [debouncedAlbumSearch, setDebouncedAlbumSearch] = useState("");
  const [accountId, setAccountId] = useState<number | "">("");
  const [force, setForce] = useState(false);
  const [sendNow, setSendNow] = useState(true);
  const [preview, setPreview] = useState<DryRunResult | null>(null);
  const [validateResult, setValidateResult] = useState<{
    ok: boolean;
    info?: { handle?: string; displayName?: string; targetChat?: string };
    reason?: string;
  } | null>(null);

  useEffect(() => {
    if (albumFromQuery) setAlbumId(albumFromQuery);
  }, [albumFromQuery]);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedAlbumSearch(albumSearch.trim()), 300);
    return () => clearTimeout(t);
  }, [albumSearch]);

  const selectedAlbumId = Number(albumId) || 0;
  const { data: selectedAlbum } = trpc.albums.byId.useQuery(
    { id: selectedAlbumId },
    { enabled: selectedAlbumId > 0 }
  );
  const { data: albumChoices } = trpc.albums.adminList.useQuery({
    page: 1,
    limit: 15,
    status: "published",
    search: debouncedAlbumSearch || undefined,
    sortBy: "newest",
  });

  useEffect(() => {
    if (accountId === "" && telegramAccounts[0]) setAccountId(telegramAccounts[0].id);
  }, [accountId, telegramAccounts]);

  const selectedAccount = useMemo(
    () => telegramAccounts.find(a => a.id === accountId),
    [telegramAccounts, accountId]
  );

  const saveAccount = async () => {
    try {
      await upsert.mutateAsync({
        id: form.id,
        platform: "telegram",
        displayName: form.displayName,
        isEnabled: form.isEnabled,
        autoShare: false,
        configJson: JSON.stringify({
          chatId: form.chatId,
          maxImages: form.maxImages,
          disableNotification: form.disableNotification,
          protectContent: form.protectContent,
        }),
        credentials: form.botToken
          ? { botToken: form.botToken, chatId: form.chatId }
          : form.id
            ? undefined
            : { botToken: form.botToken, chatId: form.chatId },
      });
      setForm(f => ({ ...f, botToken: "" }));
      toast.success("Đã lưu tài khoản Telegram");
      await utils.social.listAccounts.invalidate();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Không lưu được tài khoản");
    }
  };

  const runValidate = async (id: number) => {
    setValidateResult(null);
    setTestedAccountId(id);
    try {
      const result = await validate.mutateAsync({ accountId: id });
      setValidateResult(result);
      if (result.ok) {
        toast.success(
          `Kết nối OK · Bot ${result.info?.handle || result.info?.displayName || ""} · Target ${result.info?.targetChat || ""}`
        );
      } else {
        toast.error(result.reason || "Test kết nối thất bại");
      }
    } catch (err) {
      setValidateResult({
        ok: false,
        reason: err instanceof Error ? err.message : "Test kết nối thất bại",
      });
      toast.error(err instanceof Error ? err.message : "Test kết nối thất bại");
    }
  };

  const runDelete = async (id: number, label: string) => {
    if (
      !window.confirm(
        `Xóa tài khoản "${label}"? Token đã mã hóa sẽ bị xóa. Album không bị đụng.`
      )
    ) {
      return;
    }
    try {
      await removeAccount.mutateAsync({ id });
      toast.success("Đã xóa tài khoản Telegram");
      if (form.id === id) {
        setForm(f => ({ ...f, id: undefined, botToken: "", chatId: "" }));
      }
      if (accountId === id) setAccountId("");
      if (testedAccountId === id) {
        setTestedAccountId(null);
        setValidateResult(null);
      }
      await utils.social.listAccounts.invalidate();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Không xóa được tài khoản");
    }
  };

  const runPreview = async () => {
    if (!albumId || !accountId) return;
    try {
      const result = await dryRun.mutateAsync({
        albumId: Number(albumId),
        accountId: Number(accountId),
      });
      setPreview(result as DryRunResult);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Dry-run failed");
    }
  };

  const confirmShare = async () => {
    if (!albumId || !accountId) return;
    try {
      const result = await share.mutateAsync({
        albumId: Number(albumId),
        accountId: Number(accountId),
        force,
        scheduledAt: sendNow ? new Date() : undefined,
      });
      toast.success(
        result.duplicate
          ? "Đã có post trùng — dùng Force để share lại"
          : `Đã tạo social post #${result.id}`
      );
      await utils.social.listPosts.invalidate();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Share failed");
    }
  };

  const media = preview?.payload?.media ?? preview?.media?.items ?? [];

  return (
    <AdminLayout>
      <div className="p-6 max-w-4xl space-y-8">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Telegram Manual Share</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Manual share khi bạn chọn album. Lịch tự động random 1 bài theo chu kỳ tùy chọn, không share lúc publish album.
            Token không bao giờ được hiển thị lại sau khi lưu.
          </p>
        </div>

        <section className="rounded-xl border border-border p-4 space-y-4">
          <h2 className="font-medium">Khóa mã hóa credential</h2>
          <p className="text-sm text-muted-foreground">
            Dùng AES-256-GCM để mã hóa bot token, giống API key của AI/Wasabi — cấu hình tại đây, không cần sửa .env.
            Đổi khóa sẽ làm token đã lưu không giải mã được; lúc đó phải nhập lại bot token.
          </p>
          <p className="text-sm">
            {keyStatus?.configured
              ? `Đã cấu hình (${keyStatus.source === "db" ? "admin" : ".env"}) · ${keyStatus.hint}`
              : "Chưa cấu hình — tạo khóa trước khi lưu tài khoản Telegram."}
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              onClick={async () => {
                if (
                  keyStatus?.configured &&
                  !window.confirm(
                    "Tạo khóa mới sẽ làm token Telegram đã lưu không giải mã được. Tiếp tục?"
                  )
                ) {
                  return;
                }
                try {
                  const result = await saveKey.mutateAsync({});
                  toast.success(`Đã tạo khóa mã hóa (${result.hint})`);
                  await utils.social.getCredentialsKeyStatus.invalidate();
                } catch (err) {
                  toast.error(err instanceof Error ? err.message : "Không tạo được khóa");
                }
              }}
              disabled={saveKey.isPending}
            >
              {saveKey.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
              {keyStatus?.configured ? "Tạo khóa mới" : "Tạo khóa mã hóa"}
            </Button>
          </div>
          <div className="grid sm:grid-cols-[1fr_auto] gap-2 items-end">
            <div>
              <Label>Dán khóa có sẵn (tùy chọn)</Label>
              <Input
                type="password"
                autoComplete="off"
                value={pasteKey}
                placeholder="64 ký tự hex hoặc base64 32-byte"
                onChange={e => setPasteKey(e.target.value)}
              />
            </div>
            <Button
              type="button"
              variant="outline"
              disabled={saveKey.isPending || !pasteKey.trim()}
              onClick={async () => {
                try {
                  const result = await saveKey.mutateAsync({ key: pasteKey.trim() });
                  setPasteKey("");
                  toast.success(`Đã lưu khóa (${result.hint})`);
                  await utils.social.getCredentialsKeyStatus.invalidate();
                } catch (err) {
                  toast.error(err instanceof Error ? err.message : "Khóa không hợp lệ");
                }
              }}
            >
              Lưu khóa
            </Button>
          </div>
        </section>

        <section className="rounded-xl border border-border p-4 space-y-4">
          <h2 className="font-medium">Tài khoản Telegram</h2>
          <div className="grid sm:grid-cols-2 gap-3">
            <div>
              <Label>Tên hiển thị</Label>
              <Input
                value={form.displayName}
                onChange={e => setForm(f => ({ ...f, displayName: e.target.value }))}
              />
            </div>
            <div>
              <Label>Chat / Channel ID</Label>
              <Input
                value={form.chatId}
                placeholder="@channel hoặc -100..."
                onChange={e => setForm(f => ({ ...f, chatId: e.target.value }))}
              />
            </div>
            <div>
              <Label>Bot token</Label>
              <Input
                type="password"
                autoComplete="off"
                value={form.botToken}
                placeholder={form.id ? "•••••••• (để trống nếu giữ token cũ)" : "123456:ABC..."}
                onChange={e => setForm(f => ({ ...f, botToken: e.target.value }))}
              />
            </div>
            <div>
              <Label>Max images</Label>
              <Input
                type="number"
                min={1}
                max={10}
                value={form.maxImages}
                onChange={e =>
                  setForm(f => ({ ...f, maxImages: Number(e.target.value) || 10 }))
                }
              />
            </div>
          </div>
          <div className="flex flex-wrap gap-4 items-center">
            <label className="flex items-center gap-2 text-sm">
              <Switch
                checked={form.isEnabled}
                onCheckedChange={v => setForm(f => ({ ...f, isEnabled: v }))}
              />
              Enabled
            </label>
            <label className="flex items-center gap-2 text-sm">
              <Switch
                checked={form.disableNotification}
                onCheckedChange={v => setForm(f => ({ ...f, disableNotification: v }))}
              />
              Silent
            </label>
            <label className="flex items-center gap-2 text-sm text-muted-foreground">
              Auto-share lúc publish: tắt. Dùng lịch random bên dưới.
            </label>
          </div>
          <Button onClick={saveAccount} disabled={upsert.isPending || !keyStatus?.configured}>
            {upsert.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
            Lưu tài khoản
          </Button>

          {isLoading ? (
            <p className="text-sm text-muted-foreground">Đang tải…</p>
          ) : (
            <ul className="space-y-2">
              {telegramAccounts.map(account => {
                const cfg = parseConfig(account.configJson);
                return (
                  <li
                    key={account.id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-secondary/40 px-3 py-2 text-sm"
                  >
                    <div>
                      <p className="font-medium">{account.displayName}</p>
                      <p className="text-muted-foreground">
                        Target: {cfg.chatId || "—"} · {account.hasCredentials ? "token đã mã hóa" : "chưa có token"}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setForm({
                            id: account.id,
                            displayName: account.displayName,
                            botToken: "",
                            chatId: cfg.chatId,
                            maxImages: cfg.maxImages,
                            isEnabled: account.isEnabled,
                            disableNotification: cfg.disableNotification,
                            protectContent: cfg.protectContent,
                          });
                        }}
                      >
                        Sửa
                      </Button>
                      <Button
                        size="sm"
                        variant="secondary"
                        disabled={validate.isPending}
                        onClick={() => runValidate(account.id)}
                      >
                        {validate.isPending && testedAccountId === account.id ? (
                          <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                        ) : null}
                        Test kết nối
                      </Button>
                      <Button
                        size="sm"
                        variant="destructive"
                        disabled={removeAccount.isPending}
                        onClick={() =>
                          runDelete(account.id, `${account.displayName} · ${cfg.chatId || "no target"}`)
                        }
                      >
                        Xóa
                      </Button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
          <div className="rounded-lg border border-border bg-secondary/30 p-3 space-y-1">
            <p className="text-sm font-medium">Kết quả test kết nối</p>
            <p className="text-xs text-muted-foreground">
              Gọi Telegram getMe + getChat. Token không bao giờ được trả về trình duyệt.
            </p>
            {validate.isPending ? (
              <p className="text-sm text-muted-foreground flex items-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin" /> Đang gọi Telegram Bot API…
              </p>
            ) : validateResult ? (
              <div
                className={
                  validateResult.ok
                    ? "text-sm text-emerald-500 space-y-0.5"
                    : "text-sm text-destructive space-y-0.5"
                }
              >
                {validateResult.ok ? (
                  <>
                    <p>Connected</p>
                    <p>
                      Bot: {validateResult.info?.handle || validateResult.info?.displayName || "ok"}
                    </p>
                    <p>Target: {validateResult.info?.targetChat || "ok"}</p>
                  </>
                ) : (
                  <p>Failed · {validateResult.reason}</p>
                )}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                Bấm <span className="text-foreground">Test kết nối</span> trên tài khoản cần kiểm tra.
              </p>
            )}
          </div>
        </section>

        <TelegramScheduleCard />

        <section className="rounded-xl border border-border p-4 space-y-4">
          <h2 className="font-medium flex items-center gap-2">
            <Share2 className="w-4 h-4" /> Manual Share
          </h2>
          <p className="text-sm text-muted-foreground">
            Chọn album đã xuất bản ở đây, hoặc vào <span className="text-foreground">Album</span> bấm icon Share.
            Trang album public không hiện ID — không cần copy từ URL.
          </p>
          <div className="grid sm:grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Album đã xuất bản</Label>
              <Input
                value={albumSearch}
                onChange={e => setAlbumSearch(e.target.value)}
                placeholder="Tìm theo tên hoặc slug…"
              />
              <div className="max-h-48 overflow-y-auto rounded-md border border-border divide-y divide-border">
                {(albumChoices?.items ?? []).map(album => (
                  <button
                    key={album.id}
                    type="button"
                    className={`w-full text-left px-3 py-2 text-sm hover:bg-secondary/60 ${
                      Number(albumId) === album.id ? "bg-secondary" : ""
                    }`}
                    onClick={() => {
                      setAlbumId(album.id);
                      setPreview(null);
                    }}
                  >
                    <span className="font-medium">{album.title}</span>
                    <span className="block text-xs text-muted-foreground">
                      #{album.id} · {album.slug} · {album.photoCount} ảnh
                      {album.isVip ? " · VIP" : ""}
                    </span>
                  </button>
                ))}
                {(albumChoices?.items ?? []).length === 0 && (
                  <p className="px-3 py-2 text-xs text-muted-foreground">Không có album published khớp tìm kiếm.</p>
                )}
              </div>
              {selectedAlbum ? (
                <p className="text-xs text-muted-foreground">
                  Đang chọn: #{selectedAlbum.id} · {selectedAlbum.title} ({selectedAlbum.status})
                </p>
              ) : selectedAlbumId ? (
                <p className="text-xs text-muted-foreground">Album ID {selectedAlbumId}</p>
              ) : (
                <p className="text-xs text-muted-foreground">Chưa chọn album.</p>
              )}
            </div>
            <div>
              <Label>Telegram account</Label>
              <select
                className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm"
                value={accountId}
                onChange={e => setAccountId(Number(e.target.value))}
              >
                {telegramAccounts.map(account => (
                  <option key={account.id} value={account.id}>
                    {account.displayName}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="flex flex-wrap gap-4 text-sm">
            <label className="flex items-center gap-2">
              <Switch checked={sendNow} onCheckedChange={setSendNow} />
              Gửi ngay (bỏ delay mặc định)
            </label>
            <label className="flex items-center gap-2">
              <Switch checked={force} onCheckedChange={setForce} />
              Force re-share
            </label>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={runPreview} disabled={dryRun.isPending}>
              {dryRun.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
              Dry run / Preview
            </Button>
            <Button onClick={confirmShare} disabled={share.isPending || !preview}>
              {share.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
              Confirm share
            </Button>
          </div>
          {preview && (
            <div className="rounded-lg bg-secondary/40 p-3 text-sm space-y-2">
              <p>Platform: Telegram</p>
              <p>Account: {selectedAccount?.displayName || accountId}</p>
              <p>Policy: {preview.policy?.allowed ? "allowed" : `blocked (${preview.policy?.reason || preview.reason || "—"})`}</p>
              <p>Risk: {preview.risk?.level || "—"}</p>
              <p>Sensitive: {preview.policy?.requiresSensitive ? "yes (has_spoiler)" : "no"}</p>
              <p>
                Images: {media.length}
                {preview.media?.truncated
                  ? ` of ${preview.media.eligibleCount} eligible (capped at ${preview.media.maxImages})`
                  : ""}
              </p>
              <p>Schedule: {sendNow ? "now" : "default Telegram delay"}</p>
              {preview.duplicate?.duplicate && (
                <p className="text-amber-500">Duplicate: {preview.duplicate.reason}</p>
              )}
              <pre className="whitespace-pre-wrap text-xs bg-background/60 rounded p-2 max-h-40 overflow-auto">
                {preview.payload?.caption || "(no caption)"}
              </pre>
              <div className="flex gap-2 overflow-x-auto">
                {media.map(item => (
                  <img
                    key={item.url}
                    src={item.url}
                    alt={item.type}
                    className="w-16 h-16 object-cover rounded"
                  />
                ))}
              </div>
            </div>
          )}
        </section>

        <section className="rounded-xl border border-border p-4 space-y-2">
          <h2 className="font-medium">Recent posts</h2>
          <div className="overflow-x-auto text-sm">
            <table className="w-full">
              <thead className="text-muted-foreground text-left">
                <tr>
                  <th className="py-1">ID</th>
                  <th>Album</th>
                  <th>Status</th>
                  <th>External</th>
                  <th>Error</th>
                </tr>
              </thead>
              <tbody>
                {(posts ?? []).map(post => (
                  <tr key={post.id} className="border-t border-border">
                    <td className="py-1">{post.id}</td>
                    <td>{post.albumId}</td>
                    <td>
                      {formatSocialQueueStatus(post.status, post.lastError)}
                    </td>
                    <td className="truncate max-w-[12rem]">
                      {post.externalUrl || post.externalPostId || "—"}
                    </td>
                    <td className="truncate max-w-[16rem] text-destructive">
                      {formatSocialPostError(post.lastError)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </AdminLayout>
  );
}
