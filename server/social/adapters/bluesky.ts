import { eq } from "drizzle-orm";
import { socialAccounts } from "../../../drizzle/schema";
import { getDb } from "../../db";
import { decryptSocialCredentialsAsync } from "../crypto";
import { clipCaptionPreservingCta } from "../content";
import { sanitizeSocialErrorMessage } from "../sanitize";
import { loadSocialUploadJpeg } from "../upload-bytes";
import {
  parseBlueskyConfig,
  parseBlueskyCredentials,
  type BlueskyAccountConfig,
  type BlueskyCredentials,
} from "../bluesky-config";
import {
  SocialApiError,
  type AccountInfo,
  type PlatformCapabilities,
  type SnapshotMediaItem,
  type SocialAdapter,
} from "../types";

const REQUEST_TIMEOUT_MS = 30_000;
const UPLOAD_TIMEOUT_MS = 60_000;
const BLUESKY_CAPTION_MAX = 300;
const BLUESKY_MEDIA_MAX = 4;

export const BLUESKY_CAPABILITIES: PlatformCapabilities = {
  platform: "bluesky",
  maxImages: BLUESKY_MEDIA_MAX,
  supportsSensitiveLabel: true,
  supportsContentWarning: true,
  maxCaptionLength: BLUESKY_CAPTION_MAX,
  supportsMultipleImages: true,
  supportsCaption: true,
  supportsDelete: true,
  supportsScheduling: false,
};

type BlueskySession = {
  did: string;
  handle: string;
  accessJwt: string;
};

export type BlueskyApiCaller = (
  method: string,
  path: string,
  body?: Record<string, unknown> | Blob,
  accessJwt?: string
) => Promise<unknown>;

