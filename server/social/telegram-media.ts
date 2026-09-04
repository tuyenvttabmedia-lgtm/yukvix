import { GetObjectCommand } from "@aws-sdk/client-s3";
import sharp from "sharp";
import { getPhotoById } from "../db";
import { getS3ClientForProcessing, getWasabiBucket } from "../storage-wasabi";
import { assertTelegramSnapshotUrl } from "./telegram-config";
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
      throw new Error("object exceeds Telegram photo size");
    }
    chunks.push(buf);
  }
  return Buffer.concat(chunks);
}

async function fetchPublicSnapshot(url: string): Promise<Buffer> {
  const safe = assertTelegramSnapshotUrl(url);
  const response = await fetch(safe, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
  if (!response.ok) throw new Error(`snapshot HTTP ${response.status}`);
  const buf = Buffer.from(await response.arrayBuffer());
  if (buf.length > MAX_UPLOAD_BYTES) throw new Error("snapshot exceeds Telegram photo size");
  return buf;
}

export async function toTelegramJpeg(input: Buffer): Promise<Buffer> {
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

/**
 * Load display-size bytes for Telegram. Prefers private medium via Wasabi GET
 * (never sent as a URL). Falls back to the public thumb snapshot URL.
 * Never reads original/4K webp.
 */
export async function loadTelegramUploadBytes(
  item: SnapshotMediaItem
): Promise<Buffer | null> {
  try {
    if (item.photoId) {
      const photo = await getPhotoById(item.photoId);
      const key = socialUploadObjectKey(photo?.mediumKey);
      if (key) return toTelegramJpeg(await objectBuffer(key));
    }
    return toTelegramJpeg(await fetchPublicSnapshot(item.url));
  } catch {
    return null;
  }
}
