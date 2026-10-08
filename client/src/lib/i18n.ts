import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import LanguageDetector from "i18next-browser-languagedetector";

import en from "../locales/en.json";
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

const localeLoaders: Record<Exclude<LanguageCode, "en">, () => Promise<{ default?: unknown }>> = {
  ja: () => import("../locales/ja.json"),
  ko: () => import("../locales/ko.json"),
  vi: () => import("../locales/vi.json"),
  "zh-TW": () => import("../locales/zh-TW.json"),
  "zh-CN": () => import("../locales/zh-CN.json"),
};

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

function syncDocumentLang(lng: string) {
  if (typeof document === "undefined") return;
  document.documentElement.lang = lng;
}

function isLanguageCode(value: string): value is LanguageCode {
  return SUPPORTED_LANGUAGES.some((l) => l.code === value);
}

async function loadLocale(code: string): Promise<LanguageCode> {
  const lng = isLanguageCode(code) ? code : "en";
  if (lng === "en" || i18n.hasResourceBundle(lng, "translation")) return lng;
  const loader = localeLoaders[lng];
  const mod = await loader();
  const resources = (mod.default ?? mod) as Record<string, unknown>;
  i18n.addResourceBundle(lng, "translation", resources, true, true);
  return lng;
}

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      en: { translation: en },
    },
    lng: "en",
    fallbackLng: "en",
    supportedLngs: ["en", "ja", "ko", "vi", "zh-TW", "zh-CN"],
    detection: {
      order: [],
      caches: [],
    },
    load: "currentOnly",
    partialBundledLanguages: true,
    cleanCode: false,
    lowerCaseLng: false,
    interpolation: {
      escapeValue: false,
    },
  });

i18n.on("languageChanged", syncDocumentLang);
syncDocumentLang(i18n.language);

export async function initI18n(): Promise<void> {
  const initial = getInitialLanguage();
  if (initial !== "en") {
    await loadLocale(initial);
    await i18n.changeLanguage(initial);
  }
  syncDocumentLang(i18n.language);
}

export async function changeAppLanguage(code: LanguageCode): Promise<void> {
  try {
    localStorage.setItem(LANG_STORAGE_KEY, code);
  } catch {
    /* private mode */
  }
  await loadLocale(code);
  await i18n.changeLanguage(code);
}

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
  await loadLocale(language);
  await i18n.changeLanguage(language);
}

export default i18n;
