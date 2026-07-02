import { describe, expect, it, vi } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

// --- Mock DB ------------------------------------------------------------------
vi.mock("./db", () => ({
  upsertUser: vi.fn(),
  getUserByOpenId: vi.fn(),
  // Albums
  listAlbums: vi.fn().mockResolvedValue({ items: [], total: 0 }),
  getAlbumBySlug: vi.fn().mockResolvedValue(null),
  getAlbumById: vi.fn().mockResolvedValue(null),
  createAlbum: vi.fn().mockResolvedValue({ id: 1, slug: "test-album", title: "Test Album" }),
  updateAlbum: vi.fn().mockResolvedValue({ id: 1, title: "Updated" }),
  deleteAlbum: vi.fn().mockResolvedValue(true),
  listCategories: vi.fn().mockResolvedValue([{ id: 1, name: "Anime", slug: "anime" }]),
  listTags: vi.fn().mockResolvedValue([]),
  upsertTag: vi.fn().mockResolvedValue({ id: 1, name: "test" }),
  setAlbumTags: vi.fn(),
  getTagsByAlbumId: vi.fn().mockResolvedValue([]),
  incrementAlbumView: vi.fn(),
  setFreePreviewPhotos: vi.fn(),
  // Photos
  getPhotosByAlbumId: vi.fn().mockResolvedValue({ items: [], total: 0 }),
  createPhoto: vi.fn().mockResolvedValue({ id: 1 }),
  deletePhoto: vi.fn(),
  // Subscriptions
  getSubscriptionPlans: vi.fn().mockResolvedValue([
    { id: 1, name: "Monthly VIP", price: "9.99", intervalDays: 30, features: JSON.stringify(["Unlimited access"]), isActive: true },
  ]),
  getActiveSubscription: vi.fn().mockResolvedValue(null),
  getUserSubscription: vi.fn().mockResolvedValue(null),
  createSubscription: vi.fn().mockResolvedValue({ id: 1 }),
  activateSubscription: vi.fn(),
  grantVipAccess: vi.fn(),
  listSubscriptions: vi.fn().mockResolvedValue({ items: [], total: 0 }),
  // Users
  listUsers: vi.fn().mockResolvedValue({ items: [], total: 0 }),
  updateUserRole: vi.fn(),
  toggleBookmark: vi.fn().mockResolvedValue({ bookmarked: true }),
  getBookmarksByUser: vi.fn().mockResolvedValue([]),
  isBookmarked: vi.fn().mockResolvedValue(false),
  getBookmarksWithAlbums: vi.fn().mockResolvedValue([]),
  // Analytics
  getAnalytics: vi.fn().mockResolvedValue({
    totalUsers: 100,
    vipUsers: 20,
    totalAlbums: 50,
    publishedAlbums: 45,
    totalPhotos: 1200,
    activeSubscriptions: 18,
    totalViews: 50000,
    topAlbums: [],
    recentUsers: [],
  }),
  // Upload jobs
  createUploadJob: vi.fn().mockResolvedValue({ id: 1 }),
  updateUploadJob: vi.fn(),
}));

// --- Mock Wasabi S3 -----------------------------------------------------------
vi.mock("./storage-wasabi", () => ({
  getSignedMediaUrl: vi.fn().mockResolvedValue("https://cdn.example.com/signed-url"),
  uploadPhoto: vi.fn().mockResolvedValue({ key: "photos/test.webp", url: "/manus-storage/test.webp" }),
  deleteFromStorage: vi.fn(),
  isImageMimeType: vi.fn().mockReturnValue(true),
}));

// --- Context Factories --------------------------------------------------------
function makePublicCtx(): TrpcContext {
  return {
    user: null,
    req: { protocol: "https", headers: {} } as any,
    res: { clearCookie: vi.fn() } as any,
  };
}

function makeUserCtx(role: "user" | "vip" | "admin" = "user"): TrpcContext {
  return {
    user: {
      id: 42,
      openId: "user-42",
      name: "Test User",
      email: "test@example.com",
      loginMethod: "manus",
      role,
      avatarUrl: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
    },
    req: { protocol: "https", headers: {} } as any,
    res: { clearCookie: vi.fn() } as any,
  };
}

// --- Auth Tests ---------------------------------------------------------------
describe("auth", () => {
  it("me returns null for unauthenticated user", async () => {
    const caller = appRouter.createCaller(makePublicCtx());
    const result = await caller.auth.me();
    expect(result).toBeNull();
  });

  it("me returns user for authenticated user", async () => {
    const caller = appRouter.createCaller(makeUserCtx("vip"));
    const result = await caller.auth.me();
    expect(result?.role).toBe("vip");
    expect(result?.id).toBe(42);
  });

  it("logout clears session cookie", async () => {
    const ctx = makeUserCtx();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.auth.logout();
    expect(result.success).toBe(true);
  });
});

