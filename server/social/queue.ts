import { and, desc, eq, lte } from "drizzle-orm";
import { nanoid } from "nanoid";
import {
  socialPostAttempts,
  socialPosts,
  type InsertSocialPost,
  type SocialPost,
} from "../../drizzle/schema";
import { getDb } from "../db";
import {
  autoIdempotencyKey,
  findDuplicate,
  manualIdempotencyKey,
  type ExistingPostLite,
} from "./duplicate";
import { backoffMsForAttempt } from "./sanitize";
import { mysqlAffectedRows, mysqlClaimSucceeded } from "./mysql-result";
import type {
  MediaSnapshot,
  PolicySnapshot,
  SocialPlatform,
  SocialPostStatus,
  SocialTrigger,
} from "./types";

export type EnqueueInput = {
  albumId: number;
  accountId: number;
  platform: SocialPlatform;
  trigger: SocialTrigger;
  status: SocialPostStatus;
  scheduledAt: Date;
  contentRating: string;
  caption: string;
  media: MediaSnapshot;
  policy: PolicySnapshot;
  createdBy?: number | null;
  force?: boolean;
  idempotencyKey?: string;
  maxAttempts?: number;
};

export interface SocialQueueStore {
  listExisting(albumId: number, accountId: number): Promise<ExistingPostLite[]>;
  insert(
    post: EnqueueInput & { idempotencyKey: string }
  ): Promise<{ id: number; duplicate?: boolean }>;
  getById(id: number): Promise<SocialPostRow | null>;
  getByIdempotencyKey(key: string): Promise<SocialPostRow | null>;
  claimPending(now: Date): Promise<SocialPostRow | null>;
  updateStatus(
    id: number,
    patch: Partial<{
      status: SocialPostStatus;
      attempts: number;
      lastError: string | null;
      scheduledAt: Date;
      processedAt: Date | null;
      externalPostId: string | null;
      externalUrl: string | null;
    }>,
    expectedStatus?: SocialPostStatus
  ): Promise<boolean>;
  insertAttempt(row: {
    postId: number;
    attempt: number;
    ok: boolean;
    httpStatus?: number | null;
    error?: string | null;
    responseJson?: string | null;
    dryRun?: boolean;
  }): Promise<void>;
  listStuckProcessing(
    cutoff: Date,
    excludeIds: number[]
  ): Promise<SocialPostRow[]>;
}

export type SocialPostRow = {
  id: number;
  albumId: number;
  accountId: number;
  platform: SocialPlatform;
  trigger: SocialTrigger;
  status: SocialPostStatus;
  idempotencyKey: string;
  scheduledAt: Date;
  contentRating: string;
  caption: string | null;
  mediaJson: string;
  policyJson: string;
  externalPostId: string | null;
  externalUrl: string | null;
  attempts: number;
  maxAttempts: number;
  lastError: string | null;
  createdBy: number | null;
  createdAt: Date;
  processedAt: Date | null;
};

function toLite(row: SocialPostRow): ExistingPostLite {
  return {
    id: row.id,
    albumId: row.albumId,
    accountId: row.accountId,
    idempotencyKey: row.idempotencyKey,
    status: row.status,
    mediaJson: row.mediaJson,
    externalUrl: row.externalUrl,
    createdAt: row.createdAt,
  };
}

export class MemorySocialQueue implements SocialQueueStore {
  posts: SocialPostRow[] = [];
  attempts: Array<{
    postId: number;
    attempt: number;
    ok: boolean;
    dryRun?: boolean;
    error?: string | null;
  }> = [];
  private nextId = 1;
  private claimMutex: Promise<void> = Promise.resolve();

  async listExisting(
    albumId: number,
    accountId: number
  ): Promise<ExistingPostLite[]> {
    return this.posts
      .filter(p => p.albumId === albumId && p.accountId === accountId)
      .map(toLite);
  }

