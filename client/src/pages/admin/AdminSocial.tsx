import { useEffect, useMemo, useState } from "react";
import { useSearch } from "wouter";
import { ChevronDown, Loader2, Share2 } from "lucide-react";
import { toast } from "sonner";
import {
  AdminPageHeader,
  AdminPageShell,
  AdminStatusBadge,
  type AdminStatus,
} from "@/admin";
import AdminLayout from "./AdminLayout";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";

type SocialPlatformTab = "telegram" | "mastodon" | "bluesky" | "x";

const PLATFORM_TABS: Array<{ id: SocialPlatformTab; label: string; ready: boolean }> = [
  { id: "telegram", label: "Telegram", ready: true },
  { id: "mastodon", label: "Mastodon", ready: true },
  { id: "bluesky", label: "Bluesky", ready: true },
  { id: "x", label: "X", ready: true },
];

function defaultDisplayName(platform: SocialPlatformTab): string {
  if (platform === "telegram") return "Yukvix Telegram";
  if (platform === "mastodon") return "Yukvix Mastodon";
  if (platform === "bluesky") return "Yukvix Bluesky";
  return "Yukvix X";
}

const RECENT_POSTS_DEFAULT = 10;
const RECENT_POSTS_MORE = 30;

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
  if (!raw) {
    return {
      chatId: "",
      maxImages: 10,
      disableNotification: false,
      protectContent: false,
      instanceUrl: "",
      identifier: "",
      pdsUrl: "https://bsky.social",
    };
  }
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    return {
      chatId: String(parsed.chatId ?? parsed.chat_id ?? ""),
      maxImages: Number(parsed.maxImages ?? 10) || 10,
      disableNotification: Boolean(parsed.disableNotification),
      protectContent: Boolean(parsed.protectContent),
      instanceUrl: String(parsed.instanceUrl ?? parsed.instance_url ?? ""),
      identifier: String(parsed.identifier ?? parsed.handle ?? ""),
      pdsUrl: String(parsed.pdsUrl ?? parsed.pds_url ?? "https://bsky.social"),
    };
  } catch {
    return {
      chatId: "",
      maxImages: 10,
      disableNotification: false,
      protectContent: false,
      instanceUrl: "",
      identifier: "",
      pdsUrl: "https://bsky.social",
    };
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
      return "Đang xếp hàng";
    case "processing":
      return "Đang gửi";
    case "sent":
      return "Đã lên kênh";
    case "failed":
      return lastError ? `Thất bại: ${formatSocialPostError(lastError)}` : "Thất bại";
    case "skipped":
      return "Bỏ qua";
    case "awaiting_approval":
      return "Chờ duyệt";
    case "cancelled":
      return "Đã hủy";
    default:
      return status || "";
  }
}

function queueStatusForBadge(status: string): AdminStatus {
  if (status === "sent") return "published";
  if (status === "awaiting_approval") return "waiting";
  if (
    status === "processing" ||
    status === "pending" ||
    status === "failed" ||
    status === "skipped" ||
    status === "cancelled"
  ) {
    return status;
  }
  return "pending";
}

const MIN_SCHEDULE_MINUTES = 5;
const MAX_SCHEDULE_MINUTES = 7 * 24 * 60;

