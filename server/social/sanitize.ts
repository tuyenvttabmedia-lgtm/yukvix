const SECRET_KEY_RE =
  /token|secret|authorization|password|credential|refresh|bearer|cookie|apikey|api_key/i;

export function sanitizeForLog(value: unknown, depth = 0): unknown {
  if (depth > 6) return "[truncated]";
  if (value == null) return value;
  if (typeof value === "string") {
    if (/^s1\./.test(value)) return "[redacted-ciphertext]";
    if (SECRET_KEY_RE.test(value) && value.length > 16) return "[redacted]";
    return value;
  }
  if (Array.isArray(value))
    return value.map(item => sanitizeForLog(item, depth + 1));
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = SECRET_KEY_RE.test(k)
        ? "[redacted]"
        : sanitizeForLog(v, depth + 1);
    }
    return out;
  }
  return value;
}

const BOT_TOKEN_RE = /\b\d{8,}:[A-Za-z0-9_-]{20,}\b/g;
const BEARER_RE = /Bearer\s+\S+/gi;
const SECRET_ASSIGN_RE =
  /(access_token|refresh_token|password|bot_token|api[_-]?key|authorization)\s*[:=]\s*[^\s&,;]+/gi;

export function sanitizeSocialErrorMessage(message: unknown): string {
  const raw = message instanceof Error ? message.message : String(message ?? "");
  let out = raw.slice(0, 500);
  out = out.replace(BEARER_RE, "Bearer [redacted]");
  out = out.replace(BOT_TOKEN_RE, "[redacted-bot-token]");
  out = out.replace(SECRET_ASSIGN_RE, "$1=[redacted]");
  if (/^s1\./.test(out)) return "[redacted-ciphertext]";
  return out;
}

export function sanitizeAttemptPayload(payload: unknown): string | null {
  if (payload == null) return null;
  try {
    return JSON.stringify(sanitizeForLog(payload));
  } catch {
    return JSON.stringify({ note: "unserializable" });
  }
}

export function isRetryableSocialError(input: {
  httpStatus?: number | null;
  code?: string | null;
  message?: string | null;
}): boolean {
  const code = (input.code || "").toUpperCase();
  if (
    code === "NOT_IMPLEMENTED" ||
    code === "ACCOUNT_DISABLED" ||
    code === "INVALID_MEDIA" ||
    code === "CONTENT_REJECTED" ||
    code === "INVALID_REQUEST" ||
    code === "INVALID_CREDENTIALS" ||
    code === "FORBIDDEN" ||
    code === "AMBIGUOUS_PUBLISH"
  ) {
    return false;
  }
  const status = input.httpStatus ?? 0;
  if (
    status === 401 ||
    status === 403 ||
    status === 400 ||
    status === 404 ||
    status === 410 ||
    status === 422
  ) {
    return false;
  }
  if (
    status === 429 ||
    status === 500 ||
    status === 502 ||
    status === 503 ||
    status === 504
  )
    return true;
  const msg = (input.message || "").toLowerCase();
  if (
    /timeout|temporar|unavailable|econnreset|econnrefused|etimedout|enotfound|eai_again|network/.test(
      msg
    )
  )
    return true;
  if (
    /unauthorized|forbidden|invalid media|invalid credentials|content rejected|account disabled|policy/.test(
      msg
    )
  )
    return false;
  return false;
}

export const SOCIAL_BACKOFF_MS = [
  60_000,
  5 * 60_000,
  15 * 60_000,
  60 * 60_000,
] as const;

export function backoffMsForAttempt(attempts: number): number {
  const idx = Math.min(Math.max(attempts, 1), SOCIAL_BACKOFF_MS.length) - 1;
  return SOCIAL_BACKOFF_MS[idx];
}