  async insert(
    post: EnqueueInput & { idempotencyKey: string }
  ): Promise<{ id: number; duplicate?: boolean }> {
    if (this.posts.some(p => p.idempotencyKey === post.idempotencyKey)) {
      const existing = this.posts.find(
        p => p.idempotencyKey === post.idempotencyKey
      )!;
      return { id: existing.id, duplicate: true };
    }
    const row: SocialPostRow = {
      id: this.nextId++,
      albumId: post.albumId,
      accountId: post.accountId,
      platform: post.platform,
      trigger: post.trigger,
      status: post.status,
      idempotencyKey: post.idempotencyKey,
      scheduledAt: post.scheduledAt,
      contentRating: post.contentRating,
      caption: post.caption,
      mediaJson: JSON.stringify(post.media),
      policyJson: JSON.stringify(post.policy),
      externalPostId: null,
      externalUrl: null,
      attempts: 0,
      maxAttempts: post.maxAttempts ?? 5,
      lastError: null,
      createdBy: post.createdBy ?? null,
      createdAt: new Date(),
      processedAt: null,
    };
    this.posts.push(row);
    return { id: row.id };
  }

  async getById(id: number): Promise<SocialPostRow | null> {
    return this.posts.find(p => p.id === id) ?? null;
  }

  async getByIdempotencyKey(key: string): Promise<SocialPostRow | null> {
    return this.posts.find(p => p.idempotencyKey === key) ?? null;
  }

  async claimPending(now: Date): Promise<SocialPostRow | null> {
    let release!: () => void;
    const prev = this.claimMutex;
    this.claimMutex = new Promise<void>(resolve => {
      release = resolve;
    });
    await prev;
    try {
      const candidate = this.posts
        .filter(
          p =>
            p.status === "pending" && p.scheduledAt.getTime() <= now.getTime()
        )
        .sort(
          (a, b) =>
            a.scheduledAt.getTime() - b.scheduledAt.getTime() || a.id - b.id
        )[0];
      if (!candidate || candidate.status !== "pending") return null;
      candidate.status = "processing";
      candidate.processedAt = now;
      return candidate;
    } finally {
      release();
    }
  }

  async updateStatus(
    id: number,
    patch: Parameters<SocialQueueStore["updateStatus"]>[1],
    expectedStatus?: SocialPostStatus
  ): Promise<boolean> {
    const row = this.posts.find(p => p.id === id);
    if (!row) return false;
    if (expectedStatus && row.status !== expectedStatus) return false;
    Object.assign(row, patch);
    return true;
  }

  async insertAttempt(row: {
    postId: number;
    attempt: number;
    ok: boolean;
    error?: string | null;
    dryRun?: boolean;
  }): Promise<void> {
    this.attempts.push(row);
  }

  async listStuckProcessing(
    cutoff: Date,
    excludeIds: number[]
  ): Promise<SocialPostRow[]> {
    const exclude = new Set(excludeIds);
    return this.posts.filter(
      p =>
        p.status === "processing" &&
        !exclude.has(p.id) &&
        p.processedAt != null &&
        p.processedAt.getTime() < cutoff.getTime()
    );
  }
}

/**
 * SELECT then CAS (UPDATE WHERE status='pending'), matching MySQL InnoDB.
 * Yields between SELECT and UPDATE so concurrent workers can race — unlike
 * MemorySocialQueue which mutexes the whole claim.
 */
export class MysqlCasMemoryQueue extends MemorySocialQueue {
  async claimPending(now: Date): Promise<SocialPostRow | null> {
    for (let i = 0; i < 5; i++) {
      const candidate = this.posts
        .filter(
          p =>
            p.status === "pending" && p.scheduledAt.getTime() <= now.getTime()
        )
        .sort(
          (a, b) =>
            a.scheduledAt.getTime() - b.scheduledAt.getTime() || a.id - b.id
        )[0];
      if (!candidate) return null;
      const candidateId = candidate.id;
      await Promise.resolve();
      const ok = await this.updateStatus(
        candidateId,
        { status: "processing", processedAt: now },
        "pending"
      );
      if (!ok) continue;
      const row = await this.getById(candidateId);
      if (!row || row.status !== "processing") continue;
      return row;
    }
    return null;
  }
}

/** Shared CAS gate used by mysqlSocialQueue. Tests can drive it with mock results. */
export async function finishMysqlCasClaim(opts: {
  updateResult: unknown;
  load: () => Promise<SocialPostRow | null>;
}): Promise<SocialPostRow | null> {
  if (!mysqlClaimSucceeded(opts.updateResult)) return null;
  const row = await opts.load();
  if (!row || row.status !== "processing") return null;
  return row;
}

