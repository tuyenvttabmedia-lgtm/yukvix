import { TRPCError } from "@trpc/server";
import { isAdmin, isVipOrAdmin } from "@shared/const";
import { getSignedMediaUrl } from "./storage-wasabi";
import { rewritePublicMediaUrl } from "./public-media-url";

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

async function signedFullSizeUrl(photo: PhotoLike): Promise<string | null> {
  const signKey = photo.webpKey || photo.mediumKey || photo.originalKey;
  if (signKey) {
    try {
      return await getSignedMediaUrl(signKey, 3600);
    } catch (err) {
      console.warn(`[photo-access] signed URL failed for photo ${photo.id}:`, (err as Error).message);
    }
  }
  return photo.thumbUrl || photo.displayUrl || photo.mediumUrl || photo.webpUrl || null;
}

export type PhotoClient = PhotoLike & {
  displayUrl: string | null;
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
      displayUrl: await signedFullSizeUrl(photo),
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
      displayUrl: await signedFullSizeUrl(photo),
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
    displayUrl: await signedFullSizeUrl(photo),
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
