import { nanoid } from "nanoid";
import { composeSocialContent } from "./content";
import { delayMinutesFor, loadSocialConfig } from "./config";
import {
  autoIdempotencyKey,
  findDuplicate,
  manualIdempotencyKey,
} from "./duplicate";
import { runSocialDryRun } from "./dry-run";
import {
  getSocialMediaForAlbum,
  selectSocialMedia,
  type PhotoLike,
} from "./media";
import { evaluateSocialPolicy, withPolicySnapshot } from "./policy";
import {
  enqueueSocialPost,
  getSocialQueue,
  type SocialQueueStore,
} from "./queue";
import { getSocialAdapter } from "./adapters";
import {
  SocialAccountDisabledError,
  type PolicyInputAlbum,
  type SocialAccountFlags,
  type SocialDistributionConfig,
  type SocialPostStatus,
} from "./types";
import { socialAccounts } from "../../drizzle/schema";
import { eq } from "drizzle-orm";
import { getDb } from "../db";

export function parseAccountConfig(
  raw: string | null | undefined
): Record<string, unknown> {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

export function assertAccountCanPublish(account: SocialAccountFlags): void {
  if (!account.isEnabled) throw new SocialAccountDisabledError(account.id);
}

export async function loadSocialAccount(
  accountId: number
): Promise<SocialAccountFlags | null> {
  const db = await getDb();
  if (!db) return null;
  const [row] = await db
    .select()
    .from(socialAccounts)
    .where(eq(socialAccounts.id, accountId))
    .limit(1);
  if (!row) return null;
  return {
    id: row.id,
    platform: row.platform,
    displayName: row.displayName,
    isEnabled: row.isEnabled,
    autoShare: row.autoShare,
    requireApproval: row.requireApproval,
    configJson: row.configJson,
  };
}

export async function listEligibleAutoShareAccounts(): Promise<
  SocialAccountFlags[]
> {
  const db = await getDb();
  if (!db) return [];
  const rows = await db.select().from(socialAccounts);
  return rows
    .filter(row => row.isEnabled && row.autoShare)
    .map(row => ({
      id: row.id,
      platform: row.platform,
      displayName: row.displayName,
      isEnabled: row.isEnabled,
      autoShare: row.autoShare,
      requireApproval: row.requireApproval,
      configJson: row.configJson,
    }));
}

function initialStatus(
  account: SocialAccountFlags,
  policyRequiresApproval: boolean
): SocialPostStatus {
  if (account.requireApproval || policyRequiresApproval)
    return "awaiting_approval";
  return "pending";
}

export async function createManualSharePreview(input: {
  albumId: number;
  account: SocialAccountFlags;
  album?: PolicyInputAlbum;
  config?: SocialDistributionConfig;
  store?: SocialQueueStore;
}) {
  assertAccountCanPublish(input.account);
  return runSocialDryRun({
    albumId: input.albumId,
    account: input.account,
    album: input.album,
    config: input.config,
    store: input.store,
  });
}

export async function createManualShare(input: {
  albumId: number;
  account: SocialAccountFlags;
  createdBy?: number;
  scheduledAt?: Date;
  force?: boolean;
  album?: PolicyInputAlbum;
  config?: SocialDistributionConfig;
  store?: SocialQueueStore;
  photos?: PhotoLike[];
}) {
  assertAccountCanPublish(input.account);
  const preview = await runSocialDryRun({
    albumId: input.albumId,
    account: input.account,
    album: input.album,
    photos: input.photos,
    config: input.config,
    store: input.store,
  });
  const config = input.config ?? (await loadSocialConfig());
  const delayMinutes = delayMinutesFor(config, input.account.platform);
  const scheduledAt =
    input.scheduledAt ?? new Date(Date.now() + delayMinutes * 60_000);

  if (preview.skipped || !preview.payload || !preview.policy.allowed) {
    const inserted = await enqueueSocialPost(
      {
        albumId: input.albumId,
        accountId: input.account.id,
        platform: input.account.platform,
        trigger: "manual",
        status: "skipped",
        scheduledAt,
        contentRating: config.contentRating,
        caption: preview.content?.caption || "",
        media: { items: [...preview.media.items] },
        policy: preview.policy,
        createdBy: input.createdBy,
        force: input.force,
        idempotencyKey: manualIdempotencyKey(
          input.albumId,
          input.account.id,
          nanoid()
        ),
      },
      input.store ?? getSocialQueue()
    );
    return { ...inserted, status: "skipped" as const, preview };
  }

  if (preview.duplicate.duplicate && !input.force) {
    return {
      id: preview.duplicate.existingPostId ?? 0,
      duplicate: true,
      status: "duplicate" as const,
      preview,
    };
  }

  const status = initialStatus(input.account, preview.policy.requiresApproval);

  const inserted = await enqueueSocialPost(
    {
      albumId: input.albumId,
      accountId: input.account.id,
      platform: input.account.platform,
      trigger: "manual",
      status,
      scheduledAt,
      contentRating: config.contentRating,
      caption: preview.payload.caption,
      media: { items: preview.payload.media },
      policy: preview.policy,
      createdBy: input.createdBy,
      force: input.force,
      idempotencyKey: manualIdempotencyKey(
        input.albumId,
        input.account.id,
        nanoid()
      ),
    },
    input.store ?? getSocialQueue()
  );
  return { ...inserted, status, preview };
}

export async function createAutoSharePosts(
  albumId: number,
  opts?: {
    album?: PolicyInputAlbum;
    accounts?: SocialAccountFlags[];
    config?: SocialDistributionConfig;
    store?: SocialQueueStore;
    photos?: PhotoLike[];
  }
) {
  const config = opts?.config ?? (await loadSocialConfig());
  if (!config.enabled)
    return {
      created: [] as Array<{ accountId: number; id: number; status: string }>,
    };

  const accounts = opts?.accounts ?? (await listEligibleAutoShareAccounts());
  const created: Array<{
    accountId: number;
    id: number;
    status: string;
    duplicate?: boolean;
  }> = [];

  for (const account of accounts) {
    try {
      if (!account.isEnabled || !account.autoShare) continue;
      const capabilities = getSocialAdapter(account.platform).getCapabilities();
      const maxImages = Math.min(
        capabilities.maxImages,
        config.platforms[account.platform].maxImages
      );
      const media =
        opts?.album && opts?.photos
          ? selectSocialMedia({
              album: opts.album,
              photos: opts.photos,
              capabilities: { ...capabilities, maxImages },
            })
          : await getSocialMediaForAlbum(albumId, {
              ...capabilities,
              maxImages,
            });
      const albumRow: PolicyInputAlbum | undefined =
        opts?.album ??
        ("album" in media
          ? (media as { album?: PolicyInputAlbum }).album
          : undefined);
      if (!albumRow) continue;

      const delayMinutes = delayMinutesFor(config, account.platform);
      const policy = withPolicySnapshot(
        evaluateSocialPolicy({
          album: albumRow,
          account,
          capabilities: { ...capabilities, maxImages },
          config,
        }),
        { album: albumRow, account, config, delayMinutes, maxImages }
      );
      const content = composeSocialContent(account.platform, albumRow, {
        requiresSensitive: policy.requiresSensitive,
        maxCaptionLength: capabilities.maxCaptionLength,
      });
      const existing = await (opts?.store ?? getSocialQueue()).listExisting(
        albumId,
        account.id
      );
      const snapshot = { items: media.items };
      const dup = findDuplicate({
        albumId,
        accountId: account.id,
        idempotencyKey: autoIdempotencyKey(albumId, account.id),
        trigger: "auto",
        snapshot,
        existing,
      });
      if (dup.duplicate) {
        created.push({
          accountId: account.id,
          id: dup.existingPostId ?? 0,
          status: "duplicate",
          duplicate: true,
        });
        continue;
      }

      const skipped = !policy.allowed || media.status === "skipped";
      const status: SocialPostStatus = skipped
        ? "skipped"
        : initialStatus(account, policy.requiresApproval);

      const inserted = await enqueueSocialPost(
        {
          albumId,
          accountId: account.id,
          platform: account.platform,
          trigger: "auto",
          status,
          scheduledAt: new Date(Date.now() + delayMinutes * 60_000),
          contentRating: config.contentRating,
          caption: content.caption,
          media: snapshot,
          policy,
          force: false,
          idempotencyKey: autoIdempotencyKey(albumId, account.id),
        },
        opts?.store ?? getSocialQueue()
      );
      created.push({
        accountId: account.id,
        id: inserted.id,
        status,
        duplicate: inserted.duplicate,
      });
    } catch {
      created.push({
        accountId: account.id,
        id: 0,
        status: "error",
      });
    }
  }

  return { created };
}
