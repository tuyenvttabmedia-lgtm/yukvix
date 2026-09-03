/**
 * CMS Router Tests
 * Tests for site settings, menus, static pages, and category management.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// -- Mock DB -------------------------------------------------------------------
const mockRows: Record<string, any[]> = {
  site_settings: [],
  menus: [],
  menu_items: [],
  static_pages: [],
  categories: [],
};

const mockDb = {
  select: vi.fn().mockReturnThis(),
  from: vi.fn().mockReturnThis(),
  where: vi.fn().mockReturnThis(),
  orderBy: vi.fn().mockImplementation(function (this: any) { return this; }),
  insert: vi.fn().mockReturnThis(),
  values: vi.fn().mockResolvedValue({ insertId: 99 }),
  update: vi.fn().mockReturnThis(),
  set: vi.fn().mockReturnThis(),
  delete: vi.fn().mockReturnThis(),
};

vi.mock("../server/db", () => ({
  getDb: vi.fn().mockResolvedValue(mockDb),
}));

vi.mock("../server/storage-wasabi", () => ({
  getPresignedPutUrl: vi.fn().mockResolvedValue("https://wasabi.example.com/presigned-put"),
  getSignedMediaUrl: vi.fn().mockResolvedValue("https://wasabi.example.com/signed"),
  getPublicUrl: vi.fn().mockReturnValue("https://wasabi.example.com/public"),
  isWasabiConfigured: vi.fn().mockReturnValue(true),
  uploadToStorage: vi.fn().mockResolvedValue({ key: "cms/logos/testnanoid12.png", url: "/api/cms-media/cms/logos/testnanoid12.png" }),
}));

vi.mock("nanoid", () => ({ nanoid: () => "testnanoid12" }));

// -- Helpers -------------------------------------------------------------------
function makeCtx(role: "admin" | "user" | "vip" = "admin") {
  return {
    user: { id: 1, openId: "test-open-id", name: "Test User", email: "test@example.com", role },
    req: { headers: { origin: "http://localhost:3000" } },
  } as any;
}

// -- Tests ---------------------------------------------------------------------
describe("CMS Router — site settings", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: getSettings returns empty array
    mockDb.where.mockResolvedValue([]);
  });

  it("getPublicSettings returns key-value map", async () => {
    mockDb.from.mockResolvedValueOnce([
      { key: "logo_url", value: "https://example.com/logo.png" },
      { key: "site_name", value: "Yukvix" },
    ]);
    const { cmsRouter } = await import("../server/routers/cms");
    const caller = cmsRouter.createCaller(makeCtx("user") as any);
    const result = await caller.getPublicSettings();
    expect(result).toMatchObject({
      logo_url: "https://example.com/logo.png",
      site_name: "Yukvix",
    });
  });

  it("getSettings requires admin role", async () => {
    const { cmsRouter } = await import("../server/routers/cms");
    const caller = cmsRouter.createCaller(makeCtx("user") as any);
    await expect(caller.getSettings()).rejects.toThrow();
  });

  it("updateSettings upserts multiple keys", async () => {
    mockDb.where.mockResolvedValue([]); // simulate no existing row → insert path
    const { cmsRouter } = await import("../server/routers/cms");
    const caller = cmsRouter.createCaller(makeCtx("admin") as any);
    const result = await caller.updateSettings({
      settings: { site_name: "NewName", footer_text: "© 2026" },
    });
    expect(result.success).toBe(true);
  });

  it("updateSettings updates existing key", async () => {
    mockDb.where.mockResolvedValue([{ id: 1, key: "site_name", value: "OldName" }]);
    const { cmsRouter } = await import("../server/routers/cms");
    const caller = cmsRouter.createCaller(makeCtx("admin") as any);
    const result = await caller.updateSettings({ settings: { site_name: "Updated" } });
    expect(result.success).toBe(true);
  });
});

describe("CMS Router — presigned upload", () => {
  it("presignedUpload returns uploadUrl, key, publicUrl", async () => {
    const { cmsRouter } = await import("../server/routers/cms");
    const caller = cmsRouter.createCaller(makeCtx("admin") as any);
    const result = await caller.presignedUpload({
      filename: "logo.png",
      contentType: "image/png",
      folder: "cms/logos",
    });
    expect(result.uploadUrl).toBeTruthy();
    expect(result.key).toMatch(/^cms\/logos\//);
    expect(result.publicUrl).toBe("/api/cms-media/cms/logos/testnanoid12.png");
  });

  it("uploadAsset stores the file and returns a proxy URL", async () => {
    const { cmsRouter } = await import("../server/routers/cms");
    const caller = cmsRouter.createCaller(makeCtx("admin") as any);
    const result = await caller.uploadAsset({
      filename: "logo.png",
      contentType: "image/png",
      folder: "cms/logos",
      fileBase64: Buffer.from("fake-png").toString("base64"),
    });
    expect(result.key).toMatch(/^cms\/logos\//);
    expect(result.publicUrl).toBe("/api/cms-media/cms/logos/testnanoid12.png");
  });

  it("uploadAsset rejects non-image filenames", async () => {
    const { cmsRouter } = await import("../server/routers/cms");
    const caller = cmsRouter.createCaller(makeCtx("admin") as any);
    await expect(
      caller.uploadAsset({
        filename: "notes.txt",
        folder: "cms/logos",
        fileBase64: Buffer.from("x").toString("base64"),
      })
    ).rejects.toThrow();
  });

  it("presignedUpload rejects non-admin", async () => {
    const { cmsRouter } = await import("../server/routers/cms");
    const caller = cmsRouter.createCaller(makeCtx("user") as any);
    await expect(
      caller.presignedUpload({ filename: "logo.png", contentType: "image/png", folder: "cms" })
    ).rejects.toThrow();
  });
});

describe("CMS Router — static pages", () => {
  beforeEach(() => vi.clearAllMocks());

  it("getPublicPage returns published page", async () => {
    mockDb.where.mockResolvedValueOnce([
      { id: 1, slug: "about", title: "About Us", content: "<p>Hello</p>", status: "published" },
    ]);
    const { cmsRouter } = await import("../server/routers/cms");
    const caller = cmsRouter.createCaller(makeCtx("user") as any);
    const page = await caller.getPublicPage({ slug: "about" });
    expect(page.title).toBe("About Us");
  });

  it("getPublicPage throws NOT_FOUND for draft page", async () => {
    mockDb.where.mockResolvedValueOnce([
      { id: 2, slug: "draft-page", title: "Draft", content: "", status: "draft" },
    ]);
    const { cmsRouter } = await import("../server/routers/cms");
    const caller = cmsRouter.createCaller(makeCtx("user") as any);
    await expect(caller.getPublicPage({ slug: "draft-page" })).rejects.toThrow("Page not found");
  });

  it("getPublicPage throws NOT_FOUND for missing page", async () => {
    mockDb.where.mockResolvedValueOnce([]);
    const { cmsRouter } = await import("../server/routers/cms");
    const caller = cmsRouter.createCaller(makeCtx("user") as any);
    await expect(caller.getPublicPage({ slug: "nonexistent" })).rejects.toThrow();
  });

  it("listPages requires admin", async () => {
    const { cmsRouter } = await import("../server/routers/cms");
    const caller = cmsRouter.createCaller(makeCtx("vip") as any);
    await expect(caller.listPages()).rejects.toThrow();
  });

  it("savePage creates new page", async () => {
    mockDb.where.mockResolvedValueOnce([]); // no existing
    const { cmsRouter } = await import("../server/routers/cms");
    const caller = cmsRouter.createCaller(makeCtx("admin") as any);
    const result = await caller.savePage({
      slug: "new-page",
      title: "New Page",
      content: "<p>Content</p>",
      status: "published",
    });
    expect(result.success).toBe(true);
  });

  it("savePage updates existing page", async () => {
    mockDb.where.mockResolvedValueOnce([{ id: 5 }]); // existing
    const { cmsRouter } = await import("../server/routers/cms");
    const caller = cmsRouter.createCaller(makeCtx("admin") as any);
    const result = await caller.savePage({
      slug: "about",
      title: "About Updated",
      content: "<p>Updated</p>",
      status: "published",
    });
    expect(result.success).toBe(true);
  });
});

describe("CMS Router — menus", () => {
  beforeEach(() => vi.clearAllMocks());

  it("getPublicMenu returns items for a location", async () => {
    // First where() call returns the menu row
    mockDb.where.mockResolvedValueOnce([{ id: 1, location: "footer", label: "Footer Navigation" }]);
    // Second chain: where().orderBy() — need orderBy to resolve
    const mockOrderBy = vi.fn().mockResolvedValue([
      { id: 1, menuId: 1, label: "About", url: "/about", sortOrder: 1 },
      { id: 2, menuId: 1, label: "Privacy", url: "/privacy", sortOrder: 2 },
    ]);
    mockDb.where.mockReturnValueOnce({ orderBy: mockOrderBy });
    const { cmsRouter } = await import("../server/routers/cms");
    const caller = cmsRouter.createCaller(makeCtx("user") as any);
    const result = await caller.getPublicMenu({ location: "footer" });
    expect(result.items).toHaveLength(2);
    expect(result.items[0].label).toBe("About");
  });

  it("getPublicMenu returns empty items if no menu exists", async () => {
    mockDb.where.mockResolvedValueOnce([]);
    const { cmsRouter } = await import("../server/routers/cms");
    const caller = cmsRouter.createCaller(makeCtx("user") as any);
    const result = await caller.getPublicMenu({ location: "main" });
    expect(result.items).toHaveLength(0);
  });

  it("saveMenu requires admin", async () => {
    const { cmsRouter } = await import("../server/routers/cms");
    const caller = cmsRouter.createCaller(makeCtx("user") as any);
    await expect(
      caller.saveMenu({ location: "main", items: [{ label: "Home", url: "/", target: "_self", sortOrder: 0 }] })
    ).rejects.toThrow();
  });

  it("saveMenu replaces menu items", async () => {
    mockDb.where.mockResolvedValueOnce([{ id: 1, location: "main" }]);
    const { cmsRouter } = await import("../server/routers/cms");
    const caller = cmsRouter.createCaller(makeCtx("admin") as any);
    const result = await caller.saveMenu({
      location: "main",
      items: [
        { label: "Gallery", url: "/gallery", target: "_self", sortOrder: 0 },
        { label: "VIP", url: "/vip", target: "_self", sortOrder: 1 },
      ],
    });
    expect(result.success).toBe(true);
  });
});

describe("CMS Router — categories", () => {
  beforeEach(() => vi.clearAllMocks());

  it("listCategories requires admin", async () => {
    const { cmsRouter } = await import("../server/routers/cms");
    const caller = cmsRouter.createCaller(makeCtx("user") as any);
    await expect(caller.listCategories()).rejects.toThrow();
  });

  it("saveCategory creates new category", async () => {
    mockDb.values.mockResolvedValueOnce({ insertId: 42 });
    const { cmsRouter } = await import("../server/routers/cms");
    const caller = cmsRouter.createCaller(makeCtx("admin") as any);
    const result = await caller.saveCategory({
      name: "Anime",
      slug: "anime",
      seoTitle: "Anime Cosplay Gallery",
      sortOrder: 1,
    });
    expect(result.id).toBeDefined();
  });

  it("saveCategory updates existing category", async () => {
    const { cmsRouter } = await import("../server/routers/cms");
    const caller = cmsRouter.createCaller(makeCtx("admin") as any);
    const result = await caller.saveCategory({
      id: 1,
      name: "Anime Updated",
      slug: "anime",
      sortOrder: 0,
    });
    expect(result.id).toBe(1);
  });

  it("deleteCategory requires admin", async () => {
    const { cmsRouter } = await import("../server/routers/cms");
    const caller = cmsRouter.createCaller(makeCtx("vip") as any);
    await expect(caller.deleteCategory({ id: 1 })).rejects.toThrow();
  });
});
