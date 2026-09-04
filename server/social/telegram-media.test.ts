import { describe, expect, it } from "vitest";
import { socialUploadObjectKey } from "./telegram-media";

describe("socialUploadObjectKey", () => {
  it("allows medium keys only", () => {
    expect(socialUploadObjectKey("albums/1/medium/a.webp")).toBe(
      "albums/1/medium/a.webp"
    );
  });

  it("rejects 4K webp, original, empty, and mixed paths", () => {
    expect(socialUploadObjectKey("albums/1/webp/a.webp")).toBeNull();
    expect(socialUploadObjectKey("albums/1/original/a.jpg")).toBeNull();
    expect(socialUploadObjectKey("albums/1/thumb/a.webp")).toBeNull();
    expect(socialUploadObjectKey("albums/1/medium/../original/a.jpg")).toBeNull();
    expect(socialUploadObjectKey("")).toBeNull();
    expect(socialUploadObjectKey(null)).toBeNull();
  });
});
