import { describe, it, expect, vi, beforeEach } from "vitest";
import { getWorkerMode } from "./_core/worker-mode";

vi.mock("./storage-wasabi", () => ({
  getSignedMediaUrl: vi.fn().mockResolvedValue("https://signed.example/full.webp"),
  getPublicUrl: (key: string) => `https://cdn.example/${key}`,
  getWasabiBucket: () => "media.yukvix.com",
}));

const photo = {
  id: 1,
  albumId: 10,
  mediumKey: "albums/a/medium/1.webp",
  webpKey: "albums/a/webp/1.webp",
  webpUrl: "https://cdn.example/albums/a/webp/1.webp",
  thumbUrl: "https://cdn.example/albums/a/thumb/1.webp",
  isFreePreview: false,
};

describe("presentPhotoForClient", () => {
  beforeEach(() => vi.clearAllMocks());

  it("signs the 1200px medium for lightbox instead of 4K webp", async () => {
    const { presentPhotoForClient } = await import("./photo-access");
    const { getSignedMediaUrl } = await import("./storage-wasabi");
    const result = await presentPhotoForClient(photo, {
      albumIsVip: false,
      userIsVip: false,
      isAdminUser: false,
    });
    expect(result.displayUrl).toBe("https://signed.example/full.webp");
    expect(result.thumbUrl).toBe(photo.thumbUrl);
    expect(result.originalUrl).toBeUndefined();
    expect(getSignedMediaUrl).toHaveBeenCalledWith(photo.mediumKey, 3600);
    expect(getSignedMediaUrl).not.toHaveBeenCalledWith(photo.webpKey, 3600);
    expect("webpKey" in result).toBe(false);
  });

  it("does not sign locked VIP photos", async () => {
    const { presentPhotoForClient } = await import("./photo-access");
    const { getSignedMediaUrl } = await import("./storage-wasabi");
    const result = await presentPhotoForClient(photo, {
      albumIsVip: true,
      userIsVip: false,
      isAdminUser: false,
    });
    expect(result.isLocked).toBe(true);
    expect(result.displayUrl).toBeNull();
    expect(getSignedMediaUrl).not.toHaveBeenCalled();
  });

  it("unlocks VIP free-preview photos for guests and non-VIP users", async () => {
    const { presentPhotoForClient } = await import("./photo-access");
    const result = await presentPhotoForClient(
      { ...photo, isFreePreview: true },
      { albumIsVip: true, userIsVip: false, isAdminUser: false }
    );
    expect(result.isLocked).toBe(false);
    expect(result.displayUrl).toBe("https://signed.example/full.webp");
    expect(result.thumbUrl).toBe(photo.thumbUrl);
    expect(result.originalUrl).toBeUndefined();
  });

  it("gives VIP viewers a medium lightbox plus a 4K original for zoom", async () => {
    const { presentPhotoForClient } = await import("./photo-access");
    const { getSignedMediaUrl } = await import("./storage-wasabi");
    const result = await presentPhotoForClient(photo, {
      albumIsVip: true,
      userIsVip: true,
      isAdminUser: false,
    });
    expect(result.isLocked).toBe(false);
    expect(getSignedMediaUrl).toHaveBeenCalledWith(photo.mediumKey, 3600);
    expect(getSignedMediaUrl).toHaveBeenCalledWith(photo.webpKey, 3600);
    expect(result.originalUrl).toBe("https://signed.example/full.webp");
  });

  it("derives the 1200px medium key from a library thumb when mediumKey is missing", async () => {
    const { presentPhotoForClient } = await import("./photo-access");
    const { getSignedMediaUrl } = await import("./storage-wasabi");
    const result = await presentPhotoForClient(
      {
        ...photo,
        mediumKey: null,
        thumbKey: "library/thumb/177_Coser-Nnian_thumb.webp",
        thumbUrl: "https://cdn.example/library/thumb/177_Coser-Nnian_thumb.webp",
      },
      { albumIsVip: false, userIsVip: false, isAdminUser: false }
    );
    expect(result.displayUrl).toBe("https://signed.example/full.webp");
    expect(result.thumbUrl).toBe("https://cdn.example/library/thumb/177_Coser-Nnian_thumb.webp");
    expect(getSignedMediaUrl).toHaveBeenCalledWith(
      "library/medium/177_Coser-Nnian_medium.webp",
      3600
    );
    expect(getSignedMediaUrl).not.toHaveBeenCalledWith(photo.webpKey, 3600);
  });

  it("does not put a square thumb in displayUrl when no medium or webp can be signed", async () => {
    const { presentPhotoForClient } = await import("./photo-access");
    const { getSignedMediaUrl } = await import("./storage-wasabi");
    const result = await presentPhotoForClient(
      { ...photo, mediumKey: null, thumbKey: null, webpKey: null },
      { albumIsVip: false, userIsVip: false, isAdminUser: false }
    );
    expect(result.displayUrl).toBeNull();
    expect(getSignedMediaUrl).not.toHaveBeenCalled();
  });
});

