import type {
  PlatformCapabilities,
  PolicyDecision,
  PolicyInputAlbum,
  PolicySnapshot,
  SocialAccountFlags,
  SocialDistributionConfig,
} from "./types";

export function evaluateSocialPolicy(input: {
  album: PolicyInputAlbum;
  account: SocialAccountFlags;
  capabilities: PlatformCapabilities;
  config: SocialDistributionConfig;
}): PolicyDecision {
  const { album, account, capabilities, config } = input;
  const platformCfg = config.platforms[account.platform];

  if (!config.enabled) {
    return {
      allowed: false,
      requiresSensitive: false,
      requiresApproval: false,
      reason: "Social distribution is disabled",
    };
  }
  if (!account.isEnabled) {
    return {
      allowed: false,
      requiresSensitive: false,
      requiresApproval: false,
      reason: "Account is disabled",
    };
  }
  if (!platformCfg?.enabled) {
    return {
      allowed: false,
      requiresSensitive: false,
      requiresApproval: Boolean(
        platformCfg?.requireApproval || account.requireApproval
      ),
      reason: `Platform ${account.platform} is disabled`,
    };
  }
  if (album.status !== "published") {
    return {
      allowed: false,
      requiresSensitive: false,
      requiresApproval: false,
      reason:
        album.status === "archived"
          ? "Archived albums cannot be shared"
          : "Only published albums can be shared",
    };
  }

  const contentRating = config.contentRating || "mature";
  const isMature =
    contentRating === "mature" ||
    contentRating === "adult" ||
    contentRating === "nsfw";
  const requiresSensitive = isMature;
  const requiresApproval = Boolean(
    account.requireApproval || platformCfg.requireApproval
  );

  if (
    isMature &&
    !capabilities.supportsSensitiveLabel &&
    !capabilities.supportsContentWarning
  ) {
    return {
      allowed: false,
      requiresSensitive: true,
      requiresApproval,
      reason: `Platform ${account.platform} cannot label mature content`,
    };
  }

  return {
    allowed: true,
    requiresSensitive,
    requiresApproval,
    reason: undefined,
  };
}

export function withPolicySnapshot(
  decision: PolicyDecision,
  input: {
    album: PolicyInputAlbum;
    account: SocialAccountFlags;
    config: SocialDistributionConfig;
    delayMinutes: number;
    maxImages: number;
  }
): PolicySnapshot {
  const platformCfg = input.config.platforms[input.account.platform];
  return {
    ...decision,
    config: {
      contentRating: input.config.contentRating,
      maxImages: input.maxImages,
      delayMinutes: input.delayMinutes,
      platformEnabled: Boolean(platformCfg?.enabled),
      accountEnabled: input.account.isEnabled,
      autoShare: input.account.autoShare,
    },
  };
}
