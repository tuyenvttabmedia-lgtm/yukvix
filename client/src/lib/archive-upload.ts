/**
 * Direct-to-Wasabi ZIP upload: single PUT or multipart with part retries.
 */

export const ARCHIVE_CONTENT_TYPE = "application/octet-stream";

async function putBlob(
  url: string,
  body: Blob,
  headers: Record<string, string>,
  onProgress?: (loaded: number, total: number) => void
): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    for (const [k, v] of Object.entries(headers)) xhr.setRequestHeader(k, v);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && onProgress) onProgress(e.loaded, e.total);
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve();
      else reject(new Error(`HTTP ${xhr.status}`));
    };
    xhr.onerror = () => reject(new Error("Network error"));
    xhr.send(body);
  });
}

async function withRetries<T>(fn: () => Promise<T>, attempts = 3): Promise<T> {
  let last: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      last = err;
      await new Promise((r) => setTimeout(r, 500 * (i + 1)));
    }
  }
  throw last;
}

export async function uploadArchivePut(opts: {
  url: string;
  file: File;
  onProgress?: (pct: number) => void;
}): Promise<void> {
  await withRetries(() =>
    putBlob(opts.url, opts.file, { "Content-Type": ARCHIVE_CONTENT_TYPE }, (loaded, total) => {
      opts.onProgress?.(Math.round((loaded / total) * 100));
    })
  );
}

export async function uploadArchiveMultipart(opts: {
  file: File;
  partSize: number;
  init: () => Promise<{ uploadId: string }>;
  presignPart: (uploadId: string, partNumber: number) => Promise<string>;
  complete: (uploadId: string) => Promise<void>;
  abort: (uploadId: string) => Promise<void>;
  onProgress?: (pct: number) => void;
}): Promise<void> {
  const { uploadId } = await opts.init();
  const total = opts.file.size;
  const partCount = Math.ceil(total / opts.partSize);
  let uploaded = 0;
  try {
    for (let partNumber = 1; partNumber <= partCount; partNumber++) {
      const start = (partNumber - 1) * opts.partSize;
      const blob = opts.file.slice(start, Math.min(start + opts.partSize, total));
      await withRetries(async () => {
        const url = await opts.presignPart(uploadId, partNumber);
        await putBlob(url, blob, {});
      });
      uploaded += blob.size;
      opts.onProgress?.(Math.round((uploaded / total) * 100));
    }
    await opts.complete(uploadId);
  } catch (err) {
    await opts.abort(uploadId).catch(() => {});
    throw err;
  }
}
