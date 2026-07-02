import { useState } from "react";
import { Link, useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Eye, EyeOff, Crown, Loader2, UserPlus, CheckCircle2 } from "lucide-react";
import { useTranslation } from "react-i18next";

export default function RegisterPage() {
  const [, navigate] = useLocation();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const { t } = useTranslation();

  const passwordStrength = (pw: string): { score: number; label: string; color: string } => {
    if (pw.length === 0) return { score: 0, label: "", color: "" };
    if (pw.length < 8) return { score: 1, label: t("auth.pwTooShort"), color: "bg-red-500" };
    let score = 1;
    if (/[A-Z]/.test(pw)) score++;
    if (/[0-9]/.test(pw)) score++;
    if (/[^A-Za-z0-9]/.test(pw)) score++;
    if (score === 1) return { score, label: t("auth.pwWeak"), color: "bg-red-500" };
    if (score === 2) return { score, label: t("auth.pwFair"), color: "bg-amber-500" };
    if (score === 3) return { score, label: t("auth.pwGood"), color: "bg-yellow-400" };
    return { score, label: t("auth.pwStrong"), color: "bg-green-500" };
  };

  const utils = trpc.useUtils();
  const sendVerification = trpc.authEmail.sendVerification.useMutation();
  const registerMutation = trpc.auth.register.useMutation({
    onSuccess: async (data) => {
      await utils.auth.me.invalidate();
      sendVerification.mutate(
        { origin: window.location.origin },
        {
          onSuccess: () => {
            toast.success(
              `${t("auth.welcomeUser", { name: data.user.name })} ${t("auth.checkEmailVerify")}`,
              { duration: 6000 }
            );
          },
          onError: () => {
            toast.success(t("auth.welcomeToYukvix", { name: data.user.name }));
          },
        }
      );
      navigate("/");
    },
    onError: (err) => {
      toast.error(err.message || t("auth.registrationFailed"));
    },
  });

  const strength = passwordStrength(password);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !email || !password) {
      toast.error(t("auth.fillAllFields"));
      return;
    }
    registerMutation.mutate({ name, email, password });
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4 py-12">
      {/* Background glow */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/3 left-1/2 -translate-x-1/2 w-[600px] h-[400px] bg-amber-500/5 rounded-full blur-3xl" />
      </div>

      <div className="relative w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <Link href="/" className="inline-flex items-center gap-2 text-amber-400 hover:text-amber-300 transition-colors">
            <Crown className="w-8 h-8" />
            <span className="font-display text-2xl font-bold text-foreground">Yukvix</span>
          </Link>
          <p className="text-muted-foreground mt-2 text-sm">{t("auth.createFreeAccount")}</p>
        </div>

        {/* Card */}
        <div className="bg-card border border-border rounded-2xl p-8 shadow-2xl">
          <h1 className="text-2xl font-display font-bold text-foreground mb-2">{t("auth.joinYukvix")}</h1>
          <p className="text-muted-foreground text-sm mb-6">
            {t("auth.accessGalleries")}
          </p>

          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="name" className="text-sm font-medium text-foreground">
                {t("auth.displayName")}
              </Label>
              <Input
                id="name"
                type="text"
                placeholder={t("auth.yourName")}
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoComplete="name"
                required
                minLength={2}
                maxLength={64}
                className="bg-background border-border focus:border-amber-500/50 h-11"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="email" className="text-sm font-medium text-foreground">
                {t("auth.emailAddress")}
              </Label>
              <Input
                id="email"
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                required
                className="bg-background border-border focus:border-amber-500/50 h-11"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="password" className="text-sm font-medium text-foreground">
                {t("auth.password")}
              </Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  placeholder={t("auth.minChars")}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="new-password"
                  required
                  minLength={8}
                  className="bg-background border-border focus:border-amber-500/50 h-11 pr-11"
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
              {/* Password strength bar */}
              {password.length > 0 && (
                <div className="space-y-1">
                  <div className="flex gap-1">
                    {[1, 2, 3, 4].map((i) => (
                      <div
                        key={i}
                        className={`h-1 flex-1 rounded-full transition-all duration-300 ${
                          i <= strength.score ? strength.color : "bg-muted"
                        }`}
                      />
                    ))}
                  </div>
                  {strength.label && (
                    <p className="text-xs text-muted-foreground">{strength.label}</p>
                  )}
                </div>
              )}
            </div>

            <Button
              type="submit"
              disabled={registerMutation.isPending}
              className="w-full h-11 bg-amber-500 hover:bg-amber-400 text-black font-semibold transition-all active:scale-[0.98]"
            >
              {registerMutation.isPending ? (
                <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> {t("auth.creatingAccount")}</>
              ) : (
                <><UserPlus className="w-4 h-4 mr-2" /> {t("auth.createAccount")}</>
              )}
            </Button>
          </form>

          {/* Benefits */}
          <div className="mt-6 space-y-2">
            {[
              t("auth.benefit1"),
              t("auth.benefit2"),
              t("auth.benefit3"),
            ].map((benefit) => (
              <div key={benefit} className="flex items-center gap-2 text-xs text-muted-foreground">
                <CheckCircle2 className="w-3.5 h-3.5 text-amber-500 flex-shrink-0" />
                {benefit}
              </div>
            ))}
          </div>

          <p className="text-center text-sm text-muted-foreground mt-6">
            {t("auth.alreadyHaveAccount")}{" "}
            <Link href="/login" className="text-amber-400 hover:text-amber-300 font-medium transition-colors">
              {t("auth.signIn")}
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
