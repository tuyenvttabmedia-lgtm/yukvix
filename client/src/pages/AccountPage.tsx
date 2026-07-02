import { useState, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { useLocation } from "wouter";
import SeoHead from "@/components/SeoHead";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import {
  User,
  Crown,
  History,
  Shield,
  ChevronLeft,
  ChevronRight,
  CheckCircle,
  XCircle,
  Clock,
  CalendarDays,
  Loader2,
  Pencil,
  KeyRound,
  ExternalLink,
  Sparkles,
  Download,
  FileArchive,
  Mail,
  MailCheck,
  RefreshCw,
} from "lucide-react";
import { useTranslation } from "react-i18next";

// --- Helpers ------------------------------------------------------------------
function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    active: "bg-green-500/10 text-green-400 border-green-500/20",
    pending: "bg-yellow-500/10 text-yellow-400 border-yellow-500/20",
    expired: "bg-secondary text-muted-foreground border-border/30",
    cancelled: "bg-red-500/10 text-red-400 border-red-500/20",
  };
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const { t } = useTranslation();
  const labels: Record<string, string> = {
    active: t("account.status.active"),
    pending: t("account.status.pending"),
    expired: t("account.status.expired"),
    cancelled: t("account.status.cancelled"),
  };
  return (
    <span
      className={`text-xs px-2.5 py-1 rounded-full border font-medium ${
        map[status] ?? "bg-secondary text-muted-foreground border-border/30"
      }`}
    >
      {labels[status] ?? status}
    </span>
  );
}

function RoleBadge({ role }: { role: string }) {
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const { t } = useTranslation();
  if (role === "super_admin")
    return (
      <span className="text-xs px-2.5 py-1 rounded-full bg-red-500/10 text-red-400 border border-red-500/20 font-medium">
        Super Admin
      </span>
    );
  if (role === "admin")
    return (
      <span className="text-xs px-2.5 py-1 rounded-full bg-purple-500/10 text-purple-400 border border-purple-500/20 font-medium">
        {t("account.role.admin")}
      </span>
    );
  if (role === "vip")
    return (
      <span className="vip-badge text-xs px-2.5 py-1">{t("account.role.vip")}</span>
    );
  return (
    <span className="text-xs px-2.5 py-1 rounded-full bg-secondary text-muted-foreground border border-border/30 font-medium">
      {t("account.role.member")}
    </span>
  );
}

// --- Email Verification Banner ------------------------------------------------
function useCountdown(targetDate: Date | null) {
  const [secondsLeft, setSecondsLeft] = useState<number>(0);

  useEffect(() => {
    if (!targetDate) { setSecondsLeft(0); return; }
    const update = () => {
      const diff = Math.max(0, Math.ceil((targetDate.getTime() - Date.now()) / 1000));
      setSecondsLeft(diff);
    };
    update();
    const id = setInterval(update, 1000);
    return () => clearInterval(id);
  }, [targetDate]);

  return secondsLeft;
}

function formatCountdown(s: number) {
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return m > 0 ? `${m}m ${sec}s` : `${sec}s`;
}