describe("resolveFreePreviewCount / pickVisiblePhotosForNonVip", () => {
  it("uses flagged photos when they exist", async () => {
    const { resolveFreePreviewCount, pickVisiblePhotosForNonVip } = await import("./photo-access");
    expect(
      resolveFreePreviewCount({
        albumIsVip: true,
        flaggedPreviewCount: 3,
        freePreviewCount: 10,
        total: 50,
      })
    ).toBe(3);
    const photos = [
      { id: 1, isFreePreview: false },
      { id: 2, isFreePreview: true },
      { id: 3, isFreePreview: false },
    ];
    expect(pickVisiblePhotosForNonVip(photos, 10).map((p) => p.id)).toEqual([2]);
  });

  it("falls back to first N photos when flags were never stored", async () => {
    const { resolveFreePreviewCount, pickVisiblePhotosForNonVip } = await import("./photo-access");
    expect(
      resolveFreePreviewCount({
        albumIsVip: true,
        flaggedPreviewCount: 0,
        freePreviewCount: 10,
        total: 50,
      })
    ).toBe(10);
    const photos = Array.from({ length: 50 }, (_, i) => ({ id: i + 1, isFreePreview: false }));
    expect(pickVisiblePhotosForNonVip(photos, 10).map((p) => p.id)).toEqual(
      [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
    );
  });

  it("returns no previews when freePreviewCount is 0", async () => {
    const { resolveFreePreviewCount, pickVisiblePhotosForNonVip } = await import("./photo-access");
    expect(
      resolveFreePreviewCount({
        albumIsVip: true,
        flaggedPreviewCount: 0,
        freePreviewCount: 0,
        total: 50,
      })
    ).toBe(0);
    const photos = Array.from({ length: 5 }, (_, i) => ({ id: i + 1, isFreePreview: false }));
    expect(pickVisiblePhotosForNonVip(photos, 0)).toEqual([]);
  });

  it("treats guests and logged-in non-VIP the same (no VIP role in picker)", async () => {
    const { pickVisiblePhotosForNonVip } = await import("./photo-access");
    const photos = Array.from({ length: 12 }, (_, i) => ({ id: i + 1, isFreePreview: false }));
    expect(pickVisiblePhotosForNonVip(photos, 10)).toHaveLength(10);
  });
});

describe("getWorkerMode", () => {
  it("parses http and import", () => {
    const prev = process.env.WORKER_MODE;
    process.env.WORKER_MODE = "http";
    expect(getWorkerMode()).toBe("http");
    process.env.WORKER_MODE = "import";
    expect(getWorkerMode()).toBe("import");
    if (prev === undefined) delete process.env.WORKER_MODE;
    else process.env.WORKER_MODE = prev;
  });
});
