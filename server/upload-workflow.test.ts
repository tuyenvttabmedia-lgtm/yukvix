/**
 * Upload Workflow Tests
 * Tests for: presigned URL request, processAfterUpload, setCover,
 * toggleFreePreview, updateSeo, albums.byId
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

// --- Mock DB helpers ----------------------------------------------------------
vi.mock("./db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./db")>();
  return {
    ...actual,
    getAlbumById: vi.fn(),
    getAlbumBySlug: vi.fn(),
    getPhotoById: vi.fn(),
    getPhotosByAlbumId: vi.fn(),
    countPhotosByAlbumId: vi.fn(),
    getTagsByAlbumId: vi.fn(),
    createPhoto: vi.fn(),
    updateAlbum: vi.fn(),
    updateAlbumPhotoCount: vi.fn(),
    setFreePreviewPhotos: vi.fn(),
    deletePhoto: vi.fn(),
    getDb: vi.fn(),
    isBookmarked: vi.fn(),
    incrementAlbumView: vi.fn(),
  };
});

// --- Mock storage-wasabi ------------------------------------------------------
vi.mock("./storage-wasabi", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./storage-wasabi")>();
  return {
    ...actual,
    getPresignedPutUrl: vi.fn(),
    isWasabiConfigured: vi.fn(),
    isImageMimeType: vi.fn(),
    processImage: vi.fn(),
    uploadToStorage: vi.fn(),
    getPublicUrl: vi.fn(),
    getSignedMediaUrl: vi.fn(),
    uploadPhoto: vi.fn(),
    deleteFromStorage: vi.fn(),
  };
});

// --- Context factories --------------------------------------------------------
function makeAdminCtx(): TrpcContext {
  return {
    user: {
      id: 1,
      openId: "admin-001",
      name: "Admin",
      email: "admin@test.com",
      loginMethod: "local",
      role: "admin",
      passwordHash: "hashed",
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
    },
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: vi.fn() } as unknown as TrpcContext["res"],
  };
}

function makeUserCtx(): TrpcContext {
  return {
    user: {
      id: 2,
      openId: "user-001",
      name: "User",
      email: "user@test.com",
      loginMethod: "local",
      role: "user",
      passwordHash: "hashed",
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
    },
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: vi.fn() } as unknown as TrpcContext["res"],
  };
}

// --- Tests --------------------------------------------------------------------

describe("photos.requestPresignedUrl", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns presigned mode when Wasabi is configured", async () => {
    const { getAlbumById } = await import("./db");
    const { isWasabiConfigured, isImageMimeType, getPresignedPutUrl } = await import("./storage-wasabi");

    vi.mocked(getAlbumById).mockResolvedValue({
      id: 1, title: "Test Album", slug: "test-album", status: "published",
      isVip: false, photoCount: 0, freePreviewCount: 3, viewCount: 0,
      description: null, categoryId: null, cosplayer: null, character: null,
      series: null, coverKey: null, coverUrl: null, seoTitle: null,
      seoDescription: null, seoKeywords: null, createdBy: 1,
      createdAt: new Date(), updatedAt: new Date(),
    });
    vi.mocked(isImageMimeType).mockReturnValue(true);
    vi.mocked(isWasabiConfigured).mockReturnValue(true);
    vi.mocked(getPresignedPutUrl).mockResolvedValue("https://wasabi.example.com/presigned-put-url");

    const caller = appRouter.createCaller(makeAdminCtx());
    const result = await caller.photos.requestPresignedUrl({
      albumId: 1,
      fileName: "photo.jpg",
      mimeType: "image/jpeg",
      fileSize: 1024 * 1024,
    });

    expect(result.mode).toBe("presigned");
    expect(result.presignedUrl).toContain("wasabi");
    expect(result.originalKey).toContain("albums/1/original/");
  });

  it("returns server mode when Wasabi is not configured", async () => {
    const { getAlbumById } = await import("./db");
    const { isWasabiConfigured, isImageMimeType } = await import("./storage-wasabi");

    vi.mocked(getAlbumById).mockResolvedValue({
      id: 1, title: "Test Album", slug: "test-album", status: "published",
      isVip: false, photoCount: 0, freePreviewCount: 3, viewCount: 0,
      description: null, categoryId: null, cosplayer: null, character: null,
      series: null, coverKey: null, coverUrl: null, seoTitle: null,
      seoDescription: null, seoKeywords: null, createdBy: 1,
      createdAt: new Date(), updatedAt: new Date(),
    });
    vi.mocked(isImageMimeType).mockReturnValue(true);
    vi.mocked(isWasabiConfigured).mockReturnValue(false);

    const caller = appRouter.createCaller(makeAdminCtx());
    const result = await caller.photos.requestPresignedUrl({
      albumId: 1,
      fileName: "photo.jpg",
      mimeType: "image/jpeg",
      fileSize: 500 * 1024,
    });

    expect(result.mode).toBe("server");
    expect(result.presignedUrl).toBeNull();
  });

  it("rejects non-admin users", async () => {
    const caller = appRouter.createCaller(makeUserCtx());
    await expect(
      caller.photos.requestPresignedUrl({
        albumId: 1,
        fileName: "photo.jpg",
        mimeType: "image/jpeg",
        fileSize: 1024,
      })
    ).rejects.toThrow();
  });

  it("rejects files over 50MB", async () => {
    const { isImageMimeType } = await import("./storage-wasabi");
    vi.mocked(isImageMimeType).mockReturnValue(true);

    const caller = appRouter.createCaller(makeAdminCtx());
    await expect(
      caller.photos.requestPresignedUrl({
        albumId: 1,
        fileName: "huge.jpg",
        mimeType: "image/jpeg",
        fileSize: 60 * 1024 * 1024, // 60MB
      })
    ).rejects.toMatchObject({ message: expect.stringContaining("too large") });
  });

  it("rejects invalid mime types", async () => {
    const { isImageMimeType } = await import("./storage-wasabi");
    vi.mocked(isImageMimeType).mockReturnValue(false);

    const caller = appRouter.createCaller(makeAdminCtx());
    await expect(
      caller.photos.requestPresignedUrl({
        albumId: 1,
        fileName: "doc.pdf",
        mimeType: "application/pdf",
        fileSize: 1024,
      })
    ).rejects.toMatchObject({ message: expect.stringContaining("Invalid image type") });
  });
});

describe("photos.setCover", () => {
  beforeEach(() => vi.clearAllMocks());

  it("sets cover photo for album", async () => {
    const { getPhotoById, updateAlbum } = await import("./db");

    vi.mocked(getPhotoById).mockResolvedValue({
      id: 5, albumId: 1, originalKey: "orig.jpg", originalUrl: "https://example.com/orig.jpg",
      webpKey: "webp.webp", webpUrl: "https://example.com/webp.webp",
      thumbKey: "thumb.webp", thumbUrl: "https://example.com/thumb.webp",
      width: 1920, height: 1080, fileSize: 500000, mimeType: "image/webp",
      sortOrder: 0, isFreePreview: false, createdAt: new Date(),
    });
    vi.mocked(updateAlbum).mockResolvedValue(undefined as any);

    const caller = appRouter.createCaller(makeAdminCtx());
    const result = await caller.photos.setCover({ albumId: 1, photoId: 5 });

    expect(result.success).toBe(true);
    expect(updateAlbum).toHaveBeenCalledWith(1, expect.objectContaining({
      coverKey: "thumb.webp",
      coverUrl: "https://example.com/thumb.webp",
    }));
  });

  it("rejects if photo does not belong to album", async () => {
    const { getPhotoById } = await import("./db");

    vi.mocked(getPhotoById).mockResolvedValue({
      id: 5, albumId: 99, // different album!
      originalKey: "orig.jpg", originalUrl: null,
      webpKey: null, webpUrl: null, thumbKey: null, thumbUrl: null,
      width: null, height: null, fileSize: null, mimeType: null,
      sortOrder: 0, isFreePreview: false, createdAt: new Date(),
    });

    const caller = appRouter.createCaller(makeAdminCtx());
    await expect(
      caller.photos.setCover({ albumId: 1, photoId: 5 })
    ).rejects.toMatchObject({ message: expect.stringContaining("not found in this album") });
  });
});

describe("photos.toggleFreePreview", () => {
  beforeEach(() => vi.clearAllMocks());

  it("toggles free preview status", async () => {
    const { getDb } = await import("./db");
    const mockUpdate = vi.fn().mockReturnValue({ set: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue({}) }) });
    vi.mocked(getDb).mockResolvedValue({ update: mockUpdate } as any);

    const caller = appRouter.createCaller(makeAdminCtx());
    const result = await caller.photos.toggleFreePreview({ photoId: 5, isFreePreview: true });
    expect(result.success).toBe(true);
  });

  it("rejects non-admin users", async () => {
    const caller = appRouter.createCaller(makeUserCtx());
    await expect(
      caller.photos.toggleFreePreview({ photoId: 5, isFreePreview: true })
    ).rejects.toThrow();
  });
});

describe("photos.updateSeo", () => {
  beforeEach(() => vi.clearAllMocks());

  it("saves SEO fields and slug", async () => {
    const { getDb } = await import("./db");
    const { updateAlbum } = await import("./db");

    // Mock DB for slug uniqueness check (no conflict)
    const mockSelect = vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([]), // no conflict
        }),
      }),
    });
    vi.mocked(getDb).mockResolvedValue({ select: mockSelect } as any);
    vi.mocked(updateAlbum).mockResolvedValue(undefined as any);

    const caller = appRouter.createCaller(makeAdminCtx());
    const result = await caller.photos.updateSeo({
      albumId: 1,
      slug: "my-awesome-album",
      seoTitle: "My Awesome Album - Yukvix",
      seoDescription: "Browse stunning cosplay photos",
    });

    expect(result.success).toBe(true);
  });

  it("rejects invalid slug characters", async () => {
    const caller = appRouter.createCaller(makeAdminCtx());
    await expect(
      caller.photos.updateSeo({
        albumId: 1,
        slug: "My Album With Spaces!", // invalid
      })
    ).rejects.toThrow();
  });

  it("rejects non-admin users", async () => {
    const caller = appRouter.createCaller(makeUserCtx());
    await expect(
      caller.photos.updateSeo({ albumId: 1, slug: "valid-slug" })
    ).rejects.toThrow();
  });
});

describe("albums.byId", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns album with tags for admin", async () => {
    const { getAlbumById, getTagsByAlbumId } = await import("./db");

    vi.mocked(getAlbumById).mockResolvedValue({
      id: 1, title: "Test Album", slug: "test-album", status: "published",
      isVip: true, photoCount: 15, freePreviewCount: 3, viewCount: 100,
      description: "A great album", categoryId: 1, cosplayer: "Jane",
      character: "Rem", series: "Re:Zero", coverKey: null, coverUrl: null,
      seoTitle: "Test Album - Yukvix", seoDescription: null,
      seoKeywords: null, createdBy: 1, createdAt: new Date(), updatedAt: new Date(),
    });
    vi.mocked(getTagsByAlbumId).mockResolvedValue([
      { id: 1, name: "anime", slug: "anime", albumCount: 5 },
      { id: 2, name: "fantasy", slug: "fantasy", albumCount: 3 },
    ]);

    const caller = appRouter.createCaller(makeAdminCtx());
    const result = await caller.albums.byId({ id: 1 });

    expect(result.id).toBe(1);
    expect(result.title).toBe("Test Album");
    expect(result.tags).toHaveLength(2);
    expect(result.tags[0].name).toBe("anime");
  });

  it("rejects non-admin users", async () => {
    const caller = appRouter.createCaller(makeUserCtx());
    await expect(caller.albums.byId({ id: 1 })).rejects.toThrow();
  });

  it("throws NOT_FOUND for missing album", async () => {
    const { getAlbumById } = await import("./db");
    vi.mocked(getAlbumById).mockResolvedValue(undefined);

    const caller = appRouter.createCaller(makeAdminCtx());
    await expect(caller.albums.byId({ id: 999 })).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });
});

// --- VIP Protection Tests -----------------------------------------------------

describe("albums.bySlug — VIP protection", () => {
  beforeEach(() => vi.clearAllMocks());

  const mockAlbum = {
    id: 10, title: "VIP Album", slug: "vip-album", status: "published" as const,
    isVip: true, photoCount: 5, freePreviewCount: 2, viewCount: 50,
    description: "Premium content", categoryId: 1, cosplayer: "Jane",
    character: "Rem", series: "Re:Zero", coverKey: null, coverUrl: null,
    seoTitle: null, seoDescription: null, seoKeywords: null, createdBy: 1,
    createdAt: new Date(), updatedAt: new Date(),
  };

  it("does not hydrate photo rows; non-VIP gets locked counts", async () => {
    const {
      getAlbumBySlug,
      getPhotosByAlbumId,
      countPhotosByAlbumId,
      getTagsByAlbumId,
      isBookmarked,
      incrementAlbumView,
    } = await import("./db");

    vi.mocked(getAlbumBySlug).mockResolvedValue(mockAlbum);
    vi.mocked(countPhotosByAlbumId).mockResolvedValue({ total: 5, preview: 2 });
    vi.mocked(getTagsByAlbumId).mockResolvedValue([]);
    vi.mocked(isBookmarked).mockResolvedValue(false);
    vi.mocked(incrementAlbumView).mockResolvedValue(undefined as any);

    const caller = appRouter.createCaller(makeUserCtx());
    const result = await caller.albums.bySlug({ slug: "vip-album" });

    expect(getPhotosByAlbumId).not.toHaveBeenCalled();
    expect(result.photos).toEqual([]);
    expect(result.previewCount).toBe(2);
    expect(result.isVipLocked).toBe(true);
    expect(result.lockedCount).toBe(3);
    expect(result.totalPhotos).toBe(5);
  });

  it("VIP user is not locked and sees full photo total", async () => {
    const { getAlbumBySlug, getPhotosByAlbumId, countPhotosByAlbumId, getTagsByAlbumId, isBookmarked, incrementAlbumView } = await import("./db");

    vi.mocked(getAlbumBySlug).mockResolvedValue(mockAlbum);
    vi.mocked(countPhotosByAlbumId).mockResolvedValue({ total: 5, preview: 2 });
    vi.mocked(getTagsByAlbumId).mockResolvedValue([]);
    vi.mocked(isBookmarked).mockResolvedValue(false);
    vi.mocked(incrementAlbumView).mockResolvedValue(undefined as any);

    const vipCtx: TrpcContext = {
      user: {
        id: 3, openId: "vip-001", name: "VIP User", email: "vip@test.com",
        loginMethod: "local", role: "vip", passwordHash: "hashed",
        createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date(),
      },
      req: { protocol: "https", headers: {} } as TrpcContext["req"],
      res: { clearCookie: vi.fn() } as unknown as TrpcContext["res"],
    };

    const caller = appRouter.createCaller(vipCtx);
    const result = await caller.albums.bySlug({ slug: "vip-album" });

    expect(getPhotosByAlbumId).not.toHaveBeenCalled();
    expect(result.photos).toEqual([]);
    expect(result.isVipLocked).toBe(false);
    expect(result.lockedCount).toBe(0);
    expect(result.totalPhotos).toBe(5);
    expect(result.previewCount).toBe(5);
  });

  it("unauthenticated user is VIP-locked", async () => {
    const { getAlbumBySlug, countPhotosByAlbumId, getTagsByAlbumId, incrementAlbumView } = await import("./db");

    vi.mocked(getAlbumBySlug).mockResolvedValue(mockAlbum);
    vi.mocked(countPhotosByAlbumId).mockResolvedValue({ total: 5, preview: 2 });
    vi.mocked(getTagsByAlbumId).mockResolvedValue([]);
    vi.mocked(incrementAlbumView).mockResolvedValue(undefined as any);

    const anonCtx: TrpcContext = {
      user: null,
      req: { protocol: "https", headers: {} } as TrpcContext["req"],
      res: { clearCookie: vi.fn() } as unknown as TrpcContext["res"],
    };

    const caller = appRouter.createCaller(anonCtx);
    const result = await caller.albums.bySlug({ slug: "vip-album" });

    expect(result.isVipLocked).toBe(true);
    expect(result.lockedCount).toBe(3);
    expect(result.previewCount).toBe(2);
  });
});
