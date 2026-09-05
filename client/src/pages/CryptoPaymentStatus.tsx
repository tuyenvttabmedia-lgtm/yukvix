/**
 * CryptoPaymentStatus — /payment/crypto/:orderId
 *
 * Polls DB every 5s. When NOWPayments IPN fires → DB updated → status "finished" → redirect.
 * VIP activation is webhook/server-side only. Frontend only reads status.
 */
import { useEffect, useRef } from "react";
import { useParams, useLocation } from "wouter";
import { useTranslation } from "react-i18next";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { CheckCircle2, XCircle, Clock, RefreshCw, Bitcoin, ExternalLink, AlertTriangle, Crown } from "lucide-react";
import SeoHead from "@/components/SeoHead";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";

const POLL_MS = 5_000;

export default function CryptoPaymentStatus() {
  const { t } = useTranslation();
  const params = useParams<{ orderId: string }>();
  const sessionId = params.orderId ? decodeURIComponent(params.orderId) : "";
  const [, navigate] = useLocation();
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const { data: payment, isLoading, error, refetch } = trpc.subscriptions.getCryptoPaymentStatus.useQuery(
    { sessionId },
    { enabled: !!sessionId, refetchOnWindowFocus: false, retry: 2 }
  );

  const status = payment?.status ?? "waiting";
  const isDone = status === "finished" || status === "confirmed";
  const isFailed = status === "failed" || status === "expired";
  const invoiceOpened = useRef(false);

  useEffect(() => {
    if (!isDone) return;
    toast.success(t("payment.crypto.activatedRedirect"));
    const timer = setTimeout(() => navigate("/account"), 2000);
    return () => clearTimeout(timer);
  }, [isDone, navigate, t]);

  useEffect(() => {
    if (isDone || isFailed || status === "not_found") {
      if (pollRef.current) clearInterval(pollRef.current);
      return;
    }
    pollRef.current = setInterval(() => refetch(), POLL_MS);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [status, isDone, isFailed, refetch]);

  const invoiceUrl = payment?.invoiceUrl ?? `https://nowpayments.io/payment/?iid=${sessionId}`;

  useEffect(() => {
    if (!sessionId || isDone || isFailed || status === "not_found" || isLoading) return;
    if (invoiceOpened.current) return;
    invoiceOpened.current = true;
    window.open(invoiceUrl, "_blank", "noopener,noreferrer");
  }, [sessionId, invoiceUrl, isDone, isFailed, status, isLoading]);

  return (
    <div className="min-h-screen flex flex-col">
      <SeoHead title={t("payment.crypto.seoTitle")} description={t("payment.crypto.seoDesc")} noIndex />
      <Navbar />

      <main className="flex-1 py-12">
        <div className="container max-w-lg mx-auto">

          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-primary/10 border border-primary/20 mb-3">
              <Bitcoin className="w-6 h-6 text-primary" />
            </div>
            <h1 className="text-2xl font-bold text-foreground mb-1">{t("payment.crypto.title")}</h1>
            <p className="text-sm text-muted-foreground">{t("payment.crypto.subtitle")}</p>
          </div>

          {!sessionId && (
            <div className="rounded-xl border border-border/50 bg-card p-8 text-center">
              <AlertTriangle className="w-7 h-7 text-muted-foreground mx-auto mb-3" />
              <p className="font-medium mb-1">{t("payment.crypto.invalidLink")}</p>
              <p className="text-sm text-muted-foreground mb-4">{t("payment.crypto.noPaymentId")}</p>
              <Button onClick={() => navigate("/vip")}>{t("payment.crypto.goVip")}</Button>
            </div>
          )}

          {sessionId && isLoading && (
            <div className="rounded-xl border border-border/50 bg-card p-10 text-center">
              <RefreshCw className="w-7 h-7 text-muted-foreground animate-spin mx-auto mb-3" />
              <p className="text-sm text-muted-foreground">{t("payment.crypto.loading")}</p>
            </div>
          )}

          {error && !isLoading && (
            <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-8 text-center">
              <XCircle className="w-7 h-7 text-destructive mx-auto mb-3" />
              <p className="font-medium mb-1">{t("payment.crypto.loadFailed")}</p>
              <p className="text-sm text-muted-foreground mb-4">{error.message}</p>
              <div className="flex gap-2 justify-center">
                <Button variant="outline" size="sm" onClick={() => refetch()}>
                  <RefreshCw className="w-3.5 h-3.5 mr-1.5" /> {t("common.retry")}
                </Button>
                <Button variant="ghost" size="sm" onClick={() => navigate("/vip")}>{t("common.cancel")}</Button>
              </div>
            </div>
          )}

          {isDone && (
            <div className="rounded-xl border border-primary/30 bg-primary/5 p-8 text-center">
              <CheckCircle2 className="w-10 h-10 text-primary mx-auto mb-3" />
              <h2 className="text-xl font-bold text-primary mb-1">{t("payment.crypto.activated")}</h2>
              <p className="text-sm text-muted-foreground">
                {t("payment.crypto.activatedDesc")}
              </p>
              {payment?.expiresAt && (
                <p className="text-xs text-muted-foreground mt-2">
                  {t("payment.crypto.expires", { date: new Date(payment.expiresAt).toLocaleDateString() })}
                </p>
              )}
            </div>
          )}

          {payment && !isLoading && !isDone && !isFailed && status !== "not_found" && (
            <div className="rounded-xl border border-border/50 bg-card overflow-hidden">
              <div className="flex items-center gap-2 px-5 py-3 border-b border-border/40 bg-muted/20">
                <Clock className="w-4 h-4 text-yellow-400 shrink-0" />
                <span className="text-sm font-medium text-yellow-400 flex-1">{t("payment.crypto.waiting")}</span>
                <span className="text-xs text-muted-foreground">{t("payment.crypto.autoCheck")}</span>
              </div>

              <div className="p-6 space-y-5">
                <div className="rounded-lg bg-primary/5 border border-primary/20 p-5 text-center">
                  <h2 className="text-base font-semibold mb-2">{t("payment.crypto.completeOnNow")}</h2>
                  <p className="text-sm text-muted-foreground mb-4">
                    {t("payment.crypto.sendExact")}
                  </p>
                  <Button onClick={() => window.open(invoiceUrl, "_blank")} className="gap-2">
                    <ExternalLink className="w-4 h-4" /> {t("payment.crypto.openPage")}
                  </Button>
                </div>

                <div className="text-xs text-muted-foreground space-y-1 px-1">
                  <p>• {t("payment.crypto.tipNetwork")}</p>
                  <p>• {t("payment.crypto.tipAmount")}</p>
                  <p>• {t("payment.crypto.tipKeepOpen")}</p>
                </div>

                <div className="text-xs text-muted-foreground border-t border-border/30 pt-4 font-mono truncate">
                  {t("payment.crypto.invoice")}: {sessionId}
                </div>
              </div>

              <div className="px-6 pb-5 flex gap-2">
                <Button variant="outline" size="sm" onClick={() => refetch()} className="gap-1.5">
                  <RefreshCw className="w-3.5 h-3.5" /> {t("payment.crypto.checkNow")}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => navigate("/vip")}
                  className="text-muted-foreground ml-auto"
                >
                  {t("common.cancel")}
                </Button>
              </div>
            </div>
          )}

          {isFailed && (
            <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-8 text-center">
              <XCircle className="w-8 h-8 text-destructive mx-auto mb-3" />
              <p className="font-medium mb-1">
                {status === "expired" ? t("payment.crypto.expired") : t("payment.crypto.failed")}
              </p>
              <p className="text-sm text-muted-foreground mb-4">
                {status === "expired"
                  ? t("payment.crypto.expiredDesc")
                  : t("payment.crypto.failedDesc")}
              </p>
              <Button onClick={() => navigate("/vip")} className="gap-1.5">
                <Crown className="w-4 h-4" /> {t("payment.crypto.tryAgain")}
              </Button>
            </div>
          )}

          {status === "not_found" && !isLoading && (
            <div className="rounded-xl border border-border/50 bg-card p-8 text-center">
              <AlertTriangle className="w-7 h-7 text-muted-foreground mx-auto mb-3" />
              <p className="font-medium mb-1">{t("payment.crypto.notFound")}</p>
              <p className="text-sm text-muted-foreground mb-4">{payment?.message}</p>
              <div className="flex gap-2 justify-center">
                <Button onClick={() => navigate("/vip")} className="gap-1.5">
                  <Crown className="w-4 h-4" /> {t("payment.crypto.startNew")}
                </Button>
                <Button variant="outline" onClick={() => window.open(invoiceUrl, "_blank")} className="gap-1.5">
                  <ExternalLink className="w-3.5 h-3.5" /> {t("payment.crypto.checkNowpayments")}
                </Button>
              </div>
            </div>
          )}

        </div>
      </main>

      <Footer />
    </div>
  );
}
