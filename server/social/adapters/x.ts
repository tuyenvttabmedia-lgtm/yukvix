import { eq } from "drizzle-orm";
import { socialAccounts } from "../../../drizzle/schema";
import { getDb } from "../../db";
import { decryptSocialCredentialsAsync } from "../crypto";
import { clipCaptionPreservingCta } from "../content";
import { sanitizeSocialErrorMessage } from "../sanitize";
import { loadSocialUploadJpeg } from "../upload-bytes";
import {
  parseXConfig,
  parseXCredentials,
  type XAccountConfig,
  type XCredentials,
} from "../x-config";
import { buildOAuth1AuthorizationHeader } from "../x-oauth";
import {
  SocialApiError,
  type AccountInfo,
  type PlatformCapabilities,
  type SnapshotMediaItem,
  type SocialAdapter,
} from "../types";

const REQUEST_TIMEOUT_MS = 30_000;
const UPLOAD_TIMEOUT_MS = 60_000;
const X_CAPTION_MAX = 280;
const X_MEDIA_MAX = 4;
const X_API_BASE = "https://api.x.com";

export const X_CAPABILITIES: PlatformCapabilities = {
  platform: "x",
  maxImages: X_MEDIA_MAX,
  supportsSensitiveLabel: true,
  supportsContentWarning: false,
  maxCaptionLength: X_CAPTION_MAX,
  supportsMultipleImages: true,
  supportsCaption: true,
  supportsDelete: true,
  supportsScheduling: false,
};

export type XApiCaller = (
  method: string,
  path: string,
  body?: Record<string, unknown> | FormData
) => Promise<unknown>;

