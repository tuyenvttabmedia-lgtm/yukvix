import { eq } from "drizzle-orm";
import { socialAccounts } from "../../../drizzle/schema";
import { getDb } from "../../db";
import { decryptSocialCredentialsAsync } from "../crypto";
import { clipCaptionPreservingCta } from "../content";
import { sanitizeSocialErrorMessage } from "../sanitize";
import { loadSocialUploadBytes } from "../upload-bytes";
import {
  parseMastodonConfig,
  parseMastodonCredentials,
  type MastodonAccountConfig,
  type MastodonCredentials,
} from "../mastodon-config";
import {
  SocialApiError,
  type AccountInfo,
  type PlatformCapabilities,
  type SnapshotMediaItem,
  type SocialAdapter,
} from "../types";

const REQUEST_TIMEOUT_MS = 30_000;
const UPLOAD_TIMEOUT_MS = 60_000;
const MASTODON_CAPTION_MAX = 500;
const MASTODON_MEDIA_MAX = 4;

export const MASTODON_CAPABILITIES: PlatformCapabilities = {
  platform: "mastodon",
  maxImages: MASTODON_MEDIA_MAX,
  supportsSensitiveLabel: true,
  supportsContentWarning: true,
  maxCaptionLength: MASTODON_CAPTION_MAX,
  supportsMultipleImages: true,
  supportsCaption: true,
  supportsDelete: true,
  supportsScheduling: false,
};

export type MastodonApiCaller = (
  method: string,
  path: string,
  body?: Record<string, unknown> | FormData
) => Promise<unknown>;