function mapSqlPost(row: SocialPost): SocialPostRow {
  return {
    id: row.id,
    albumId: row.albumId,
    accountId: row.accountId,
    platform: row.platform,
    trigger: row.trigger,
    status: row.status,
    idempotencyKey: row.idempotencyKey,
    scheduledAt: row.scheduledAt,
    contentRating: row.contentRating,
    caption: row.caption,
    mediaJson: row.mediaJson,
    policyJson: row.policyJson,
    externalPostId: row.externalPostId,
    externalUrl: row.externalUrl,
    attempts: row.attempts,
    maxAttempts: row.maxAttempts,
    lastError: row.lastError,
    createdBy: row.createdBy,
    createdAt: row.createdAt,
    processedAt: row.processedAt,
  };
}

export const mysqlSocialQueue: SocialQueueStore = {
  async listExisting(albumId, accountId) {
    const db = await getDb();
    if (!db) return [];
    const rows = await db
      .select()
      .from(socialPosts)
      .where(
        and(
          eq(socialPosts.albumId, albumId),
          eq(socialPosts.accountId, accountId)
        )
      )
      .orderBy(desc(socialPosts.createdAt))
      .limit(50);
    return rows.map(row => toLite(mapSqlPost(row)));
  },

  async insert(post) {
    const db = await getDb();
    if (!db) throw new Error("Database not available");
    const values: InsertSocialPost = {
      albumId: post.albumId,
      accountId: post.accountId,
      platform: post.platform,
      trigger: post.trigger,
      status: post.status,
      idempotencyKey: post.idempotencyKey,
      scheduledAt: post.scheduledAt,
      contentRating: post.contentRating,
      caption: post.caption,
      mediaJson: JSON.stringify(post.media),
      policyJson: JSON.stringify(post.policy),
      attempts: 0,
      maxAttempts: post.maxAttempts ?? 5,
      createdBy: post.createdBy ?? null,
    };
    try {
      const [result] = await db.insert(socialPosts).values(values);
      return { id: Number((result as { insertId?: number }).insertId ?? 0) };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (/duplicate|unique/i.test(msg)) {
        const existing = await mysqlSocialQueue.getByIdempotencyKey(
          post.idempotencyKey
        );
        if (existing) return { id: existing.id, duplicate: true };
      }
      throw err;
    }
  },

  async getById(id) {
    const db = await getDb();
    if (!db) return null;
    const [row] = await db
      .select()
      .from(socialPosts)
      .where(eq(socialPosts.id, id))
      .limit(1);
    return row ? mapSqlPost(row) : null;
  },

  async getByIdempotencyKey(key) {
    const db = await getDb();
    if (!db) return null;
    const [row] = await db
      .select()
      .from(socialPosts)
      .where(eq(socialPosts.idempotencyKey, key))
      .limit(1);
    return row ? mapSqlPost(row) : null;
  },

  async claimPending(now) {
    const db = await getDb();
    if (!db) return null;
    for (let i = 0; i < 5; i++) {
      const [candidate] = await db
        .select({ id: socialPosts.id })
        .from(socialPosts)
        .where(
          and(
            eq(socialPosts.status, "pending"),
            lte(socialPosts.scheduledAt, now)
          )
        )
        .orderBy(socialPosts.scheduledAt, socialPosts.id)
        .limit(1);
      if (!candidate) return null;
      const result = await db
        .update(socialPosts)
        .set({ status: "processing", processedAt: now })
        .where(
          and(
            eq(socialPosts.id, candidate.id),
            eq(socialPosts.status, "pending")
          )
        );
      const claimed = await finishMysqlCasClaim({
        updateResult: result,
        load: async () => {
          const [row] = await db
            .select()
            .from(socialPosts)
            .where(eq(socialPosts.id, candidate.id))
            .limit(1);
          return row ? mapSqlPost(row) : null;
        },
      });
      if (claimed) return claimed;
    }
    return null;
  },

  async updateStatus(id, patch, expectedStatus) {
    const db = await getDb();
    if (!db) return false;
    const where = expectedStatus
      ? and(eq(socialPosts.id, id), eq(socialPosts.status, expectedStatus))
      : eq(socialPosts.id, id);
    const result = await db.update(socialPosts).set(patch).where(where);
    return mysqlAffectedRows(result) >= 1;
  },

  async insertAttempt(row) {
    const db = await getDb();
    if (!db) return;
    await db.insert(socialPostAttempts).values({
      postId: row.postId,
      attempt: row.attempt,
      ok: row.ok,
      httpStatus: row.httpStatus ?? null,
      error: row.error ?? null,
      responseJson: row.responseJson ?? null,
      dryRun: row.dryRun ?? false,
    });
  },

  async listStuckProcessing(cutoff, excludeIds) {
    const db = await getDb();
    if (!db) return [];
    const rows = await db
      .select()
      .from(socialPosts)
      .where(
        and(
          eq(socialPosts.status, "processing"),
          lte(socialPosts.processedAt, cutoff)
        )
      );
    const exclude = new Set(excludeIds);
    return rows.filter(r => !exclude.has(r.id)).map(mapSqlPost);
  },
};

