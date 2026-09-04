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

export default function AdminSocial() {
  const search = useSearch();
  const albumFromQuery = Number(new URLSearchParams(search).get("albumId") || "") || 0;
  const utils = trpc.useUtils();
  const { data: accounts, isLoading } = trpc.social.listAccounts.useQuery();
  const { data: posts } = trpc.social.listPosts.useQuery({ limit: 30 });
  const { data: keyStatus } = trpc.social.getCredentialsKeyStatus.useQuery();
  const upsert = trpc.social.upsertAccount.useMutation();
  const validate = trpc.social.validateAccount.useMutation();
  const dryRun = trpc.social.dryRun.useMutation();
  const share = trpc.social.createManualShare.useMutation();
  const saveKey = trpc.social.saveCredentialsKey.useMutation();
  const [pasteKey, setPasteKey] = useState("");

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
    try {
      const result = await validate.mutateAsync({ accountId: id });
      setValidateResult(result);
    } catch (err) {
      setValidateResult({
        ok: false,
        reason: err instanceof Error ? err.message : "Validate failed",
      });
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
            Phase Telegram: validate bot, dry-run và manual share. Auto-share chưa bật.
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
              Auto-share: tắt (phase sau)
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
                    <div className="flex gap-2">
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
                        Validate
                      </Button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
          {validateResult && (
            <p className={validateResult.ok ? "text-sm text-emerald-500" : "text-sm text-destructive"}>
              {validateResult.ok
                ? `Connected · Bot: ${validateResult.info?.handle || validateResult.info?.displayName || "ok"} · Target: ${validateResult.info?.targetChat || "ok"}`
                : `Failed · ${validateResult.reason}`}
            </p>
          )}
        </section>

        <section className="rounded-xl border border-border p-4 space-y-4">
          <h2 className="font-medium flex items-center gap-2">
            <Share2 className="w-4 h-4" /> Manual Share
          </h2>
          <div className="grid sm:grid-cols-2 gap-3">
            <div>
              <Label>Album ID</Label>
              <Input
                value={albumId}
                onChange={e => setAlbumId(e.target.value)}
                placeholder="ID album đã published"
              />
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
                      {post.status}
                      {/ambiguous publish/i.test(post.lastError || "")
                        ? " / unknown"
                        : ""}
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