export type BlueskyAdapterOptions = {
  credentials: BlueskyCredentials;
  config: BlueskyAccountConfig;
  callApi?: BlueskyApiCaller;
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

function classifyBlueskyError(
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
  if (
    httpStatus === 401 ||
    /unauthorized|invalid identifier|invalid password|expired token/.test(desc)
  ) {
    return new SocialApiError({
      message: "invalid credentials",
      httpStatus: 401,
      code: "INVALID_CREDENTIALS",
      retryable: false,
    });
  }
  if (httpStatus === 400 && /blob|image|media/.test(desc)) {
    return new SocialApiError({
      message: sanitizeSocialErrorMessage(description) || "invalid media",
      httpStatus: 400,
      code: "INVALID_MEDIA",
      retryable: false,
    });
  }
  if (httpStatus && httpStatus >= 500) {
    return new SocialApiError({
      message: "temporary Bluesky server error",
      httpStatus,
      code: "BLUESKY_UNAVAILABLE",
      retryable: true,
    });
  }
  return new SocialApiError({
    message: sanitizeSocialErrorMessage(description) || "Bluesky request failed",
    httpStatus,
    code: "BLUESKY_ERROR",
    retryable: false,
  });
}

export function createBlueskyApiCaller(pdsUrl: string): BlueskyApiCaller {
  return async (method, path, body, accessJwt) => {
    const url = `${pdsUrl}${path}`;
    const blob = typeof Blob !== "undefined" && body instanceof Blob;
    const timeout = blob ? UPLOAD_TIMEOUT_MS : REQUEST_TIMEOUT_MS;
    let response: Response;
    try {
      response = await fetch(url, {
        method,
        headers: {
          ...(accessJwt ? { Authorization: `Bearer ${accessJwt}` } : {}),
          ...(blob
            ? { "Content-Type": "image/jpeg" }
            : { "Content-Type": "application/json" }),
        },
        body: body
          ? blob
            ? (body as Blob)
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
    const description = String(record?.message ?? record?.error ?? response.statusText ?? "");
    throw classifyBlueskyError(response.status, description);
  };
}

export function createBlueskyAdapter(opts: BlueskyAdapterOptions): SocialAdapter {
  const callApi = opts.callApi ?? createBlueskyApiCaller(opts.config.pdsUrl);
  const uploadFiles = opts.uploadFiles ?? !opts.callApi;
  const loadUpload = opts.loadUpload ?? loadSocialUploadJpeg;
  const maxImages = Math.min(
    BLUESKY_MEDIA_MAX,
    Math.max(1, opts.config.maxImages)
  );
  let session: BlueskySession | null = null;

  async function ensureSession(): Promise<BlueskySession> {
    if (session) return session;
    const created = asRecord(
      await callApi("POST", "/xrpc/com.atproto.server.createSession", {
        identifier: opts.credentials.identifier,
        password: opts.credentials.appPassword,
      })
    );
    const did = typeof created?.did === "string" ? created.did : "";
    const handle = typeof created?.handle === "string" ? created.handle : "";
    const accessJwt =
      typeof created?.accessJwt === "string" ? created.accessJwt : "";
    if (!did || !accessJwt) {
      throw new SocialApiError({
        message: "invalid credentials",
        httpStatus: 401,
        code: "INVALID_CREDENTIALS",
        retryable: false,
      });
    }
    session = { did, handle, accessJwt };
    return session;
  }

  return {
    getCapabilities: () => ({ ...BLUESKY_CAPABILITIES, maxImages }),

    async validateConnection() {
      await ensureSession();
      return true;
    },

    async getAccountInfo(): Promise<AccountInfo> {
      const current = await ensureSession();
      return {
        platform: "bluesky",
        handle: current.handle ? `@${current.handle}` : undefined,
        displayName: current.handle,
        botId: current.did,
        targetChat: opts.config.pdsUrl,
      };
    },

    async uploadMedia(media) {
      return { externalId: media.url };
    },

    async publishPost(post) {
      const current = await ensureSession();
      const items = [...post.media].sort((a, b) => a.sortOrder - b.sortOrder);
      if (!items.length || items.length > maxImages) {
        throw new SocialApiError({
          message: "invalid media",
          httpStatus: 400,
          code: "INVALID_MEDIA",
          retryable: false,
        });
      }
      const images: Array<{
        alt: string;
        image: unknown;
        aspectRatio?: { width: number; height: number };
      }> = [];
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
        const blob = await callApi(
          "POST",
          "/xrpc/com.atproto.repo.uploadBlob",
          new Blob([new Uint8Array(jpeg.bytes)], { type: "image/jpeg" }),
          current.accessJwt
        );
        const blobRef = asRecord(blob)?.blob;
        if (!blobRef) {
          throw new SocialApiError({
            message: "Bluesky did not return blob",
            httpStatus: 500,
            code: "BLUESKY_UNAVAILABLE",
            retryable: true,
          });
        }
        images.push({
          alt: "Yukvix album photo",
          image: blobRef,
          aspectRatio: { width: jpeg.width, height: jpeg.height },
        });
      }
      const text = clipCaptionPreservingCta(post.caption || "", BLUESKY_CAPTION_MAX);
      const sensitive = Boolean(
        post.labels &&
          typeof post.labels === "object" &&
          (post.labels as { sensitive?: boolean }).sensitive
      );
      const record: Record<string, unknown> = {
        $type: "app.bsky.feed.post",
        text,
        createdAt: new Date().toISOString(),
        embed: {
          $type: "app.bsky.embed.images",
          images,
        },
      };
      if (sensitive) {
        record.labels = {
          $type: "com.atproto.label.defs#selfLabels",
          values: [{ val: "sexual" }],
        };
      }
      const created = asRecord(
        await callApi(
          "POST",
          "/xrpc/com.atproto.repo.createRecord",
          {
            repo: current.did,
            collection: "app.bsky.feed.post",
            record,
          },
          current.accessJwt
        )
      );
      const uri = typeof created?.uri === "string" ? created.uri : "";
      if (!uri) {
        throw new SocialApiError({
          message: "Bluesky did not return post uri",
          httpStatus: 500,
          code: "BLUESKY_UNAVAILABLE",
          retryable: true,
        });
      }
      const rkey = uri.split("/").pop() || "";
      const handle = current.handle.replace(/^@/, "");
      return {
        externalPostId: uri,
        externalUrl: handle && rkey ? `https://bsky.app/profile/${handle}/post/${rkey}` : undefined,
      };
    },

    async deletePost(externalPostId: string) {
      const current = await ensureSession();
      const rkey = externalPostId.split("/").pop();
      if (!rkey) {
        throw new SocialApiError({
          message: "invalid request",
          httpStatus: 400,
          code: "INVALID_REQUEST",
          retryable: false,
        });
      }
      await callApi(
        "POST",
        "/xrpc/com.atproto.repo.deleteRecord",
        {
          repo: current.did,
          collection: "app.bsky.feed.post",
          rkey,
        },
        current.accessJwt
      );
    },
  };
}

export async function createBlueskyAdapterForAccount(
  accountId: number
): Promise<SocialAdapter> {
  const db = await getDb();
  if (!db) {
    throw new SocialApiError({
      message: "Database not available",
      httpStatus: 500,
      code: "BLUESKY_UNAVAILABLE",
      retryable: true,
    });
  }
  const [row] = await db
    .select()
    .from(socialAccounts)
    .where(eq(socialAccounts.id, accountId))
    .limit(1);
  if (!row || row.platform !== "bluesky") {
    throw new SocialApiError({
      message: "Bluesky account not found",
      httpStatus: 404,
      code: "INVALID_REQUEST",
      retryable: false,
    });
  }
  const credentials = parseBlueskyCredentials(
    await decryptSocialCredentialsAsync(row.encryptedCredentials)
  );
  const config = parseBlueskyConfig(row.configJson, credentials);
  return createBlueskyAdapter({ credentials, config });
}

export const blueskyAdapter: SocialAdapter = {
  getCapabilities: () => ({ ...BLUESKY_CAPABILITIES }),
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
