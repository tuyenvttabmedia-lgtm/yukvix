import { describe, expect, it, vi } from "vitest";

vi.mock("../storage-wasabi", () => ({
  getPublicUrl: (key: string) => `https://media.yukvix.com/${key}`,
  getWasabiBucket: () => "media.yukvix.com",
}));

import { resolveSocialMediumKey, socialUploadObjectKey } from "./upload-bytes";

describe("resolveSocialMediumKey", () => {
  it("uses a stored medium key when present", () => {
    expect(
      resolveSocialMediumKey({ mediumKey: "albums/1/medium/a_medium.webp" })
    ).toBe("albums/1/medium/a_medium.webp");
  });

  it("derives medium from a square thumb key or snapshot URL", () => {
    expect(
      resolveSocialMediumKey({ thumbKey: "albums/1/thumb/cover_thumb.webp" })
    ).toBe("albums/1/medium/cover_medium.webp");
    expect(
      resolveSocialMediumKey({
        snapshotUrl: "https://media.yukvix.com/albums/1/thumb/a_thumb.webp",
      })
    ).toBe("albums/1/medium/a_medium.webp");
  });

  it("never returns original, webp, or raw thumb keys", () => {
    expect(socialUploadObjectKey("albums/1/thumb/a.webp")).toBeNull();
    expect(
      resolveSocialMediumKey({ webpKey: "albums/1/webp/a.webp" })
    ).toBe("albums/1/medium/a_medium.webp");
    expect(resolveSocialMediumKey({ mediumKey: "albums/1/original/a.jpg" })).toBeNull();
  });
});