function EmailVerificationBanner() {
  const { t } = useTranslation();
  const [rateLimitedUntil, setRateLimitedUntil] = useState<Date | null>(null);
  const secondsLeft = useCountdown(rateLimitedUntil);
  const isRateLimited = secondsLeft > 0;

  const sendVerification = trpc.authEmail.sendVerification.useMutation({
    onSuccess: () => {
      toast.success(t("account.verificationSent"), { duration: 5000 });
      setRateLimitedUntil(null);
    },
    onError: (err) => {
      // Try to parse rate limit info from error message
      try {
        const parsed = JSON.parse(err.message);
        if (parsed?.type === "RATE_LIMITED" && parsed?.nextAllowedAt) {
          setRateLimitedUntil(new Date(parsed.nextAllowedAt));
          return;
        }
      } catch { /* not JSON */ }
      toast.error(err.message || "Failed to send verification email. Please try again later.");
    },
  });

  return (
    <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4 flex items-start gap-3">
      <div className="w-9 h-9 rounded-full bg-amber-500/10 flex items-center justify-center flex-shrink-0 mt-0.5">
        <Mail className="w-4.5 h-4.5 text-amber-400" />
      </div>
      <div className="flex-1 min-w-0">
        <h4 className="text-sm font-semibold text-foreground">{t("account.emailNotVerified")}</h4>
        <p className="text-xs text-muted-foreground mt-0.5">
          {t("account.emailNotVerifiedDesc")}
        </p>

        {isRateLimited ? (
          <div className="mt-3 flex items-center gap-2 text-xs text-amber-400">
            <Clock className="w-3.5 h-3.5 flex-shrink-0" />
            <span>
              {t("account.tooManyAttempts")}{" "}
              <span className="font-mono font-semibold">{formatCountdown(secondsLeft)}</span>
            </span>
          </div>
        ) : (
          <Button
            variant="outline"
            size="sm"
            className="mt-3 border-amber-500/30 text-amber-400 hover:bg-amber-500/10 hover:text-amber-300"
            onClick={() => sendVerification.mutate({ origin: window.location.origin })}
            disabled={sendVerification.isPending}
          >
            {sendVerification.isPending ? (
              <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
            ) : (
              <RefreshCw className="w-3.5 h-3.5 mr-1.5" />
            )}
            {t("account.resendVerification")}
          </Button>
        )}

        {sendVerification.isSuccess && !isRateLimited && (
          <p className="text-xs text-green-400 mt-2 flex items-center gap-1">
            <MailCheck className="w-3.5 h-3.5" />
            {t("account.verificationEmailSent")}
          </p>
        )}
      </div>
    </div>
  );
}

