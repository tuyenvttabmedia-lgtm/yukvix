export type SocialPlatform = "telegram" | "mastodon" | "bluesky" | "x";
export type SocialTrigger = "auto" | "manual";
export type SocialPostStatus =
  | "skipped"
  | "awaiting_approval"
  | "pending"
  | "processing"
  | "sent"
  | "failed"
  | "cancelled";

export type SnapshotMediaType = "cover" | "thumb" | "free_preview";

export interface SnapshotMediaItem {
  photoId?: number | null;
  mediaItemId?: number | null;
  type: SnapshotMediaType;
  url: string;
  sortOrder: number;
}

export interface MediaSnapshot {
  items: SnapshotMediaItem[];
}

export interface SocialMediaResult {
  status: "ok" | "skipped";
  reason?: string;
  items: SnapshotMediaItem[];
  eligibleCount?: number;
  truncated?: boolean;
  maxImages?: number;
}

export interface PolicyInputAlbum {
  id: number;
  status: string;
  isVip?: boolean | null;
  photoCount?: number | null;
  title?: string | null;
  slug?: string | null;
  cosplayer?: string | null;
  character?: string | null;
  series?: string | null;
  coverUrl?: string | null;
}

export interface PolicyDecision {
  allowed: boolean;
  requiresSensitive: boolean;
  requiresApproval: boolean;
  reason?: string;
}

export interface PolicySnapshot extends PolicyDecision {
  config: {
    contentRating: string;
    maxImages: number;
    delayMinutes: number;
    platformEnabled: boolean;
    accountEnabled: boolean;
    autoShare: boolean;
  };
}

export interface PlatformCapabilities {
  platform: SocialPlatform;
  maxImages: number;
  supportsSensitiveLabel: boolean;
  supportsContentWarning: boolean;
  maxCaptionLength: number;
  supportsMultipleImages?: boolean;
  supportsCaption?: boolean;
  supportsDelete?: boolean;
  supportsScheduling?: boolean;
}

export interface AccountInfo {
  platform: SocialPlatform;
  handle?: string;
  displayName?: string;
  botId?: number | string;
  targetChat?: string;
}

export interface UploadedMedia {
  externalId: string;
}

export interface PublishResult {
  externalPostId: string;
  externalUrl?: string;
}

export interface SocialAdapter {
  validateConnection(): Promise<boolean>;
  getAccountInfo(): Promise<AccountInfo>;
  uploadMedia(media: SnapshotMediaItem): Promise<UploadedMedia>;
  publishPost(post: {
    caption: string;
    media: SnapshotMediaItem[];
    labels?: unknown;
  }): Promise<PublishResult>;
  deletePost?(externalPostId: string): Promise<void>;
  getCapabilities(): PlatformCapabilities;
}

export interface ComposedContent {
  caption: string;
  labels?: { sensitive?: boolean; contentWarning?: string };
  metadata?: Record<string, unknown>;
}

export type RiskLevel = "low" | "medium" | "high";

export interface RiskResult {
  level: RiskLevel;
  factors: {
    duplicate: boolean;
    mediaCount: number;
    vipTeaser: boolean;
    requiresSensitive: boolean;
    requiresApproval: boolean;
    platformDisabled: boolean;
  };
}

export interface DuplicateResult {
  duplicate: boolean;
  reason?: string;
  existingPostId?: number;
}

export interface SocialAccountFlags {
  id: number;
  platform: SocialPlatform;
  displayName: string;
  isEnabled: boolean;
  autoShare: boolean;
  requireApproval: boolean;
  configJson?: string | null;
}

export interface PlatformConfig {
  enabled: boolean;
  defaultAutoShare: boolean;
  maxImages: number;
  delayMinutes: number;
  requireApproval?: boolean;
}

export interface SocialDistributionConfig {
  enabled: boolean;
  contentRating: string;
  defaultDelayMinutes: number;
  platforms: Record<SocialPlatform, PlatformConfig>;
  /** Random 1 album per interval. Not tied to album publish. */
  schedule: {
    enabled: boolean;
    /** Minutes between random posts. 5–10080 (7 days). */
    intervalMinutes: number;
  };
}

export class SocialNotImplementedError extends Error {
  readonly code = "NOT_IMPLEMENTED";
  readonly retryable = false;
  constructor(platform: SocialPlatform, method: string) {
    super(`${platform} adapter ${method} is not implemented in Phase Core`);
    this.name = "SocialNotImplementedError";
  }
}

export class SocialCryptoError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SocialCryptoError";
  }
}

export class SocialAccountDisabledError extends Error {
  constructor(accountId: number) {
    super(`Social account ${accountId} is disabled`);
    this.name = "SocialAccountDisabledError";
  }
}

export class SocialApiError extends Error {
  readonly httpStatus: number | null;
  readonly code: string;
  readonly retryable: boolean;
  readonly retryAfterSeconds?: number;
  constructor(opts: {
    message: string;
    httpStatus?: number | null;
    code: string;
    retryable: boolean;
    retryAfterSeconds?: number;
  }) {
    super(opts.message);
    this.name = "SocialApiError";
    this.httpStatus = opts.httpStatus ?? null;
    this.code = opts.code;
    this.retryable = opts.retryable;
    this.retryAfterSeconds = opts.retryAfterSeconds;
  }
}
