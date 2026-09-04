import { isShareablePublicMediaUrl } from "./media";

export type TelegramCredentials = {
  botToken: string;
  chatId?: string;
};

export type TelegramAccountConfig = {
  chatId: string;
  maxImages: number;
  disableNotification: boolean;
  protectContent: boolean;
  channelUsername?: string;
};

const PRIVATE_HOST_RE =
  /^(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[0-1])\.|169\.254\.|0\.0\.0\.0|::1|\[::1\])/i;

export function parseTelegramCredentials(
  raw: Record<string, unknown>
): TelegramCredentials {
  const botToken = String(raw.botToken ?? raw.bot_token ?? "").trim();
  if (!botToken || botToken.length < 20) {
    throw new Error("Telegram botToken is required");
  }
  const chatId = String(raw.chatId ?? raw.chat_id ?? "").trim();
  return { botToken, chatId: chatId || undefined };
}

export function parseTelegramConfig(
  raw: string | null | undefined,
  credentials?: TelegramCredentials
): TelegramAccountConfig {
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
  const chatId = String(
    parsed.chatId ?? parsed.chat_id ?? credentials?.chatId ?? ""
  ).trim();
  const maxImagesRaw = Number(parsed.maxImages ?? parsed.max_images ?? 10);
  const maxImages = Number.isFinite(maxImagesRaw)
    ? Math.min(10, Math.max(1, Math.floor(maxImagesRaw)))
    : 10;
  const channelUsername = String(
    parsed.channelUsername ?? parsed.channel_username ?? ""
  )
    .trim()
    .replace(/^@/, "");
  return {
    chatId,
    maxImages,
    disableNotification: Boolean(parsed.disableNotification),
    protectContent: Boolean(parsed.protectContent),
    channelUsername: channelUsername || undefined,
  };
}

export function telegramConfigForStorage(
  raw: string | null | undefined,
  chatId?: string
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
  if (chatId && !parsed.chatId && !parsed.chat_id) parsed.chatId = chatId;
  return JSON.stringify(parsed);
}

export function assertTelegramSnapshotUrl(url: string): string {
  const trimmed = url.trim();
  if (!isShareablePublicMediaUrl(trimmed)) {
    throw invalidTelegramMedia("URL is not a public https snapshot");
  }
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw invalidTelegramMedia("URL is not a valid absolute https URL");
  }
  if (parsed.protocol !== "https:") {
    throw invalidTelegramMedia("Only https snapshot URLs are allowed");
  }
  if (parsed.username || parsed.password) {
    throw invalidTelegramMedia("Snapshot URLs must not contain credentials");
  }
  if (PRIVATE_HOST_RE.test(parsed.hostname)) {
    throw invalidTelegramMedia("Snapshot host is not publicly fetchable");
  }
  return parsed.toString();
}

function invalidTelegramMedia(message: string): Error {
  const err = new Error(message) as Error & { code: string; httpStatus: number };
  err.code = "INVALID_MEDIA";
  err.httpStatus = 400;
  return err;
}