// --- Tab: Hồ sơ ---------------------------------------------------------------
function ProfileTab() {
  const { t } = useTranslation();
  const utils = trpc.useUtils();
  const { data: profile, isLoading } = trpc.account.myProfile.useQuery();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");

  const updateProfile = trpc.account.updateProfile.useMutation({
    onSuccess: () => {
      utils.account.myProfile.invalidate();
      toast.success(t("account.profileUpdated"));
      setEditing(false);
    },
    onError: (e) => toast.error(e.message),
  });

  function startEdit() {
    setName(profile?.name ?? "");
    setEmail(profile?.email ?? "");
    setEditing(true);
  }

  if (isLoading) {
    return (
      <div className="space-y-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-16 skeleton rounded-xl" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Avatar + tên */}
      <div className="flex items-center gap-4 p-5 rounded-xl border border-border/50 bg-card">
        <div className="w-16 h-16 rounded-full bg-secondary border border-border flex items-center justify-center overflow-hidden flex-shrink-0">
          {profile?.avatarUrl ? (
            <img
              src={profile.avatarUrl}
              alt={profile.name ?? ""}
              className="w-full h-full object-cover"
            />
          ) : (
            <User className="w-7 h-7 text-muted-foreground" />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="text-lg font-semibold text-foreground">
              {profile?.name ?? t("account.noNameSet")}
            </h2>
            <RoleBadge role={profile?.role ?? "user"} />
          </div>
          <div className="flex items-center gap-1.5 mt-0.5 min-w-0">
            <p className="text-sm text-muted-foreground truncate">
              {profile?.email ?? "—"}
            </p>
            {profile?.email && (
              profile?.emailVerified ? (
                <span
                  title={t("account.emailVerified")}
                  className="inline-flex items-center gap-1 text-xs text-green-400 bg-green-500/10 border border-green-500/20 rounded-full px-2 py-0.5 flex-shrink-0"
                >
                  <MailCheck className="w-3 h-3" />
                  {t("account.verified")}
                </span>
              ) : (
                <span
                  title={t("account.emailNotVerified")}
                  className="inline-flex items-center gap-1 text-xs text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded-full px-2 py-0.5 flex-shrink-0"
                >
                  <Mail className="w-3 h-3" />
                  {t("account.notVerified")}
                </span>
              )
            )}
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            {t("account.memberSince")}{" "}
            {profile?.createdAt
              ? new Date(profile.createdAt).toLocaleDateString("en-US", {
                  year: "numeric",
                  month: "long",
                  day: "numeric",
                })
              : "—"}
          </p>
        </div>
        {!editing && (
          <Button variant="outline" size="sm" onClick={startEdit}>
            <Pencil className="w-3.5 h-3.5 mr-1.5" />
            {t("common.edit")}
          </Button>
        )}
      </div>

      {/* Email verification banner */}
      {profile && profile.email && !profile.emailVerified && (
        <EmailVerificationBanner />
      )}

      {/* Form chỉnh sửa */}
      {editing && (
        <div className="p-5 rounded-xl border border-primary/30 bg-card space-y-4">
          <h3 className="font-medium text-foreground">{t("account.updateProfile")}</h3>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">{t("account.displayName")}</label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t("account.enterName")}
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">{t("auth.email")}</label>
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="email@example.com"
            />
          </div>
          <div className="flex gap-2 justify-end">
            <Button variant="outline" size="sm" onClick={() => setEditing(false)}>
              {t("common.cancel")}
            </Button>
            <Button
              size="sm"
              onClick={() =>
                updateProfile.mutate({
                  name: name || undefined,
                  email: email || undefined,
                })
              }
              disabled={updateProfile.isPending}
            >
              {updateProfile.isPending ? (
                <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
              ) : null}
              {t("account.saveChanges")}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

// --- Tab: Trạng thái VIP ------------------------------------------------------
function VipStatusTab() {
  const { t } = useTranslation();
  const { data, isLoading } = trpc.account.myVipStatus.useQuery();
  const [, navigate] = useLocation();

  const renewVip = trpc.account.renewVip.useMutation({
    onSuccess: (result) => {
      if (result.url) {
        toast.success(`Redirecting to checkout for ${result.planName}…`);
        window.open(result.url, "_blank");
      }
    },
    onError: (err) => {
      toast.error(err.message || "Failed to create checkout session. Please try again.");
    },
  });

  const handleRenew = (planId?: number) => {
    renewVip.mutate({
      planId,
      successUrl: window.location.origin + "/payment/success",
      cancelUrl: window.location.origin + "/account",
    });
  };

  if (isLoading) {
    return <div className="h-48 skeleton rounded-xl" />;
  }

  const sub = data?.subscription;

  return (
    <div className="space-y-5">
      {/* Trạng thái chính */}
      <div
        className={`rounded-xl border p-6 ${
          data?.isVip
            ? "border-primary/30 bg-gradient-to-br from-primary/5 to-transparent"
            : "border-border/50 bg-card"
        }`}
      >
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <div
              className={`w-12 h-12 rounded-full flex items-center justify-center ${
                data?.isVip ? "bg-primary/10" : "bg-secondary"
              }`}
            >
              <Crown
                className={`w-6 h-6 ${data?.isVip ? "text-primary" : "text-muted-foreground"}`}
              />
            </div>
            <div>
              <h3 className="font-semibold text-foreground text-lg">
                {data?.isVip ? t("account.vipMember") : t("account.standardAccount")}
              </h3>
              <p className="text-sm text-muted-foreground">
                {data?.isVip
                  ? `${t("account.plan")}: ${sub?.planName ?? "VIP"}`
                  : t("account.upgradePrompt")}
              </p>
            </div>
          </div>
          {data?.isVip ? (
            <CheckCircle className="w-6 h-6 text-green-500 flex-shrink-0 mt-1" />
          ) : (
            <XCircle className="w-6 h-6 text-muted-foreground flex-shrink-0 mt-1" />
          )}
        </div>

        {/* Thông tin hết hạn */}
        {data?.isVip && sub && (
          <div className="mt-5 space-y-3">
            <div className="flex items-center justify-between text-sm">
              <div className="flex items-center gap-1.5 text-muted-foreground">
                <Clock className="w-4 h-4" />
                <span>{t("account.remaining")}</span>
              </div>
              <span
                className={`font-semibold ${
                  (sub as any).daysLeft <= 7 ? "text-yellow-400" : "text-green-400"
                }`}
              >
                {t("account.daysLeft", { count: (sub as any).daysLeft })}
              </span>
            </div>

            {/* Progress bar */}
            <div className="w-full bg-secondary rounded-full h-2 overflow-hidden">
              <div
                className="h-full rounded-full bg-gradient-to-r from-primary to-primary/60 transition-all duration-500"
                style={{ width: `${(sub as any).progressPercent}%` }}
              />
            </div>

            <div className="grid grid-cols-2 gap-3 mt-3">
              <div className="rounded-lg bg-secondary/50 p-3">
                <p className="text-xs text-muted-foreground mb-1">{t("account.startDate")}</p>
                <p className="text-sm font-medium text-foreground">
                  {'startedAt' in sub && sub.startedAt
                    ? new Date(sub.startedAt as Date).toLocaleDateString("en-US")
                    : "—"}
                </p>
              </div>
              <div className="rounded-lg bg-secondary/50 p-3">
                <p className="text-xs text-muted-foreground mb-1">{t("account.expiryDate")}</p>
                <p className="text-sm font-medium text-foreground">
                  {sub.expiresAt
                    ? new Date(sub.expiresAt).toLocaleDateString("en-US")
                    : "—"}
                </p>
              </div>
            </div>

            {(sub as any).daysLeft <= 7 && (
              <div className="mt-3 p-3 rounded-lg bg-yellow-500/10 border border-yellow-500/20 space-y-3">
                <p className="text-xs text-yellow-400 font-medium">
                  ⚠ {t("account.vipExpiringSoon")}
                </p>
                <Button
                  size="sm"
                  className="w-full bg-yellow-500 hover:bg-yellow-400 text-black font-semibold"
                  onClick={() => handleRenew((sub as any).planId)}
                  disabled={renewVip.isPending}
                >
                  {renewVip.isPending ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <Crown className="w-4 h-4 mr-2" />
                  )}
                  {t("account.renewNow")}
                </Button>
              </div>
            )}
          </div>
        )}

        {/* Subscription hết hạn gần nhất + nút gia hạn */}
        {!data?.isVip && sub && (sub as any).isExpired && (
          <div className="mt-4 space-y-3">
            <div className="p-3 rounded-lg bg-secondary/50">
              <p className="text-xs text-muted-foreground">
                Your <strong className="text-foreground">{sub.planName ?? "VIP"}</strong> plan
                  {t("account.expiredOn")}{" "}
                <strong className="text-foreground">
                  {sub.expiresAt
                    ? new Date(sub.expiresAt).toLocaleDateString("en-US")
                    : "—"}
                </strong>
                .
              </p>
            </div>
            <Button
              className="w-full"
              onClick={() => handleRenew((sub as any).planId)}
              disabled={renewVip.isPending}
            >
              {renewVip.isPending ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Crown className="w-4 h-4 mr-2" />
              )}
              {t("account.renewVipNow")}
            </Button>
          </div>
        )}

        {/* Nút nâng cấp (chưa từng đăng ký) */}
        {!data?.isVip && !sub && (
          <Button
            className="mt-5 w-full"
            onClick={() => navigate("/vip")}
          >
            <Sparkles className="w-4 h-4 mr-2" />
              {t("vip.upgradeBtn")}
          </Button>
        )}
      </div>

      {/* Quyền lợi VIP */}
      <div className="rounded-xl border border-border/50 bg-card p-5">
        <h3 className="font-semibold text-foreground mb-3">{t("account.vipBenefits")}</h3>
        <ul className="space-y-2">
          {[
            t("account.benefit1"),
            t("account.benefit2"),
            t("account.benefit3"),
            t("account.benefit4"),
            t("account.benefit5"),
          ].map((benefit) => (
            <li key={benefit} className="flex items-center gap-2 text-sm text-muted-foreground">
              <CheckCircle className="w-4 h-4 text-green-500 flex-shrink-0" />
              {benefit}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

// --- Tab: Lịch sử thanh toán --------------------------------------------------
function PaymentHistoryTab() {
  const { t } = useTranslation();
  const [page, setPage] = useState(1);
  const LIMIT = 10;

  const { data, isLoading } = trpc.account.myPaymentHistory.useQuery({ page, limit: LIMIT });
  const totalPages = Math.ceil((data?.total ?? 0) / LIMIT);

  return (
    <div className="space-y-4">
      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-20 skeleton rounded-xl" />
          ))}
        </div>
      ) : data?.items.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border/50 p-12 text-center">
          <History className="w-10 h-10 text-muted-foreground mx-auto mb-3 opacity-40" />
          <p className="text-muted-foreground">{t("account.noPaymentHistory")}</p>
          <Button
            variant="outline"
            size="sm"
            className="mt-4"
            onClick={() => (window.location.href = "/vip")}
          >
            <Crown className="w-4 h-4 mr-1.5" />
            {t("account.subscribeVip")}
          </Button>
        </div>
      ) : (
        <>
          <div className="space-y-3">
            {data?.items.map((item) => (
              <div
                key={item.id}
                className="rounded-xl border border-border/50 bg-card p-4 flex flex-col sm:flex-row sm:items-center gap-3"
              >
                {/* Plan info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-foreground">
                      {item.planName ?? "VIP Plan"}
                    </span>
                    {item.planBadge && (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20">
                        {item.planBadge}
                      </span>
                    )}
                    <StatusBadge status={item.status} />
                  </div>
                  <div className="flex items-center gap-3 mt-1.5 flex-wrap">
                    <span className="text-xs text-muted-foreground flex items-center gap-1">
                      <CalendarDays className="w-3 h-3" />
                      {new Date(item.createdAt).toLocaleDateString("en-US", {
                        year: "numeric",
                        month: "short",
                        day: "numeric",
                      })}
                    </span>
                    {item.expiresAt && (
                      <span className="text-xs text-muted-foreground flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {t("account.expires")}{" "}
                        {new Date(item.expiresAt).toLocaleDateString("en-US", {
                          year: "numeric",
                          month: "short",
                          day: "numeric",
                        })}
                      </span>
                    )}
                  </div>
                  {item.stripeSessionId && (
                    <p className="text-xs text-muted-foreground/60 font-mono mt-1 truncate">
                      Ref: {item.stripeSessionId}
                    </p>
                  )}
                </div>

                {/* Giá */}
                <div className="text-right flex-shrink-0">
                  {item.planPrice ? (
                    <div>
                      <p className="text-lg font-bold text-foreground font-mono">
                        {Number(item.planPrice).toFixed(2)}
                      </p>
                      <p className="text-xs text-muted-foreground uppercase">
                        {item.planCurrency ?? "usd"}
                      </p>
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">—</p>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between pt-2">
              <span className="text-xs text-muted-foreground">
                {t("account.pageOf", { page, total: totalPages })} · {data?.total} {t("account.transactions")}
              </span>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                >
                  <ChevronLeft className="w-4 h-4" />
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                >
                  <ChevronRight className="w-4 h-4" />
                </Button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// --- Tab: Bảo mật -------------------------------------------------------------
function SecurityTab() {
  const { t } = useTranslation();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const changePassword = trpc.account.changePassword.useMutation({
    onSuccess: () => {
      toast.success(t("account.passwordChanged"));
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    },
    onError: (e) => toast.error(e.message),
  });

  const strength = (() => {
    if (newPassword.length === 0) return 0;
    let score = 0;
    if (newPassword.length >= 8) score++;
    if (newPassword.length >= 12) score++;
    if (/[A-Z]/.test(newPassword)) score++;
    if (/[0-9]/.test(newPassword)) score++;
    if (/[^A-Za-z0-9]/.test(newPassword)) score++;
    return score;
  })();

  const strengthLabel = ["", t("account.strength.veryWeak"), t("account.strength.weak"), t("account.strength.fair"), t("account.strength.strong"), t("account.strength.veryStrong")][strength];
  const strengthColor = [
    "",
    "bg-red-500",
    "bg-orange-500",
    "bg-yellow-500",
    "bg-green-500",
    "bg-emerald-500",
  ][strength];

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-border/50 bg-card p-5">
        <div className="flex items-center gap-2 mb-4">
          <KeyRound className="w-4 h-4 text-primary" />
          <h3 className="font-semibold text-foreground">{t("account.changePassword")}</h3>
        </div>

        <div className="space-y-4">
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">{t("account.currentPassword")}</label>
            <Input
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              placeholder="••••••••"
              autoComplete="current-password"
            />
          </div>

          <div>
            <label className="text-xs text-muted-foreground mb-1 block">{t("account.newPassword")}</label>
            <Input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder={t("account.atLeast8Chars")}
              autoComplete="new-password"
            />
            {newPassword.length > 0 && (
              <div className="mt-2 space-y-1">
                <div className="flex gap-1">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <div
                      key={i}
                      className={`h-1 flex-1 rounded-full transition-colors ${
                        i < strength ? strengthColor : "bg-secondary"
                      }`}
                    />
                  ))}
                </div>
                <p className="text-xs text-muted-foreground">{strengthLabel}</p>
              </div>
            )}
          </div>

          <div>
            <label className="text-xs text-muted-foreground mb-1 block">{t("account.confirmNewPassword")}</label>
            <Input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="••••••••"
              autoComplete="new-password"
            />
            {confirmPassword.length > 0 && newPassword !== confirmPassword && (
              <p className="text-xs text-red-400 mt-1">{t("account.passwordMismatch")}</p>
            )}
          </div>

          <Button
            className="w-full"
            onClick={() =>
              changePassword.mutate({ currentPassword, newPassword, confirmPassword })
            }
            disabled={
              changePassword.isPending ||
              !currentPassword ||
              !newPassword ||
              newPassword !== confirmPassword
            }
          >
            {changePassword.isPending ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <Shield className="w-4 h-4 mr-2" />
            )}
              {t("account.changePasswordBtn")}
            </Button>
        </div>
      </div>

      <div className="rounded-xl border border-border/50 bg-card p-5">
        <h3 className="font-semibold text-foreground mb-2">{t("account.forgotPassword")}</h3>
        <p className="text-sm text-muted-foreground mb-3">
          {t("account.forgotPasswordDesc")}
        </p>
        <Button
          variant="outline"
          size="sm"
          onClick={() => (window.location.href = "/forgot-password")}
        >
          <ExternalLink className="w-3.5 h-3.5 mr-1.5" />
          {t("account.resetViaEmail")}
        </Button>
      </div>
    </div>
  );
}

// --- Tab: Lịch sử tải xuống --------------------------------------------------
function DownloadHistoryTab() {
  const { t } = useTranslation();
  const [page, setPage] = useState(1);
  const LIMIT = 15;
  const { data, isLoading } = trpc.downloads.myHistory.useQuery({ page, limit: LIMIT });
  const totalPages = Math.ceil((data?.total ?? 0) / LIMIT);

  return (
    <div className="space-y-4">
      {isLoading ? (
        <div className="space-y-3">{Array.from({ length: 5 }).map((_, i) => <div key={i} className="h-16 skeleton rounded-xl" />)}</div>
      ) : data?.items.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border/50 p-12 text-center">
          <FileArchive className="w-10 h-10 text-muted-foreground mx-auto mb-3 opacity-40" />
          <p className="text-muted-foreground">{t("account.noDownloadHistory")}</p>
          <p className="text-xs text-muted-foreground mt-1">{t("account.noDownloadHistoryDesc")}</p>
        </div>
      ) : (
        <>
          <div className="space-y-3">
            {data?.items.map((item: any) => (
              <div key={item.id} className="rounded-xl border border-border/50 bg-card p-4 flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                  <FileArchive className="w-5 h-5 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-foreground truncate">{item.albumTitle ?? "Album"}</p>
                  <p className="text-xs text-muted-foreground">
                    {new Date(item.downloadedAt).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                    {item.fileSize && <span className="ml-2">· {(item.fileSize / 1024 / 1024).toFixed(1)} MB</span>}
                  </p>
                </div>
                {item.albumSlug && (
                  <a href={`/album/${item.albumSlug}`} className="text-xs text-primary hover:underline flex-shrink-0">{t("account.viewAlbum")}</a>
                )}
              </div>
            ))}
          </div>
          {totalPages > 1 && (
            <div className="flex items-center justify-between pt-2">
              <span className="text-xs text-muted-foreground">{t("account.pageOf", { page, total: totalPages })}</span>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}><ChevronLeft className="w-4 h-4" /></Button>
                <Button variant="outline" size="sm" onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}><ChevronRight className="w-4 h-4" /></Button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// --- Main Component -----------------------------------------------------------
const TAB_IDS = ["profile", "vip", "payments", "downloads", "security"] as const;

type TabId = (typeof TAB_IDS)[number];

export default function AccountPage() {
  const { t } = useTranslation();
  const { isAuthenticated, loading } = useAuth();
  const [, navigate] = useLocation();
  const [activeTab, setActiveTab] = useState<TabId>("profile");

  const TABS = [
    { id: "profile" as const, label: t("account.tabs.profile"), icon: User },
    { id: "vip" as const, label: t("account.tabs.vip"), icon: Crown },
    { id: "payments" as const, label: t("account.tabs.payments"), icon: History },
    { id: "downloads" as const, label: t("account.tabs.downloads"), icon: Download },
    { id: "security" as const, label: t("account.tabs.security"), icon: Shield },
  ];

  useEffect(() => {
    if (!loading && !isAuthenticated) {
      navigate("/login");
    }
  }, [loading, isAuthenticated, navigate]);

  if (loading || !isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-primary animate-spin" />
      </div>
    );
  }

  return (
    <>
      <SeoHead title={t("account.myAccount")} noIndex />
      <div className="min-h-screen bg-background">
        <div className="max-w-3xl mx-auto px-4 py-8">
          {/* Header */}
          <div className="mb-8">
            <h1
              className="text-3xl font-bold text-foreground"
              style={{ fontFamily: "'Playfair Display', serif" }}
            >
              {t("account.myAccount")}
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              {t("account.myAccountDesc")}
            </p>
          </div>

          {/* Tab navigation */}
          <div className="flex gap-1 p-1 bg-secondary/50 rounded-xl mb-6 overflow-x-auto">
            {TABS.map((tab) => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-all whitespace-nowrap flex-1 justify-center ${
                    activeTab === tab.id
                      ? "bg-card text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <Icon className="w-4 h-4 flex-shrink-0" />
                  <span className="hidden sm:inline">{tab.label}</span>
                </button>
              );
            })}
          </div>

          {/* Tab content */}
          <div>
            {activeTab === "profile" && <ProfileTab />}
            {activeTab === "vip" && <VipStatusTab />}
            {activeTab === "payments" && <PaymentHistoryTab />}
            {activeTab === "downloads" && <DownloadHistoryTab />}
            {activeTab === "security" && <SecurityTab />}
          </div>
        </div>
      </div>
    </>
  );
}
