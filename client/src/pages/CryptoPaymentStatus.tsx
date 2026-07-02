/**
 * CryptoPaymentStatus — /payment/crypto/:orderId
 *
 * Polls DB every 5s. When NOWPayments IPN fires → DB updated → status "finished" → redirect.
 * VIP activation is webhook/server-side only. Frontend only reads status.
 */
import { useEffect, useRef } from "react";
import { useParams, useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { CheckCircle2, XCircle, Clock, RefreshCw, Bitcoin, ExternalLink, AlertTriangle, Crown } from "lucide-react";
import SeoHead from "@/components/SeoHead";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";

const POLL_MS = 5_000;

export default function CryptoPaymentStatus() {
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

  // Auto-redirect on success
  useEffect(() => {
    if (!isDone) return;
    toast.success("VIP activated! Redirecting...");
    const t = setTimeout(() => navigate("/account"), 2000);
    return () => clearTimeout(t);
  }, [isDone, navigate]);

  // Polling — stop when terminal
  useEffect(() => {
    if (isDone || isFailed || status === "not_found") {
      if (pollRef.current) clearInterval(pollRef.current);
      return;
    }
    pollRef.current = setInterval(() => refetch(), POLL_MS);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [status, isDone, isFailed, refetch]);

  const invoiceUrl = payment?.invoiceUrl ?? `https://nowpayments.io/payment/?iid=${sessionId}`;

  return (
    <div className="min-h-screen flex flex-col">
      <SeoHead title="Crypto Payment — Yukvix" description="Complete your USDT crypto payment." noIndex />
      <Navbar />

      <main className="flex-1 py-12">
        <div className="container max-w-lg mx-auto">

          {/* Header */}
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-primary/10 border border-primary/20 mb-3">
              <Bitcoin className="w-6 h-6 text-primary" />
            </div>
            <h1 className="text-2xl font-bold text-foreground mb-1">Crypto Payment</h1>
            <p className="text-sm text-muted-foreground">Pay with USDT to activate VIP access.</p>
          </div>

          {/* No session */}
          {!sessionId && (
            <div className="rounded-xl border border-border/50 bg-card p-8 text-center">
              <AlertTriangle className="w-7 h-7 text-muted-foreground mx-auto mb-3" />
              <p className="font-medium mb-1">Invalid payment link</p>
              <p className="text-sm text-muted-foreground mb-4">No payment ID found.</p>
              <Button onClick={() => navigate("/vip")}>Go to VIP page</Button>
            </div>
          )}

          {/* Loading */}
          {sessionId && isLoading && (
            <div className="rounded-xl border border-border/50 bg-card p-10 text-center">
              <RefreshCw className="w-7 h-7 text-muted-foreground animate-spin mx-auto mb-3" />
              <p className="text-sm text-muted-foreground">Loading payment status...</p>
            </div>
          )}

          {/* API Error */}
          {error && !isLoading && (
            <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-8 text-center">
              <XCircle className="w-7 h-7 text-destructive mx-auto mb-3" />
              <p className="font-medium mb-1">Unable to load payment status</p>
              <p className="text-sm text-muted-foreground mb-4">{error.message}</p>
              <div className="flex gap-2 justify-center">
                <Button variant="outline" size="sm" onClick={() => refetch()}>
                  <RefreshCw className="w-3.5 h-3.5 mr-1.5" /> Retry
                </Button>
                <Button variant="ghost" size="sm" onClick={() => navigate("/vip")}>Cancel</Button>
              </div>
            </div>
          )}

          {/* Success */}
          {isDone && (
            <div className="rounded-xl border border-primary/30 bg-primary/5 p-8 text-center">
              <CheckCircle2 className="w-10 h-10 text-primary mx-auto mb-3" />
              <h2 className="text-xl font-bold text-primary mb-1">VIP Activated!</h2>
              <p className="text-sm text-muted-foreground">
                Payment confirmed. Redirecting to your account...
              </p>
              {payment?.expiresAt && (
                <p className="text-xs text-muted-foreground mt-2">
                  VIP expires: {new Date(payment.expiresAt).toLocaleDateString()}
                </p>
              )}
            </div>
          )}

          {/* Waiting */}
          {payment && !isLoading && !isDone && !isFailed && status !== "not_found" && (
            <div className="rounded-xl border border-border/50 bg-card overflow-hidden">
              <div className="flex items-center gap-2 px-5 py-3 border-b border-border/40 bg-muted/20">
                <Clock className="w-4 h-4 text-yellow-400 shrink-0" />
                <span className="text-sm font-medium text-yellow-400 flex-1">Waiting for payment</span>
                <span className="text-xs text-muted-foreground">Auto-checks every 5s</span>
              </div>

              <div className="p-6 space-y-5">
                <div className="rounded-lg bg-primary/5 border border-primary/20 p-5 text-center">
                  <h2 className="text-base font-semibold mb-2">Complete payment on NOWPayments</h2>
                  <p className="text-sm text-muted-foreground mb-4">
                    Send the exact USDT amount shown on the payment page to activate VIP.
                  </p>
                  <Button onClick={() => window.open(invoiceUrl, "_blank")} className="gap-2">
                    <ExternalLink className="w-4 h-4" /> Open Payment Page
                  </Button>
                </div>

                <div className="text-xs text-muted-foreground space-y-1 px-1">
                  <p>• Select USDT network (TRC20 or BEP20) on the payment page.</p>
                  <p>• Send the <strong className="text-foreground">exact amount</strong> — VIP activates automatically after 1–3 confirmations.</p>
                  <p>• Keep this page open. It checks every 5 seconds.</p>
                </div>

                <div className="text-xs text-muted-foreground border-t border-border/30 pt-4 font-mono truncate">
                  Invoice: {sessionId}
                </div>
              </div>

              <div className="px-6 pb-5 flex gap-2">
                <Button variant="outline" size="sm" onClick={() => refetch()} className="gap-1.5">
                  <RefreshCw className="w-3.5 h-3.5" /> Check now
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => navigate("/vip")}
                  className="text-muted-foreground ml-auto"
                >
                  Cancel
                </Button>
              </div>
            </div>
          )}

          {/* Failed / Expired */}
          {isFailed && (
            <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-8 text-center">
              <XCircle className="w-8 h-8 text-destructive mx-auto mb-3" />
              <p className="font-medium mb-1">
                Payment {status === "expired" ? "expired" : "failed"}
              </p>
              <p className="text-sm text-muted-foreground mb-4">
                {status === "expired"
                  ? "The payment window has expired. Please start a new payment."
                  : "Something went wrong. Please try again."}
              </p>
              <Button onClick={() => navigate("/vip")} className="gap-1.5">
                <Crown className="w-4 h-4" /> Try again
              </Button>
            </div>
          )}

          {/* Not found */}
          {status === "not_found" && !isLoading && (
            <div className="rounded-xl border border-border/50 bg-card p-8 text-center">
              <AlertTriangle className="w-7 h-7 text-muted-foreground mx-auto mb-3" />
              <p className="font-medium mb-1">Payment session not found</p>
              <p className="text-sm text-muted-foreground mb-4">{payment?.message}</p>
              <div className="flex gap-2 justify-center">
                <Button onClick={() => navigate("/vip")} className="gap-1.5">
                  <Crown className="w-4 h-4" /> Start new payment
                </Button>
                <Button variant="outline" onClick={() => window.open(invoiceUrl, "_blank")} className="gap-1.5">
                  <ExternalLink className="w-3.5 h-3.5" /> Check NOWPayments
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
