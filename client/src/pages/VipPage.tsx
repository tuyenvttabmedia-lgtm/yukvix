import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import SeoHead from "@/components/SeoHead";
import {
  Check,
  Crown,
  Loader2,
  Sparkles,
  Zap,
  CreditCard,
  Bitcoin,
  ChevronDown,
  ChevronUp,
  Info,
  Shield,
} from "lucide-react";
import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Link, useLocation } from "wouter";
import { useTranslation } from "react-i18next";

type PaymentMethod = "ccbill" | "crypto";

interface Plan {
  id: number;
  name: string;
  price: string | number;
  intervalDays: number;
  description: string;
  features: string[];
}

function getBestValuePlan(plans: Plan[]): Plan | null {
  if (!plans.length) return null;
  // Plan with most days per dollar is best value
  return plans.reduce((best, p) =>
    p.intervalDays / Number(p.price) > best.intervalDays / Number(best.price) ? p : best
  );
}

export default function VipPage() {
  const { user, isAuthenticated } = useAuth();
  const { t } = useTranslation();
  const [loadingPlanId, setLoadingPlanId] = useState<number | null>(null);
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState<PaymentMethod>("ccbill");
  const [selectedPlanId, setSelectedPlanId] = useState<number | null>(null);
  const [expandedFaq, setExpandedFaq] = useState<number | null>(null);

  const isVip = user?.role === "vip" || user?.role === "admin" || user?.role === "super_admin";

  const { data: plans } = trpc.subscriptions.plans.useQuery();
  const { data: mySubscription } = trpc.subscriptions.mySubscription.useQuery(undefined, {
    enabled: isAuthenticated,
  });
  const { data: availableMethods } = trpc.subscriptions.availablePaymentMethods.useQuery();

  const [, navigate] = useLocation();

  // Auto-select best value plan on load
  useEffect(() => {
    if (plans && plans.length > 0 && selectedPlanId === null) {
      const best = getBestValuePlan(plans as Plan[]);
      if (best) setSelectedPlanId(best.id);
    }
  }, [plans, selectedPlanId]);

  // Auto-select payment method based on availability
  useEffect(() => {
    if (!availableMethods) return;
    const hasCcbill = availableMethods.some((m: { id: string }) => m.id === "ccbill");
    const hasCrypto = availableMethods.some((m: { id: string }) => m.id === "crypto");
    if (!hasCcbill && hasCrypto && selectedPaymentMethod === "ccbill") {
      setSelectedPaymentMethod("crypto");
    }
  }, [availableMethods, selectedPaymentMethod]);

  const createCheckout = trpc.subscriptions.createCheckout.useMutation({
    onSuccess: (data) => {
      setLoadingPlanId(null);
      if (!data.url && !data.sessionId) {
        toast.error("Failed to create checkout session");
        return;
      }
      if (selectedPaymentMethod === "crypto" && data.sessionId) {
        navigate(`/payment/crypto/${encodeURIComponent(data.sessionId)}`);
      } else if (data.url) {
        toast.info("Redirecting to secure checkout...");
        window.location.href = data.url;
      } else {
        toast.error("Failed to create checkout session");
      }
    },
    onError: (err) => {
      toast.error(err.message || "Payment system not available");
      setLoadingPlanId(null);
    },
  });

  const handleSelectPaymentMethod = (method: PaymentMethod) => {
    setSelectedPaymentMethod(method);
  };

  const handleSubscribe = () => {
    const planId = selectedPlanId;
    if (!planId) {
      toast.error("Please select a plan first");
      return;
    }
    if (!isAuthenticated) {
      window.location.href = "/login?redirect=/vip";
      return;
    }
    setLoadingPlanId(planId);
    createCheckout.mutate({
      planId,
      paymentMethod: selectedPaymentMethod,
      successUrl: `${window.location.origin}/payment/success`,
      cancelUrl: `${window.location.origin}/payment/cancel`,
    });
  };

  const selectedPlan = plans?.find((p) => p.id === selectedPlanId) as Plan | undefined;
  const bestValuePlan = plans ? getBestValuePlan(plans as Plan[]) : null;

  const features = [
    t("vip.features.unlimited"),
    t("vip.features.hd"),
    t("vip.features.adfree"),
    t("vip.features.support"),
    t("vip.features.earlyAccess"),
    t("vip.features.spotlights"),
  ];

  const faqs = [
    { q: t("vip.faq.q1"), a: t("vip.faq.a1") },
    { q: t("vip.faq.q2"), a: t("vip.faq.a2", { min: 10 }) },
    { q: t("vip.faq.q3"), a: t("vip.faq.a3") },
    { q: t("vip.faq.q4"), a: t("vip.faq.a4") },
    { q: t("vip.faq.q5"), a: t("vip.faq.a5") },
  ];

  const isCcbillAvailable = availableMethods?.some((m: { id: string }) => m.id === "ccbill") ?? true;
  const isCryptoAvailable = availableMethods?.some((m: { id: string }) => m.id === "crypto") ?? true;

  return (
    <div className="min-h-screen py-6">
      <SeoHead
        title="VIP Membership — Unlock Exclusive Galleries"
        description="Join Yukvix VIP to access thousands of exclusive high-resolution cosplay galleries. Unlimited downloads, early access, and more."
        keywords="VIP cosplay membership, premium cosplay photos, exclusive cosplay galleries, cosplay subscription"
        canonical={typeof window !== "undefined" ? window.location.origin + "/vip" : undefined}
        ogType="website"
      />
      <div className="container max-w-4xl mx-auto">
        {/* Header */}
        <div className="text-center mb-6">
          <div className="inline-flex items-center gap-3 justify-center mb-3">
            <div className="inline-flex items-center justify-center w-10 h-10 rounded-xl bg-primary/10 border border-primary/20">
              <Crown className="w-5 h-5 text-primary" />
            </div>
            <h1
              className="text-2xl md:text-4xl font-bold text-foreground"
              style={{ fontFamily: "'Playfair Display', serif" }}
            >
              {t("vip.title")}
            </h1>
          </div>
          <p className="text-base text-muted-foreground max-w-xl mx-auto">
            {t("vip.subtitle")}
          </p>
        </div>

        {/* Active VIP banner */}
        {isVip && mySubscription && (
          <div
            className="mb-8 rounded-xl p-6 text-center"
            style={{
              background: "linear-gradient(135deg, oklch(0.14 0.015 50 / 0.3), oklch(0.12 0.008 260))",
              border: "1px solid oklch(0.72 0.18 50 / 0.4)",
            }}
          >
            <div className="flex items-center justify-center gap-2 mb-2">
              <Crown className="w-5 h-5 text-primary" />
              <span className="font-semibold text-primary">{t("vip.activeVip")}</span>
            </div>
            <p className="text-sm text-muted-foreground">
              {t("vip.activeUntil")}{" "}
              <strong className="text-foreground">
                {mySubscription.expiresAt
                  ? new Date(mySubscription.expiresAt).toLocaleDateString()
                  : "—"}
              </strong>
            </p>
            <Link href="/account">
              <Button variant="outline" size="sm" className="mt-3 gap-1">
                {t("vip.manageSubscription")}
              </Button>
            </Link>
          </div>
        )}

        {!isVip && (
          <>
            {/* -- STEP 1: Plan Selector -- */}
            <div className="mb-8">
              <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-4 text-center">
                {t("vip.step1")}
              </p>
              <div className="grid md:grid-cols-3 gap-4">
                {plans ? (
                  (plans as Plan[]).map((plan) => {
                    const isSelected = selectedPlanId === plan.id;
                    const isBestValue = bestValuePlan?.id === plan.id;
                    const monthlyEquiv =
                      plan.intervalDays >= 180
                        ? `$${(Number(plan.price) / Math.round(plan.intervalDays / 30)).toFixed(2)}/mo`
                        : null;
                    // Calculate savings vs 1-month plan price
                    const monthlyPlan = (plans as Plan[]).find((p) => p.intervalDays < 60);
                    const baseMonthlyPrice = monthlyPlan ? Number(monthlyPlan.price) : null;
                    const savingPct =
                      plan.intervalDays >= 180 && baseMonthlyPrice
                        ? Math.round(
                            (1 - Number(plan.price) / Math.round(plan.intervalDays / 30) / baseMonthlyPrice) * 100
                          )
                        : null;

                    return (
                      <button
                        key={plan.id}
                        onClick={() => setSelectedPlanId(plan.id)}
                        className={`relative rounded-2xl p-5 text-left transition-all duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
                          isSelected
                            ? "border-2 border-primary shadow-lg shadow-primary/15 scale-[1.02]"
                            : "border border-border/50 hover:border-primary/40 hover:shadow-md hover:shadow-primary/5 hover:scale-[1.01]"
                        }`}
                        style={{
                          background: isSelected
                            ? "linear-gradient(135deg, oklch(0.14 0.015 50 / 0.5), oklch(0.12 0.008 260))"
                            : "oklch(0.12 0.008 260)",
                        }}
                      >
                        {/* Best value badge */}
                        {isBestValue && (
                          <div className="absolute -top-3 left-1/2 -translate-x-1/2 z-10">
                            <span className="vip-badge flex items-center gap-1 px-3 py-1 text-xs">
                              <Sparkles className="w-3 h-3" />
                              {t("vip.bestValue")}
                            </span>
                          </div>
                        )}

                        {/* Selected indicator */}
                        <div
                          className={`absolute top-3 right-3 w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all duration-200 ${
                            isSelected
                              ? "border-primary bg-primary"
                              : "border-border/50 bg-transparent"
                          }`}
                        >
                          {isSelected && <Check className="w-3 h-3 text-primary-foreground" />}
                        </div>

                        <div className="mb-3 pr-6">
                          <h3 className="font-bold text-foreground text-base">{plan.name}</h3>
                          <p className="text-xs text-muted-foreground mt-0.5">{plan.description}</p>
                        </div>

                        <div className="mb-2">
                          <div className="flex items-baseline gap-1">
                            <span className="text-3xl font-bold text-foreground">${plan.price}</span>
                            <span className="text-sm text-muted-foreground">
                              /{plan.intervalDays >= 365 ? "yr" : plan.intervalDays >= 180 ? "6mo" : "mo"}
                            </span>
                          </div>
                          {monthlyEquiv && (
                            <p className="text-xs text-primary mt-1">
                              {monthlyEquiv} · Save {savingPct}%
                            </p>
                          )}
                        </div>

                        {/* Payment method indicators */}
                        <div className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground/70">
                          {isCcbillAvailable && <CreditCard className="w-3 h-3" />}
                          {isCcbillAvailable && isCryptoAvailable && <span>+</span>}
                          {isCryptoAvailable && <Bitcoin className="w-3 h-3" />}
                          <span>{isCcbillAvailable && isCryptoAvailable ? t("vip.cardOrCrypto") : isCryptoAvailable ? "Crypto" : t("vip.cardOnly")}</span>
                        </div>
                      </button>
                    );
                  })
                ) : (
                  [1, 2, 3].map((i) => (
                    <div key={i} className="rounded-2xl border border-border/50 p-5 h-36">
                      <div className="h-5 skeleton rounded w-1/2 mb-3" />
                      <div className="h-8 skeleton rounded w-1/3 mb-3" />
                      <div className="h-3 skeleton rounded w-2/3" />
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* -- STEP 2: Payment Method -- */}
            <div className="mb-8">
              <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-4 text-center">
                {t("vip.step2")}
              </p>

              <div className={`grid gap-4 ${isCcbillAvailable && isCryptoAvailable ? 'sm:grid-cols-2' : 'max-w-sm mx-auto'}`}>
                {/* CCBill - only show if available */}
                {isCcbillAvailable && <button
                  onClick={() => handleSelectPaymentMethod("ccbill")}
                  disabled={!isCcbillAvailable}
                  className={`relative flex items-start gap-4 p-5 rounded-2xl border text-left transition-all duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
                    selectedPaymentMethod === "ccbill"
                      ? "border-2 border-primary shadow-lg shadow-primary/10 scale-[1.01]"
                      : isCcbillAvailable
                      ? "border border-border/50 hover:border-primary/40 hover:shadow-md hover:scale-[1.01]"
                      : "border border-border/30 opacity-40 cursor-not-allowed"
                  }`}
                  style={{
                    background:
                      selectedPaymentMethod === "ccbill"
                        ? "linear-gradient(135deg, oklch(0.14 0.015 50 / 0.4), oklch(0.12 0.008 260))"
                        : "oklch(0.12 0.008 260)",
                  }}
                >
                  <div
                    className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 transition-colors ${
                      selectedPaymentMethod === "ccbill"
                        ? "bg-primary/15 text-primary"
                        : "bg-muted/50 text-muted-foreground"
                    }`}
                  >
                    <CreditCard className="w-6 h-6" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <span className="font-semibold text-foreground">{t("vip.creditCard")}</span>
                      <Badge variant="secondary" className="text-xs px-1.5 py-0">
                        {t("vip.recommended")}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">{t("vip.ccbillDesc")}</p>
                    <div className="flex items-center gap-1 mt-2 text-xs text-muted-foreground/70">
                      <Shield className="w-3 h-3" />
                      <span>{t("vip.allPlansSupported")}</span>
                    </div>
                  </div>
                  {/* Selected dot */}
                  <div
                    className={`absolute top-4 right-4 w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all duration-200 ${
                      selectedPaymentMethod === "ccbill"
                        ? "border-primary bg-primary"
                        : "border-border/50 bg-transparent"
                    }`}
                  >
                    {selectedPaymentMethod === "ccbill" && (
                      <Check className="w-3 h-3 text-primary-foreground" />
                    )}
                  </div>
                </button>}

                {/* Crypto */}
                {(() => {
                  const cryptoEnabled = isCryptoAvailable;
                  const isSelected = selectedPaymentMethod === "crypto";
                  return (
                    <button
                      onClick={() => handleSelectPaymentMethod("crypto")}
                      disabled={!cryptoEnabled}
                      className={`relative flex items-start gap-4 p-5 rounded-2xl border text-left transition-all duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
                        isSelected
                          ? "border-2 border-primary shadow-lg shadow-primary/10 scale-[1.01]"
                          : cryptoEnabled
                          ? "border border-border/50 hover:border-primary/40 hover:shadow-md hover:scale-[1.01]"
                          : "border border-border/30 opacity-40 cursor-not-allowed"
                      }`}
                      style={{
                        background: isSelected
                          ? "linear-gradient(135deg, oklch(0.14 0.015 50 / 0.4), oklch(0.12 0.008 260))"
                          : "oklch(0.12 0.008 260)",
                      }}
                    >
                      <div
                        className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 transition-colors ${
                          isSelected ? "bg-primary/15 text-primary" : "bg-muted/50 text-muted-foreground"
                        }`}
                      >
                        <Bitcoin className="w-6 h-6" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap mb-1">
                          <span className="font-semibold text-foreground">{t("vip.cryptoUsdt")}</span>
                          <Badge variant="secondary" className="text-xs px-1.5 py-0 bg-emerald-500/15 text-emerald-400 border-emerald-500/20">
                            No KYC
                          </Badge>

                        </div>
                        <p className="text-xs text-muted-foreground">{t("vip.cryptoDesc")}</p>
                        <div className="flex items-center gap-1 mt-2 text-xs text-muted-foreground/70">
                          <Info className="w-3 h-3" />
                          <span>{t("vip.cryptoAvailable")}</span>
                        </div>
                      </div>
                      {/* Selected dot */}
                      <div
                        className={`absolute top-4 right-4 w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all duration-200 ${
                          isSelected ? "border-primary bg-primary" : "border-border/50 bg-transparent"
                        }`}
                      >
                        {isSelected && <Check className="w-3 h-3 text-primary-foreground" />}
                      </div>
                    </button>
                  );
                })()}
              </div>
            </div>

            {/* -- STEP 3: Order Summary + CTA -- */}
            {selectedPlan && (
              <div
                className="mb-10 rounded-2xl p-6 border border-primary/20"
                style={{
                  background: "linear-gradient(135deg, oklch(0.13 0.012 50 / 0.4), oklch(0.11 0.008 260))",
                }}
              >
                <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-4">
                  {t("vip.orderSummary")}
                </p>

                {/* Plan breakdown */}
                <div className="space-y-2 mb-4">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-foreground/80">{selectedPlan.name}</span>
                    <span className="font-bold text-foreground">${selectedPlan.price}</span>
                  </div>
                  {selectedPlan.intervalDays >= 180 && (() => {
                    const months = Math.round(selectedPlan.intervalDays / 30);
                    const perMonth = (Number(selectedPlan.price) / months).toFixed(2);
                    const monthlyPlan = (plans as Plan[]).find((p) => p.intervalDays < 60);
                    const saved = monthlyPlan
                      ? ((Number(monthlyPlan.price) * months) - Number(selectedPlan.price)).toFixed(2)
                      : null;
                    return (
                      <>
                        <div className="flex items-center justify-between text-xs text-muted-foreground">
                          <span>${perMonth}/tháng × {months} tháng</span>
                          <span className="text-emerald-400">
                            {saved && Number(saved) > 0 ? `Tiết kiệm $${saved}` : ""}
                          </span>
                        </div>
                      </>
                    );
                  })()}
                </div>

                {/* Divider */}
                <div className="border-t border-border/30 mb-4" />

                <div className="flex items-center justify-between mb-5 text-xs text-muted-foreground">
                  <span>
                    {t("vip.paymentVia")}{" "}
                    <span className="text-foreground/70">
                      {selectedPaymentMethod === "ccbill" ? t("vip.ccbillLabel") : t("vip.nowpaymentsLabel")}
                    </span>
                  </span>
                  <span>
                    {selectedPlan.intervalDays >= 365
                      ? "12 months"
                      : selectedPlan.intervalDays >= 180
                      ? "6 months"
                      : "1 month"}{" "}
                    access
                  </span>
                </div>
                <Button
                  className="w-full gap-2 text-base py-5"
                  onClick={handleSubscribe}
                  disabled={loadingPlanId === selectedPlan.id || isVip}
                >
                  {loadingPlanId === selectedPlan.id ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      {t("common.processing")}
                    </>
                  ) : selectedPaymentMethod === "crypto" ? (
                    <>
                      <Bitcoin className="w-4 h-4" />
                      {t("vip.payWithUsdt", { price: selectedPlan.price })}
                    </>
                  ) : (
                    <>
                      <Crown className="w-4 h-4" />
                      {t("vip.getPlan", { name: selectedPlan.name, price: selectedPlan.price })}
                    </>
                  )}
                </Button>
                <p className="text-center text-xs text-muted-foreground mt-3">
                  {selectedPaymentMethod === "ccbill"
                    ? t("vip.ccbillRedirect")
                    : t("vip.cryptoRedirect")}
                </p>

                {/* Trust badges */}
                <div className="flex items-center justify-center gap-4 mt-4 pt-4 border-t border-border/20">
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground/60">
                    <Shield className="w-3.5 h-3.5" />
                    <span>Thanh toán bảo mật</span>
                  </div>
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground/60">
                    <Check className="w-3.5 h-3.5" />
                    <span>Kích hoạt ngay</span>
                  </div>
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground/60">
                    <Crown className="w-3.5 h-3.5" />
                    <span>Truy cập đầy đủ</span>
                  </div>
                </div>
              </div>
            )}
          </>
        )}

        {/* Features list */}
        <div className="rounded-2xl border border-border/50 p-8 bg-card mb-10">
          <h2
            className="text-xl font-bold text-foreground mb-6 text-center"
            style={{ fontFamily: "'Playfair Display', serif" }}
          >
            {t("vip.everythingIncluded")}
          </h2>
          <div className="grid sm:grid-cols-2 gap-4">
            {features.map((feature) => (
              <div key={feature} className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                  <Zap className="w-4 h-4 text-primary" />
                </div>
                <span className="text-sm text-foreground/80">{feature}</span>
              </div>
            ))}
          </div>
        </div>

        {/* FAQ */}
        <div className="mb-10">
          <h2
            className="text-xl font-bold text-foreground mb-5 text-center"
            style={{ fontFamily: "'Playfair Display', serif" }}
          >
            {t("vip.faqTitle")}
          </h2>
          <div className="space-y-2">
            {faqs.map((faq, i) => (
              <div key={i} className="rounded-xl border border-border/50 bg-card overflow-hidden">
                <button
                  className="w-full flex items-center justify-between px-5 py-4 text-left hover:bg-muted/20 transition-colors"
                  onClick={() => setExpandedFaq(expandedFaq === i ? null : i)}
                >
                  <span className="text-sm font-medium text-foreground">{faq.q}</span>
                  {expandedFaq === i ? (
                    <ChevronUp className="w-4 h-4 text-muted-foreground shrink-0" />
                  ) : (
                    <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" />
                  )}
                </button>
                {expandedFaq === i && (
                  <div className="px-5 pb-4 text-sm text-muted-foreground border-t border-border/30 pt-3">
                    {faq.a}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Footer note */}
        <div className="text-center text-sm text-muted-foreground">
          <p>{t("vip.footerNote")}</p>
          <p className="mt-1">
            {t("vip.questions")}{" "}
            <Link href="/contact" className="text-primary hover:underline">
              {t("vip.contactSupport")}
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
