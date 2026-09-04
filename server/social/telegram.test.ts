import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createTelegramAdapter,
  createTelegramApiCaller,
  TELEGRAM_CAPABILITIES,
  type TelegramApiCaller,
} from "./adapters/telegram";
import { assertTelegramSnapshotUrl } from "./telegram-config";
import { SocialApiError } from "./types";
import {
  MemorySocialQueue,
  claimSocialPost,
  setSocialQueueForTests,
} from "./queue";
import { processClaimedPost } from "./worker";
import { setSocialAdapterOverride, clearSocialAdapterOverrides } from "./adapters";
import { withPolicySnapshot, evaluateSocialPolicy } from "./policy";
import { DEFAULT_SOCIAL_CONFIG } from "./config";
import { stubCapabilities } from "./adapters/stub";
import type { PolicyInputAlbum, SocialAccountFlags, SnapshotMediaItem } from "./types";

const album: PolicyInputAlbum = {
  id: 1,
  status: "published",
  title: "Safe Test",
  slug: "safe-test",
  coverUrl: "https://media.yukvix.com/albums/1/thumb/cover.webp",
};

const telegramAccount: SocialAccountFlags = {
  id: 1,
  platform: "telegram",
  displayName: "Yukvix TG",
  isEnabled: true,
  autoShare: false,
  requireApproval: false,
};

const creds = { botToken: "123456789:AAThisIsAFakeTelegramBotTokenXX", chatId: "@yukvix_test" };
const config = {
  chatId: "@yukvix_test",
  maxImages: 10,
  disableNotification: false,
  protectContent: false,
  channelUsername: "yukvix_test",
};

function photo(n: number): SnapshotMediaItem {
  return {
    type: "thumb",
    url: `https://media.yukvix.com/albums/1/thumb/${n}.webp`,
    sortOrder: n,
  };
}

