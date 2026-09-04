import { createHash } from "node:crypto";
import type { DuplicateResult, MediaSnapshot, SocialTrigger } from "./types";

export function autoIdempotencyKey(albumId: number, accountId: number): string {
  return `album:${albumId}:account:${accountId}:kind:publish`;
}

export function manualIdempotencyKey(
  albumId: number,
  accountId: number,
  runId: string
): string {
  return `album:${albumId}:account:${accountId}:kind:publish:manual:${runId}`;
}

export function hashMediaSnapshot(snapshot: MediaSnapshot): string {
  const canonical = snapshot.items
    .map(item => `${item.sortOrder}|${item.type}|${item.url}`)
    .join("\n");
  return createHash("sha256").update(canonical).digest("hex");
}

export type ExistingPostLite = {
  id: number;
  albumId: number;
  accountId: number;
  idempotencyKey: string;
  status: string;
  mediaJson: string;
  externalUrl?: string | null;
  createdAt?: Date | string | null;
};

const OPEN_STATUSES = new Set([
  "pending",
  "processing",
  "awaiting_approval",
  "sent",
]);

export function isOpenSocialPostStatus(status: string): boolean {
  return OPEN_STATUSES.has(status);
}

export function findDuplicate(opts: {
  albumId: number;
  accountId: number;
  idempotencyKey: string;
  trigger: SocialTrigger;
  force?: boolean;
  snapshot: MediaSnapshot;
  existing: ExistingPostLite[];
  now?: Date;
}): DuplicateResult {
  const now = opts.now ?? new Date();
  const recentMs = 24 * 60 * 60 * 1000;
  const snapshotHash = hashMediaSnapshot(opts.snapshot);

  const byKey = opts.existing.find(
    p => p.idempotencyKey === opts.idempotencyKey
  );
  if (byKey && OPEN_STATUSES.has(byKey.status)) {
    return {
      duplicate: true,
      reason: "idempotencyKey already exists",
      existingPostId: byKey.id,
    };
  }

  if (opts.force && opts.trigger === "manual") {
    return { duplicate: false };
  }

  const samePair = opts.existing.filter(
    p =>
      p.albumId === opts.albumId &&
      p.accountId === opts.accountId &&
      OPEN_STATUSES.has(p.status)
  );
  if (samePair.length > 0) {
    return {
      duplicate: true,
      reason:
        "album+account already has an open or sent post (pass force for intentional re-share)",
      existingPostId: samePair[0].id,
    };
  }

  for (const post of opts.existing) {
    if (!OPEN_STATUSES.has(post.status)) continue;
    const created = post.createdAt ? new Date(post.createdAt).getTime() : 0;
    const recent = created > 0 && now.getTime() - created < recentMs;
    if (!recent) continue;
    if (
      post.externalUrl &&
      post.albumId === opts.albumId &&
      post.accountId === opts.accountId
    ) {
      return {
        duplicate: true,
        reason: "recent same album/account already has an external URL",
        existingPostId: post.id,
      };
    }
    try {
      const parsed = JSON.parse(post.mediaJson) as MediaSnapshot;
      if (
        parsed?.items &&
        hashMediaSnapshot(parsed) === snapshotHash &&
        post.accountId === opts.accountId
      ) {
        return {
          duplicate: true,
          reason: "recent same media snapshot",
          existingPostId: post.id,
        };
      }
    } catch {
      /* ignore malformed historical rows */
    }
  }

  return { duplicate: false };
}
