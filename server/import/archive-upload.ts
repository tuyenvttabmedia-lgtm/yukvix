/** Shared constants for ZIP/RAR direct-to-Wasabi upload. */

export const ARCHIVE_CONTENT_TYPE = "application/octet-stream";
/** Single PUT and multipart part URLs — long enough for sequential multi-GB batch. */
export const ARCHIVE_PUT_EXPIRES_SECONDS = 4 * 60 * 60;
export const ARCHIVE_PART_SIZE_BYTES = 16 * 1024 * 1024;
/** Files larger than this use multipart (Wasabi min part is 5MB except last). */
export const ARCHIVE_MULTIPART_THRESHOLD_BYTES = 8 * 1024 * 1024;

export function shouldUseMultipartUpload(sizeBytes: number): boolean {
  return sizeBytes > ARCHIVE_MULTIPART_THRESHOLD_BYTES;
}

export function countArchiveParts(sizeBytes: number, partSize = ARCHIVE_PART_SIZE_BYTES): number {
  if (sizeBytes <= 0) return 0;
  return Math.ceil(sizeBytes / partSize);
}
