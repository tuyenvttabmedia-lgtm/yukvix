import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import LanguageDetector from "i18next-browser-languagedetector";

import en from "../locales/en.json";
import ja from "../locales/ja.json";
import ko from "../locales/ko.json";
import vi from "../locales/vi.json";
import zhTW from "../locales/zh-TW.json";
import zhCN from "../locales/zh-CN.json";
import {
  countryToLanguage,
  parseCloudflareTrace,
} from "@shared/geo-locale";

export const LANG_STORAGE_KEY = "cosplay-lang";

export const SUPPORTED_LANGUAGES = [
  { code: "en", label: "English", nativeLabel: "English" },
  { code: "ja", label: "Japanese", nativeLabel: "日本語" },
  { code: "ko", label: "Korean", nativeLabel: "한국어" },
  { code: "vi", label: "Vietnamese", nativeLabel: "Tiếng Việt" },
  { code: "zh-TW", label: "Traditional Chinese", nativeLabel: "繁體中文" },
  { code: "zh-CN", label: "Simplified Chinese", nativeLabel: "简体中文" },
] as const;

export type LanguageCode = (typeof SUPPORTED_LANGUAGES)[number]["code"];

/**
 * Normalize a raw browser/stored locale string to one of our supported codes.
 * zh-Hant, zh-HK, zh-MO, zh-TW  → "zh-TW"
 * zh, zh-Hans, zh-CN, zh-SG      → "zh-CN"
 * en-US, vi-VN, ja-JP, ko-KR     → en / vi / ja / ko
 */
export function normalizeLocale(raw: string): string {
  const lower = raw.toLowerCase().replace("_", "-");
  if (
    lower === "zh-tw" ||
    lower === "zh-hant" ||
    lower.startsWith("zh-hant") ||
    lower === "zh-hk" ||
    lower === "zh-mo"
  ) {
    return "zh-TW";
  }
  if (
    lower.startsWith("zh-cn") ||
    lower === "zh" ||
    lower === "zh-hans" ||
    lower.startsWith("zh-hans") ||
    lower === "zh-sg"
  ) {
    return "zh-CN";
  }
  const short = lower.split("-")[0];
  if (short === "en" || short === "ja" || short === "ko" || short === "vi") {
    return short;
  }
  return raw;
}

function readStoredLanguage(): string | null {
  try {
    const stored = localStorage.getItem(LANG_STORAGE_KEY);
    return stored ? normalizeLocale(stored) : null;
  } catch {
    return null;
  }
}

function readBrowserLanguage(): string {
  const browserLang =
    (typeof navigator !== "undefined" &&
      (navigator.language || navigator.languages?.[0])) ||
    "en";
  return normalizeLocale(browserLang);
}

/**
 * Explicit switcher pick → browser locale → English.
 * IP country is applied asynchronously in applyGeoLanguage() and never
 * overwrites a saved pick — a VPN test in Incognito (no saved pick) will follow IP.
 */
function getInitialLanguage(): string {
  return readStoredLanguage() || readBrowserLanguage() || "en";
}

const initialLng = getInitialLanguage();

function syncDocumentLang(lng: string) {
  if (typeof document === "undefined") return;
  document.documentElement.lang = lng;
}

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      en: { translation: en },
      ja: { translation: ja },
      ko: { translation: ko },
      vi: { translation: vi },
      "zh-TW": { translation: zhTW },
      "zh-CN": { translation: zhCN },
    },
    lng: initialLng,
    fallbackLng: "en",
    supportedLngs: ["en", "ja", "ko", "vi", "zh-TW", "zh-CN"],
    detection: {
      order: [],
      caches: [],
    },
    load: "currentOnly",
    cleanCode: false,
    lowerCaseLng: false,
    interpolation: {
      escapeValue: false,
    },
  });

i18n.on("languageChanged", syncDocumentLang);
syncDocumentLang(i18n.language);

async function detectCountry(): Promise<string | null> {
  try {
    const trace = await fetch("/cdn-cgi/trace", { cache: "no-store" });
    if (trace.ok) {
      const country = parseCloudflareTrace(await trace.text());
      if (country) return country;
    }
  } catch {
    /* local / non-Cloudflare */
  }
  try {
    const geo = await fetch("/api/geo", { cache: "no-store" });
    if (!geo.ok) return null;
    const body = (await geo.json()) as { country?: string | null };
    return body.country || null;
  } catch {
    return null;
  }
}

/** Follow visitor IP when the user has not picked a language in the switcher. */
export async function applyGeoLanguage(): Promise<void> {
  if (readStoredLanguage()) return;
  const language = countryToLanguage(await detectCountry());
  if (!language || language === i18n.language) return;
  await i18n.changeLanguage(language);
}

export default i18n;