export type MastodonAdapterOptions = {
  credentials: MastodonCredentials;
  config: MastodonAccountConfig;
  callApi?: MastodonApiCaller;
  uploadFiles?: boolean;
  loadUpload?: (item: SnapshotMediaItem) => Promise<Buffer | null>;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function classifyMastodonError(
  httpStatus: number | null,
  description: string
): SocialApiError {
  const desc = description.toLowerCase();
  if (httpStatus === 429) {
    return new SocialApiError({
      message: "rate limited",
      httpStatus: 429,
      code: "RATE_LIMITED",
      retryable: true,
      retryAfterSeconds: 30,
    });
  }
  if (httpStatus === 401 || /unauthorized|invalid access token/.test(desc)) {
    return new SocialApiError({
      message: "invalid credentials",
      httpStatus: 401,
      code: "INVALID_CREDENTIALS",
      retryable: false,
    });
  }
  if (httpStatus === 403 || /forbidden/.test(desc)) {
    return new SocialApiError({
      message: "forbidden",
      httpStatus: 403,
      code: "FORBIDDEN",
      retryable: false,
    });
  }
  if (httpStatus === 422 || /unprocessable|media/.test(desc)) {
    return new SocialApiError({
      message: sanitizeSocialErrorMessage(description) || "invalid media",
      httpStatus: httpStatus ?? 422,
      code: "INVALID_MEDIA",
      retryable: false,
    });
  }
  if (httpStatus && httpStatus >= 500) {
    return new SocialApiError({
      message: "temporary Mastodon server error",
      httpStatus,
      code: "MASTODON_UNAVAILABLE",
      retryable: true,
    });
  }
  return new SocialApiError({
    message: sanitizeSocialErrorMessage(description) || "Mastodon request failed",
    httpStatus,
    code: "MASTODON_ERROR",
    retryable: false,
  });
}

export function createMastodonApiCaller(
  instanceUrl: string,
  accessToken: string
): MastodonApiCaller {
  return async (method, path, body) => {
    const url = `${instanceUrl}${path}`;
    const form = typeof FormData !== "undefined" && body instanceof FormData;
    const timeout = form ? UPLOAD_TIMEOUT_MS : REQUEST_TIMEOUT_MS;
    let response: Response;
    try {
      response = await fetch(url, {
        method,
        headers: {
          Authorization: `Bearer ${accessToken}`,
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
    const record = asRecord(payload);
    const description = String(
      record?.error ?? record?.error_description ?? response.statusText ?? ""
    );
    throw classifyMastodonError(response.status, description);
  };
}

function assertBound(opts: MastodonAdapterOptions): void {
  if (!opts.credentials.accessToken || !opts.config.instanceUrl) {
    throw new SocialApiError({
      message: "invalid credentials",
      httpStatus: 401,
      code: "INVALID_CREDENTIALS",
      retryable: false,
    });
  }
}

export function createMastodonAdapter(
  opts: MastodonAdapterOptions
): SocialAdapter {
  const callApi =
    opts.callApi ??
    createMastodonApiCaller(opts.config.instanceUrl, opts.credentials.accessToken);
  const uploadFiles = opts.uploadFiles ?? !opts.callApi;
  const loadUpload = opts.loadUpload ?? loadSocialUploadBytes;
  const maxImages = Math.min(
    MASTODON_MEDIA_MAX,
    Math.max(1, opts.config.maxImages)
  );

  return {
    getCapabilities: () => ({ ...MASTODON_CAPABILITIES, maxImages }),

    async validateConnection() {
      assertBound(opts);
      await callApi("GET", "/api/v1/accounts/verify_credentials");
      return true;
    },

    async getAccountInfo(): Promise<AccountInfo> {
      assertBound(opts);
      const me = asRecord(
        await callApi("GET", "/api/v1/accounts/verify_credentials")
      );
      return {
        platform: "mastodon",
        handle: me?.acct ? `@${me.acct}` : undefined,
        displayName: typeof me?.display_name === "string" ? me.display_name : undefined,
        botId: me?.id != null ? String(me.id) : undefined,
        targetChat: opts.config.instanceUrl,
      };
    },

    async uploadMedia(media) {
      return { externalId: media.url };
    },

    async publishPost(post) {
      assertBound(opts);
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
        const bytes = uploadFiles ? await loadUpload(item) : null;
        if (!bytes) {
          throw new SocialApiError({
            message: "invalid media",
            httpStatus: 400,
            code: "INVALID_MEDIA",
            retryable: false,
          });
        }
        const form = new FormData();
        form.append(
          "file",
          new Blob([new Uint8Array(bytes)], { type: "image/jpeg" }),
          "photo.jpg"
        );
        const uploaded = asRecord(await callApi("POST", "/api/v2/media", form));
        const id = uploaded?.id != null ? String(uploaded.id) : "";
        if (!id) {
          throw new SocialApiError({
            message: "Mastodon did not return media id",
            httpStatus: 500,
            code: "MASTODON_UNAVAILABLE",
            retryable: true,
          });
        }
        mediaIds.push(id);
      }
      const caption = clipCaptionPreservingCta(post.caption || "", MASTODON_CAPTION_MAX);
      const sensitive = Boolean(
        post.labels &&
          typeof post.labels === "object" &&
          (post.labels as { sensitive?: boolean }).sensitive
      );
      const warning =
        post.labels &&
        typeof post.labels === "object" &&
        typeof (post.labels as { contentWarning?: string }).contentWarning === "string"
          ? (post.labels as { contentWarning: string }).contentWarning
          : sensitive
            ? "Mature / 18+"
            : undefined;
      const status = asRecord(
        await callApi("POST", "/api/v1/statuses", {
          status: caption,
          media_ids: mediaIds,
          sensitive: sensitive || undefined,
          spoiler_text: warning,
          visibility: opts.config.visibility,
        })
      );
      const id = status?.id != null ? String(status.id) : "";
      if (!id) {
        throw new SocialApiError({
          message: "Mastodon did not return status id",
          httpStatus: 500,
          code: "MASTODON_UNAVAILABLE",
          retryable: true,
        });
      }
      const url =
        typeof status?.url === "string"
          ? status.url
          : typeof status?.uri === "string"
            ? status.uri
            : undefined;
      return { externalPostId: id, externalUrl: url };
    },

    async deletePost(externalPostId: string) {
      assertBound(opts);
      await callApi("DELETE", `/api/v1/statuses/${encodeURIComponent(externalPostId)}`);
    },
  };
}

export async function createMastodonAdapterForAccount(
  accountId: number
): Promise<SocialAdapter> {
  const db = await getDb();
  if (!db) {
    throw new SocialApiError({
      message: "Database not available",
      httpStatus: 500,
      code: "MASTODON_UNAVAILABLE",
      retryable: true,
    });
  }
  const [row] = await db
    .select()
    .from(socialAccounts)
    .where(eq(socialAccounts.id, accountId))
    .limit(1);
  if (!row || row.platform !== "mastodon") {
    throw new SocialApiError({
      message: "Mastodon account not found",
      httpStatus: 404,
      code: "INVALID_REQUEST",
      retryable: false,
    });
  }
  const credentials = parseMastodonCredentials(
    await decryptSocialCredentialsAsync(row.encryptedCredentials)
  );
  const config = parseMastodonConfig(row.configJson, credentials);
  return createMastodonAdapter({ credentials, config });
}

export const mastodonAdapter: SocialAdapter = {
  getCapabilities: () => ({ ...MASTODON_CAPABILITIES }),
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
  uploadMedia: async () => {
    throw new SocialApiError({
      message: "invalid credentials",
      httpStatus: 401,
      code: "INVALID_CREDENTIALS",
      retryable: false,
    });
  },
  publishPost: async () => {
    throw new SocialApiError({
      message: "invalid credentials",
      httpStatus: 401,
      code: "INVALID_CREDENTIALS",
      retryable: false,
    });
  },
};
