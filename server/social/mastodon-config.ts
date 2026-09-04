const PRIVATE_HOST_RE =
  /^(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[0-1])\.|169\.254\.|0\.0\.0\.0|::1|\[::1\])/i;

export type MastodonCredentials = {
  instanceUrl: string;
  accessToken: string;
};

export type MastodonAccountConfig = {
  instanceUrl: string;
  maxImages: number;
  visibility: "public" | "unlisted";
};

export function normalizeMastodonInstanceUrl(raw: string): string {
  const trimmed = raw.trim();
  const withProto = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  let parsed: URL;
  try {
    parsed = new URL(withProto);
  } catch {
    throw new Error("Mastodon instance URL is invalid");
  }
  if (parsed.protocol !== "https:") {
    throw new Error("Mastodon instance must be https");
  }
  if (parsed.username || parsed.password) {
    throw new Error("Mastodon instance URL must not contain credentials");
  }
  if (PRIVATE_HOST_RE.test(parsed.hostname)) {
    throw new Error("Mastodon instance host is not public");
  }
  return `${parsed.protocol}//${parsed.host}`;
}

export function parseMastodonCredentials(
  raw: Record<string, unknown>
): MastodonCredentials {
  const instanceUrl = normalizeMastodonInstanceUrl(
    String(raw.instanceUrl ?? raw.instance_url ?? raw.baseUrl ?? "")
  );
  const accessToken = String(raw.accessToken ?? raw.access_token ?? "").trim();
  if (!accessToken || accessToken.length < 8) {
    throw new Error("Mastodon access token is required");
  }
  return { instanceUrl, accessToken };
}

export function parseMastodonConfig(
  raw: string | null | undefined,
  credentials?: MastodonCredentials
): MastodonAccountConfig {
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
  const instanceRaw = String(
    parsed.instanceUrl ?? parsed.instance_url ?? credentials?.instanceUrl ?? ""
  ).trim();
  const instanceUrl = instanceRaw
    ? normalizeMastodonInstanceUrl(instanceRaw)
    : credentials?.instanceUrl ?? "";
  const maxImagesRaw = Number(parsed.maxImages ?? parsed.max_images ?? 4);
  const maxImages = Number.isFinite(maxImagesRaw)
    ? Math.min(4, Math.max(1, Math.floor(maxImagesRaw)))
    : 4;
  const visibility =
    parsed.visibility === "unlisted" ? "unlisted" : "public";
  return { instanceUrl, maxImages, visibility };
}

export function mastodonConfigForStorage(
  raw: string | null | undefined,
  instanceUrl?: string
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
    if (/token|secret|password|credential|authorization|bearer/i.test(key)) {
      delete parsed[key];
    }
  }
  if (instanceUrl && !parsed.instanceUrl && !parsed.instance_url) {
    parsed.instanceUrl = instanceUrl;
  }
  if (parsed.instanceUrl) {
    parsed.instanceUrl = normalizeMastodonInstanceUrl(String(parsed.instanceUrl));
  }
  return JSON.stringify(parsed);
}
