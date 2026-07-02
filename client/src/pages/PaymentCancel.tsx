import { XCircle } from "lucide-react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { useTranslation } from "react-i18next";

export default function PaymentCancel() {
  const { t } = useTranslation();
  return (
    <div className="min-h-screen flex items-center justify-center py-12">
      <div className="text-center max-w-md mx-auto px-4 animate-slide-up">
        <div className="w-20 h-20 rounded-full bg-destructive/10 border-2 border-destructive/30 flex items-center justify-center mx-auto mb-6">
          <XCircle className="w-10 h-10 text-destructive" />
        </div>
        <h1
          className="text-3xl font-bold text-foreground mb-3"
          style={{ fontFamily: "'Playfair Display', serif" }}
        >
          {t("payment.cancel.title")}
        </h1>
        <p className="text-muted-foreground mb-8">
          {t("payment.cancel.desc")}
        </p>
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Link href="/vip">
            <Button className="bg-primary text-primary-foreground hover:bg-primary/90">
              {t("payment.cancel.tryAgain")}
            </Button>
          </Link>
          <Link href="/">
            <Button variant="outline" className="border-border hover:border-primary/50">
              {t("common.goHome")}
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
