import { useState, useEffect } from "react";
import { Link, useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import {
  Eye,
  EyeOff,
  Lock,
  CheckCircle,
  XCircle,
  Loader2,
  Sparkles,
  AlertTriangle,
  ArrowLeft,
} from "lucide-react";
import { useTranslation } from "react-i18next";

// --- Password strength helper -------------------------------------------------

type StrengthLevel = "weak" | "fair" | "good" | "strong";

function getPasswordStrength(password: string): {
  level: StrengthLevel;
  score: number;
  checks: { label: string; passed: boolean }[];
} {
  const checks = [
    { label: "At least 8 characters", passed: password.length >= 8, key: "resetPassword.check8chars" },
    { label: "Uppercase letter (A–Z)", passed: /[A-Z]/.test(password), key: "resetPassword.checkUpper" },
    { label: "Lowercase letter (a–z)", passed: /[a-z]/.test(password), key: "resetPassword.checkLower" },
    { label: "Number (0–9)", passed: /[0-9]/.test(password), key: "resetPassword.checkNumber" },
    { label: "Special character (!@#$…)", passed: /[^A-Za-z0-9]/.test(password), key: "resetPassword.checkSpecial" },
  ];
  const score = checks.filter((c) => c.passed).length;
  const level: StrengthLevel =
    score <= 1 ? "weak" : score === 2 ? "fair" : score === 3 ? "good" : "strong";
  return { level, score, checks };
}

const strengthConfig: Record<StrengthLevel, { label: string; color: string; barColor: string }> = {
  weak: { label: "Weak", color: "text-red-500", barColor: "bg-red-500" },
  fair: { label: "Fair", color: "text-amber-500", barColor: "bg-amber-500" },
  good: { label: "Good", color: "text-yellow-400", barColor: "bg-yellow-400" },
  strong: { label: "Strong", color: "text-green-500", barColor: "bg-green-500" },
};

// --- Component ----------------------------------------------------------------

export default function ResetPasswordPage() {
  const { t } = useTranslation();
  const [, navigate] = useLocation();
  const [token, setToken] = useState<string>("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [success, setSuccess] = useState(false);

  // Extract token from URL on mount
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const t = params.get("token");
    if (t) setToken(t);
  }, []);

  // Validate token query
  const tokenQuery = trpc.auth.validateResetToken.useQuery(
    { token },
    {
      enabled: token.length > 0,
      retry: false,
    }
  );

  const resetMutation = trpc.auth.resetPassword.useMutation({
    onSuccess: () => {
      setSuccess(true);
      toast.success(t("resetPassword.successToast"));
      setTimeout(() => navigate("/login"), 3000);
    },
    onError: (err) => {
      toast.error(err.message || t("resetPassword.failedToast"));
    },
  });

  const strength = getPasswordStrength(newPassword);
  const passwordsMatch = newPassword === confirmPassword && confirmPassword.length > 0;
  const canSubmit =
    newPassword.length >= 8 &&
    passwordsMatch &&
    !resetMutation.isPending;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    if (newPassword !== confirmPassword) {
      toast.error(t("resetPassword.noMatch"));
      return;
    }
    resetMutation.mutate({ token, newPassword });
  };

  // -- Loading state ------------------------------------------------------------
  if (!token || tokenQuery.isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin text-primary mx-auto mb-3" />
          <p className="text-muted-foreground text-sm">{t("resetPassword.validating")}</p>
        </div>
      </div>
    );
  }

  // -- Invalid / expired token --------------------------------------------------
  if (!tokenQuery.data?.valid) {
    const reason = tokenQuery.data?.reason ?? "Invalid token";
    return (
      <div className="min-h-screen bg-background flex items-center justify-center px-4">
        <div className="w-full max-w-md">
          <div className="text-center mb-8">
            <Link href="/" className="inline-flex items-center gap-2">
              <div className="w-10 h-10 rounded-xl bg-primary flex items-center justify-center">
                <Sparkles className="w-5 h-5 text-primary-foreground" />
              </div>
              <span className="text-xl font-bold">Yukvix</span>
            </Link>
          </div>
          <div className="bg-card border border-border rounded-2xl p-8 text-center shadow-2xl">
            <div className="w-16 h-16 rounded-full bg-red-500/10 border border-red-500/20 flex items-center justify-center mx-auto mb-5">
              <XCircle className="w-8 h-8 text-red-500" />
            </div>
            <h2 className="text-xl font-bold text-foreground mb-3">
              {reason === "Token expired" ? t("resetPassword.linkExpired") : t("resetPassword.invalidLink")}
            </h2>
            <p className="text-muted-foreground text-sm leading-relaxed mb-6">
              {reason === "Token expired"
                ? t("resetPassword.expiredDesc")
                : reason === "Token already used"
                ? t("resetPassword.usedDesc")
                : t("resetPassword.invalidDesc")}
            </p>
            <div className="space-y-3">
              <Link href="/forgot-password">
                <Button className="w-full">{t("resetPassword.requestNew")}</Button>
              </Link>
              <Link href="/login">
                <Button variant="ghost" className="w-full text-muted-foreground">
                  <ArrowLeft className="w-3.5 h-3.5 mr-1.5" />
                  {t("forgotPassword.backToSignIn")}
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // -- Success state ------------------------------------------------------------
  if (success) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center px-4">
        <div className="w-full max-w-md">
          <div className="text-center mb-8">
            <Link href="/" className="inline-flex items-center gap-2">
              <div className="w-10 h-10 rounded-xl bg-primary flex items-center justify-center">
                <Sparkles className="w-5 h-5 text-primary-foreground" />
              </div>
              <span className="text-xl font-bold">Yukvix</span>
            </Link>
          </div>
          <div className="bg-card border border-border rounded-2xl p-8 text-center shadow-2xl">
            <div className="w-16 h-16 rounded-full bg-green-500/10 border border-green-500/20 flex items-center justify-center mx-auto mb-5">
              <CheckCircle className="w-8 h-8 text-green-500" />
            </div>
            <h2 className="text-xl font-bold text-foreground mb-3">{t("resetPassword.successTitle")}</h2>
            <p className="text-muted-foreground text-sm leading-relaxed mb-6">
              {t("resetPassword.successDesc")}
            </p>
            <div className="flex items-center justify-center gap-2 mb-6">
              <Loader2 className="w-4 h-4 animate-spin text-primary" />
              <span className="text-sm text-muted-foreground">{t("resetPassword.redirecting")}</span>
            </div>
            <Link href="/login">
              <Button className="w-full">{t("resetPassword.signInNow")}</Button>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // -- Reset form ---------------------------------------------------------------
  const sConfig = strengthConfig[strength.level];

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4">
      {/* Background glow */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[600px] h-[400px] bg-primary/5 rounded-full blur-3xl" />
      </div>

      <div className="w-full max-w-md relative z-10">
        {/* Logo */}
        <div className="text-center mb-8">
          <Link href="/" className="inline-flex items-center gap-2 group">
            <div className="w-10 h-10 rounded-xl bg-primary flex items-center justify-center shadow-lg shadow-primary/30">
              <Sparkles className="w-5 h-5 text-primary-foreground" />
            </div>
            <span className="text-xl font-bold tracking-tight">Yukvix</span>
          </Link>
        </div>

        <div className="bg-card border border-border rounded-2xl p-8 shadow-2xl">
          {/* Header */}
          <div className="mb-6">
            <h1 className="text-2xl font-bold text-foreground mb-2">{t("resetPassword.title")}</h1>
            {tokenQuery.data.maskedEmail && (
              <p className="text-muted-foreground text-sm">
                Resetting password for{" "}
                <span className="text-foreground font-medium">{tokenQuery.data.maskedEmail}</span>
              </p>
            )}
          </div>

          {/* Expiry warning */}
          {tokenQuery.data.expiresAt && (
            <div className="flex items-start gap-2 p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg mb-5">
              <AlertTriangle className="w-4 h-4 text-amber-500 mt-0.5 shrink-0" />
              <p className="text-xs text-amber-500/90">
                This link expires at{" "}
                <span className="font-semibold">
                  {new Date(tokenQuery.data.expiresAt).toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
                . Complete the form before then.
              </p>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
            {/* New password */}
            <div className="space-y-2">
              <Label htmlFor="newPassword" className="text-sm font-medium text-foreground">
                New password
              </Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  id="newPassword"
                  type={showPassword ? "text" : "password"}
                  placeholder="Enter new password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="pl-10 pr-10 bg-background border-border focus:border-primary h-11"
                  autoComplete="new-password"
                  autoFocus
                  disabled={resetMutation.isPending}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>

              {/* Strength meter */}
              {newPassword.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex gap-1 flex-1 mr-3">
                      {[1, 2, 3, 4].map((i) => (
                        <div
                          key={i}
                          className={`h-1 flex-1 rounded-full transition-all duration-300 ${
                            i <= strength.score
                              ? sConfig.barColor
                              : "bg-muted"
                          }`}
                        />
                      ))}
                    </div>
                    <span className={`text-xs font-semibold ${sConfig.color}`}>
                      {sConfig.label}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-1">
                    {strength.checks.map((check) => (
                      <div key={check.label} className="flex items-center gap-1.5">
                        {check.passed ? (
                          <CheckCircle className="w-3 h-3 text-green-500 shrink-0" />
                        ) : (
                          <XCircle className="w-3 h-3 text-muted-foreground/50 shrink-0" />
                        )}
                        <span
                          className={`text-xs ${
                            check.passed ? "text-green-500" : "text-muted-foreground/60"
                          }`}
                        >
                          {check.label}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Confirm password */}
            <div className="space-y-2">
              <Label htmlFor="confirmPassword" className="text-sm font-medium text-foreground">
                Confirm new password
              </Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  id="confirmPassword"
                  type={showConfirm ? "text" : "password"}
                  placeholder="Confirm new password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className={`pl-10 pr-10 bg-background border-border focus:border-primary h-11 ${
                    confirmPassword.length > 0
                      ? passwordsMatch
                        ? "border-green-500/50"
                        : "border-red-500/50"
                      : ""
                  }`}
                  autoComplete="new-password"
                  disabled={resetMutation.isPending}
                />
                <button
                  type="button"
                  onClick={() => setShowConfirm(!showConfirm)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                  tabIndex={-1}
                >
                  {showConfirm ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              {confirmPassword.length > 0 && !passwordsMatch && (
                <p className="text-xs text-red-500 flex items-center gap-1">
                  <XCircle className="w-3 h-3" />
                  Passwords do not match
                </p>
              )}
              {confirmPassword.length > 0 && passwordsMatch && (
                <p className="text-xs text-green-500 flex items-center gap-1">
                  <CheckCircle className="w-3 h-3" />
                  Passwords match
                </p>
              )}
            </div>

            <Button
              type="submit"
              className="w-full h-11 font-semibold"
              disabled={!canSubmit}
            >
              {resetMutation.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  {t("resetPassword.resetting")}
                </>
              ) : (
                t("resetPassword.submit")
              )}
            </Button>
          </form>

          <div className="mt-5 text-center">
            <Link
              href="/login"
              className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              {t("forgotPassword.backToSignIn")}
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
