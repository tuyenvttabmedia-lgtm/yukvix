/** Import Profile snapshot schema version. */
export const IMPORT_PROFILE_VERSION = "1.0.0";

export type VipZipMode = "copy" | "regenerate";

export interface ImportProfileSnapshot {
  profileVersion: string;
  profile: string;
  publish: "draft" | "published" | string;
  vip: boolean;
  preview: number;
  seo: string;
  watermark: boolean;
  vipZipMode: VipZipMode;
  zipImportV2: boolean;
}

export interface BuildImportProfileInput {
  publishMode?: "draft" | "published" | string;
  defaultVip?: boolean;
  freePreviewCount?: number;
  profile?: string;
}

export function buildImportProfileSnapshot(
  input: BuildImportProfileInput = {}
): ImportProfileSnapshot {
  const vipZipMode = (process.env.VIP_ZIP_MODE || "copy") as VipZipMode;
  const zipImportV2 = process.env.ZIP_IMPORT_V2 === "true";

  return {
    profileVersion: IMPORT_PROFILE_VERSION,
    profile: input.profile ?? "default",
    publish: input.publishMode ?? "draft",
    vip: input.defaultVip ?? true,
    preview: input.freePreviewCount ?? 10,
    seo: "gemini",
    watermark: false,
    vipZipMode: vipZipMode === "regenerate" ? "regenerate" : "copy",
    zipImportV2,
  };
}

export function parseImportProfile(raw: string | null | undefined): ImportProfileSnapshot | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as ImportProfileSnapshot;
  } catch {
    return null;
  }
}

export function isZipImportV2Enabled(profile: ImportProfileSnapshot | null): boolean {
  if (profile?.zipImportV2 !== undefined) return profile.zipImportV2;
  return process.env.ZIP_IMPORT_V2 === "true";
}

/** Batch auto-publish: only after pipeline completes with photos (+ VIP zip when album is VIP). */
export function shouldAutoPublishAfterImport(
  profile: ImportProfileSnapshot | null,
  opts: { photoCount: number; vipZipReady: boolean; isVipAlbum: boolean }
): boolean {
  if (profile?.publish !== "published") return false;
  if (opts.photoCount <= 0) return false;
  if (opts.isVipAlbum && !opts.vipZipReady) return false;
  return true;
}