export type XAdapterOptions = {
  credentials: XCredentials;
  config: XAccountConfig;
  callApi?: XApiCaller;
  uploadFiles?: boolean;
  loadUpload?: (item: SnapshotMediaItem) => Promise<{
    bytes: Buffer;
    width: number;
    height: number;
  } | null>;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function errorDescription(payload: unknown, fallback: string): string {
  const record = asRecord(payload);
  if (!record) return fallback;
  const nested = Array.isArray(record.errors) ? asRecord(record.errors[0]) : null;
  return String(
    record.detail ??
      record.title ??
      record.message ??
      nested?.message ??
      nested?.detail ??
      fallback
  );
}

function classifyXError(httpStatus: number | null, description: string): SocialApiError {
  const desc = description.toLowerCase();
  if (httpStatus === 429) {
    return new SocialApiError({
      message: "rate limited",
      httpStatus: 429,
      code: "RATE_LIMITED",
      retryable: true,
      retryAfterSeconds: 60,
    });
  }
  if (
    httpStatus === 401 ||
    /unauthorized|bad authentication|invalid.*(token|key|secret)|could not authenticate/.test(
      desc
    )
  ) {
    return new SocialApiError({
      message: "invalid credentials",
      httpStatus: 401,
      code: "INVALID_CREDENTIALS",
      retryable: false,
    });
  }
  if (httpStatus === 403 && /duplicate|status is a duplicate/.test(desc)) {
    return new SocialApiError({
      message: "duplicate post",
      httpStatus: 403,
      code: "DUPLICATE",
      retryable: false,
    });
  }
  if (httpStatus === 403 || /forbidden|not permitted/.test(desc)) {
    return new SocialApiError({
      message: "forbidden",
      httpStatus: 403,
      code: "FORBIDDEN",
      retryable: false,
    });
  }
  if (httpStatus === 400 && /media|image|blob/.test(desc)) {
    return new SocialApiError({
      message: sanitizeSocialErrorMessage(description) || "invalid media",
      httpStatus: 400,
      code: "INVALID_MEDIA",
      retryable: false,
    });
  }
  if (httpStatus && httpStatus >= 500) {
    return new SocialApiError({
      message: "temporary X server error",
      httpStatus,
      code: "X_UNAVAILABLE",
      retryable: true,
    });
  }
  return new SocialApiError({
    message: sanitizeSocialErrorMessage(description) || "X request failed",
    httpStatus,
    code: "X_ERROR",
    retryable: false,
  });
}

export function createXApiCaller(credentials: XCredentials): XApiCaller {
  return async (method, path, body) => {
    const url = path.startsWith("http") ? path : `${X_API_BASE}${path}`;
    const form = typeof FormData !== "undefined" && body instanceof FormData;
    const timeout = form ? UPLOAD_TIMEOUT_MS : REQUEST_TIMEOUT_MS;
    const authorization = buildOAuth1AuthorizationHeader(method, url, {
      consumerKey: credentials.apiKey,
      consumerSecret: credentials.apiSecret,
      token: credentials.accessToken,
      tokenSecret: credentials.accessTokenSecret,
    });
    let response: Response;
    try {
      response = await fetch(url, {
        method,
        headers: {
          Authorization: authorization,
          ...(form ? {} : { "Content-Type": "application/json" }),
        },
        body: body
          ? form
            ? (body as FormData)
            : JSON.stringify(body)
          : undefined,
        signal: AbortSignal.timeout(timeout),
      });
    } catch (err) {
      const aborted =
        err instanceof Error &&
        (err.name === "TimeoutError" || err.name === "AbortError");
      throw new SocialApiError({
        message: aborted ? "network timeout" : "temporary connection failure",
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
    if (response.ok) return payload;
    throw classifyXError(response.status, errorDescription(payload, response.statusText));
  };
}

function mediaIdFromUpload(payload: unknown): string {
  const record = asRecord(payload);
  const data = asRecord(record?.data);
  const id =
    data?.id ??
    data?.media_id ??
    record?.media_id_string ??
    record?.media_id ??
    record?.id;
  return id != null ? String(id) : "";
}

function tweetIdFromCreate(payload: unknown): string {
  const record = asRecord(payload);
  const data = asRecord(record?.data);
  const id = data?.id ?? record?.id;
  return id != null ? String(id) : "";
}

export function createXAdapter(opts: XAdapterOptions): SocialAdapter {
  const callApi = opts.callApi ?? createXApiCaller(opts.credentials);
  const uploadFiles = opts.uploadFiles ?? !opts.callApi;
  const loadUpload = opts.loadUpload ?? loadSocialUploadJpeg;
  const maxImages = Math.min(X_MEDIA_MAX, Math.max(1, opts.config.maxImages));
  let username = "";

  async function ensureMe(): Promise<AccountInfo> {
    const me = asRecord(
      await callApi("GET", "/2/users/me?user.fields=username,name")
    );
    const data = asRecord(me?.data) ?? me;
    username = typeof data?.username === "string" ? data.username : "";
    return {
      platform: "x",
      handle: username ? `@${username}` : undefined,
      displayName: typeof data?.name === "string" ? data.name : username || undefined,
      botId: data?.id != null ? String(data.id) : undefined,
      targetChat: username ? `https://x.com/${username}` : "https://x.com",
    };
  }

  return {
    getCapabilities: () => ({ ...X_CAPABILITIES, maxImages }),

    async validateConnection() {
      await ensureMe();
      return true;
    },

    async getAccountInfo(): Promise<AccountInfo> {
      return ensureMe();
    },

    async uploadMedia(media) {
      return { externalId: media.url };
    },

    async publishPost(post) {
      const items = [...post.media].sort((a, b) => a.sortOrder - b.sortOrder);
      if (!items.length || items.length > maxImages) {
        throw new SocialApiError({
          message: "invalid media",
          httpStatus: 400,
          code: "INVALID_MEDIA",
          retryable: false,
        });
      }
      const mediaIds: string[] = [];
      for (const item of items) {
        const jpeg = uploadFiles ? await loadUpload(item) : null;
        if (!jpeg) {
          throw new SocialApiError({
            message: "invalid media",
            httpStatus: 400,
            code: "INVALID_MEDIA",
            retryable: false,
          });
        }
        const form = new FormData();
        form.append(
          "media",
          new Blob([new Uint8Array(jpeg.bytes)], { type: "image/jpeg" }),
          "photo.jpg"
        );
        form.append("media_category", "tweet_image");
        const uploaded = await callApi("POST", "/2/media/upload", form);
        const mediaId = mediaIdFromUpload(uploaded);
        if (!mediaId) {
          throw new SocialApiError({
            message: "X did not return media id",
            httpStatus: 500,
            code: "X_UNAVAILABLE",
            retryable: true,
          });
        }
        mediaIds.push(mediaId);
      }
      const text = clipCaptionPreservingCta(post.caption || "", X_CAPTION_MAX);
      const sensitive = Boolean(
        post.labels &&
          typeof post.labels === "object" &&
          (post.labels as { sensitive?: boolean }).sensitive
      );
      const created = await callApi("POST", "/2/tweets", {
        text,
        media: { media_ids: mediaIds },
        ...(sensitive ? { possibly_sensitive: true } : {}),
      });
      const id = tweetIdFromCreate(created);
      if (!id) {
        throw new SocialApiError({
          message: "X did not return tweet id",
          httpStatus: 500,
          code: "X_UNAVAILABLE",
          retryable: true,
        });
      }
      if (!username) {
        try {
          await ensureMe();
        } catch {
          /* public status URL still works without handle */
        }
      }
      return {
        externalPostId: id,
        externalUrl: username
          ? `https://x.com/${username}/status/${id}`
          : `https://x.com/i/web/status/${id}`,
      };
    },

    async deletePost(externalPostId: string) {
      await callApi("DELETE", `/2/tweets/${encodeURIComponent(externalPostId)}`);
    },
  };
}

export async function createXAdapterForAccount(accountId: number): Promise<SocialAdapter> {
  const db = await getDb();
  if (!db) {
    throw new SocialApiError({
      message: "Database not available",
      httpStatus: 500,
      code: "X_UNAVAILABLE",
      retryable: true,
    });
  }
  const [row] = await db
    .select()
    .from(socialAccounts)
    .where(eq(socialAccounts.id, accountId))
    .limit(1);
  if (!row || row.platform !== "x") {
    throw new SocialApiError({
      message: "X account not found",
      httpStatus: 404,
      code: "INVALID_REQUEST",
      retryable: false,
    });
  }
  const credentials = parseXCredentials(
    await decryptSocialCredentialsAsync(row.encryptedCredentials)
  );
  const config = parseXConfig(row.configJson);
  return createXAdapter({ credentials, config });
}

export const xAdapter: SocialAdapter = {
  getCapabilities: () => ({ ...X_CAPABILITIES }),
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
  uploadMedia: async media => ({ externalId: media.url }),
  publishPost: async () => {
    throw new SocialApiError({
      message: "invalid credentials",
      httpStatus: 401,
      code: "INVALID_CREDENTIALS",
      retryable: false,
    });
  },
};
