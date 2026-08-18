import { useEffect, useState } from "react";
import { Link, useLocation } from "wouter";
import { useTranslation } from "react-i18next";
import { Crown } from "lucide-react";
import { Button } from "@/components/ui/button";

const STORAGE_KEY = "yukvix_age_confirmed";

const SKIP_PREFIXES = [
  "/privacy",
  "/terms",
  "/dmca",
  "/contact",
  "/about",
  "/info",
  "/login",
  "/register",
  "/forgot-password",
  "/reset-password",
  "/verify-email",
  "/admin",
  "/vip",
  "/payment",
];

function shouldSkip(path: string): boolean {
  return SKIP_PREFIXES.some((p) => path === p || path.startsWith(`${p}/`));
}

export default function AgeGate() {
  const { t } = useTranslation();
  const [location] = useLocation();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (shouldSkip(location)) {
      setOpen(false);
      return;
    }
    try {
      setOpen(localStorage.getItem(STORAGE_KEY) !== "1");
    } catch {
      setOpen(true);
    }
  }, [location]);

  if (!open) return null;

  const confirm = () => {
    try {
      localStorage.setItem(STORAGE_KEY, "1");
    } catch {
      // ignore quota / private mode
    }
    setOpen(false);
  };

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm px-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="age-gate-title"
    >
      <div className="w-full max-w-md rounded-2xl border border-border bg-card p-8 shadow-2xl">
        <div className="mb-5 flex items-center justify-center gap-2 text-amber-400">
          <Crown className="h-7 w-7" />
          <span className="font-display text-xl font-bold text-foreground">Yukvix</span>
        </div>
        <h1 id="age-gate-title" className="mb-3 text-center text-2xl font-bold text-foreground">
          {t("ageGate.title")}
        </h1>
        <p className="mb-6 text-center text-sm leading-relaxed text-muted-foreground">
          {t("ageGate.body")}
        </p>
        <div className="flex flex-col gap-2">
          <Button className="h-11 w-full bg-amber-500 font-semibold text-black hover:bg-amber-400" onClick={confirm}>
            {t("ageGate.confirm")}
          </Button>
          <Button variant="outline" className="h-11 w-full" asChild>
            <a href="https://www.google.com">{t("ageGate.leave")}</a>
          </Button>
        </div>
        <p className="mt-4 text-center text-xs text-muted-foreground">
          {t("ageGate.legal")}{" "}
          <Link href="/privacy" className="underline hover:text-foreground">
            {t("ageGate.privacy")}
          </Link>
          {" · "}
          <Link href="/terms" className="underline hover:text-foreground">
            {t("ageGate.terms")}
          </Link>
        </p>
      </div>
    </div>
  );
}
