import { describe, expect, it, vi } from "vitest";

vi.mock("./storage-wasabi", () => ({
  getWasabiBucket: () => "media.yukvix.com",
  getPublicUrl: (key: string) => `https://media.yukvix.com/${key}`,
}));

import { extractStorageObjectKey, isCreatorPubliclyVisible, isLowResCreatorBanner, preferredBannerSourceKey, rewritePublicMediaUrl, toPublicCreatorBannerUrl, toPublicCreatorImageUrl } from "./public-media-url";

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

  it("maps private webp/medium creator images onto the public thumb CDN URL", () => {
    expect(
      toPublicCreatorImageUrl(
        "https://s3.ap-southeast-1.wasabisys.com/media.yukvix.com/albums/a/medium/1.webp"
      )
    ).toBe("https://media.yukvix.com/albums/a/thumb/1.webp");
    expect(
      toPublicCreatorImageUrl("https://yukvix.com/media-proxy/albums/a/webp/1.webp")
    ).toBe("https://media.yukvix.com/albums/a/thumb/1.webp");
    expect(
      toPublicCreatorImageUrl("https://media.yukvix.com/creators/avatar/9.webp")
    ).toBe("https://media.yukvix.com/creators/avatar/9.webp");
  });
});

describe("creator banner URLs", () => {
  it("keeps public creators/ banners sharp instead of mapping them to album thumbs", () => {
    expect(
      toPublicCreatorBannerUrl("https://media.yukvix.com/creators/banner/9-1.webp")
    ).toBe("https://media.yukvix.com/creators/banner/9-1.webp");
  });

  it("treats album thumbs as low-res banners", () => {
    expect(isLowResCreatorBanner("https://media.yukvix.com/albums/a/thumb/1.webp")).toBe(true);
    expect(isLowResCreatorBanner("https://media.yukvix.com/creators/banner/9.webp")).toBe(false);
    expect(isLowResCreatorBanner(null)).toBe(true);
  });
});

describe("preferredBannerSourceKey", () => {
  it("prefers medium over webp and thumb so banners stay sharp", () => {
    expect(
      preferredBannerSourceKey({
        mediumKey: "albums/a/medium/1.webp",
        webpKey: "albums/a/webp/1.webp",
        thumbKey: "albums/a/thumb/1.webp",
      })
    ).toBe("albums/a/medium/1.webp");
  });
});

describe("isCreatorPubliclyVisible", () => {
  it("requires albums and an avatar", () => {
    expect(isCreatorPubliclyVisible({ albumCount: 2, avatarUrl: "a", bannerUrl: "b" })).toBe(true);
    expect(isCreatorPubliclyVisible({ albumCount: 2, avatarUrl: "a", bannerUrl: null })).toBe(true);
    expect(isCreatorPubliclyVisible({ albumCount: 0, avatarUrl: "a", bannerUrl: "b" })).toBe(false);
    expect(isCreatorPubliclyVisible({ albumCount: 3, avatarUrl: "", bannerUrl: "b" })).toBe(false);
    expect(isCreatorPubliclyVisible({ albumCount: 3, avatarUrl: null, bannerUrl: "b" })).toBe(false);
  });
});