// --- Albums Tests -------------------------------------------------------------
describe("albums", () => {
  it("list returns paginated albums for public user", async () => {
    const caller = appRouter.createCaller(makePublicCtx());
    const result = await caller.albums.list({ page: 1, limit: 10, sortBy: "newest" });
    expect(result).toHaveProperty("items");
    expect(result).toHaveProperty("total");
    expect(Array.isArray(result.items)).toBe(true);
  });

  it("categories returns list of categories", async () => {
    const caller = appRouter.createCaller(makePublicCtx());
    const result = await caller.albums.categories();
    expect(Array.isArray(result)).toBe(true);
    expect(result[0]).toHaveProperty("name");
    expect(result[0]).toHaveProperty("slug");
  });

  it("create requires admin role", async () => {
    const caller = appRouter.createCaller(makeUserCtx("user"));
    await expect(
      caller.albums.create({ title: "Test", isVip: false, freePreviewCount: 3, status: "published" })
    ).rejects.toThrow();
  });

  it("create succeeds for admin", async () => {
    const caller = appRouter.createCaller(makeUserCtx("admin"));
    const result = await caller.albums.create({
      title: "New Album",
      isVip: false,
      freePreviewCount: 3,
      status: "published",
    });
    expect(result).toHaveProperty("id");
    expect(result).toHaveProperty("slug");
  });

  it("update requires admin role", async () => {
    const caller = appRouter.createCaller(makeUserCtx("vip"));
    await expect(caller.albums.update({ id: 1, title: "Updated" })).rejects.toThrow();
  });

  it("delete requires admin role", async () => {
    const caller = appRouter.createCaller(makeUserCtx("vip"));
    await expect(caller.albums.delete({ id: 1 })).rejects.toThrow();
  });
});

// --- Subscriptions Tests ------------------------------------------------------
describe("subscriptions", () => {
  it("plans returns available subscription plans", async () => {
    const caller = appRouter.createCaller(makePublicCtx());
    const result = await caller.subscriptions.plans();
    expect(Array.isArray(result)).toBe(true);
    expect(result[0]).toHaveProperty("price");
    expect(result[0]).toHaveProperty("intervalDays");
  });

  it("mySubscription requires authentication", async () => {
    const caller = appRouter.createCaller(makePublicCtx());
    await expect(caller.subscriptions.mySubscription()).rejects.toThrow();
  });

  it("mySubscription returns null for user without subscription", async () => {
    const caller = appRouter.createCaller(makeUserCtx("user"));
    const result = await caller.subscriptions.mySubscription();
    expect(result).toBeNull();
  });

  it("adminList requires admin role", async () => {
    const caller = appRouter.createCaller(makeUserCtx("vip"));
    await expect(caller.subscriptions.adminList({ page: 1, limit: 20 })).rejects.toThrow();
  });

  it("adminList succeeds for admin", async () => {
    const caller = appRouter.createCaller(makeUserCtx("admin"));
    const result = await caller.subscriptions.adminList({ page: 1, limit: 20 });
    expect(result).toHaveProperty("items");
    expect(result).toHaveProperty("total");
  });
});

// --- Users Tests --------------------------------------------------------------
describe("users", () => {
  it("myBookmarks requires authentication", async () => {
    const caller = appRouter.createCaller(makePublicCtx());
    await expect(caller.users.myBookmarks()).rejects.toThrow();
  });

  it("myBookmarks returns empty array for new user", async () => {
    const caller = appRouter.createCaller(makeUserCtx("user"));
    const result = await caller.users.myBookmarks();
    expect(Array.isArray(result)).toBe(true);
  });

  it("toggleBookmark requires authentication", async () => {
    const caller = appRouter.createCaller(makePublicCtx());
    await expect(caller.users.toggleBookmark({ albumId: 1 })).rejects.toThrow();
  });

  it("toggleBookmark works for authenticated user", async () => {
    const caller = appRouter.createCaller(makeUserCtx("user"));
    const result = await caller.users.toggleBookmark({ albumId: 1 });
    expect(result).toHaveProperty("bookmarked");
    expect(typeof result.bookmarked).toBe("boolean");
  });

  it("adminList requires admin role", async () => {
    const caller = appRouter.createCaller(makeUserCtx("user"));
    await expect(caller.users.adminList({ page: 1, limit: 20 })).rejects.toThrow();
  });

  it("setRole requires admin role", async () => {
    const caller = appRouter.createCaller(makeUserCtx("vip"));
    await expect(caller.users.setRole({ userId: 1, role: "vip" })).rejects.toThrow();
  });

  it("adminList succeeds for admin", async () => {
    const caller = appRouter.createCaller(makeUserCtx("admin"));
    const result = await caller.users.adminList({ page: 1, limit: 20 });
    expect(result).toHaveProperty("items");
    expect(result).toHaveProperty("total");
  });
});

// --- Analytics Tests ----------------------------------------------------------
describe("analytics", () => {
  it("overview requires admin role", async () => {
    const caller = appRouter.createCaller(makeUserCtx("user"));
    await expect(caller.analytics.overview()).rejects.toThrow();
  });

  it("overview requires admin role (vip blocked)", async () => {
    const caller = appRouter.createCaller(makeUserCtx("vip"));
    await expect(caller.analytics.overview()).rejects.toThrow();
  });

  it("overview returns stats for admin", async () => {
    const caller = appRouter.createCaller(makeUserCtx("admin"));
    const result = await caller.analytics.overview();
    expect(result).toHaveProperty("totalUsers");
    expect(result).toHaveProperty("totalAlbums");
    expect(result).toHaveProperty("vipUsers");
    expect(result).toHaveProperty("totalViews");
    expect(typeof result?.totalUsers).toBe("number");
  });
});
