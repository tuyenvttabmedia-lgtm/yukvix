import { useEffect, useState } from "react";
import { Link, useLocation } from "wouter";
import { useTranslation } from "react-i18next";
import { Crown } from "lucide-react";
import { Button } from "@/components/ui/button";

const STORAGE_KEY = "yukvix_age_confirmed";
const COOKIE_NAME = "yukvix_age_confirmed";
const CANONICAL_ORIGIN =
  (import.meta.env.VITE_APP_URL as string | undefined)?.replace(/\/$/, "") || "https://yukvix.com";
const CANONICAL_HOST = new URL(CANONICAL_ORIGIN).hostname;

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

function readCookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  const prefix = `${name}=`;
  for (const part of document.cookie.split(";")) {
    const trimmed = part.trim();
    if (trimmed.startsWith(prefix)) return decodeURIComponent(trimmed.slice(prefix.length));
  }
  return null;
}

function isAgeConfirmed(): boolean {
  try {
    if (localStorage.getItem(STORAGE_KEY) === "1") return true;
  } catch {
    /* private mode */
  }
  return readCookie(COOKIE_NAME) === "1";
}

function persistAgeConfirmed() {
  try {
    localStorage.setItem(STORAGE_KEY, "1");
  } catch {
    /* ignore quota / private mode */
  }
  const host = window.location.hostname;
  if (host === CANONICAL_HOST || host.endsWith(`.${CANONICAL_HOST}`)) {
    document.cookie = `${COOKIE_NAME}=1; Domain=.${CANONICAL_HOST}; Path=/; Max-Age=31536000; SameSite=Lax; Secure`;
  }
}

function isSatelliteHost(hostname: string): boolean {
  return hostname === "staging.yukvix.com" || hostname === `www.${CANONICAL_HOST}`;
}

function redirectToCanonical(): boolean {
  if (typeof window === "undefined") return false;
  if (!isSatelliteHost(window.location.hostname)) return false;
  const dest = `${CANONICAL_ORIGIN}${window.location.pathname}${window.location.search}${window.location.hash}`;
  window.location.replace(dest);
  return true;
}

export default function AgeGate() {
  const { t } = useTranslation();
  const [location] = useLocation();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (isAgeConfirmed()) {
      if (redirectToCanonical()) return;
      setOpen(false);
      return;
    }
    if (shouldSkip(location)) {
      setOpen(false);
      return;
    }
    setOpen(true);
  }, [location]);

  if (!open) return null;

  const confirm = () => {
    persistAgeConfirmed();
    if (redirectToCanonical()) return;
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
