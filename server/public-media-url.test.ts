import { describe, expect, it, vi } from "vitest";

vi.mock("./storage-wasabi", () => ({
  getWasabiBucket: () => "media.yukvix.com",
  getPublicUrl: (key: string) => `https://media.yukvix.com/${key}`,
}));

import { extractStorageObjectKey, rewritePublicMediaUrl } from "./public-media-url";

describe("extractStorageObjectKey", () => {
  it("parses path-style Wasabi, media-proxy, and CDN hosts", () => {
    expect(
      extractStorageObjectKey(
        "https://s3.ap-southeast-1.wasabisys.com/media.yukvix.com/albums/a/thumb/1.webp",
        "media.yukvix.com"
      )
    ).toBe("albums/a/thumb/1.webp");
    expect(
      extractStorageObjectKey(
        "https://yukvix.com/media-proxy/albums/a/thumb/1.webp",
        "media.yukvix.com"
      )
    ).toBe("albums/a/thumb/1.webp");
    expect(
      extractStorageObjectKey("/media-proxy/albums/a/thumb/1.webp", "media.yukvix.com")
    ).toBe("albums/a/thumb/1.webp");
    expect(
      extractStorageObjectKey("https://media.yukvix.com/albums/a/thumb/1.webp", "media.yukvix.com")
    ).toBe("albums/a/thumb/1.webp");
  });
});

describe("rewritePublicMediaUrl", () => {
  it("moves public thumbs off the VPS proxy onto the CDN/Wasabi URL", () => {
    expect(
      rewritePublicMediaUrl("https://yukvix.com/media-proxy/albums/a/thumb/1.webp")
    ).toBe("https://media.yukvix.com/albums/a/thumb/1.webp");
    expect(
      rewritePublicMediaUrl(
        "https://s3.ap-southeast-1.wasabisys.com/media.yukvix.com/albums/a/thumb/1.webp"
      )
    ).toBe("https://media.yukvix.com/albums/a/thumb/1.webp");
  });

  it("does not unsigned-rewrite private full-size objects", () => {
    const webp = "https://yukvix.com/media-proxy/albums/a/webp/1.webp";
    expect(rewritePublicMediaUrl(webp)).toBe(webp);
  });
});
