export type XCredentials = {
  apiKey: string;
  apiSecret: string;
  accessToken: string;
  accessTokenSecret: string;
};

export type XAccountConfig = {
  maxImages: number;
};

function requiredSecret(raw: unknown, label: string): string {
  const value = String(raw ?? "").trim();
  if (!value || value.length < 8) {
    throw new Error(`${label} is required`);
  }
  return value;
}

export function parseXCredentials(raw: Record<string, unknown>): XCredentials {
  return {
    apiKey: requiredSecret(
      raw.apiKey ?? raw.api_key ?? raw.consumerKey ?? raw.consumer_key,
      "X API key"
    ),
    apiSecret: requiredSecret(
      raw.apiSecret ?? raw.api_secret ?? raw.consumerSecret ?? raw.consumer_secret,
      "X API secret"
    ),
    accessToken: requiredSecret(
      raw.accessToken ?? raw.access_token,
      "X access token"
    ),
    accessTokenSecret: requiredSecret(
      raw.accessTokenSecret ?? raw.access_token_secret,
      "X access token secret"
    ),
  };
}

export function parseXConfig(raw: string | null | undefined): XAccountConfig {
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
  const maxImagesRaw = Number(parsed.maxImages ?? parsed.max_images ?? 4);
  const maxImages = Number.isFinite(maxImagesRaw)
    ? Math.min(4, Math.max(1, Math.floor(maxImagesRaw)))
    : 4;
  return { maxImages };
}

export function xConfigForStorage(raw: string | null | undefined): string {
  const config = parseXConfig(raw);
  return JSON.stringify({ maxImages: config.maxImages });
}