function SocialScheduleCard({
  platform,
  label,
}: {
  platform: "telegram" | "mastodon" | "bluesky" | "x";
  label: string;
}) {
  const utils = trpc.useUtils();
  const { data: status } = trpc.social.getScheduleStatus.useQuery(
    { platform },
    {
      refetchInterval: query => {
        const s = query.state.data?.lastPostStatus;
        return s === "pending" || s === "processing" ? 3000 : false;
      },
    }
  );
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
        platform,
        enabled: nextEnabled,
        intervalMinutes: nextMinutes,
      });
      toast.success(
        nextEnabled
          ? `Đã bật lịch: mỗi ${formatIntervalMinutes(saved.intervalMinutes)}`
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
        platform,
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
    <section className="rounded-xl border border-border p-4 space-y-3 h-full">
      <div>
        <h2 className="font-medium">Lịch random {label}</h2>
        <p className="text-xs text-muted-foreground mt-0.5">
          Không share lúc publish. Random 1 album chưa lên kênh · tối thiểu {MIN_SCHEDULE_MINUTES} phút.
        </p>
      </div>
      <label className="flex items-center gap-2 text-sm">
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
        Bật lịch
      </label>
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <Label className="m-0">Mỗi</Label>
        <Input
          type="number"
          min={0}
          max={168}
          className="w-16 h-8"
          value={hours}
          disabled={saveSchedule.isPending}
          onChange={e => setHours(Math.max(0, Math.min(168, Number(e.target.value) || 0)))}
        />
        <span>giờ</span>
        <Input
          type="number"
          min={0}
          max={59}
          className="w-16 h-8"
          value={minutes}
          disabled={saveSchedule.isPending}
          onChange={e => setMinutes(Math.max(0, Math.min(59, Number(e.target.value) || 0)))}
        />
        <span>phút</span>
        <Button
          type="button"
          size="sm"
          variant="secondary"
          disabled={saveSchedule.isPending}
          onClick={() => void saveInterval()}
        >
          Lưu
        </Button>
      </div>
      <Button
        type="button"
        size="sm"
        variant="outline"
        disabled={runNow.isPending}
        onClick={async () => {
          try {
              const result = await runNow.mutateAsync({ platform });
            if (!result.ran) {
              toast.message(result.reason || "Không có bài để share");
            } else if (result.reason === "duplicate skipped") {
              toast.message("Album trùng — đã bỏ qua");
            } else {
              toast.success(`Đã xếp album #${result.albumId} — worker đang gửi`);
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
      <dl className="text-xs text-muted-foreground grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
        <dt>Kênh</dt>
        <dd className="text-foreground">{status?.accountName || "chưa có tài khoản enabled"}</dd>
        <dt>Còn lại</dt>
        <dd>{status?.remaining ?? "—"} album chưa lên kênh</dd>
        <dt>Gần nhất</dt>
        <dd>
          {status?.lastRunAt ? new Date(status.lastRunAt).toLocaleString() : "chưa có"}
          {status?.lastAlbumId ? ` · #${status.lastAlbumId}` : ""}
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
                {label}
              </a>
            </>
          ) : null}
        </dd>
        <dt>Lần tới</dt>
        <dd>
          {status?.enabled && status.nextRunAt
            ? new Date(status.nextRunAt).toLocaleString()
            : "—"}
        </dd>
      </dl>
    </section>
  );
}

export default function AdminSocial() {
  const search = useSearch();
  const albumFromQuery = Number(new URLSearchParams(search).get("albumId") || "") || 0;
  const utils = trpc.useUtils();
  const [platform, setPlatform] = useState<SocialPlatformTab>("telegram");
  const [postLimit, setPostLimit] = useState(RECENT_POSTS_DEFAULT);
  const { data: accounts, isLoading } = trpc.social.listAccounts.useQuery();
  const { data: posts } = trpc.social.listPosts.useQuery(
    { limit: postLimit, platform },
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
  const [keyOpen, setKeyOpen] = useState(false);
  const [accountFormOpen, setAccountFormOpen] = useState(true);
  const [shareOpen, setShareOpen] = useState(Boolean(albumFromQuery));

  const platformAccounts = (accounts ?? []).filter(a => a.platform === platform);

  const [form, setForm] = useState({
    id: undefined as number | undefined,
    displayName: "Yukvix Telegram",
    botToken: "",
    chatId: "",
    instanceUrl: "",
    accessToken: "",
    identifier: "",
    appPassword: "",
    pdsUrl: "https://bsky.social",
    apiKey: "",
    apiSecret: "",
    accessTokenSecret: "",
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
    if (albumFromQuery) {
      setAlbumId(albumFromQuery);
      setShareOpen(true);
    }
  }, [albumFromQuery]);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedAlbumSearch(albumSearch.trim()), 300);
    return () => clearTimeout(t);
  }, [albumSearch]);

  useEffect(() => {
    if (keyStatus && !keyStatus.configured) setKeyOpen(true);
  }, [keyStatus]);

  useEffect(() => {
    if (!accounts) return;
    setAccountFormOpen(platformAccounts.length === 0);
  }, [accounts, platformAccounts.length]);

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
    if (accountId === "" && platformAccounts[0]) setAccountId(platformAccounts[0].id);
  }, [accountId, platformAccounts]);

  useEffect(() => {
    setAccountId("");
    setPreview(null);
    setValidateResult(null);
    setForm({
      id: undefined,
      displayName: defaultDisplayName(platform),
      botToken: "",
      chatId: "",
      instanceUrl: "",
      accessToken: "",
      identifier: "",
      appPassword: "",
      pdsUrl: "https://bsky.social",
      apiKey: "",
      apiSecret: "",
      accessTokenSecret: "",
      maxImages: platform === "telegram" ? 10 : 4,
      isEnabled: true,
      disableNotification: false,
      protectContent: false,
    });
  }, [platform]);

  const selectedAccount = useMemo(
    () => platformAccounts.find(a => a.id === accountId),
    [platformAccounts, accountId]
  );

  const saveAccount = async () => {
    try {
      const credentials =
        platform === "telegram"
          ? form.botToken
            ? { botToken: form.botToken, chatId: form.chatId }
            : form.id
              ? undefined
              : { botToken: form.botToken, chatId: form.chatId }
          : platform === "mastodon"
            ? form.accessToken
              ? { instanceUrl: form.instanceUrl, accessToken: form.accessToken }
              : form.id
                ? undefined
                : { instanceUrl: form.instanceUrl, accessToken: form.accessToken }
            : platform === "bluesky"
              ? form.appPassword
                ? {
                    identifier: form.identifier,
                    appPassword: form.appPassword,
                    pdsUrl: form.pdsUrl,
                  }
                : form.id
                  ? undefined
                  : {
                      identifier: form.identifier,
                      appPassword: form.appPassword,
                      pdsUrl: form.pdsUrl,
                    }
              : form.apiKey && form.apiSecret && form.accessToken && form.accessTokenSecret
                ? {
                    apiKey: form.apiKey,
                    apiSecret: form.apiSecret,
                    accessToken: form.accessToken,
                    accessTokenSecret: form.accessTokenSecret,
                  }
                : form.id
                  ? undefined
                  : {
                      apiKey: form.apiKey,
                      apiSecret: form.apiSecret,
                      accessToken: form.accessToken,
                      accessTokenSecret: form.accessTokenSecret,
                    };
      const configJson =
        platform === "telegram"
          ? JSON.stringify({
              chatId: form.chatId,
              maxImages: form.maxImages,
              disableNotification: form.disableNotification,
              protectContent: form.protectContent,
            })
          : platform === "mastodon"
            ? JSON.stringify({
                instanceUrl: form.instanceUrl,
                maxImages: form.maxImages,
                visibility: "public",
              })
            : platform === "bluesky"
              ? JSON.stringify({
                  identifier: form.identifier,
                  pdsUrl: form.pdsUrl,
                  maxImages: form.maxImages,
                })
              : JSON.stringify({ maxImages: form.maxImages });
      await upsert.mutateAsync({
        id: form.id,
        platform,
        displayName: form.displayName,
        isEnabled: form.isEnabled,
        autoShare: false,
        configJson,
        credentials,
      });
      setForm(f => ({
        ...f,
        botToken: "",
        accessToken: "",
        appPassword: "",
        apiKey: "",
        apiSecret: "",
        accessTokenSecret: "",
      }));
      setAccountFormOpen(false);
      toast.success(`Đã lưu tài khoản ${platform}`);
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
      toast.success(`Đã xóa tài khoản ${platform}`);
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
      <AdminPageShell mode="wide">
        <AdminPageHeader
          icon={Share2}
          title="Social Distribution"
          subtitle="Cấu hình theo từng MXH. Token không hiện lại sau khi lưu. Không auto-share lúc publish album."
        />

        <Collapsible open={keyOpen} onOpenChange={setKeyOpen} className="mb-4">
          <section className="rounded-xl border border-border px-4 py-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="min-w-0">
                <h2 className="text-sm font-medium">Khóa mã hóa credential</h2>
                <p className="text-xs text-muted-foreground">
                  {keyStatus?.configured
                    ? `Đã cấu hình (${keyStatus.source === "db" ? "admin" : ".env"}) · ${keyStatus.hint}`
                    : "Chưa có khóa — tạo trước khi lưu tài khoản."}
                </p>
              </div>
              <CollapsibleTrigger asChild>
                <Button type="button" variant="ghost" size="sm" className="gap-1">
                  {keyOpen ? "Thu gọn" : keyStatus?.configured ? "Đổi khóa" : "Cấu hình"}
                  <ChevronDown className={`w-4 h-4 transition-transform ${keyOpen ? "rotate-180" : ""}`} />
                </Button>
              </CollapsibleTrigger>
            </div>
            <CollapsibleContent className="pt-3 space-y-3">
              <p className="text-xs text-muted-foreground">
                AES-256-GCM, dùng chung cho mọi MXH. Đổi khóa sẽ làm token đã lưu không giải mã được.
              </p>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  size="sm"
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
                  <Label>Dán khóa có sẵn</Label>
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
            </CollapsibleContent>
          </section>
        </Collapsible>

        <Tabs
          value={platform}
          onValueChange={v => {
            setPlatform(v as SocialPlatformTab);
            setPostLimit(RECENT_POSTS_DEFAULT);
          }}
        >
          <TabsList className="h-auto w-full flex-wrap justify-start sm:w-fit">
            {PLATFORM_TABS.map(tab => (
              <TabsTrigger key={tab.id} value={tab.id} className="px-3">
                {tab.label}
                {!tab.ready ? (
                  <span className="text-[10px] text-muted-foreground ml-1">sắp</span>
                ) : null}
              </TabsTrigger>
            ))}
          </TabsList>

          {PLATFORM_TABS.filter(tab => tab.ready).map(tab => (
          <TabsContent key={tab.id} value={tab.id} className="mt-4 space-y-4">
            <div className="grid gap-4 xl:grid-cols-2 items-start">
              <section className="rounded-xl border border-border p-4 space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h2 className="font-medium">Tài khoản</h2>
                    <p className="text-xs text-muted-foreground">
                      Auto-share lúc publish: tắt. Dùng lịch bên phải.
                    </p>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setForm({
                        id: undefined,
                        displayName: defaultDisplayName(platform),
                        botToken: "",
                        chatId: "",
                        instanceUrl: "",
                        accessToken: "",
                        identifier: "",
                        appPassword: "",
                        pdsUrl: "https://bsky.social",
                        apiKey: "",
                        apiSecret: "",
                        accessTokenSecret: "",
                        maxImages: platform === "telegram" ? 10 : 4,
                        isEnabled: true,
                        disableNotification: false,
                        protectContent: false,
                      });
                      setAccountFormOpen(true);
                    }}
                  >
                    Thêm
                  </Button>
                </div>

                {isLoading ? (
                  <p className="text-sm text-muted-foreground">Đang tải…</p>
                ) : (
                  <ul className="space-y-2">
                    {platformAccounts.map(account => {
                      const cfg = parseConfig(account.configJson);
                      return (
                        <li
                          key={account.id}
                          className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-secondary/40 px-3 py-2 text-sm"
                        >
                          <div className="min-w-0">
                            <p className="font-medium truncate">{account.displayName}</p>
                            <p className="text-xs text-muted-foreground truncate">
                              {cfg.chatId ||
                                cfg.instanceUrl ||
                                cfg.identifier ||
                                (platform === "x" ? "OAuth 1.0a" : "—")}{" "}
                              ·{" "}
                              {account.hasCredentials ? "credential đã mã hóa" : "chưa có credential"}
                              {account.isEnabled ? "" : " · tắt"}
                            </p>
                          </div>
                          <div className="flex flex-wrap gap-1">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                setForm({
                                  id: account.id,
                                  displayName: account.displayName,
                                  botToken: "",
                                  chatId: cfg.chatId,
                                  instanceUrl: cfg.instanceUrl,
                                  accessToken: "",
                                  identifier: cfg.identifier,
                                  appPassword: "",
                                  pdsUrl: cfg.pdsUrl,
                                  apiKey: "",
                                  apiSecret: "",
                                  accessTokenSecret: "",
                                  maxImages: cfg.maxImages,
                                  isEnabled: account.isEnabled,
                                  disableNotification: cfg.disableNotification,
                                  protectContent: cfg.protectContent,
                                });
                                setAccountFormOpen(true);
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
                              Test
                            </Button>
                            <Button
                              size="sm"
                              variant="destructive"
                              disabled={removeAccount.isPending}
                              onClick={() =>
                                runDelete(
                                  account.id,
                                  `${account.displayName} · ${cfg.chatId || "no target"}`
                                )
                              }
                            >
                              Xóa
                            </Button>
                          </div>
                        </li>
                      );
                    })}
                    {platformAccounts.length === 0 ? (
                      <p className="text-sm text-muted-foreground">Chưa có tài khoản {platform}.</p>
                    ) : null}
                  </ul>
                )}

                {validateResult ? (
                  <p
                    className={`text-xs ${validateResult.ok ? "text-emerald-500" : "text-destructive"}`}
                  >
                    {validateResult.ok
                      ? `Connected · ${validateResult.info?.handle || validateResult.info?.displayName || "ok"} · ${validateResult.info?.targetChat || ""}`
                      : `Failed · ${validateResult.reason}`}
                  </p>
                ) : null}

                <Collapsible open={accountFormOpen} onOpenChange={setAccountFormOpen}>
                  <CollapsibleContent className="space-y-3 pt-1">
                    <div className="grid sm:grid-cols-2 gap-3">
                      <div>
                        <Label>Tên hiển thị</Label>
                        <Input
                          value={form.displayName}
                          onChange={e => setForm(f => ({ ...f, displayName: e.target.value }))}
                        />
                      </div>
                      {platform === "telegram" ? (
                        <>
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
                        </>
                      ) : null}
                      {platform === "mastodon" ? (
                        <>
                          <div>
                            <Label>Instance URL</Label>
                            <Input
                              value={form.instanceUrl}
                              placeholder="https://mastodon.social"
                              onChange={e => setForm(f => ({ ...f, instanceUrl: e.target.value }))}
                            />
                          </div>
                          <div className="sm:col-span-2">
                            <Label>Access token</Label>
                            <Input
                              type="password"
                              autoComplete="off"
                              value={form.accessToken}
                              placeholder={form.id ? "•••••••• (để trống nếu giữ token cũ)" : "Token từ Mastodon → Development"}
                              onChange={e => setForm(f => ({ ...f, accessToken: e.target.value }))}
                            />
                          </div>
                        </>
                      ) : null}
                      {platform === "bluesky" ? (
                        <>
                          <div>
                            <Label>Handle / email</Label>
                            <Input
                              value={form.identifier}
                              placeholder="yukvix.bsky.social"
                              onChange={e => setForm(f => ({ ...f, identifier: e.target.value }))}
                            />
                          </div>
                          <div>
                            <Label>App password</Label>
                            <Input
                              type="password"
                              autoComplete="off"
                              value={form.appPassword}
                              placeholder={form.id ? "•••••••• (để trống nếu giữ mật khẩu cũ)" : "bsky.app → App passwords"}
                              onChange={e => setForm(f => ({ ...f, appPassword: e.target.value }))}
                            />
                          </div>
                          <div>
                            <Label>PDS (tuỳ chọn)</Label>
                            <Input
                              value={form.pdsUrl}
                              placeholder="https://bsky.social"
                              onChange={e => setForm(f => ({ ...f, pdsUrl: e.target.value }))}
                            />
                          </div>
                        </>
                      ) : null}
                      {platform === "x" ? (
                        <>
                          <div className="sm:col-span-2 text-xs text-muted-foreground">
                            Developer Portal → Project → Keys and tokens. App permission Read and
                            Write. Cần gói API trả phí (Basic+). Không dùng password tài khoản X.
                          </div>
                          <div>
                            <Label>API Key</Label>
                            <Input
                              type="password"
                              autoComplete="off"
                              value={form.apiKey}
                              placeholder={form.id ? "•••••••• (để trống nếu giữ key cũ)" : "API Key"}
                              onChange={e => setForm(f => ({ ...f, apiKey: e.target.value }))}
                            />
                          </div>
                          <div>
                            <Label>API Secret</Label>
                            <Input
                              type="password"
                              autoComplete="off"
                              value={form.apiSecret}
                              placeholder={form.id ? "••••••••" : "API Key Secret"}
                              onChange={e => setForm(f => ({ ...f, apiSecret: e.target.value }))}
                            />
                          </div>
                          <div>
                            <Label>Access Token</Label>
                            <Input
                              type="password"
                              autoComplete="off"
                              value={form.accessToken}
                              placeholder={form.id ? "••••••••" : "Access Token"}
                              onChange={e => setForm(f => ({ ...f, accessToken: e.target.value }))}
                            />
                          </div>
                          <div>
                            <Label>Access Token Secret</Label>
                            <Input
                              type="password"
                              autoComplete="off"
                              value={form.accessTokenSecret}
                              placeholder={form.id ? "••••••••" : "Access Token Secret"}
                              onChange={e => setForm(f => ({ ...f, accessTokenSecret: e.target.value }))}
                            />
                          </div>
                        </>
                      ) : null}
                      <div>
                        <Label>Max images</Label>
                        <Input
                          type="number"
                          min={1}
                          max={platform === "telegram" ? 10 : 4}
                          value={form.maxImages}
                          onChange={e =>
                            setForm(f => ({
                              ...f,
                              maxImages: Number(e.target.value) || (platform === "telegram" ? 10 : 4),
                            }))
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
                      {platform === "telegram" ? (
                      <label className="flex items-center gap-2 text-sm">
                        <Switch
                          checked={form.disableNotification}
                          onCheckedChange={v => setForm(f => ({ ...f, disableNotification: v }))}
                        />
                        Silent
                      </label>
                      ) : null}
                    </div>
                    <Button
                      size="sm"
                      onClick={saveAccount}
                      disabled={upsert.isPending || !keyStatus?.configured}
                    >
                      {upsert.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                      Lưu tài khoản
                    </Button>
                  </CollapsibleContent>
                </Collapsible>
              </section>

              <SocialScheduleCard
                platform={platform}
                label={PLATFORM_TABS.find(t => t.id === platform)?.label || platform}
              />
            </div>

            <Collapsible open={shareOpen} onOpenChange={setShareOpen}>
              <section className="rounded-xl border border-border">
                <CollapsibleTrigger asChild>
                  <button
                    type="button"
                    className="flex w-full items-center justify-between px-4 py-3 text-left"
                  >
                    <span>
                      <span className="font-medium">Share thủ công</span>
                      <span className="block text-xs text-muted-foreground">
                        Chọn album published, hoặc từ trang Album bấm icon Share.
                      </span>
                    </span>
                    <ChevronDown
                      className={`w-4 h-4 text-muted-foreground transition-transform ${shareOpen ? "rotate-180" : ""}`}
                    />
                  </button>
                </CollapsibleTrigger>
                <CollapsibleContent className="px-4 pb-4 space-y-3">
                  <div className="grid sm:grid-cols-2 gap-3">
                    <div className="space-y-2">
                      <Label>Album đã xuất bản</Label>
                      <Input
                        value={albumSearch}
                        onChange={e => setAlbumSearch(e.target.value)}
                        placeholder="Tìm theo tên hoặc slug…"
                      />
                      <div className="max-h-40 overflow-y-auto rounded-md border border-border divide-y divide-border">
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
                              #{album.id} · {album.photoCount} ảnh
                              {album.isVip ? " · VIP" : ""}
                            </span>
                          </button>
                        ))}
                        {(albumChoices?.items ?? []).length === 0 && (
                          <p className="px-3 py-2 text-xs text-muted-foreground">
                            Không có album published khớp tìm kiếm.
                          </p>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {selectedAlbum
                          ? `Đang chọn: #${selectedAlbum.id} · ${selectedAlbum.title}`
                          : selectedAlbumId
                            ? `Album ID ${selectedAlbumId}`
                            : "Chưa chọn album."}
                      </p>
                    </div>
                    <div className="space-y-3">
                      <div>
                        <Label>Tài khoản</Label>
                        <select
                          className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm"
                          value={accountId}
                          onChange={e => setAccountId(Number(e.target.value))}
                        >
                          {platformAccounts.map(account => (
                            <option key={account.id} value={account.id}>
                              {account.displayName}
                            </option>
                          ))}
                        </select>
                      </div>
                      <label className="flex items-center gap-2 text-sm">
                        <Switch checked={sendNow} onCheckedChange={setSendNow} />
                        Gửi ngay
                      </label>
                      <label className="flex items-center gap-2 text-sm">
                        <Switch checked={force} onCheckedChange={setForce} />
                        Force re-share
                      </label>
                      <div className="flex gap-2">
                        <Button variant="outline" size="sm" onClick={runPreview} disabled={dryRun.isPending}>
                          {dryRun.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                          Preview
                        </Button>
                        <Button size="sm" onClick={confirmShare} disabled={share.isPending || !preview}>
                          {share.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                          Confirm share
                        </Button>
                      </div>
                    </div>
                  </div>
                  {preview && (
                    <div className="rounded-lg bg-secondary/40 p-3 text-xs space-y-1">
                      <p>
                        {selectedAccount?.displayName || accountId} ·{" "}
                        {preview.policy?.allowed
                          ? "allowed"
                          : `blocked (${preview.policy?.reason || preview.reason || "—"})`}{" "}
                        · {media.length} ảnh
                        {preview.duplicate?.duplicate ? " · trùng album" : ""}
                      </p>
                      <pre className="whitespace-pre-wrap bg-background/60 rounded p-2 max-h-28 overflow-auto">
                        {preview.payload?.caption || "(no caption)"}
                      </pre>
                      <div className="flex gap-2 overflow-x-auto">
                        {media.map(item => (
                          <img
                            key={item.url}
                            src={item.url}
                            alt={item.type}
                            className="w-12 h-12 object-cover rounded"
                          />
                        ))}
                      </div>
                    </div>
                  )}
                </CollapsibleContent>
              </section>
            </Collapsible>

            <section className="rounded-xl border border-border p-4 space-y-2">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <div>
                  <h2 className="font-medium">Lần share gần đây</h2>
                  <p className="text-xs text-muted-foreground">
                    Mỗi dòng là 1 lần gửi {platform}, không phải danh sách album. Mặc định {RECENT_POSTS_DEFAULT} bài mới nhất.
                  </p>
                </div>
                {postLimit === RECENT_POSTS_DEFAULT ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setPostLimit(RECENT_POSTS_MORE)}
                  >
                    Xem {RECENT_POSTS_MORE}
                  </Button>
                ) : (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setPostLimit(RECENT_POSTS_DEFAULT)}
                  >
                    Thu gọn
                  </Button>
                )}
              </div>
              <div className="overflow-auto max-h-72 text-sm">
                <table className="w-full">
                  <thead className="text-muted-foreground text-left text-xs sticky top-0 bg-background">
                    <tr>
                      <th className="py-1.5 pr-3">Album</th>
                      <th className="pr-3">Nguồn</th>
                      <th className="pr-3">Trạng thái</th>
                      <th className="pr-3">Lúc</th>
                      <th>Link</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(posts ?? []).map(post => (
                      <tr key={post.id} className="border-t border-border">
                        <td className="py-1.5 pr-3 max-w-[16rem]">
                          <span className="block truncate">
                            {post.albumTitle || `Album #${post.albumId}`}
                          </span>
                          <span className="text-[11px] text-muted-foreground">#{post.albumId}</span>
                        </td>
                        <td className="pr-3 text-xs text-muted-foreground">
                          {post.trigger === "auto" ? "Lịch" : "Thủ công"}
                        </td>
                        <td className="pr-3">
                          <AdminStatusBadge
                            status={queueStatusForBadge(post.status)}
                            label={formatSocialQueueStatus(post.status)}
                          />
                          {post.status === "failed" && post.lastError ? (
                            <span className="block text-[11px] text-destructive truncate max-w-[14rem]">
                              {formatSocialPostError(post.lastError)}
                            </span>
                          ) : null}
                        </td>
                        <td className="pr-3 text-xs text-muted-foreground whitespace-nowrap">
                          {post.createdAt
                            ? new Date(post.createdAt).toLocaleString()
                            : "—"}
                        </td>
                        <td className="truncate max-w-[10rem] text-xs">
                          {post.externalUrl ? (
                            <a
                              href={post.externalUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="underline"
                            >
                              Mở
                            </a>
                          ) : (
                            "—"
                          )}
                        </td>
                      </tr>
                    ))}
                    {(posts ?? []).length === 0 ? (
                      <tr>
                        <td colSpan={5} className="py-4 text-muted-foreground text-sm">
                          Chưa có lần share nào trên {platform}.
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
            </section>
          </TabsContent>
          ))}
        </Tabs>
      </AdminPageShell>
    </AdminLayout>
  );
}
