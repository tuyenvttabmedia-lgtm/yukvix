export type DuplicateType =
  | "SKIPPED_SHA256"
  | "SKIPPED_FILENAME"
  | "SKIPPED_SIZE"
  | "SKIPPED_CREATOR"
  | "SKIPPED_TITLE"
  | "SKIPPED_IMAGE_HASH";

export interface DuplicateMatch {
  duplicateType: DuplicateType;
  confidence: number; // 0.0 - 1.0
  matchedJobId: number | null;
  matchedAlbumId: number | null;
  matchedTitle?: string;
  matchedSlug?: string;
  details?: Record<string, unknown>;
}

export interface DuplicateInfo {
  primaryDuplicate: DuplicateMatch;
  matches: DuplicateMatch[];
  policy: string;
  detectedAt: string;
  /** Engine version at detection time — audit trail. */
  engineVersion: string;
  /** Archive hash algorithm used (e.g. sha256) — not hardcoded in details. */
  hashAlgorithm: string;
}

export interface DuplicateOverrideAudit {
  overrideBy: number;
  overrideAt: string;
  reason?: string;
}

export type DuplicateAction = "skip" | "warn";

export interface DuplicateRule {
  action: DuplicateAction;
  minConfidence: number;
  windowDays?: number;
  matchPercent?: number;
  requireSameFilename?: boolean;
}

export interface DuplicatePolicyConfig {
  mode: "STRICT" | "LENIENT" | string;
  rules: Partial<Record<DuplicateType, DuplicateRule>>;
}

export interface ImportJobStatsByType {
  SKIPPED_SHA256: number;
  SKIPPED_FILENAME: number;
  SKIPPED_SIZE: number;
  SKIPPED_CREATOR: number;
  SKIPPED_TITLE: number;
  SKIPPED_IMAGE_HASH: number;
}

export interface ImportJobStats {
  imported: number;
  skipped: number;
  override: number;
  failed: number;
  byDuplicateType: ImportJobStatsByType;
}
