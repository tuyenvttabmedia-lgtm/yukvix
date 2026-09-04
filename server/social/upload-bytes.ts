import { GetObjectCommand } from "@aws-sdk/client-s3";
import sharp from "sharp";
import { getPhotoById } from "../db";
import { getS3ClientForProcessing, getWasabiBucket } from "../storage-wasabi";
import { isShareablePublicMediaUrl } from "./media";
import type { SnapshotMediaItem } from "./types";

const MAX_UPLOAD_BYTES = 9 * 1024 * 1024;
const FETCH_TIMEOUT_MS = 20_000;

/** Medium 1200px only — never 4K webp or original. */
export function socialUploadObjectKey(key: string | null | undefined): string | null {
  const trimmed = key?.trim();
  if (!trimmed) return null;
  if (!/\/medium\//.test(trimmed)) return null;
  if (/\/(original|webp)\//.test(trimmed)) return null;
  return trimmed;
}

async function objectBuffer(key: string): Promise<Buffer> {
  const s3 = getS3ClientForProcessing();
  const response = await s3.send(
    new GetObjectCommand({ Bucket: getWasabiBucket(), Key: key })
  );
  if (!response.Body) throw new Error("empty object body");
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of response.Body as AsyncIterable<Uint8Array>) {
    const buf = Buffer.from(chunk);
    total += buf.length;
    if (total > MAX_UPLOAD_BYTES) {
      throw new Error("object exceeds social photo size");
    }
    chunks.push(buf);
  }
  return Buffer.concat(chunks);
}

async function fetchPublicSnapshot(url: string): Promise<Buffer> {
  const trimmed = url.trim();
  if (!isShareablePublicMediaUrl(trimmed)) {
    throw new Error("snapshot URL is not public https");
  }
  const response = await fetch(trimmed, {
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`snapshot HTTP ${response.status}`);
  const buf = Buffer.from(await response.arrayBuffer());
  if (buf.length > MAX_UPLOAD_BYTES) throw new Error("snapshot exceeds social photo size");
  return buf;
}

export async function toSocialJpeg(input: Buffer): Promise<Buffer> {
  return sharp(input, { failOn: "none" })
    .rotate()
    .resize({
      width: 1280,
      height: 1280,
      fit: "inside",
      withoutEnlargement: true,
    })
    .jpeg({ quality: 82, mozjpeg: true })
    .toBuffer();
}

export type SocialJpegUpload = {
  bytes: Buffer;
  width: number;
  height: number;
};

export async function toSocialJpegWithSize(input: Buffer): Promise<SocialJpegUpload> {
  const bytes = await toSocialJpeg(input);
  const meta = await sharp(bytes, { failOn: "none" }).metadata();
  return {
    bytes,
    width: meta.width || 1,
    height: meta.height || 1,
  };
}

/**
 * Display-size JPEG for adapters. Prefers private medium via Wasabi GET
 * (never sent as a URL). Falls back to the public thumb snapshot URL.
 * Never reads original/4K webp.
 */
export async function loadSocialUploadBytes(
  item: SnapshotMediaItem
): Promise<Buffer | null> {
  try {
    if (item.photoId) {
      const photo = await getPhotoById(item.photoId);
      const key = socialUploadObjectKey(photo?.mediumKey);
      if (key) return toSocialJpeg(await objectBuffer(key));
    }
    return toSocialJpeg(await fetchPublicSnapshot(item.url));
  } catch {
    return null;
  }
}

export async function loadSocialUploadJpeg(
  item: SnapshotMediaItem
): Promise<SocialJpegUpload | null> {
  const bytes = await loadSocialUploadBytes(item);
  if (!bytes) return null;
  const meta = await sharp(bytes, { failOn: "none" }).metadata();
  return {
    bytes,
    width: meta.width || 1,
    height: meta.height || 1,
  };
}
