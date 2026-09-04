import { TRPCError } from "@trpc/server";
import { isAdmin, isVipOrAdmin } from "@shared/const";
import { getSignedMediaUrl } from "./storage-wasabi";
import { deriveMediumObjectKey, rewritePublicMediaUrl } from "./public-media-url";

type AlbumLike = {
  status?: string | null;
  isVip?: boolean | null;
};

type PhotoLike = {
  id: number;
  albumId: number;
  width?: number | null;
  height?: number | null;
  sortOrder?: number | null;
  isFreePreview?: boolean | null;
  filename?: string | null;
  altText?: string | null;
  thumbUrl?: string | null;
  thumbKey?: string | null;
  webpKey?: string | null;
  mediumKey?: string | null;
  originalKey?: string | null;
  webpUrl?: string | null;
  mediumUrl?: string | null;
  originalUrl?: string | null;
  displayUrl?: string | null;
  isLocked?: boolean;
  fileSize?: number | null;
};

export function assertAlbumPubliclyReadable(
  album: AlbumLike | undefined | null,
  role?: string | null
): asserts album is AlbumLike {
  if (!album) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Album not found" });
  }
  if (album.status !== "published" && !isAdmin(role)) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Album not found" });
  }
}

async function signedVariantUrl(
  photo: PhotoLike,
  keys: Array<string | null | undefined>,
  opts?: { allowThumbFallback?: boolean }
): Promise<string | null> {
  const tried = new Set<string>();
  for (const signKey of keys) {
    if (!signKey || tried.has(signKey)) continue;
    tried.add(signKey);
    try {
      return await getSignedMediaUrl(signKey, 3600);
    } catch (err) {
      console.warn(
        `[photo-access] signed URL failed for photo ${photo.id}:`,
        (err as Error).message
      );
    }
  }
  if (opts?.allowThumbFallback === false) return null;
  return photo.thumbUrl || photo.displayUrl || photo.mediumUrl || photo.webpUrl || null;
}

/** Lightbox default: 1200px medium. Never start the viewer on a square 400px thumb. */
async function signedDisplayUrl(photo: PhotoLike): Promise<string | null> {
  const derivedMedium = deriveMediumObjectKey(
    photo.mediumKey || photo.thumbKey || photo.webpKey,
    photo.thumbUrl
  );
  return signedVariantUrl(
    photo,
    [photo.mediumKey, derivedMedium, photo.webpKey],
    { allowThumbFallback: false }
  );
}

/** VIP zoom only. */
async function signedOriginalUrl(photo: PhotoLike): Promise<string | null> {
  return signedVariantUrl(photo, [photo.webpKey, photo.originalKey]);
}

export type PhotoClient = PhotoLike & {
  displayUrl: string | null;
  originalUrl?: string | null;
  isLocked: boolean;
};

/**
 * Public clients never receive Wasabi keys or permanent CDN URLs for full-size
 * variants (webp/medium/original). Those objects are private; thumbs stay public.
 */
export async function presentPhotoForClient(
  photo: PhotoLike,
  opts: { albumIsVip: boolean; userIsVip: boolean; isAdminUser: boolean }
): Promise<PhotoClient> {
  const { albumIsVip, userIsVip, isAdminUser } = opts;

  if (isAdminUser) {
    return {
      ...photo,
      thumbUrl: rewritePublicMediaUrl(photo.thumbUrl),
      displayUrl: await signedDisplayUrl(photo),
      originalUrl: await signedOriginalUrl(photo),
      isLocked: false,
    };
  }

  if (!albumIsVip) {
    return {
      id: photo.id,
      albumId: photo.albumId,
      width: photo.width,
      height: photo.height,
      sortOrder: photo.sortOrder,
      isFreePreview: photo.isFreePreview,
      filename: photo.filename,
      altText: photo.altText,
      thumbUrl: rewritePublicMediaUrl(photo.thumbUrl),
      displayUrl: await signedDisplayUrl(photo),
      isLocked: false,
    };
  }

  const canSeeFull = userIsVip || isAdminUser;
  const canSeePreview = !!photo.isFreePreview;
  if (!canSeeFull && !canSeePreview) {
    return {
      id: photo.id,
      albumId: photo.albumId,
      isLocked: true,
      displayUrl: null,
      thumbUrl: null,
    };
  }

  return {
    id: photo.id,
    albumId: photo.albumId,
    width: photo.width,
    height: photo.height,
    sortOrder: photo.sortOrder,
    isFreePreview: photo.isFreePreview,
    filename: undefined,
    altText: photo.altText,
    thumbUrl: rewritePublicMediaUrl(photo.thumbUrl),
    displayUrl: await signedDisplayUrl(photo),
    originalUrl: canSeeFull ? await signedOriginalUrl(photo) : undefined,
    isLocked: false,
  };
}

export async function presentPhotosForClient(
  photos: PhotoLike[],
  opts: { albumIsVip: boolean; userIsVip: boolean; isAdminUser: boolean }
): Promise<PhotoClient[]> {
  return Promise.all(photos.map((p) => presentPhotoForClient(p, opts)));
}

export function viewerFlags(role?: string | null) {
  return {
    userIsVip: !!role && isVipOrAdmin(role),
    isAdminUser: isAdmin(role),
  };
}

/** Guest and logged-in non-VIP share this: flagged photos, else first N by sort order. */
export function resolveFreePreviewCount(opts: {
  albumIsVip: boolean;
  flaggedPreviewCount: number;
  freePreviewCount: number;
  total: number;
}): number {
  if (!opts.albumIsVip) return opts.total;
  const flagged = Math.max(0, Number(opts.flaggedPreviewCount) || 0);
  if (flagged > 0) return Math.min(flagged, opts.total);
  return Math.min(Math.max(0, Number(opts.freePreviewCount) || 0), opts.total);
}

export function pickVisiblePhotosForNonVip<T extends { isFreePreview?: boolean | number | null }>(
  photos: T[],
  freePreviewCount: number
): T[] {
  const flagged = photos.filter((p) => !!p.isFreePreview);
  if (flagged.length > 0) return flagged;
  const n = Math.min(Math.max(0, Number(freePreviewCount) || 0), photos.length);
  return n > 0 ? photos.slice(0, n) : [];
}