let activeStore: SocialQueueStore = mysqlSocialQueue;

export function getSocialQueue(): SocialQueueStore {
  return activeStore;
}

export function setSocialQueueForTests(store: SocialQueueStore | null): void {
  activeStore = store ?? mysqlSocialQueue;
}

export async function enqueueSocialPost(
  input: EnqueueInput,
  store: SocialQueueStore = getSocialQueue()
): Promise<{ id: number; duplicate: boolean; skipped?: boolean }> {
  const key =
    input.idempotencyKey ||
    (input.trigger === "auto"
      ? autoIdempotencyKey(input.albumId, input.accountId)
      : manualIdempotencyKey(input.albumId, input.accountId, nanoid()));

  const existing = await store.listExisting(input.albumId, input.accountId);
  const dup = findDuplicate({
    albumId: input.albumId,
    accountId: input.accountId,
    idempotencyKey: key,
    trigger: input.trigger,
    force: input.force,
    snapshot: input.media,
    existing,
  });
  if (dup.duplicate && dup.existingPostId) {
    return { id: dup.existingPostId, duplicate: true };
  }

  const inserted = await store.insert({ ...input, idempotencyKey: key });
  return { id: inserted.id, duplicate: Boolean(inserted.duplicate) };
}

export async function claimSocialPost(
  now = new Date(),
  store: SocialQueueStore = getSocialQueue()
): Promise<SocialPostRow | null> {
  return store.claimPending(now);
}

export async function retrySocialPost(
  id: number,
  store: SocialQueueStore = getSocialQueue()
): Promise<boolean> {
  const post = await store.getById(id);
  if (!post || post.status !== "failed") return false;
  return store.updateStatus(
    id,
    {
      status: "pending",
      scheduledAt: new Date(),
      lastError: null,
      processedAt: null,
    },
    "failed"
  );
}

export async function cancelSocialPost(
  id: number,
  store: SocialQueueStore = getSocialQueue()
): Promise<boolean> {
  const post = await store.getById(id);
  if (!post) return false;
  if (post.status === "sent" || post.status === "cancelled") return false;
  return store.updateStatus(id, {
    status: "cancelled",
    processedAt: new Date(),
  });
}

export async function recoverStuckSocialPosts(
  opts: {
    now?: Date;
    timeoutMs?: number;
    inFlightIds?: number[];
    store?: SocialQueueStore;
  } = {}
): Promise<number> {
  const store = opts.store ?? getSocialQueue();
  const now = opts.now ?? new Date();
  const timeoutMs = opts.timeoutMs ?? 30 * 60 * 1000;
  const cutoff = new Date(now.getTime() - timeoutMs);
  const stuck = await store.listStuckProcessing(cutoff, opts.inFlightIds ?? []);
  let recovered = 0;
  for (const post of stuck) {
    const ok = await store.updateStatus(
      post.id,
      {
        status: "pending",
        scheduledAt: now,
        lastError: "stuck processing recovered",
      },
      "processing"
    );
    if (ok) recovered++;
  }
  return recovered;
}

export function nextRetryAt(attempts: number, now = new Date()): Date {
  return new Date(now.getTime() + backoffMsForAttempt(attempts));
}
