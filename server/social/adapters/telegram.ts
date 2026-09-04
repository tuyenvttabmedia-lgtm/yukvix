import { eq } from "drizzle-orm";
import { socialAccounts } from "../../../drizzle/schema";
import { getDb } from "../../db";
import { decryptSocialCredentialsAsync } from "../crypto";
import { clipCaptionPreservingCta } from "../content";
import { isShareablePublicMediaUrl } from "../media";
import { sanitizeSocialErrorMessage } from "../sanitize";
import {
  parseTelegramConfig,
  parseTelegramCredentials,
  assertTelegramSnapshotUrl,
  type TelegramAccountConfig,
  type TelegramCredentials,
} from "../telegram-config";
import {
  SocialApiError,
  type AccountInfo,
  type PlatformCapabilities,
  type SnapshotMediaItem,
  type SocialAdapter,
} from "../types";

const TELEGRAM_API = "https://api.telegram.org";
const REQUEST_TIMEOUT_MS = 30_000;
const TELEGRAM_CAPTION_MAX = 1024;
const TELEGRAM_MEDIA_GROUP_MIN = 2;
const TELEGRAM_MEDIA_GROUP_MAX = 10;

export const TELEGRAM_CAPABILITIES: PlatformCapabilities = {
  platform: "telegram",
  maxImages: TELEGRAM_MEDIA_GROUP_MAX,
  supportsSensitiveLabel: true,
  supportsContentWarning: false,
  maxCaptionLength: TELEGRAM_CAPTION_MAX,
  supportsMultipleImages: true,
  supportsCaption: true,
  supportsDelete: true,
  supportsScheduling: false,
};

export type TelegramApiCaller = (
  method: string,
  body: Record<string, unknown>
) => Promise<unknown>;

export type TelegramAdapterOptions = {
  credentials: TelegramCredentials;
  config: TelegramAccountConfig;
  callApi?: TelegramApiCaller;
};

type TelegramUser = {
  id?: number;
  is_bot?: boolean;
  first_name?: string;
  username?: string;
};

type TelegramChat = {
  id?: number;
  type?: string;
  title?: string;
  username?: string;
};

type TelegramMessage = {
  message_id?: number;
  chat?: TelegramChat;
};

