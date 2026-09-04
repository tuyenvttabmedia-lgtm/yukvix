import { composeSocialContent } from "./content";
import { delayMinutesFor, loadSocialConfig } from "./config";
import { findDuplicate } from "./duplicate";
import {
  getSocialMediaForAlbum,
  selectSocialMedia,
  type PhotoLike,
} from "./media";
import { evaluateSocialPolicy, withPolicySnapshot } from "./policy";
import { calculateSocialRisk } from "./risk";
import { getSocialAdapter } from "./adapters";
import { getSocialQueue, type SocialQueueStore } from "./queue";
import type {
  PolicyInputAlbum,
  SocialAccountFlags,
  SocialDistributionConfig,
  SocialPlatform,
} from "./types";

export type DryRunInput = {
  albumId: number;
  account: SocialAccountFlags;
  album?: PolicyInputAlbum;
  photos?: PhotoLike[];
  config?: SocialDistributionConfig;
  store?: SocialQueueStore;
};

export async function runSocialDryRun(input: DryRunInput) {
  const config = input.config ?? (await loadSocialConfig());
  const capabilities = getSocialAdapter(
    input.account.platform
  ).getCapabilities();
  const maxImages = Math.min(
    capabilities.maxImages,
    config.platforms[input.account.platform].maxImages
  );
  const cappedCapabilities = { ...capabilities, maxImages };

  let album = input.album;
  let media;
  if (album && input.photos) {
    media = selectSocialMedia({
      album,
      photos: input.photos,
      capabilities: cappedCapabilities,
    });
  } else {
    const loaded = await getSocialMediaForAlbum(
      input.albumId,
      cappedCapabilities
    );
    album = loaded.album;
    media = loaded;
  }

  if (!album) {
    const delayMinutes = delayMinutesFor(config, input.account.platform);
    return {
      albumId: input.albumId,
      accountId: input.account.id,
      platform: input.account.platform,
      skipped: true,
      reason: "Album not found",
      policy: {
        allowed: false,
        requiresSensitive: false,
        requiresApproval: false,
        reason: "Album not found",
        config: {
          contentRating: config.contentRating,
          maxImages,
          delayMinutes,
          platformEnabled: Boolean(
            config.platforms[input.account.platform].enabled
          ),
          accountEnabled: input.account.isEnabled,
          autoShare: input.account.autoShare,
        },
      },
      media: {
        items: [] as const,
        status: "skipped" as const,
        reason: "Album not found",
      },
      content: null,
      duplicate: { duplicate: false },
      risk: calculateSocialRisk({
        policy: {
          allowed: false,
          requiresSensitive: false,
          requiresApproval: false,
        },
        duplicate: { duplicate: false },
        mediaCount: 0,
        vipTeaser: false,
        platformDisabled: !config.platforms[input.account.platform].enabled,
      }),
      payload: null,
      dryRun: true as const,
    };
  }

  const delayMinutes = delayMinutesFor(config, input.account.platform);
  const policy = evaluateSocialPolicy({
    album,
    account: input.account,
    capabilities: cappedCapabilities,
    config,
  });
  const policySnapshot = withPolicySnapshot(policy, {
    album,
    account: input.account,
    config,
    delayMinutes,
    maxImages,
  });
  const content = composeSocialContent(input.account.platform, album, {
    requiresSensitive: policy.requiresSensitive,
    maxCaptionLength: cappedCapabilities.maxCaptionLength,
  });

  const existing = await (input.store ?? getSocialQueue()).listExisting(
    album.id,
    input.account.id
  );
  const previewDuplicate = findDuplicate({
    albumId: album.id,
    accountId: input.account.id,
    idempotencyKey: `preview-check:${album.id}:${input.account.id}`,
    trigger: "manual",
    force: false,
    snapshot: { items: media.items },
    existing,
  });

  const platformDisabled =
    !config.platforms[input.account.platform].enabled ||
    !input.account.isEnabled;
  const risk = calculateSocialRisk({
    policy,
    duplicate: previewDuplicate,
    mediaCount: media.items.length,
    vipTeaser: Boolean(album.isVip),
    platformDisabled,
  });

  const skipped = !policy.allowed || media.status === "skipped";
  const payload = skipped
    ? null
    : {
        platform: input.account.platform,
        caption: content.caption,
        labels: content.labels,
        media: media.items,
        scheduledDelayMinutes: delayMinutes,
        contentRating: config.contentRating,
      };

  return {
    albumId: album.id,
    accountId: input.account.id,
    platform: input.account.platform as SocialPlatform,
    skipped,
    reason: !policy.allowed ? policy.reason : media.reason,
    policy: policySnapshot,
    media,
    content,
    duplicate: previewDuplicate,
    risk,
    payload,
    dryRun: true as const,
  };
}
