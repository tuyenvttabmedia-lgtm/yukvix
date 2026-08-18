import { TRPCError } from "@trpc/server";
import { isAdmin, isVipOrAdmin } from "@shared/const";
import { getSignedMediaUrl } from "./storage-wasabi";

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

function isPrivateFullSizeKey(key: string | null | undefined): boolean {
  if (!key) return false;
  return /\/(webp|medium|original)\//.test(key);
}

export type PhotoClient = PhotoLike & {
  displayUrl: string | null;
  isLocked: boolean;
};

/**
 * Public clients never receive Wasabi keys or permanent CDN URLs for VIP full-size
 * variants. VIP (and free-preview lightbox) get a short-lived signed displayUrl.
 * Thumbs stay public for cards/SEO.
 */
export async function presentPhotoForClient(
  photo: PhotoLike,
  opts: { albumIsVip: boolean; userIsVip: boolean; isAdminUser: boolean }
): Promise<PhotoClient> {
  const { albumIsVip, userIsVip, isAdminUser } = opts;

  if (isAdminUser) {
    return {
      ...photo,
      displayUrl: photo.displayUrl ?? photo.mediumUrl ?? photo.webpUrl ?? photo.thumbUrl ?? null,
      isLocked: false,
    };
  }

  if (!albumIsVip) {
    const displayUrl =
      photo.displayUrl ||
      photo.mediumUrl ||
      photo.webpUrl ||
      photo.thumbUrl ||
      null;
    return {
      id: photo.id,
      albumId: photo.albumId,
      width: photo.width,
      height: photo.height,
      sortOrder: photo.sortOrder,
      isFreePreview: photo.isFreePreview,
      filename: photo.filename,
      altText: photo.altText,
      thumbUrl: photo.thumbUrl,
      displayUrl,
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

  const signKey =
    (canSeeFull ? photo.webpKey || photo.mediumKey || photo.originalKey : null) ||
    photo.mediumKey ||
    photo.webpKey ||
    photo.thumbKey;

  let displayUrl = photo.thumbUrl || null;
  if (signKey && isPrivateFullSizeKey(signKey)) {
    try {
      displayUrl = await getSignedMediaUrl(signKey, 3600);
    } catch (err) {
      console.warn(`[photo-access] signed URL failed for photo ${photo.id}:`, (err as Error).message);
      displayUrl = photo.thumbUrl || null;
    }
  } else if (signKey) {
    try {
      displayUrl = await getSignedMediaUrl(signKey, 3600);
    } catch {
      displayUrl = photo.thumbUrl || null;
    }
  }

  return {
    id: photo.id,
    albumId: photo.albumId,
    width: photo.width,
    height: photo.height,
    sortOrder: photo.sortOrder,
    isFreePreview: photo.isFreePreview,
    filename: isAdminUser ? photo.filename : undefined,
    altText: photo.altText,
    thumbUrl: photo.thumbUrl,
    displayUrl,
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