function redactTelegramText(value: string): string {
  return sanitizeSocialErrorMessage(
    value.replace(/\/bot[^/]+\//g, "/bot[redacted]/")
  );
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function classifyTelegramError(
  httpStatus: number | null,
  description: string,
  retryAfterSeconds?: number
): SocialApiError {
  const desc = description.toLowerCase();
  if (httpStatus === 429 || retryAfterSeconds) {
    return new SocialApiError({
      message: "rate limited",
      httpStatus: httpStatus ?? 429,
      code: "RATE_LIMITED",
      retryable: true,
      retryAfterSeconds: retryAfterSeconds || 1,
    });
  }
  if (httpStatus === 401 || /unauthorized|invalid token/.test(desc)) {
    return new SocialApiError({
      message: "invalid credentials",
      httpStatus: 401,
      code: "INVALID_CREDENTIALS",
      retryable: false,
    });
  }
  if (
    httpStatus === 403 ||
    /forbidden|bot was blocked|not enough rights|have no rights/.test(desc)
  ) {
    return new SocialApiError({
      message: "bot blocked or missing permission",
      httpStatus: 403,
      code: "FORBIDDEN",
      retryable: false,
    });
  }
  if (
    /chat not found|message rejected|wrong url|failed to get http url|photo_invalid|unsupported/.test(
      desc
    )
  ) {
    return new SocialApiError({
      message: redactTelegramText(description) || "invalid request",
      httpStatus: httpStatus ?? 400,
      code: /url|photo|media/.test(desc) ? "INVALID_MEDIA" : "INVALID_REQUEST",
      retryable: false,
    });
  }
  if (httpStatus === 400) {
    return new SocialApiError({
      message: redactTelegramText(description) || "invalid request",
      httpStatus: 400,
      code: "INVALID_REQUEST",
      retryable: false,
    });
  }
  if (
    httpStatus === 500 ||
    httpStatus === 502 ||
    httpStatus === 503 ||
    httpStatus === 504
  ) {
    return new SocialApiError({
      message: "temporary Telegram server error",
      httpStatus,
      code: "TELEGRAM_UNAVAILABLE",
      retryable: true,
    });
  }
  return new SocialApiError({
    message: redactTelegramText(description) || "Telegram request failed",
    httpStatus,
    code: "TELEGRAM_ERROR",
    retryable: false,
  });
}

export function createTelegramApiCaller(botToken: string): TelegramApiCaller {
  return async (method, body) => {
    const url = `${TELEGRAM_API}/bot${botToken}/${method}`;
    let response: Response;
    try {
      response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch (err) {
      const aborted =
        (err instanceof Error && err.name === "TimeoutError") ||
        (err instanceof Error && err.name === "AbortError");
      const detail = [
        err instanceof Error ? err.message : String(err),
        String((err as { code?: string }).code ?? ""),
        String((err as { cause?: { code?: string } }).cause?.code ?? ""),
      ].join(" ");
      const unsent =
        /ENOTFOUND|ECONNREFUSED|EAI_AGAIN|ENETUNREACH|ERR_INVALID_URL|getaddrinfo|certificate/i.test(
          detail
        );
      const sendMethod = method === "sendPhoto" || method === "sendMediaGroup";
      if (sendMethod && aborted && !unsent) {
        throw new SocialApiError({
          message:
            "ambiguous publish: request may have reached Telegram without a response",
          httpStatus: null,
          code: "AMBIGUOUS_PUBLISH",
          retryable: false,
        });
      }
      throw new SocialApiError({
        message: unsent ? "temporary connection failure" : "network timeout",
        httpStatus: null,
        code: "NETWORK_ERROR",
        retryable: true,
      });
    }

    let payload: unknown = null;
    try {
      payload = await response.json();
    } catch {
      payload = null;
    }
    const record = asRecord(payload);
    if (record && record.ok === true) return record.result;
    const description = redactTelegramText(String(record?.description ?? ""));
    const retryAfter = Number(
      asRecord(record?.parameters)?.retry_after ?? NaN
    );
    throw classifyTelegramError(
      response.status,
      description,
      Number.isFinite(retryAfter) ? retryAfter : undefined
    );
  };
}

function assertBound(opts: TelegramAdapterOptions): void {
  if (!opts.credentials.botToken) {
    throw new SocialApiError({
      message: "invalid credentials",
      httpStatus: 401,
      code: "INVALID_CREDENTIALS",
      retryable: false,
    });
  }
  if (!opts.config.chatId) {
    throw new SocialApiError({
      message: "Telegram chatId is required",
      httpStatus: 400,
      code: "INVALID_REQUEST",
      retryable: false,
    });
  }
}

function snapshotItems(media: SnapshotMediaItem[]): SnapshotMediaItem[] {
  return [...media].sort((a, b) => a.sortOrder - b.sortOrder);
}

function validateSnapshot(
  media: SnapshotMediaItem[],
  maxImages: number
): SnapshotMediaItem[] {
  if (!media.length) {
    throw new SocialApiError({
      message: "invalid media",
      httpStatus: 400,
      code: "INVALID_MEDIA",
      retryable: false,
    });
  }
  if (media.length > maxImages) {
    throw new SocialApiError({
      message: `snapshot has ${media.length} images; maxImages=${maxImages} (reject, no silent truncate)`,
      httpStatus: 400,
      code: "INVALID_MEDIA",
      retryable: false,
    });
  }
  return snapshotItems(media).map(item => ({
    ...item,
    url: assertTelegramSnapshotUrl(item.url),
  }));
}

function publicMessageUrl(
  chat: TelegramChat | undefined,
  messageId: number,
  channelUsername?: string
): string | undefined {
  const username = (
    channelUsername ||
    chat?.username ||
    ""
  ).replace(/^@/, "");
  if (!username || !messageId) return undefined;
  return `https://t.me/${username}/${messageId}`;
}

function captionForTelegram(caption: string): string {
  return clipCaptionPreservingCta(caption, TELEGRAM_CAPTION_MAX);
}

export function createTelegramAdapter(
  opts: TelegramAdapterOptions
): SocialAdapter {
  const callApi =
    opts.callApi ?? createTelegramApiCaller(opts.credentials.botToken);
  const chatId = opts.config.chatId;
  const maxImages = Math.min(
    TELEGRAM_MEDIA_GROUP_MAX,
    Math.max(1, opts.config.maxImages)
  );

  return {
    getCapabilities: () => ({ ...TELEGRAM_CAPABILITIES, maxImages }),

    async validateConnection() {
      assertBound(opts);
      await callApi("getMe", {});
      await callApi("getChat", { chat_id: chatId });
      return true;
    },

    async getAccountInfo(): Promise<AccountInfo> {
      assertBound(opts);
      const me = (await callApi("getMe", {})) as TelegramUser;
      let target = chatId;
      try {
        const chat = (await callApi("getChat", { chat_id: chatId })) as TelegramChat;
        target =
          (chat.username ? `@${chat.username}` : chat.title) ||
          String(chat.id ?? chatId);
      } catch {
        /* token is valid but chat may be inaccessible — validateConnection handles hard fail */
      }
      return {
        platform: "telegram",
        handle: me.username ? `@${me.username}` : undefined,
        displayName: me.first_name,
        botId: me.id,
        targetChat: target,
      };
    },

    async uploadMedia(media) {
      const url = assertTelegramSnapshotUrl(media.url);
      return { externalId: url };
    },

    async publishPost(post) {
      assertBound(opts);
      const items = validateSnapshot(post.media, maxImages);
      const caption = captionForTelegram(post.caption || "");
      const sensitive = Boolean(
        post.labels &&
          typeof post.labels === "object" &&
          (post.labels as { sensitive?: boolean }).sensitive
      );
      const common = {
        chat_id: chatId,
        disable_notification: opts.config.disableNotification || undefined,
        protect_content: opts.config.protectContent || undefined,
      };

      if (items.length === 1) {
        const result = (await callApi("sendPhoto", {
          ...common,
          photo: items[0].url,
          caption: caption || undefined,
          has_spoiler: sensitive || undefined,
        })) as TelegramMessage;
        const messageId = Number(result.message_id);
        if (!Number.isFinite(messageId)) {
          throw new SocialApiError({
            message: "Telegram did not return message_id",
            httpStatus: 500,
            code: "TELEGRAM_UNAVAILABLE",
            retryable: true,
          });
        }
        return {
          externalPostId: String(messageId),
          externalUrl: publicMessageUrl(
            result.chat,
            messageId,
            opts.config.channelUsername
          ),
        };
      }

      if (items.length < TELEGRAM_MEDIA_GROUP_MIN) {
        throw new SocialApiError({
          message: "invalid media",
          httpStatus: 400,
          code: "INVALID_MEDIA",
          retryable: false,
        });
      }

      const media = items.map((item, index) => ({
        type: "photo",
        media: item.url,
        caption: index === 0 && caption ? caption : undefined,
        has_spoiler: sensitive || undefined,
      }));
      const results = (await callApi("sendMediaGroup", {
        ...common,
        media,
      })) as TelegramMessage[];
      const messages = Array.isArray(results) ? results : [];
      const ids = messages
        .map(row => Number(row.message_id))
        .filter(id => Number.isFinite(id));
      if (!ids.length) {
        throw new SocialApiError({
          message: "Telegram did not return message_id",
          httpStatus: 500,
          code: "TELEGRAM_UNAVAILABLE",
          retryable: true,
        });
      }
      return {
        externalPostId: ids.join(","),
        externalUrl: publicMessageUrl(
          messages[0]?.chat,
          ids[0],
          opts.config.channelUsername
        ),
      };
    },

    async deletePost(externalPostId: string) {
      assertBound(opts);
      const ids = externalPostId
        .split(",")
        .map(part => Number(part.trim()))
        .filter(id => Number.isFinite(id));
      if (!ids.length) {
        throw new SocialApiError({
          message: "invalid request",
          httpStatus: 400,
          code: "INVALID_REQUEST",
          retryable: false,
        });
      }
      if (ids.length === 1) {
        await callApi("deleteMessage", { chat_id: chatId, message_id: ids[0] });
        return;
      }
      await callApi("deleteMessages", { chat_id: chatId, message_ids: ids });
    },
  };
}

export async function createTelegramAdapterForAccount(
  accountId: number
): Promise<SocialAdapter> {
  const db = await getDb();
  if (!db) {
    throw new SocialApiError({
      message: "Database not available",
      httpStatus: 500,
      code: "TELEGRAM_UNAVAILABLE",
      retryable: true,
    });
  }
  const [row] = await db
    .select()
    .from(socialAccounts)
    .where(eq(socialAccounts.id, accountId))
    .limit(1);
  if (!row || row.platform !== "telegram") {
    throw new SocialApiError({
      message: "Telegram account not found",
      httpStatus: 404,
      code: "INVALID_REQUEST",
      retryable: false,
    });
  }
  const credentials = parseTelegramCredentials(
    await decryptSocialCredentialsAsync(row.encryptedCredentials)
  );
  const config = parseTelegramConfig(row.configJson, credentials);
  return createTelegramAdapter({ credentials, config });
}

export const telegramAdapter: SocialAdapter = {
  getCapabilities: () => ({ ...TELEGRAM_CAPABILITIES }),
  validateConnection: async () => {
    throw new SocialApiError({
      message: "invalid credentials",
      httpStatus: 401,
      code: "INVALID_CREDENTIALS",
      retryable: false,
    });
  },
  getAccountInfo: async () => {
    throw new SocialApiError({
      message: "invalid credentials",
      httpStatus: 401,
      code: "INVALID_CREDENTIALS",
      retryable: false,
    });
  },
  uploadMedia: async media => {
    if (!isShareablePublicMediaUrl(media.url)) {
      throw new SocialApiError({
        message: "invalid media",
        httpStatus: 400,
        code: "INVALID_MEDIA",
        retryable: false,
      });
    }
    return { externalId: media.url };
  },
  publishPost: async () => {
    throw new SocialApiError({
      message: "invalid credentials",
      httpStatus: 401,
      code: "INVALID_CREDENTIALS",
      retryable: false,
    });
  },
  deletePost: async () => {
    throw new SocialApiError({
      message: "invalid credentials",
      httpStatus: 401,
      code: "INVALID_CREDENTIALS",
      retryable: false,
    });
  },
};
