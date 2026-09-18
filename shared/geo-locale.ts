export const SUPPORTED_LANGUAGE_CODES = ["en", "ja", "ko", "vi", "zh-TW", "zh-CN"] as const;
export type GeoLanguageCode = (typeof SUPPORTED_LANGUAGE_CODES)[number];

/** ISO 3166-1 alpha-2 → one of the six site languages. Unmapped countries return null. */
const COUNTRY_LANGUAGE: Record<string, GeoLanguageCode> = {
  US: "en",
  GB: "en",
  AU: "en",
  NZ: "en",
  CA: "en",
  IE: "en",
  ZA: "en",
  PH: "en",
  IN: "en",
  MY: "en",
  SG: "en",
  NG: "en",
  KE: "en",
  GH: "en",
  PK: "en",
  BD: "en",
  JM: "en",
  TT: "en",
  JP: "ja",
  KR: "ko",
  VN: "vi",
  TW: "zh-TW",
  HK: "zh-TW",
  MO: "zh-TW",
  CN: "zh-CN",
};

export function countryToLanguage(country: string | null | undefined): GeoLanguageCode | null {
  if (!country) return null;
  const code = country.trim().toUpperCase();
  if (code === "XX" || code === "T1") return null;
  return COUNTRY_LANGUAGE[code] ?? null;
}

export function readCountryFromHeaders(headers: {
  get?(name: string): string | null | undefined;
  [key: string]: unknown;
}): string | null {
  const pick = (name: string): string | null => {
    if (typeof headers.get === "function") {
      const v = headers.get(name);
      return typeof v === "string" && v.trim() ? v.trim() : null;
    }
    const raw = headers[name] ?? headers[name.toLowerCase()];
    if (Array.isArray(raw)) return String(raw[0] || "").trim() || null;
    if (typeof raw === "string" && raw.trim()) return raw.trim();
    return null;
  };
  return pick("cf-ipcountry") || pick("CF-IPCountry") || pick("x-country-code") || null;
}

export function parseCloudflareTrace(body: string): string | null {
  const match = body.match(/^loc=([A-Z]{2})$/m);
  return match?.[1] ?? null;
}
