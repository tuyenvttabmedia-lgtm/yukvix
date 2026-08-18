import { describe, it, expect, vi, beforeEach } from "vitest";
import { getWorkerMode } from "./_core/worker-mode";

vi.mock("./storage-wasabi", () => ({
  getSignedMediaUrl: vi.fn().mockResolvedValue("https://signed.example/full.webp"),
}));

const photo = {
  id: 1,
  albumId: 10,
  webpKey: "albums/a/webp/1.webp",
  webpUrl: "https://cdn.example/albums/a/webp/1.webp",
  thumbUrl: "https://cdn.example/albums/a/thumb/1.webp",
  isFreePreview: false,
};

describe("presentPhotoForClient", () => {
  beforeEach(() => vi.clearAllMocks());

  it("signs full-size for free albums instead of returning the public CDN URL", async () => {
    const { presentPhotoForClient } = await import("./photo-access");
    const { getSignedMediaUrl } = await import("./storage-wasabi");
    const result = await presentPhotoForClient(photo, {
      albumIsVip: false,
      userIsVip: false,
      isAdminUser: false,
    });
    expect(result.displayUrl).toBe("https://signed.example/full.webp");
    expect(result.thumbUrl).toBe(photo.thumbUrl);
    expect(getSignedMediaUrl).toHaveBeenCalledWith(photo.webpKey, 3600);
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
