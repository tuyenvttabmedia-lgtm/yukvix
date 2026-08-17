/**
 * Wasabi helpers for import pipeline (Phase 4).
 */

import fs from "fs/promises";
import path from "path";
import { createWriteStream } from "fs";
import os from "os";
import { createRequire } from "module";
import { GetObjectCommand, CopyObjectCommand } from "@aws-sdk/client-s3";
import {
  uploadToStorage,
  deleteFromStorage,
  getS3ClientForProcessing,
} from "../storage-wasabi";
import type { ValidatedImage } from "../services/image-validator";

const require = createRequire(import.meta.url);
// eslint-disable-next-line @typescript-eslint/no-require-imports
const archiverLib = require("archiver") as {
  ZipArchive: new (opts?: object) => import("archiver").Archiver;
};

export async function downloadFromWasabi(key: string, destPath: string): Promise<void> {
  const s3 = getS3ClientForProcessing();
  const bucket = process.env.WASABI_BUCKET || "";
  const cmd = new GetObjectCommand({ Bucket: bucket, Key: key });
  const response = await s3.send(cmd);
  if (!response.Body) throw new Error(`Empty response body for key: ${key}`);

  const chunks: Buffer[] = [];
  for await (const chunk of response.Body as AsyncIterable<Uint8Array>) {
    chunks.push(Buffer.from(chunk));
  }
  await fs.writeFile(destPath, Buffer.concat(chunks));
}

export async function moveWasabiObject(sourceKey: string, destKey: string): Promise<void> {
  const s3 = getS3ClientForProcessing();
  const bucket = process.env.WASABI_BUCKET || "";

  await s3.send(
    new CopyObjectCommand({
      Bucket: bucket,
      CopySource: encodeCopySource(bucket, sourceKey),
      Key: destKey,
    })
  );
  await deleteFromStorage(sourceKey);
}

/** URL-encode CopySource for keys with spaces, parentheses, or non-ASCII chars (UAT BUG-001). */
export function encodeCopySource(bucket: string, key: string): string {
  return encodeURIComponent(`${bucket}/${key}`);
}

export async function generateVipZip(
  jobId: number,
  albumSlug: string,
  albumTitle: string,
  extractedDir: string,
  imageFiles: ValidatedImage[]
): Promise<{ key: string; size: number }> {
  const tempBase = process.env.IMPORT_TEMP_PATH || path.join(os.tmpdir(), "zip-import");
  const zipPath = path.join(tempBase, `vip-${jobId}-${albumSlug}.zip`);

  await new Promise<void>((resolve, reject) => {
    const output = createWriteStream(zipPath);
    const archive = new archiverLib.ZipArchive({ zlib: { level: 6 } });

    output.on("close", resolve);
    archive.on("error", reject);
    archive.pipe(output);

    const metadata = {
      albumTitle,
      albumSlug,
      generatedAt: new Date().toISOString(),
      imageCount: imageFiles.length,
      source: "Yukvix.com",
    };
    archive.append(JSON.stringify(metadata, null, 2), { name: "metadata.json" });

    for (const img of imageFiles) {
      archive.file(img.path, { name: img.filename });
    }

    archive.finalize();
  });

  const stats = await fs.stat(zipPath);
  const buffer = await fs.readFile(zipPath);
  const vipKey = `vip-zips/${albumSlug}/VIP_${albumSlug}.zip`;
  await uploadToStorage(vipKey, buffer, "application/zip");
  await fs.rm(zipPath).catch(() => {});

  return { key: vipKey, size: stats.size };
}
