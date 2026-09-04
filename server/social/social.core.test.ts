import { readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { DEFAULT_SOCIAL_CONFIG } from "./config";
import { composeSocialContent, clipCaptionPreservingCta } from "./content";
import {
  autoIdempotencyKey,
  findDuplicate,
  manualIdempotencyKey,
} from "./duplicate";
import { runSocialDryRun } from "./dry-run";
import { evaluateSocialPolicy, withPolicySnapshot } from "./policy";
import { calculateSocialRisk } from "./risk";
import { isRetryableSocialError, sanitizeAttemptPayload, sanitizeSocialErrorMessage } from "./sanitize";
import {
  MemorySocialQueue,
  MysqlCasMemoryQueue,
  claimSocialPost,
  enqueueSocialPost,
  finishMysqlCasClaim,
  recoverStuckSocialPosts,
  retrySocialPost,
  setSocialQueueForTests,
} from "./queue";
import { createAutoSharePosts, createManualShare } from "./share";
import {
  clearSocialAdapterOverrides,
  setSocialAdapterOverride,
} from "./adapters";
import { stubCapabilities } from "./adapters/stub";
import { SOCIAL_STUCK_MS, processClaimedPost, runSocialWorkerTick } from "./worker";
import type {
  PolicyInputAlbum,
  SocialAccountFlags,
  SocialAdapter,
} from "./types";

const album: PolicyInputAlbum = {
  id: 42,
  status: "published",
  isVip: false,
  title: "Espacia Test",
  slug: "espacia-test",
  coverUrl: "https://media.yukvix.com/albums/42/thumb/cover.webp",
};

const photos = [
  {
    id: 7,
    thumbUrl: "https://media.yukvix.com/albums/42/thumb/1.webp",
    isFreePreview: true,
    sortOrder: 0,
  },
];

const telegramAccount: SocialAccountFlags = {
  id: 1,
  platform: "telegram",
  displayName: "Yukvix TG",
  isEnabled: true,
  autoShare: false,
  requireApproval: false,
};

const xAccount: SocialAccountFlags = {
  id: 9,
  platform: "x",
  displayName: "Yukvix X",
  isEnabled: false,
  autoShare: false,
  requireApproval: true,
};

function policyInput(
  account: SocialAccountFlags,
  albumOverride?: Partial<PolicyInputAlbum>
) {
  return {
    album: { ...album, ...albumOverride },
    account,
    capabilities: stubCapabilities(account.platform),
    config: DEFAULT_SOCIAL_CONFIG,
  };
}

afterEach(() => {
  setSocialQueueForTests(null);
  clearSocialAdapterOverrides();
});

describe("migration SQL", () => {
  it("creates the three social tables and unique idempotency", () => {
    const sql = readFileSync(
      path.resolve("drizzle/0045_social_distribution.sql"),
      "utf8"
    );
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS `social_accounts`");
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS `social_posts`");
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS `social_post_attempts`");
    expect(sql).toContain("UNIQUE KEY `social_posts_idempotencyKey_unique` (`idempotencyKey`)");
    expect(sql).not.toContain("ALTER TABLE `albums`");
    expect(sql).not.toContain("ALTER TABLE `photos`");
  });
});

describe("policy", () => {
  it("allows published albums", () => {
    const decision = evaluateSocialPolicy(policyInput(telegramAccount));
    expect(decision.allowed).toBe(true);
    expect(decision.requiresSensitive).toBe(true);
  });

  it("rejects draft and archived", () => {
    expect(
      evaluateSocialPolicy(policyInput(telegramAccount, { status: "draft" }))
        .allowed
    ).toBe(false);
    expect(
      evaluateSocialPolicy(policyInput(telegramAccount, { status: "archived" }))
        .reason
    ).toMatch(/Archived/);
  });

  it("rejects disabled platform X", () => {
    const enabledX = { ...xAccount, isEnabled: true };
    const decision = evaluateSocialPolicy(policyInput(enabledX));
    expect(decision.allowed).toBe(false);
    expect(decision.reason).toMatch(/disabled/);
    expect(decision.requiresApproval).toBe(true);
  });

  it("rejects disabled accounts", () => {
    expect(
      evaluateSocialPolicy(
        policyInput({ ...telegramAccount, isEnabled: false })
      ).allowed
    ).toBe(false);
  });
});

describe("idempotency and duplicate", () => {
  it("enqueues the same auto key only once", async () => {
    const store = new MemorySocialQueue();
    const base = {
      albumId: 42,
      accountId: 1,
      platform: "telegram" as const,
      trigger: "auto" as const,
      status: "pending" as const,
      scheduledAt: new Date(),
      contentRating: "mature",
      caption: "hi",
      media: {
        items: [
          {
            type: "thumb" as const,
            url: "https://media.yukvix.com/t.webp",
            sortOrder: 1,
          },
        ],
      },
      policy: withPolicySnapshot(
        evaluateSocialPolicy(policyInput(telegramAccount)),
        {
          album,
          account: telegramAccount,
          config: DEFAULT_SOCIAL_CONFIG,
          delayMinutes: 5,
          maxImages: 10,
        }
      ),
    };
    const first = await enqueueSocialPost(
      { ...base, idempotencyKey: autoIdempotencyKey(42, 1) },
      store
    );
    const second = await enqueueSocialPost(
      { ...base, idempotencyKey: autoIdempotencyKey(42, 1) },
      store
    );
    expect(first.duplicate).toBe(false);
    expect(second.duplicate).toBe(true);
    expect(second.id).toBe(first.id);
    expect(store.posts).toHaveLength(1);
  });

  it("allows intentional manual re-share with a new key", async () => {
    const store = new MemorySocialQueue();
    const media = {
      items: [
        {
          type: "thumb" as const,
          url: "https://media.yukvix.com/t.webp",
          sortOrder: 1,
        },
      ],
    };
    const policy = withPolicySnapshot(
      evaluateSocialPolicy(policyInput(telegramAccount)),
      {
        album,
        account: telegramAccount,
        config: DEFAULT_SOCIAL_CONFIG,
        delayMinutes: 5,
        maxImages: 10,
      }
    );
    await enqueueSocialPost(
      {
        albumId: 42,
        accountId: 1,
        platform: "telegram",
        trigger: "manual",
        status: "sent",
        scheduledAt: new Date(),
        contentRating: "mature",
        caption: "one",
        media,
        policy,
        idempotencyKey: manualIdempotencyKey(42, 1, "run-a"),
      },
      store
    );
    const again = await enqueueSocialPost(
      {
        albumId: 42,
        accountId: 1,
        platform: "telegram",
        trigger: "manual",
        status: "pending",
        scheduledAt: new Date(),
        contentRating: "mature",
        caption: "two",
        media,
        policy,
        force: true,
        idempotencyKey: manualIdempotencyKey(42, 1, "run-b"),
      },
      store
    );
    expect(again.duplicate).toBe(false);
    expect(store.posts).toHaveLength(2);
  });

  it("detects album+account duplicates unless force", () => {
    const existing = [
      {
        id: 5,
        albumId: 42,
        accountId: 1,
        idempotencyKey: "other",
        status: "sent",
        mediaJson: JSON.stringify({ items: [] }),
        createdAt: new Date(),
      },
    ];
    const blocked = findDuplicate({
      albumId: 42,
      accountId: 1,
      idempotencyKey: "new",
      trigger: "manual",
      snapshot: { items: [] },
      existing,
    });
    expect(blocked.duplicate).toBe(true);
    const forced = findDuplicate({
      albumId: 42,
      accountId: 1,
      idempotencyKey: "new",
      trigger: "manual",
      force: true,
      snapshot: { items: [] },
      existing,
    });
    expect(forced.duplicate).toBe(false);
  });
});

describe("queue claim / retry / stuck / schedule", () => {
  it("lets only one of two workers claim a pending post", async () => {
    const store = new MemorySocialQueue();
    await store.insert({
      albumId: 1,
      accountId: 1,
      platform: "telegram",
      trigger: "manual",
      status: "pending",
      scheduledAt: new Date(Date.now() - 1000),
      contentRating: "mature",
      caption: "x",
      media: { items: [] },
      policy: withPolicySnapshot(
        evaluateSocialPolicy(policyInput(telegramAccount)),
        {
          album,
          account: telegramAccount,
          config: DEFAULT_SOCIAL_CONFIG,
          delayMinutes: 0,
          maxImages: 10,
        }
      ),
      idempotencyKey: "claim-1",
    });
    const now = new Date();
    const [a, b] = await Promise.all([
      store.claimPending(now),
      store.claimPending(now),
    ]);
    const claimed = [a, b].filter(Boolean);
    expect(claimed).toHaveLength(1);
    expect(store.posts.filter(p => p.status === "processing")).toHaveLength(1);
  });

  it("MySQL CAS: two workers SELECT the same row; only affectedRows===1 publishes", async () => {
    const store = new MysqlCasMemoryQueue();
    await store.insert({
      albumId: 1,
      accountId: 1,
      platform: "telegram",
      trigger: "manual",
      status: "pending",
      scheduledAt: new Date(Date.now() - 1000),
      contentRating: "mature",
      caption: "x",
      media: { items: [] },
      policy: withPolicySnapshot(
        evaluateSocialPolicy(policyInput(telegramAccount)),
        {
          album,
          account: telegramAccount,
          config: DEFAULT_SOCIAL_CONFIG,
          delayMinutes: 0,
          maxImages: 10,
        }
      ),
      idempotencyKey: "cas-claim-1",
    });
    const now = new Date();
    const [a, b] = await Promise.all([
      store.claimPending(now),
      store.claimPending(now),
    ]);
    const claimed = [a, b].filter(Boolean);
    expect(claimed).toHaveLength(1);
    expect(store.posts.filter(p => p.status === "processing")).toHaveLength(1);
    expect(store.posts.filter(p => p.status === "pending")).toHaveLength(0);
  });

  it("affectedRows 0 skips the job and does not load it as claimed", async () => {
    let loaded = 0;
    const lost = await finishMysqlCasClaim({
      updateResult: [{ affectedRows: 0 }, []],
      load: async () => {
        loaded += 1;
        return {
          id: 1,
          albumId: 1,
          accountId: 1,
          platform: "telegram",
          trigger: "manual",
          status: "processing",
          idempotencyKey: "x",
          scheduledAt: new Date(),
          contentRating: "mature",
          caption: "x",
          mediaJson: "{}",
          policyJson: "{}",
          externalPostId: null,
          externalUrl: null,
          attempts: 0,
          maxAttempts: 5,
          lastError: null,
          createdBy: null,
          createdAt: new Date(),
          processedAt: new Date(),
        };
      },
    });
    expect(lost).toBeNull();
    expect(loaded).toBe(0);

    const won = await finishMysqlCasClaim({
      updateResult: { affectedRows: 1 },
      load: async () => ({
        id: 2,
        albumId: 1,
        accountId: 1,
        platform: "telegram",
        trigger: "manual",
        status: "processing",
        idempotencyKey: "y",
        scheduledAt: new Date(),
        contentRating: "mature",
        caption: "x",
        mediaJson: "{}",
        policyJson: "{}",
        externalPostId: null,
        externalUrl: null,
        attempts: 0,
        maxAttempts: 5,
        lastError: null,
        createdBy: null,
        createdAt: new Date(),
        processedAt: new Date(),
      }),
    });
    expect(won?.id).toBe(2);
  });

  it("does not claim future scheduledAt rows", async () => {
    const store = new MemorySocialQueue();
    await store.insert({
      albumId: 1,
      accountId: 1,
      platform: "telegram",
      trigger: "manual",
      status: "pending",
      scheduledAt: new Date(Date.now() + 60_000),
      contentRating: "mature",
      caption: "later",
      media: { items: [] },
      policy: withPolicySnapshot(
        evaluateSocialPolicy(policyInput(telegramAccount)),
        {
          album,
          account: telegramAccount,
          config: DEFAULT_SOCIAL_CONFIG,
          delayMinutes: 15,
          maxImages: 10,
        }
      ),
      idempotencyKey: "future-1",
    });
    expect(await claimSocialPost(new Date(), store)).toBeNull();
  });

  it("retries failed posts back to pending", async () => {
    const store = new MemorySocialQueue();
    const { id } = await store.insert({
      albumId: 1,
      accountId: 1,
      platform: "telegram",
      trigger: "manual",
      status: "failed",
      scheduledAt: new Date(),
      contentRating: "mature",
      caption: "x",
      media: { items: [] },
      policy: withPolicySnapshot(
        evaluateSocialPolicy(policyInput(telegramAccount)),
        {
          album,
          account: telegramAccount,
          config: DEFAULT_SOCIAL_CONFIG,
          delayMinutes: 0,
          maxImages: 10,
        }
      ),
      idempotencyKey: "fail-1",
    });
    expect(await retrySocialPost(id, store)).toBe(true);
    expect((await store.getById(id))?.status).toBe("pending");
  });

  it("recovers stuck processing except in-flight ids", async () => {
    const store = new MemorySocialQueue();
    const old = await store.insert({
      albumId: 1,
      accountId: 1,
      platform: "telegram",
      trigger: "manual",
      status: "processing",
      scheduledAt: new Date(),
      contentRating: "mature",
      caption: "x",
      media: { items: [] },
      policy: withPolicySnapshot(
        evaluateSocialPolicy(policyInput(telegramAccount)),
        {
          album,
          account: telegramAccount,
          config: DEFAULT_SOCIAL_CONFIG,
          delayMinutes: 0,
          maxImages: 10,
        }
      ),
      idempotencyKey: "stuck-1",
    });
    const row = await store.getById(old.id);
    if (row) row.processedAt = new Date(Date.now() - 30 * 60 * 1000);
    const recovered = await recoverStuckSocialPosts({
      store,
      timeoutMs: 10 * 60 * 1000,
      inFlightIds: [],
    });
    expect(recovered).toBe(1);
    expect((await store.getById(old.id))?.status).toBe("pending");
  });

  it("classifies retryable vs hard errors and backoff", () => {
    expect(isRetryableSocialError({ httpStatus: 429 })).toBe(true);
    expect(isRetryableSocialError({ httpStatus: 500 })).toBe(true);
    expect(isRetryableSocialError({ httpStatus: 502 })).toBe(true);
    expect(isRetryableSocialError({ httpStatus: 503 })).toBe(true);
    expect(isRetryableSocialError({ httpStatus: 504 })).toBe(true);
    expect(isRetryableSocialError({ message: "network timeout" })).toBe(true);
    expect(isRetryableSocialError({ message: "ECONNRESET" })).toBe(true);
    expect(isRetryableSocialError({ httpStatus: 400 })).toBe(false);
    expect(isRetryableSocialError({ httpStatus: 401 })).toBe(false);
    expect(isRetryableSocialError({ httpStatus: 403 })).toBe(false);
    expect(isRetryableSocialError({ code: "NOT_IMPLEMENTED" })).toBe(false);
    expect(isRetryableSocialError({ code: "INVALID_MEDIA" })).toBe(false);
    expect(isRetryableSocialError({ message: "content rejected" })).toBe(false);
    expect(isRetryableSocialError({ message: "invalid credentials" })).toBe(
      false
    );
    expect(isRetryableSocialError({ message: "policy rejection" })).toBe(false);
  });
});

describe("worker + stub adapter", () => {
  it("does not call a real network API; stub fails closed", async () => {
    const store = new MemorySocialQueue();
    setSocialQueueForTests(store);
    const { id } = await store.insert({
      albumId: 42,
      accountId: 1,
      platform: "mastodon",
      trigger: "manual",
      status: "pending",
      scheduledAt: new Date(Date.now() - 1000),
      contentRating: "mature",
      caption: "caption",
      media: {
        items: [
          {
            type: "thumb",
            url: "https://media.yukvix.com/t.webp",
            sortOrder: 1,
          },
        ],
      },
      policy: withPolicySnapshot(
        evaluateSocialPolicy(policyInput(telegramAccount)),
        {
          album,
          account: telegramAccount,
          config: DEFAULT_SOCIAL_CONFIG,
          delayMinutes: 0,
          maxImages: 10,
        }
      ),
      idempotencyKey: "worker-stub",
    });
    await runSocialWorkerTick(store);
    const post = await store.getById(id);
    expect(post?.status).toBe("failed");
    expect(post?.lastError).toMatch(/not implemented/i);
    expect(store.attempts[0]?.ok).toBe(false);
  });

  it("marks sent when a test adapter succeeds, using the snapshot not a re-query", async () => {
    const store = new MemorySocialQueue();
    const fake: SocialAdapter = {
      getCapabilities: () => stubCapabilities("telegram"),
      validateConnection: async () => true,
      getAccountInfo: async () => ({ platform: "telegram", handle: "@test" }),
      uploadMedia: async media => ({ externalId: media.url }),
      publishPost: async post => {
        expect(post.media[0].url).toBe("https://media.yukvix.com/frozen.webp");
        return { externalPostId: "tg-1", externalUrl: "https://t.me/c/1" };
      },
    };
    setSocialAdapterOverride("telegram", fake);
    const { id } = await store.insert({
      albumId: 42,
      accountId: 1,
      platform: "telegram",
      trigger: "manual",
      status: "pending",
      scheduledAt: new Date(Date.now() - 1),
      contentRating: "mature",
      caption: "snap",
      media: {
        items: [
          {
            type: "thumb",
            url: "https://media.yukvix.com/frozen.webp",
            sortOrder: 1,
          },
        ],
      },
      policy: withPolicySnapshot(
        evaluateSocialPolicy(policyInput(telegramAccount)),
        {
          album,
          account: telegramAccount,
          config: DEFAULT_SOCIAL_CONFIG,
          delayMinutes: 0,
          maxImages: 10,
        }
      ),
      idempotencyKey: "worker-ok",
    });
    const claimed = await claimSocialPost(new Date(), store);
    expect(claimed?.id).toBe(id);
    await processClaimedPost(claimed!, store);
    expect((await store.getById(id))?.status).toBe("sent");
    expect((await store.getById(id))?.externalPostId).toBe("tg-1");
  });
});

describe("dry-run", () => {
  it("returns payload without inserting posts", async () => {
    const store = new MemorySocialQueue();
    const result = await runSocialDryRun({
      albumId: 42,
      account: telegramAccount,
      album,
      photos,
      config: DEFAULT_SOCIAL_CONFIG,
      store,
    });
    expect(result.dryRun).toBe(true);
    expect(result.payload?.caption).toContain("Espacia Test");
    expect(result.payload?.media.length).toBeGreaterThan(0);
    expect(result.risk.level).toBeTruthy();
    expect(store.posts).toHaveLength(0);
  });
});

describe("manual / auto share core", () => {
  it("rejects disabled accounts", async () => {
    const store = new MemorySocialQueue();
    await expect(
      createManualShare({
        albumId: 42,
        account: { ...telegramAccount, isEnabled: false },
        album,
        photos,
        config: DEFAULT_SOCIAL_CONFIG,
        store,
      })
    ).rejects.toThrow(/disabled/);
  });

  it("creates a pending manual post from preview snapshot", async () => {
    const store = new MemorySocialQueue();
    const result = await createManualShare({
      albumId: 42,
      account: telegramAccount,
      album,
      photos,
      config: DEFAULT_SOCIAL_CONFIG,
      store,
      scheduledAt: new Date(),
    });
    expect(result.duplicate).toBeFalsy();
    expect(result.status).toBe("pending");
    expect(store.posts).toHaveLength(1);
    expect(JSON.parse(store.posts[0].mediaJson).items[0].url).toContain(
      "/thumb/"
    );
  });

  it("auto-share skips accounts without autoShare and uses delay scheduling", async () => {
    const store = new MemorySocialQueue();
    const result = await createAutoSharePosts(42, {
      album,
      photos,
      config: DEFAULT_SOCIAL_CONFIG,
      store,
      accounts: [
        telegramAccount,
        { ...telegramAccount, id: 2, autoShare: true, displayName: "auto" },
      ],
    });
    expect(result.created).toHaveLength(1);
    expect(result.created[0].accountId).toBe(2);
    const scheduled = store.posts[0].scheduledAt.getTime();
    expect(scheduled).toBeGreaterThan(Date.now() + 60_000);
  });
});

describe("content + sanitizer + risk", () => {
  it("composes platform captions without AI", () => {
    const tg = composeSocialContent("telegram", album);
    expect(tg.caption).toContain("Espacia Test");
    expect(tg.caption).toContain("/album/espacia-test");
    const x = composeSocialContent("x", album);
    expect(x.caption.length).toBeLessThanOrEqual(280);
  });

  it("keeps the album URL when clipping long Telegram captions", () => {
    const longAlbum = {
      ...album,
      title: "A".repeat(2000),
    };
    const at1024 = clipCaptionPreservingCta(
      `${"B".repeat(2000)}\nhttps://yukvix.com/album/safe-test`,
      1024
    );
    expect(at1024.length).toBeLessThanOrEqual(1024);
    expect(at1024.endsWith("https://yukvix.com/album/safe-test")).toBe(true);
    const composed = composeSocialContent("telegram", longAlbum, {
      maxCaptionLength: 1024,
    });
    expect(composed.caption).toContain("/album/espacia-test");
    expect(composed.caption.length).toBeLessThanOrEqual(1024);
  });

  it("redacts tokens from attempt payloads", () => {
    const json = sanitizeAttemptPayload({
      Authorization: "Bearer abc",
      access_token: "tok",
      nested: { refresh_token: "r", ok: true },
    });
    expect(json).not.toContain("Bearer abc");
    expect(json).not.toContain('"tok"');
    expect(json).toContain("[redacted]");
  });

  it("does not use risk to allow a blocked policy", () => {
    const policy = evaluateSocialPolicy(
      policyInput({ ...telegramAccount, isEnabled: false })
    );
    const risk = calculateSocialRisk({
      policy,
      duplicate: { duplicate: false },
      mediaCount: 2,
      vipTeaser: false,
      platformDisabled: true,
    });
    expect(policy.allowed).toBe(false);
    expect(risk.level).toBe("high");
  });
});

describe("production audit extras", () => {
  it("does not reclaim a fresh processing lease (heartbeat-shaped processedAt)", async () => {
    const store = new MemorySocialQueue();
    const { id } = await store.insert({
      albumId: 1,
      accountId: 1,
      platform: "telegram",
      trigger: "manual",
      status: "processing",
      scheduledAt: new Date(),
      contentRating: "mature",
      caption: "x",
      media: { items: [] },
      policy: withPolicySnapshot(
        evaluateSocialPolicy(policyInput(telegramAccount)),
        {
          album,
          account: telegramAccount,
          config: DEFAULT_SOCIAL_CONFIG,
          delayMinutes: 0,
          maxImages: 10,
        }
      ),
      idempotencyKey: "lease-fresh",
    });
    const row = await store.getById(id);
    if (row) row.processedAt = new Date();
    const recovered = await recoverStuckSocialPosts({
      store,
      timeoutMs: SOCIAL_STUCK_MS,
      inFlightIds: [],
    });
    expect(recovered).toBe(0);
    expect((await store.getById(id))?.status).toBe("processing");
  });

  it("does not reclaim in-flight ids even when processedAt is stale", async () => {
    const store = new MemorySocialQueue();
    const { id } = await store.insert({
      albumId: 1,
      accountId: 1,
      platform: "telegram",
      trigger: "manual",
      status: "processing",
      scheduledAt: new Date(),
      contentRating: "mature",
      caption: "x",
      media: { items: [] },
      policy: withPolicySnapshot(
        evaluateSocialPolicy(policyInput(telegramAccount)),
        {
          album,
          account: telegramAccount,
          config: DEFAULT_SOCIAL_CONFIG,
          delayMinutes: 0,
          maxImages: 10,
        }
      ),
      idempotencyKey: "lease-inflight",
    });
    const row = await store.getById(id);
    if (row) row.processedAt = new Date(Date.now() - 60 * 60 * 1000);
    const recovered = await recoverStuckSocialPosts({
      store,
      timeoutMs: SOCIAL_STUCK_MS,
      inFlightIds: [id],
    });
    expect(recovered).toBe(0);
    expect((await store.getById(id))?.status).toBe("processing");
  });

  it("retry keeps mediaJson frozen and does not re-select media", async () => {
    const store = new MemorySocialQueue();
    const { id } = await store.insert({
      albumId: 42,
      accountId: 1,
      platform: "telegram",
      trigger: "manual",
      status: "failed",
      scheduledAt: new Date(),
      contentRating: "mature",
      caption: "snap",
      media: {
        items: [
          {
            type: "thumb",
            url: "https://media.yukvix.com/frozen.webp",
            sortOrder: 1,
          },
        ],
      },
      policy: withPolicySnapshot(
        evaluateSocialPolicy(policyInput(telegramAccount)),
        {
          album,
          account: telegramAccount,
          config: DEFAULT_SOCIAL_CONFIG,
          delayMinutes: 0,
          maxImages: 10,
        }
      ),
      idempotencyKey: "frozen-media",
    });
    const before = (await store.getById(id))!.mediaJson;
    expect(await retrySocialPost(id, store)).toBe(true);
    expect((await store.getById(id))?.mediaJson).toBe(before);
    expect((await store.getById(id))?.status).toBe("pending");
  });

  it("manual force re-share generates a new server idempotency key", async () => {
    const store = new MemorySocialQueue();
    const first = await createManualShare({
      albumId: 42,
      account: telegramAccount,
      album,
      photos,
      config: DEFAULT_SOCIAL_CONFIG,
      store,
      scheduledAt: new Date(),
    });
    const second = await createManualShare({
      albumId: 42,
      account: telegramAccount,
      album,
      photos,
      config: DEFAULT_SOCIAL_CONFIG,
      store,
      scheduledAt: new Date(),
      force: true,
    });
    expect(first.duplicate).toBeFalsy();
    expect(second.duplicate).toBeFalsy();
    expect(store.posts).toHaveLength(2);
    expect(store.posts[0].idempotencyKey).not.toBe(store.posts[1].idempotencyKey);
    expect(store.posts[1].idempotencyKey).toMatch(/:manual:/);
  });

  it("redacts tokens from lastError-shaped messages", () => {
    expect(
      sanitizeSocialErrorMessage(
        "401 bot 123456789:AAThisIsAFakeTelegramBotTokenXX"
      )
    ).not.toMatch(/AAThisIsAFakeTelegramBotTokenXX/);
    expect(
      sanitizeSocialErrorMessage("Authorization: Bearer super-secret-token")
    ).toContain("[redacted]");
    expect(sanitizeSocialErrorMessage("s1.aaa.bbb.ccc")).toBe(
      "[redacted-ciphertext]"
    );
  });

  it("skips terminal write when the processing lease was lost", async () => {
    const store = new MemorySocialQueue();
    const orig = store.updateStatus.bind(store);
    store.updateStatus = async (id, patch, expected) => {
      if (patch.status === "sent") return false;
      return orig(id, patch, expected);
    };
    const fake: SocialAdapter = {
      getCapabilities: () => stubCapabilities("telegram"),
      validateConnection: async () => true,
      getAccountInfo: async () => ({ platform: "telegram", handle: "@test" }),
      uploadMedia: async media => ({ externalId: media.url }),
      publishPost: async () => ({
        externalPostId: "tg-lost",
        externalUrl: "https://t.me/c/1",
      }),
    };
    setSocialAdapterOverride("telegram", fake);
    const { id } = await store.insert({
      albumId: 42,
      accountId: 1,
      platform: "telegram",
      trigger: "manual",
      status: "processing",
      scheduledAt: new Date(),
      contentRating: "mature",
      caption: "snap",
      media: {
        items: [
          {
            type: "thumb",
            url: "https://media.yukvix.com/frozen.webp",
            sortOrder: 1,
          },
        ],
      },
      policy: withPolicySnapshot(
        evaluateSocialPolicy(policyInput(telegramAccount)),
        {
          album,
          account: telegramAccount,
          config: DEFAULT_SOCIAL_CONFIG,
          delayMinutes: 0,
          maxImages: 10,
        }
      ),
      idempotencyKey: "lost-lease",
    });
    const post = await store.getById(id);
    const outcome = await processClaimedPost(post!, store);
    expect(outcome).toBe("lost_lease");
    expect((await store.getById(id))?.status).toBe("processing");
    expect((await store.getById(id))?.externalPostId).toBeNull();
  });

  it("isolates auto-share insert failures per account", async () => {
    const store = new MemorySocialQueue();
    const orig = store.insert.bind(store);
    store.insert = async post => {
      if (post.accountId === 3) throw new Error("db down for mastodon");
      return orig(post);
    };
    const result = await createAutoSharePosts(42, {
      album,
      photos,
      config: DEFAULT_SOCIAL_CONFIG,
      store,
      accounts: [
        { ...telegramAccount, id: 2, autoShare: true, displayName: "tg" },
        {
          ...telegramAccount,
          id: 3,
          platform: "mastodon",
          autoShare: true,
          displayName: "masto",
        },
      ],
    });
    expect(result.created).toHaveLength(2);
    expect(result.created.find(c => c.accountId === 2)?.status).not.toBe(
      "error"
    );
    expect(result.created.find(c => c.accountId === 3)?.status).toBe("error");
    expect(store.posts).toHaveLength(1);
    expect(store.posts[0].accountId).toBe(2);
  });

  it("keeps social router admin-only and does not accept client keys", () => {
    const src = readFileSync(
      path.resolve("server/routers/social.ts"),
      "utf8"
    );
    expect(src).not.toContain("publicProcedure");
    expect(src).not.toContain("alreadyApproved");
    expect(src).not.toMatch(/idempotencyKey/);
    expect(src.match(/adminProcedure/g)?.length).toBeGreaterThanOrEqual(7);
  });
});
