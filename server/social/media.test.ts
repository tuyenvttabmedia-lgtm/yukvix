import { describe, expect, it, vi } from "vitest";

vi.mock("../storage-wasabi", () => ({
  getPublicUrl: (key: string) => `https://media.yukvix.com/${key}`,
  getWasabiBucket: () => "media.yukvix.com",
}));

import { isShareablePublicMediaUrl, selectSocialMedia } from "./media";
import { stubCapabilities } from "./adapters/stub";

const album = {
  id: 1,
  status: "published" as const,
  isVip: false,
  title: "Test",
  slug: "test",
  coverUrl: "https://media.yukvix.com/albums/1/thumb/cover.webp",
};

describe("social media security", () => {
  it("allows public thumbs and cover", () => {
    const result = selectSocialMedia({
      album,
      photos: [
        {
          id: 10,
          thumbUrl: "https://media.yukvix.com/albums/1/thumb/a.webp",
          isFreePreview: true,
          sortOrder: 0,
        },
      ],
      capabilities: stubCapabilities("telegram"),
    });
    expect(result.status).toBe("ok");
    expect(result.items.some(i => i.type === "cover")).toBe(true);
    expect(result.items.some(i => i.type === "free_preview")).toBe(true);
  });

  it("attaches photoId on the cover when CDN and Wasabi URLs share the same object key", () => {
    const result = selectSocialMedia({
      album: {
        ...album,
        coverUrl:
          "https://s3.ap-southeast-1.wasabisys.com/media.yukvix.com/albums/1/thumb/cover.webp",
        coverKey: "albums/1/thumb/cover.webp",
      },
      photos: [
        {
          id: 10,
          thumbKey: "albums/1/thumb/cover.webp",
          thumbUrl: "https://media.yukvix.com/albums/1/thumb/cover.webp",
          isFreePreview: true,
          sortOrder: 0,
        },
      ],
      capabilities: stubCapabilities("telegram"),
    });
    expect(result.items[0]).toMatchObject({ type: "cover", photoId: 10 });
  });

  it("attaches photoId on the cover when it matches a photo thumb", () => {
    const result = selectSocialMedia({
      album,
      photos: [
        {
          id: 10,
          thumbUrl: album.coverUrl,
          isFreePreview: true,
          sortOrder: 0,
        },
      ],
      capabilities: stubCapabilities("telegram"),
    });
    expect(result.items[0]).toMatchObject({ type: "cover", photoId: 10 });
    expect(result.items.filter(i => i.url === album.coverUrl)).toHaveLength(1);
  });

  it("reports truncation instead of hiding extra eligible images", () => {
    const photos = Array.from({ length: 12 }, (_, i) => ({
      id: i + 1,
      thumbUrl: `https://media.yukvix.com/albums/1/thumb/${i}.webp`,
      isFreePreview: true,
      sortOrder: i,
    }));
    const result = selectSocialMedia({
      album,
      photos,
      capabilities: { ...stubCapabilities("telegram"), maxImages: 3 },
    });
    expect(result.items.length).toBe(3);
    expect(result.eligibleCount).toBeGreaterThan(3);
    expect(result.truncated).toBe(true);
    expect(result.maxImages).toBe(3);
  });

  it("allows free preview thumbs on VIP albums and rejects other photos", () => {
    const result = selectSocialMedia({
      album: { ...album, isVip: true },
      photos: [
        {
          id: 1,
          thumbUrl: "https://media.yukvix.com/albums/1/thumb/locked.webp",
          isFreePreview: false,
        },
        {
          id: 2,
          thumbUrl: "https://media.yukvix.com/albums/1/thumb/free.webp",
          isFreePreview: true,
        },
      ],
      capabilities: stubCapabilities("telegram"),
    });
    expect(result.items.map(i => i.photoId).filter(Boolean)).toEqual([2]);
  });

  it("rejects original / private object paths", () => {
    expect(
      isShareablePublicMediaUrl(
        "https://media.yukvix.com/albums/1/original/a.jpg"
      )
    ).toBe(false);
    expect(
      isShareablePublicMediaUrl("https://media.yukvix.com/albums/1/webp/a.webp")
    ).toBe(false);
    expect(
      isShareablePublicMediaUrl(
        "https://media.yukvix.com/albums/1/medium/a.webp"
      )
    ).toBe(false);
    const result = selectSocialMedia({
      album: {
        ...album,
        coverUrl: "https://media.yukvix.com/albums/1/original/cover.jpg",
      },
      photos: [
        {
          id: 1,
          originalUrl: "https://media.yukvix.com/albums/1/original/a.jpg",
          thumbUrl: null,
        },
      ],
      capabilities: stubCapabilities("telegram"),
    });
    expect(result.status).toBe("skipped");
  });

  it("rejects signed VIP URLs and ZIP", () => {
    expect(
      isShareablePublicMediaUrl(
        "https://media.yukvix.com/albums/1/webp/a.webp?X-Amz-Signature=abc&X-Amz-Credential=x"
      )
    ).toBe(false);
    expect(
      isShareablePublicMediaUrl("https://media.yukvix.com/vip-zips/album.zip")
    ).toBe(false);
    expect(
      isShareablePublicMediaUrl("https://media.yukvix.com/download-zips/a.zip")
    ).toBe(false);
  });

  it("rejects relative, http, and media-proxy URLs adapters cannot fetch publicly", () => {
    expect(isShareablePublicMediaUrl("/albums/1/thumb/a.webp")).toBe(false);
    expect(
      isShareablePublicMediaUrl("/media-proxy/albums/1/thumb/a.webp")
    ).toBe(false);
    expect(
      isShareablePublicMediaUrl("http://media.yukvix.com/albums/1/thumb/a.webp")
    ).toBe(false);
    expect(
      isShareablePublicMediaUrl("https://media.yukvix.com/albums/1/thumb/a.webp")
    ).toBe(true);
  });

  it("never puts original keys on the snapshot", () => {
    const result = selectSocialMedia({
      album,
      photos: [
        {
          id: 3,
          thumbUrl: "https://media.yukvix.com/albums/1/thumb/ok.webp",
          originalKey: "albums/1/original/secret.jpg",
          webpKey: "albums/1/webp/secret.webp",
        },
      ],
      capabilities: stubCapabilities("telegram"),
    });
    const raw = JSON.stringify(result.items);
    expect(raw).not.toContain("original/secret");
    expect(raw).not.toContain("webp/secret");
  });
});
