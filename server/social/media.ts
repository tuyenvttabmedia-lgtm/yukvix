import { extractStorageObjectKey, rewritePublicMediaUrl } from "../public-media-url";
import type {
  PlatformCapabilities,
  PolicyInputAlbum,
  SnapshotMediaItem,
  SocialMediaResult,
} from "./types";

const SIGNED_URL_RE = /x-amz-|amz-signature|awsaccesskeyid|signature=/i;
const PRIVATE_PATH_RE = /\/(webp|medium|original)\//;
const ZIP_RE = /(\.zip(\?|$))|\/vip-zips\/|\/download-zips\//i;

export type PhotoLike = {
  id: number;
  albumId?: number;
  sortOrder?: number | null;
  isFreePreview?: boolean | null;
  thumbUrl?: string | null;
  thumbKey?: string | null;
  originalKey?: string | null;
  originalUrl?: string | null;
  webpKey?: string | null;
  webpUrl?: string | null;
  mediumKey?: string | null;
  mediumUrl?: string | null;
  zipUrl?: string | null;
};

export function isShareablePublicMediaUrl(
  url: string | null | undefined
): boolean {
  if (!url || typeof url !== "string") return false;
  const trimmed = url.trim();
  if (!trimmed) return false;
  if (SIGNED_URL_RE.test(trimmed)) return false;
  if (ZIP_RE.test(trimmed)) return false;
  if (PRIVATE_PATH_RE.test(trimmed)) return false;
  if (/^wasabi:|^s3:|^key:/i.test(trimmed)) return false;
  // Adapters fetch without a Yukvix session — only stable public https URLs.
  if (!/^https:\/\//i.test(trimmed)) return false;
  return true;
}

function toPublicThumb(url: string | null | undefined): string | null {
  const rewritten = rewritePublicMediaUrl(url);
  if (!rewritten || !isShareablePublicMediaUrl(rewritten)) return null;
  return rewritten;
}

function objectKey(urlOrKey: string | null | undefined): string | null {
  if (!urlOrKey?.trim()) return null;
  return extractStorageObjectKey(urlOrKey) || (!/^https?:/i.test(urlOrKey) && !urlOrKey.startsWith("/")
    ? urlOrKey
    : null);
}

function sameMedia(
  a: string | null | undefined,
  b: string | null | undefined
): boolean {
  const left = objectKey(a);
  const right = objectKey(b);
  return Boolean(left && right && left === right);
}

function findCoverPhoto(
  album: PolicyInputAlbum,
  photos: PhotoLike[]
): PhotoLike | undefined {
  return photos.find(
    photo =>
      sameMedia(album.coverUrl, photo.thumbUrl) ||
      sameMedia(album.coverKey, photo.thumbKey) ||
      sameMedia(album.coverUrl, photo.thumbKey) ||
      sameMedia(album.coverKey, photo.thumbUrl)
  );
}

function pushItem(
  items: SnapshotMediaItem[],
  seen: Set<string>,
  item: SnapshotMediaItem,
  maxImages: number
): void {
  if (items.length >= maxImages) return;
  if (!isShareablePublicMediaUrl(item.url)) return;
  if (seen.has(item.url)) return;
  seen.add(item.url);
  items.push(item);
}

export function selectSocialMedia(opts: {
  album: PolicyInputAlbum;
  photos: PhotoLike[];
  capabilities: PlatformCapabilities;
}): SocialMediaResult {
  const maxImages = Math.max(1, opts.capabilities.maxImages);
  const items: SnapshotMediaItem[] = [];
  const seen = new Set<string>();

  const cover = toPublicThumb(opts.album.coverUrl);
  const coverPhoto = findCoverPhoto(opts.album, opts.photos);
  if (cover) {
    pushItem(
      items,
      seen,
      {
        photoId: coverPhoto?.id ?? null,
        mediaItemId: null,
        type: "cover",
        url: cover,
        sortOrder: 0,
      },
      maxImages
    );
  }

  const photos = [...opts.photos].sort(
    (a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || a.id - b.id
  );

  const vip = Boolean(opts.album.isVip);
  const eligible = vip ? photos.filter(p => p.isFreePreview) : photos;

  for (const photo of eligible) {
    if (items.length >= maxImages) break;
    if (
      photo.originalUrl &&
      isShareablePublicMediaUrl(photo.originalUrl) === false
    ) {
      /* original URLs are never used even if somehow public-looking after rewrite skip */
    }
    const thumb = toPublicThumb(photo.thumbUrl);
    if (!thumb) continue;
    pushItem(
      items,
      seen,
      {
        photoId: photo.id,
        mediaItemId: null,
        type: photo.isFreePreview ? "free_preview" : "thumb",
        url: thumb,
        sortOrder: items.length,
      },
      maxImages
    );
  }

  const eligibleUrls = new Set<string>();
  if (cover) eligibleUrls.add(cover);
  for (const photo of eligible) {
    const thumb = toPublicThumb(photo.thumbUrl);
    if (thumb) eligibleUrls.add(thumb);
  }
  const eligibleCount = eligibleUrls.size;

  if (items.length === 0) {
    return {
      status: "skipped",
      reason: vip
        ? "VIP album has no public cover or free-preview thumbs"
        : "Album has no public cover or thumbs eligible for social share",
      items: [],
      eligibleCount,
      truncated: false,
      maxImages,
    };
  }

  return {
    status: "ok",
    items,
    eligibleCount,
    truncated: eligibleCount > items.length,
    maxImages,
  };
}

export async function getSocialMediaForAlbum(
  albumId: number,
  platformCapabilities: PlatformCapabilities
): Promise<SocialMediaResult & { album?: PolicyInputAlbum }> {
  const { getAlbumById, getPhotosByAlbumId, getCreatorById } = await import("../db");
  const { displayCosplayerName } = await import("../services/cosplayer-name");
  const album = await getAlbumById(albumId);
  if (!album) {
    return { status: "skipped", reason: "Album not found", items: [] };
  }
  let creatorName: string | null = null;
  if (album.creatorId) {
    const creator = await getCreatorById(album.creatorId);
    creatorName = creator?.name ?? null;
  }
  const photos = await getPhotosByAlbumId(albumId);
  const policyAlbum = {
    id: album.id,
    status: album.status,
    isVip: album.isVip,
    photoCount: album.photoCount,
    title: album.title,
    slug: album.slug,
    cosplayer: displayCosplayerName({
      cosplayer: album.cosplayer,
      creator: album.creator,
      creatorName,
    }),
    character: album.character,
    series: album.series,
    coverUrl: album.coverUrl,
    coverKey: album.coverKey,
  };
  const result = selectSocialMedia({
    album: policyAlbum,
    photos,
    capabilities: platformCapabilities,
  });
  return { ...result, album: policyAlbum };
}