function adapterWith(callApi: TelegramApiCaller) {
  return createTelegramAdapter({
    credentials: creds,
    config,
    callApi,
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
  clearSocialAdapterOverrides();
  setSocialQueueForTests(null);
});

describe("telegram capabilities", () => {
  it("matches the implemented Bot API surface", () => {
    expect(TELEGRAM_CAPABILITIES.maxImages).toBe(10);
    expect(TELEGRAM_CAPABILITIES.supportsMultipleImages).toBe(true);
    expect(TELEGRAM_CAPABILITIES.supportsCaption).toBe(true);
    expect(TELEGRAM_CAPABILITIES.supportsSensitiveLabel).toBe(true);
    expect(TELEGRAM_CAPABILITIES.supportsDelete).toBe(true);
    expect(TELEGRAM_CAPABILITIES.supportsScheduling).toBe(false);
    expect(TELEGRAM_CAPABILITIES.maxCaptionLength).toBe(1024);
  });
});

describe("telegram URL boundary", () => {
  it("allows public https thumbs", () => {
    expect(
      assertTelegramSnapshotUrl("https://media.yukvix.com/albums/1/thumb/a.webp")
    ).toContain("https://");
  });

  it("rejects http, relative, private, signed, and VIP paths", () => {
    expect(() =>
      assertTelegramSnapshotUrl("http://media.yukvix.com/albums/1/thumb/a.webp")
    ).toThrow(/https/i);
    expect(() => assertTelegramSnapshotUrl("/albums/1/thumb/a.webp")).toThrow();
    expect(() =>
      assertTelegramSnapshotUrl("https://127.0.0.1/albums/1/thumb/a.webp")
    ).toThrow();
    expect(() =>
      assertTelegramSnapshotUrl(
        "https://media.yukvix.com/albums/1/webp/a.webp?X-Amz-Signature=abc"
      )
    ).toThrow();
    expect(() =>
      assertTelegramSnapshotUrl("https://media.yukvix.com/vip-zips/a.zip")
    ).toThrow();
    expect(() =>
      assertTelegramSnapshotUrl("https://media.yukvix.com/albums/1/original/a.jpg")
    ).toThrow();
  });
});

describe("telegram connection", () => {
  it("validates bot + target chat via getMe and getChat", async () => {
    const methods: string[] = [];
    const adapter = adapterWith(async method => {
      methods.push(method);
      if (method === "getMe") return { id: 9, username: "yukvix_bot", first_name: "Yukvix" };
      if (method === "getChat") return { id: -100, title: "Yukvix Test", username: "yukvix_test" };
      throw new Error(`unexpected ${method}`);
    });
    expect(await adapter.validateConnection()).toBe(true);
    const info = await adapter.getAccountInfo();
    expect(info.handle).toBe("@yukvix_bot");
    expect(info.botId).toBe(9);
    expect(info.targetChat).toBe("@yukvix_test");
    expect(JSON.stringify(info)).not.toContain(creds.botToken);
    expect(methods).toContain("getMe");
    expect(methods).toContain("getChat");
  });

  it("maps invalid token to non-retryable 401", async () => {
    const adapter = adapterWith(async () => {
      throw new SocialApiError({
        message: "invalid credentials",
        httpStatus: 401,
        code: "INVALID_CREDENTIALS",
        retryable: false,
      });
    });
    await expect(adapter.validateConnection()).rejects.toMatchObject({
      code: "INVALID_CREDENTIALS",
      retryable: false,
    });
  });

  it("maps missing chat permission to non-retryable 403", async () => {
    const adapter = adapterWith(async method => {
      if (method === "getMe") return { id: 1, username: "bot" };
      throw new SocialApiError({
        message: "bot blocked or missing permission",
        httpStatus: 403,
        code: "FORBIDDEN",
        retryable: false,
      });
    });
    await expect(adapter.validateConnection()).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });
});

describe("telegram publish", () => {
  it("sends a single photo with caption and spoiler for mature content", async () => {
    const bodies: Array<{ method: string; body: Record<string, unknown> }> = [];
    const adapter = adapterWith(async (method, body) => {
      if (body instanceof FormData) throw new Error("expected json");
      bodies.push({ method, body });
      return {
        message_id: 77,
        chat: { username: "yukvix_test" },
      };
    });
    const result = await adapter.publishPost({
      caption: "Safe Test\nhttps://yukvix.com/album/safe-test",
      media: [photo(1)],
      labels: { sensitive: true },
    });
    expect(bodies[0].method).toBe("sendPhoto");
    expect(bodies[0].body.photo).toBe(photo(1).url);
    expect(bodies[0].body.caption).toContain("Safe Test");
    expect(bodies[0].body.has_spoiler).toBe(true);
    expect(result.externalPostId).toBe("77");
    expect(result.externalUrl).toBe("https://t.me/yukvix_test/77");
  });

  it("sends a media group with caption only on the first item", async () => {
    const adapter = adapterWith(async (method, body) => {
      expect(method).toBe("sendMediaGroup");
      if (body instanceof FormData) throw new Error("expected json");
      const media = body.media as Array<{ caption?: string }>;
      expect(media).toHaveLength(3);
      expect(media[0].caption).toContain("Album");
      expect(media[1].caption).toBeUndefined();
      expect(media[2].caption).toBeUndefined();
      return [
        { message_id: 10, chat: { username: "yukvix_test" } },
        { message_id: 11 },
        { message_id: 12 },
      ];
    });
    const result = await adapter.publishPost({
      caption: "Album",
      media: [photo(1), photo(2), photo(3)],
    });
    expect(result.externalPostId).toBe("10,11,12");
  });

  it("rejects snapshots above maxImages instead of truncating", async () => {
    const adapter = createTelegramAdapter({
      credentials: creds,
      config: { ...config, maxImages: 2 },
      callApi: async () => {
        throw new Error("should not call Telegram");
      },
    });
    await expect(
      adapter.publishPost({
        caption: "x",
        media: [photo(1), photo(2), photo(3)],
      })
    ).rejects.toMatchObject({ code: "INVALID_MEDIA" });
  });

  it("does not query albums or regenerate captions", async () => {
    const adapter = adapterWith(async () => ({
      message_id: 1,
      chat: { username: "yukvix_test" },
    }));
    const caption = "Frozen snapshot caption 🌸 日本語";
    const result = await adapter.publishPost({
      caption,
      media: [photo(1)],
    });
    expect(result.externalPostId).toBe("1");
    const sent = await adapterWith(async (_method, body) => {
      if (body instanceof FormData) throw new Error("expected json");
      expect(body.caption).toBe(caption);
      return { message_id: 2, chat: { username: "yukvix_test" } };
    }).publishPost({ caption, media: [photo(1)] });
    expect(sent.externalPostId).toBe("2");
  });

  it("uploads a JPEG file instead of a thumb URL when uploadFiles is on", async () => {
    const jpeg = Buffer.from("fake-jpeg");
    let form: FormData | null = null;
    const adapter = createTelegramAdapter({
      credentials: creds,
      config,
      uploadFiles: true,
      loadUpload: async () => jpeg,
      callApi: async (method, body) => {
        expect(method).toBe("sendPhoto");
        expect(body).toBeInstanceOf(FormData);
        form = body as FormData;
        return { message_id: 88, chat: { username: "yukvix_test" } };
      },
    });
    const result = await adapter.publishPost({
      caption: "Hello",
      media: [photo(1)],
    });
    expect(result.externalPostId).toBe("88");
    expect(form).toBeTruthy();
    expect(form!.get("caption")).toBe("Hello");
    expect(form!.get("photo")).toBeTruthy();
    expect(form!.get("chat_id")).toBe(creds.chatId);
  });

  it("attaches JPEG files on sendMediaGroup", async () => {
    const jpeg = Buffer.from("fake-jpeg");
    const adapter = createTelegramAdapter({
      credentials: creds,
      config,
      uploadFiles: true,
      loadUpload: async () => jpeg,
      callApi: async (method, body) => {
        expect(method).toBe("sendMediaGroup");
        expect(body).toBeInstanceOf(FormData);
        const form = body as FormData;
        const media = JSON.parse(String(form.get("media")));
        expect(media).toHaveLength(3);
        expect(media[0].media).toBe("attach://file0");
        expect(media[1].media).toBe("attach://file1");
        expect(media[0].caption).toBe("Album");
        expect(form.get("file0")).toBeTruthy();
        expect(form.get("file2")).toBeTruthy();
        return [
          { message_id: 10, chat: { username: "yukvix_test" } },
          { message_id: 11 },
          { message_id: 12 },
        ];
      },
    });
    const result = await adapter.publishPost({
      caption: "Album",
      media: [photo(1), photo(2), photo(3)],
    });
    expect(result.externalPostId).toBe("10,11,12");
  });
});

describe("telegram errors", () => {
  it("maps 400/401/403 as hard failures and 429 with retry_after", async () => {
    const cases = [
      [400, "INVALID_REQUEST", false],
      [401, "INVALID_CREDENTIALS", false],
      [403, "FORBIDDEN", false],
    ] as const;
    for (const [status, code, retryable] of cases) {
      const adapter = adapterWith(async () => {
        throw new SocialApiError({
          message: "err",
          httpStatus: status,
          code,
          retryable,
        });
      });
      await expect(
        adapter.publishPost({ caption: "x", media: [photo(1)] })
      ).rejects.toMatchObject({ httpStatus: status, retryable });
    }
  });

  it("honors retry_after on 429", async () => {
    const adapter = adapterWith(async () => {
      throw new SocialApiError({
        message: "rate limited",
        httpStatus: 429,
        code: "RATE_LIMITED",
        retryable: true,
        retryAfterSeconds: 42,
      });
    });
    await expect(
      adapter.publishPost({ caption: "x", media: [photo(1)] })
    ).rejects.toMatchObject({ retryAfterSeconds: 42, retryable: true });
  });
});

describe("telegram API caller", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    clearSocialAdapterOverrides();
    setSocialQueueForTests(null);
  });

  it("parses retry_after and never puts the bot token in thrown errors", async () => {
    const token = "123456789:AAThisIsAFakeTelegramBotTokenXX";
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        status: 429,
        json: async () => ({
          ok: false,
          description: "Too Many Requests: retry after 7",
          parameters: { retry_after: 7 },
        }),
      }))
    );
    const call = createTelegramApiCaller(token);
    await expect(call("sendPhoto", { chat_id: "@x" })).rejects.toMatchObject({
      retryAfterSeconds: 7,
      retryable: true,
      httpStatus: 429,
    });
    try {
      await call("sendPhoto", { chat_id: "@x" });
    } catch (err) {
      expect(String(err)).not.toContain(token);
    }
  });

  it("retries connection failures that happen before the request is sent", async () => {
    const err = Object.assign(new TypeError("fetch failed"), {
      cause: { code: "ECONNREFUSED" },
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw err;
      })
    );
    const call = createTelegramApiCaller("123456789:AAThisIsAFakeTelegramBotTokenXX");
    await expect(call("sendPhoto", { chat_id: "@x" })).rejects.toMatchObject({
      code: "NETWORK_ERROR",
      retryable: true,
    });
  });

  it("does not retry send timeouts after the request may have left the process", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        const abort = new Error("The operation was aborted");
        abort.name = "AbortError";
        throw abort;
      })
    );
    const call = createTelegramApiCaller("123456789:AAThisIsAFakeTelegramBotTokenXX");
    await expect(call("sendPhoto", { chat_id: "@x" })).rejects.toMatchObject({
      code: "AMBIGUOUS_PUBLISH",
      retryable: false,
    });
    await expect(call("getMe", {})).rejects.toMatchObject({
      code: "NETWORK_ERROR",
      retryable: true,
    });
  });
});

