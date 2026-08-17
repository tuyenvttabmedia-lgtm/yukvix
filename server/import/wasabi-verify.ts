/**
 * Wasabi upload/copy verification (Phase 5).
 * Never trust HTTP 200 alone — verify via HeadObject + size/ETag.
 */

import { HeadObjectCommand } from "@aws-sdk/client-s3";
import {
  copyObject,
  deleteFromStorage,
  getS3ClientForProcessing,
  uploadToStorage,
} from "../storage-wasabi";

export interface ObjectHeadResult {
  contentLength: number;
  etag: string | null;
}

export async function headObject(key: string): Promise<ObjectHeadResult> {
  const client = getS3ClientForProcessing();
  const bucket = process.env.WASABI_BUCKET || "";
  const resp = await client.send(
    new HeadObjectCommand({
      Bucket: bucket,
      Key: key,
    })
  );

  if (resp.ContentLength === undefined) {
    throw new Error(`HeadObject: missing ContentLength for ${key}`);
  }

  return {
    contentLength: resp.ContentLength,
    etag: resp.ETag ?? null,
  };
}

export async function verifyObjectExists(key: string, expectedSize?: number): Promise<ObjectHeadResult> {
  const head = await headObject(key);
  if (expectedSize !== undefined && head.contentLength !== expectedSize) {
    throw new Error(
      `Object size mismatch for ${key}: expected ${expectedSize}, got ${head.contentLength}`
    );
  }
  return head;
}

export async function copyObjectWithVerify(
  sourceKey: string,
  destKey: string,
  expectedSize: number
): Promise<ObjectHeadResult> {
  await copyObject(sourceKey, destKey);
  try {
    return await verifyObjectExists(destKey, expectedSize);
  } catch (err) {
    await deleteFromStorage(destKey).catch(() => {});
    throw err;
  }
}

export async function uploadBufferVerified(
  key: string,
  buffer: Buffer,
  contentType: string
): Promise<{ etag: string | null; size: number }> {
  await uploadToStorage(key, buffer, contentType);
  const head = await verifyObjectExists(key, buffer.length);
  return { etag: head.etag, size: head.contentLength };
}

export async function verifyAllObjects(keys: string[]): Promise<void> {
  for (const key of keys) {
    await verifyObjectExists(key);
  }
}
