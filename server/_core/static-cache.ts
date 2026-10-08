/** Cache-Control for files served from the Vite dist directory. */

const IMMUTABLE = "public, max-age=31536000, immutable";
const SHORT = "public, max-age=86400";

export function staticAssetCacheControl(filePath: string): string {
  const normalized = filePath.replace(/\\/g, "/");
  if (
    normalized.includes("/assets/") ||
    normalized.includes("/fonts/") ||
    /\/[^/]+\.[a-fA-F0-9]{8}\.(js|css)$/.test(normalized)
  ) {
    return IMMUTABLE;
  }
  return SHORT;
}