describe("telegram worker integration (mocked API)", () => {
  it("marks sent and stores external ids", async () => {
    const store = new MemorySocialQueue();
    setSocialQueueForTests(store);
    setSocialAdapterOverride(
      "telegram",
      adapterWith(async () => ({
        message_id: 55,
        chat: { username: "yukvix_test" },
      }))
    );
    const { id } = await store.insert({
      albumId: 1,
      accountId: 1,
      platform: "telegram",
      trigger: "manual",
      status: "pending",
      scheduledAt: new Date(Date.now() - 1),
      contentRating: "mature",
      caption: "caption",
      media: { items: [photo(1)] },
      policy: withPolicySnapshot(
        evaluateSocialPolicy({
          album,
          account: telegramAccount,
          capabilities: stubCapabilities("telegram"),
          config: DEFAULT_SOCIAL_CONFIG,
        }),
        {
          album,
          account: telegramAccount,
          config: DEFAULT_SOCIAL_CONFIG,
          delayMinutes: 0,
          maxImages: 10,
        }
      ),
      idempotencyKey: "tg-sent",
    });
    const claimed = await claimSocialPost(new Date(), store);
    await processClaimedPost(claimed!, store);
    const post = await store.getById(id);
    expect(post?.status).toBe("sent");
    expect(post?.externalPostId).toBe("55");
    expect(post?.externalUrl).toContain("t.me/yukvix_test/55");
    clearSocialAdapterOverrides();
    setSocialQueueForTests(null);
  });

  it("schedules retry using retry_after rather than a shorter backoff", async () => {
    const store = new MemorySocialQueue();
    setSocialAdapterOverride(
      "telegram",
      adapterWith(async () => {
        throw new SocialApiError({
          message: "rate limited",
          httpStatus: 429,
          code: "RATE_LIMITED",
          retryable: true,
          retryAfterSeconds: 120,
        });
      })
    );
    const { id } = await store.insert({
      albumId: 1,
      accountId: 1,
      platform: "telegram",
      trigger: "manual",
      status: "pending",
      scheduledAt: new Date(Date.now() - 1),
      contentRating: "mature",
      caption: "caption",
      media: { items: [photo(1)] },
      policy: withPolicySnapshot(
        evaluateSocialPolicy({
          album,
          account: telegramAccount,
          capabilities: stubCapabilities("telegram"),
          config: DEFAULT_SOCIAL_CONFIG,
        }),
        {
          album,
          account: telegramAccount,
          config: DEFAULT_SOCIAL_CONFIG,
          delayMinutes: 0,
          maxImages: 10,
        }
      ),
      idempotencyKey: "tg-429",
    });
    const claimed = await claimSocialPost(new Date(), store);
    const outcome = await processClaimedPost(claimed!, store);
    expect(outcome).toBe("retry");
    const post = await store.getById(id);
    expect(post?.status).toBe("pending");
    expect(post?.scheduledAt.getTime()).toBeGreaterThan(Date.now() + 60_000);
    const payload = JSON.stringify(store.attempts[0]);
    expect(payload).not.toContain(creds.botToken);
    clearSocialAdapterOverrides();
  });

  it("does not auto-retry an ambiguous publish", async () => {
    const store = new MemorySocialQueue();
    setSocialAdapterOverride(
      "telegram",
      adapterWith(async () => {
        throw new SocialApiError({
          message:
            "ambiguous publish: request may have reached Telegram without a response",
          httpStatus: null,
          code: "AMBIGUOUS_PUBLISH",
          retryable: false,
        });
      })
    );
    const { id } = await store.insert({
      albumId: 1,
      accountId: 1,
      platform: "telegram",
      trigger: "manual",
      status: "pending",
      scheduledAt: new Date(Date.now() - 1),
      contentRating: "mature",
      caption: "caption",
      media: { items: [photo(1)] },
      policy: withPolicySnapshot(
        evaluateSocialPolicy({
          album,
          account: telegramAccount,
          capabilities: stubCapabilities("telegram"),
          config: DEFAULT_SOCIAL_CONFIG,
        }),
        {
          album,
          account: telegramAccount,
          config: DEFAULT_SOCIAL_CONFIG,
          delayMinutes: 0,
          maxImages: 10,
        }
      ),
      idempotencyKey: "tg-ambiguous",
    });
    const claimed = await claimSocialPost(new Date(), store);
    const outcome = await processClaimedPost(claimed!, store);
    expect(outcome).toBe("failed");
    expect((await store.getById(id))?.status).toBe("failed");
    expect((await store.getById(id))?.lastError).toMatch(/ambiguous publish/i);
    clearSocialAdapterOverrides();
  });

  it("does not call Telegram when policy.allowed is false", async () => {
    const store = new MemorySocialQueue();
    const spy = vi.fn();
    setSocialAdapterOverride(
      "telegram",
      adapterWith(async method => {
        spy(method);
        return {};
      })
    );
    const { id } = await store.insert({
      albumId: 1,
      accountId: 1,
      platform: "telegram",
      trigger: "manual",
      status: "pending",
      scheduledAt: new Date(Date.now() - 1),
      contentRating: "mature",
      caption: "caption",
      media: { items: [photo(1)] },
      policy: {
        allowed: false,
        requiresSensitive: false,
        requiresApproval: false,
        reason: "blocked",
        config: {
          contentRating: "mature",
          maxImages: 10,
          delayMinutes: 0,
          platformEnabled: true,
          accountEnabled: true,
          autoShare: false,
        },
      },
      idempotencyKey: "tg-policy",
    });
    const claimed = await claimSocialPost(new Date(), store);
    await processClaimedPost(claimed!, store);
    expect(spy).not.toHaveBeenCalled();
    expect((await store.getById(id))?.status).toBe("failed");
    clearSocialAdapterOverrides();
  });
});
