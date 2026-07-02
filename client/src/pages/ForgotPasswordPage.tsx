import { useState } from "react";
import { Link } from "wouter";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Mail, ArrowLeft, CheckCircle, Loader2, Sparkles } from "lucide-react";
import { useTranslation } from "react-i18next";

export default function ForgotPasswordPage() {
  const { t } = useTranslation();
  const [email, setEmail] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [devPreviewUrl, setDevPreviewUrl] = useState<string | null>(null);

  const forgotMutation = trpc.auth.forgotPassword.useMutation({
    onSuccess: (data) => {
      setSubmitted(true);
      // In development, the server returns a preview URL for Ethereal
      if ((data as any)._devPreviewUrl) {
        setDevPreviewUrl((data as any)._devPreviewUrl);
      }
    },
    onError: (err) => {
      toast.error(err.message || t("common.somethingWrong"));
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) {
      toast.error(t("forgotPassword.enterEmail"));
      return;
    }
    forgotMutation.mutate({
      email: email.trim(),
      origin: window.location.origin,
    });
  };

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
          {!submitted ? (
            <>
              {/* Header */}
              <div className="mb-6">
                <h1 className="text-2xl font-bold text-foreground mb-2">{t("forgotPassword.title")}</h1>
                <p className="text-muted-foreground text-sm leading-relaxed">
                  {t("forgotPassword.desc")}
                </p>
              </div>

              {/* Form */}
              <form onSubmit={handleSubmit} className="space-y-5">
                <div className="space-y-2">
                  <Label htmlFor="email" className="text-sm font-medium text-foreground">
                    {t("auth.emailAddress")}
                  </Label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                      id="email"
                      type="email"
                      placeholder="you@example.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="pl-10 bg-background border-border focus:border-primary h-11"
                      autoComplete="email"
                      autoFocus
                      disabled={forgotMutation.isPending}
                    />
                  </div>
                </div>

                <Button
                  type="submit"
                  className="w-full h-11 font-semibold"
                  disabled={forgotMutation.isPending}
                >
                  {forgotMutation.isPending ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      {t("forgotPassword.sending")}
                    </>
                  ) : (
                    t("forgotPassword.sendLink")
                  )}
                </Button>
              </form>

              {/* Back to login */}
              <div className="mt-6 text-center">
                <Link
                  href="/login"
                  className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  {t("forgotPassword.backToSignIn")}
                </Link>
              </div>
            </>
          ) : (
            /* Success state */
            <div className="text-center py-4">
              <div className="w-16 h-16 rounded-full bg-green-500/10 border border-green-500/20 flex items-center justify-center mx-auto mb-5">
                <CheckCircle className="w-8 h-8 text-green-500" />
              </div>
              <h2 className="text-xl font-bold text-foreground mb-3">{t("forgotPassword.checkInbox")}</h2>
              <p className="text-muted-foreground text-sm leading-relaxed mb-2">
                {t("forgotPassword.sentDesc", { email })}
              </p>
              <p className="text-muted-foreground text-xs">
                {t("forgotPassword.expiryNote")}
              </p>

              {/* Dev-only Ethereal preview link */}
              {devPreviewUrl && (
                <div className="mt-5 p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg text-left">
                  <p className="text-xs font-semibold text-amber-500 mb-1">🛠 Development Mode — Email Preview</p>
                  <p className="text-xs text-muted-foreground mb-2">
                    No SMTP configured. View the email in Ethereal:
                  </p>
                  <a
                    href={devPreviewUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-primary hover:underline break-all"
                  >
                    {devPreviewUrl}
                  </a>
                </div>
              )}

              <div className="mt-6 space-y-3">
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={() => {
                    setSubmitted(false);
                    setDevPreviewUrl(null);
                  }}
                >
                  {t("forgotPassword.tryDifferent")}
                </Button>
                <Link href="/login">
                  <Button variant="ghost" className="w-full text-muted-foreground">
                    <ArrowLeft className="w-3.5 h-3.5 mr-1.5" />
                    {t("forgotPassword.backToSignIn")}
                  </Button>
                </Link>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <p className="text-center text-xs text-muted-foreground mt-6">
          {t("forgotPassword.rememberPassword")}{" "}
          <Link href="/login" className="text-primary hover:underline font-medium">
            {t("auth.signIn")}
          </Link>
        </p>
      </div>
    </div>
  );
}
