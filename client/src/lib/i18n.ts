import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import LanguageDetector from "i18next-browser-languagedetector";

import en from "../locales/en.json";
import ja from "../locales/ja.json";
import ko from "../locales/ko.json";
import vi from "../locales/vi.json";
import zhTW from "../locales/zh-TW.json";
import zhCN from "../locales/zh-CN.json";

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
 * Everything else falls through to i18next's own matching.
 */
function normalizeLocale(raw: string): string {
  const lower = raw.toLowerCase();
  if (
    lower === "zh-tw" ||
    lower === "zh-hant" ||
    lower === "zh-hk" ||
    lower === "zh-mo"
  ) {
    return "zh-TW";
  }
  if (
    lower.startsWith("zh-cn") ||
    lower === "zh" ||
    lower === "zh-hans" ||
    lower === "zh-sg"
  ) {
    return "zh-CN";
  }
  return raw;
}

// Determine initial language: stored preference → browser locale → "en"
function getInitialLanguage(): string {
  const stored = localStorage.getItem("cosplay-lang");
  if (stored) return stored;

  const browserLang =
    navigator.language || navigator.languages?.[0] || "en";
  return normalizeLocale(browserLang);
}

const initialLng = getInitialLanguage();

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
    // Disable auto-detection by LanguageDetector since we resolve it manually above
    detection: {
      order: [],
      caches: [],
    },
    // Do NOT normalize language codes — keep "zh-TW" / "zh-CN" as-is
    load: "currentOnly",
    cleanCode: false,
    lowerCaseLng: false,
    interpolation: {
      escapeValue: false,
    },
  });

export default i18n;
