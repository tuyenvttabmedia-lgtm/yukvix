import { describe, expect, it } from "vitest";
import {
  ARCHIVE_PART_SIZE_BYTES,
  countArchiveParts,
  shouldUseMultipartUpload,
} from "./archive-upload";

describe("archive-upload helpers", () => {
  it("uses multipart only above 8MB", () => {
    expect(shouldUseMultipartUpload(8 * 1024 * 1024)).toBe(false);
    expect(shouldUseMultipartUpload(8 * 1024 * 1024 + 1)).toBe(true);
  });

  it("counts 16MB parts", () => {
    expect(countArchiveParts(0)).toBe(0);
    expect(countArchiveParts(1)).toBe(1);
    expect(countArchiveParts(ARCHIVE_PART_SIZE_BYTES)).toBe(1);
    expect(countArchiveParts(ARCHIVE_PART_SIZE_BYTES + 1)).toBe(2);
    expect(countArchiveParts(4 * 1024 * 1024 * 1024)).toBe(256);
  });
});
