import { trpc } from "@/lib/trpc";
import { isVipOrAdmin } from "@shared/const";
import { CheckCircle, Crown, Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useSearch } from "wouter";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";

export default function PaymentSuccess() {
  const { t } = useTranslation();
  const searchStr = useSearch();
  const params = new URLSearchParams(searchStr.startsWith("?") ? searchStr.slice(1) : searchStr);
  const sessionId = params.get("session_id");
  const [verified, setVerified] = useState(false);
  const [verifying, setVerifying] = useState(true);

  const { data: me } = trpc.auth.me.useQuery(undefined, {
    refetchInterval: verifying && !verified ? 3000 : false,
  });
  const { data: sub } = trpc.subscriptions.mySubscription.useQuery(undefined, {
    refetchInterval: verifying && !verified ? 3000 : false,
  });

  const verifyPayment = trpc.subscriptions.verifyPayment.useMutation({
    onSuccess: (data) => {
      if (data.success) {
        setVerified(true);
        toast.success(t("payment.success.activated"));
      }
      setVerifying(false);
    },
    onError: () => {
      setVerifying(false);
      toast.error(t("payment.success.verifyFailed"));
    },
  });

  useEffect(() => {
    if (isVipOrAdmin(me?.role) || sub?.status === "active") {
      setVerified(true);
      setVerifying(false);
    }
  }, [me, sub]);

  useEffect(() => {
    if (sessionId) {
      verifyPayment.mutate({ sessionId });
      return;
    }
    const timer = setTimeout(() => setVerifying(false), 120000);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);

  return (
    <div className="min-h-screen flex items-center justify-center py-12">
      <div className="text-center max-w-md mx-auto px-4">
        {verifying && !verified ? (
          <div>
            <Loader2 className="w-12 h-12 text-primary animate-spin mx-auto mb-4" />
            <h2 className="text-xl font-semibold text-foreground">
              {t("payment.success.verifying")}
            </h2>
            <p className="text-muted-foreground mt-2">
              {t("payment.success.verifyingDesc")}
            </p>
          </div>
        ) : verified ? (
          <div className="animate-slide-up">
            <div className="w-20 h-20 rounded-full bg-primary/10 border-2 border-primary/30 flex items-center justify-center mx-auto mb-6">
              <CheckCircle className="w-10 h-10 text-primary" />
            </div>
            <h1
              className="text-3xl font-bold text-foreground mb-3"
              style={{ fontFamily: "'Playfair Display', serif" }}
            >
              {t("payment.success.welcomeVip")}
            </h1>
            <p className="text-muted-foreground mb-8">
              {t("payment.success.welcomeVipDesc")}
            </p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <Link href="/gallery">
                <Button className="bg-primary text-primary-foreground hover:bg-primary/90 gap-2">
                  <Crown className="w-4 h-4" />
                  {t("payment.success.exploreVip")}
                </Button>
              </Link>
              <Link href="/account">
                <Button variant="outline" className="border-border hover:border-primary/50">
                  {t("payment.success.myAccount")}
                </Button>
              </Link>
            </div>
          </div>
        ) : (
          <div>
            <h2 className="text-xl font-semibold text-foreground mb-3">
              {t("payment.success.unknownStatus")}
            </h2>
            <p className="text-muted-foreground mb-6">
              {t("payment.success.unknownStatusDesc")}
            </p>
            <Link href="/vip">
              <Button variant="outline">{t("payment.success.backToVip")}</Button>
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
