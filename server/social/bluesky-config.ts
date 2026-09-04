const PRIVATE_HOST_RE =
  /^(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[0-1])\.|169\.254\.|0\.0\.0\.0|::1|\[::1\])/i;

export const BLUESKY_DEFAULT_PDS = "https://bsky.social";

export type BlueskyCredentials = {
  identifier: string;
  appPassword: string;
  pdsUrl: string;
};

export type BlueskyAccountConfig = {
  identifier: string;
  pdsUrl: string;
  maxImages: number;
};

export function normalizeBlueskyPdsUrl(raw: string | undefined): string {
  const trimmed = (raw || BLUESKY_DEFAULT_PDS).trim();
  const withProto = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  let parsed: URL;
  try {
    parsed = new URL(withProto);
  } catch {
    throw new Error("Bluesky PDS URL is invalid");
  }
  if (parsed.protocol !== "https:") {
    throw new Error("Bluesky PDS must be https");
  }
  if (parsed.username || parsed.password) {
    throw new Error("Bluesky PDS URL must not contain credentials");
  }
  if (PRIVATE_HOST_RE.test(parsed.hostname)) {
    throw new Error("Bluesky PDS host is not public");
  }
  return `${parsed.protocol}//${parsed.host}`;
}

export function parseBlueskyCredentials(
  raw: Record<string, unknown>
): BlueskyCredentials {
  const identifier = String(
    raw.identifier ?? raw.handle ?? raw.username ?? ""
  ).trim();
  const appPassword = String(
    raw.appPassword ?? raw.app_password ?? raw.password ?? ""
  ).trim();
  if (!identifier) throw new Error("Bluesky handle or email is required");
  if (!appPassword || appPassword.length < 8) {
    throw new Error("Bluesky app password is required");
  }
  return {
    identifier,
    appPassword,
    pdsUrl: normalizeBlueskyPdsUrl(String(raw.pdsUrl ?? raw.pds_url ?? "")),
  };
}

export function parseBlueskyConfig(
  raw: string | null | undefined,
  credentials?: BlueskyCredentials
): BlueskyAccountConfig {
  let parsed: Record<string, unknown> = {};
  if (raw) {
    try {
      const value = JSON.parse(raw);
      if (value && typeof value === "object" && !Array.isArray(value)) {
        parsed = value as Record<string, unknown>;
      }
    } catch {
      parsed = {};
    }
  }
  const identifier = String(
    parsed.identifier ?? parsed.handle ?? credentials?.identifier ?? ""
  ).trim();
  const pdsUrl = normalizeBlueskyPdsUrl(
    String(parsed.pdsUrl ?? parsed.pds_url ?? credentials?.pdsUrl ?? "")
  );
  const maxImagesRaw = Number(parsed.maxImages ?? parsed.max_images ?? 4);
  const maxImages = Number.isFinite(maxImagesRaw)
    ? Math.min(4, Math.max(1, Math.floor(maxImagesRaw)))
    : 4;
  return { identifier, pdsUrl, maxImages };
}

export function blueskyConfigForStorage(
  raw: string | null | undefined,
  extras?: { identifier?: string; pdsUrl?: string }
): string {
  let parsed: Record<string, unknown> = {};
  if (raw) {
    try {
      const value = JSON.parse(raw);
      if (value && typeof value === "object" && !Array.isArray(value)) {
        parsed = { ...(value as Record<string, unknown>) };
      }
    } catch {
      parsed = {};
    }
  }
  for (const key of Object.keys(parsed)) {
    if (/token|secret|password|credential|authorization|bearer|jwt/i.test(key)) {
      delete parsed[key];
    }
  }
  if (extras?.identifier) parsed.identifier = extras.identifier;
  if (extras?.pdsUrl) parsed.pdsUrl = normalizeBlueskyPdsUrl(extras.pdsUrl);
  else if (parsed.pdsUrl) parsed.pdsUrl = normalizeBlueskyPdsUrl(String(parsed.pdsUrl));
  return JSON.stringify(parsed);
}
