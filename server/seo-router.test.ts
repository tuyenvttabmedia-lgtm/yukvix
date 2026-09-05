/**
 * SEO Router Tests
 * Tests for seo.suggestAlbum, seo.suggestCreator, seo.getSettings, seo.updateSettings
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// -- Mock DB -------------------------------------------------------------------
const mockDb = {
  select: vi.fn().mockReturnThis(),
  from: vi.fn().mockReturnThis(),
  where: vi.fn().mockReturnThis(),
  limit: vi.fn().mockResolvedValue([]),
  insert: vi.fn().mockReturnThis(),
  values: vi.fn().mockResolvedValue({ insertId: 1 }),
  update: vi.fn().mockReturnThis(),
  set: vi.fn().mockReturnThis(),
};

vi.mock("./db", () => ({
  getDb: vi.fn().mockResolvedValue(mockDb),
  getAlbumById: vi.fn(),
  getTagsByAlbumId: vi.fn(),
  getCreatorById: vi.fn(),
  getPhotosByAlbumId: vi.fn(),
  listTags: vi.fn(),
  updateAlbum: vi.fn(),
  updateCreator: vi.fn(),
}));

// -- Mock LLM ------------------------------------------------------------------
vi.mock("./_core/llm.js", () => ({
  invokeLLM: vi.fn(),
}));

vi.mock("./services/ai-provider", () => ({
  callAi: vi.fn(),
}));

// -- Mock schema ---------------------------------------------------------------
vi.mock("../drizzle/schema", () => ({
  seoSettings: { id: "id", gtmContainerId: "gtmContainerId", gscVerificationMeta: "gscVerificationMeta" },
}));

// -- Mock drizzle-orm ----------------------------------------------------------
vi.mock("drizzle-orm", () => ({
  eq: vi.fn((col: string, val: unknown) => ({ col, val })),
}));

// -- Mock shared/const ---------------------------------------------------------
vi.mock("@shared/const", () => ({
  isAdmin: (role: string) => role === "admin",
}));

// -- Helpers -------------------------------------------------------------------
function makeCtx(role: "admin" | "user" | "vip" = "admin") {
  return {
    user: { id: 1, openId: "test-open-id", name: "Test User", email: "test@example.com", role },
    req: { headers: { origin: "http://localhost:3000" } },
  } as any;
}

// -- Tests ---------------------------------------------------------------------
describe("SEO Router — suggestAlbum", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    // Reset db mock chain
    mockDb.select.mockReturnThis();
    mockDb.from.mockReturnThis();
    mockDb.where.mockReturnThis();
    mockDb.limit.mockResolvedValue([]);
  });

  it("returns AI-generated SEO fields for an album", async () => {
    const { getAlbumById, getTagsByAlbumId } = await import("./db");
    const { callAi } = await import("./services/ai-provider");

    vi.mocked(getAlbumById).mockResolvedValue({
      id: 1,
      title: "Rem Re:Zero Maid",
      cosplayer: "Sakura",
      character: "Rem",
      series: "Re:Zero",
      isVip: false,
    } as any);

    vi.mocked(getTagsByAlbumId).mockResolvedValue([
      { id: 1, name: "maid", slug: "maid", createdAt: new Date() },
      { id: 2, name: "anime", slug: "anime", createdAt: new Date() },
    ]);

    vi.mocked(callAi).mockResolvedValue({
      content: JSON.stringify({
        focusKeyword: "Rem Re:Zero",
        metaTitle: "Maid Cosplay Rem by Sakura | Yukvix",
        metaDescription: "Photos from Rem Re:Zero Maid by Sakura. View the full set on Yukvix.",
      }),
      model: "test",
    });

    const { seoRouter } = await import("./routers/seo");
    const caller = seoRouter.createCaller(makeCtx("admin"));
    const result = await caller.suggestAlbum({ albumId: 1 });

    expect(result.metaTitle).toContain("Rem Re:Zero Maid");
    expect(result.metaTitle.toLowerCase().indexOf("rem")).toBeLessThan(result.metaTitle.toLowerCase().indexOf("maid"));
    expect(result.metaDescription.length).toBeGreaterThan(50);
    expect(result.focusKeyword.length).toBeGreaterThan(2);
  });

  it("throws NOT_FOUND when album does not exist", async () => {
    const { getAlbumById } = await import("./db");
    vi.mocked(getAlbumById).mockResolvedValue(undefined);

    const { seoRouter } = await import("./routers/seo");
    const caller = seoRouter.createCaller(makeCtx("admin"));

    await expect(caller.suggestAlbum({ albumId: 9999 })).rejects.toThrow("Album not found");
  });

  it("throws FORBIDDEN for non-admin users", async () => {
    const { seoRouter } = await import("./routers/seo");
    const caller = seoRouter.createCaller(makeCtx("user"));

    await expect(caller.suggestAlbum({ albumId: 1 })).rejects.toThrow("FORBIDDEN");
  });

  it("calls LLM with album context including tags", async () => {
    const { getAlbumById, getTagsByAlbumId } = await import("./db");
    const { callAi } = await import("./services/ai-provider");

    vi.mocked(getAlbumById).mockResolvedValue({
      id: 2,
      title: "Asuna SAO",
      cosplayer: "Yuki",
      character: "Asuna",
      series: "Sword Art Online",
      isVip: false,
    } as any);

    vi.mocked(getTagsByAlbumId).mockResolvedValue([
      { id: 3, name: "sword art online", slug: "sword-art-online", createdAt: new Date() },
    ]);

    vi.mocked(callAi).mockResolvedValue({
      content: JSON.stringify({
        focusKeyword: "Asuna SAO",
        metaTitle: "Asuna SAO | Yukvix",
        metaDescription: "Photos from Asuna SAO by Yuki. View the full set on Yukvix.",
      }),
      model: "test",
    });

    const { seoRouter } = await import("./routers/seo");
    const caller = seoRouter.createCaller(makeCtx("admin"));
    await caller.suggestAlbum({ albumId: 2 });

    const callArgs = vi.mocked(callAi).mock.calls[0][0];
    const userMessage = callArgs.messages.find((m: any) => m.role === "user");
    expect(userMessage.content).toContain("Asuna");
    expect(userMessage.content).toContain("sword art online");
  });
});

describe("SEO Router — suggestCreator", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
  });

  it("returns AI-generated SEO fields for a creator", async () => {
    const { getCreatorById } = await import("./db");
    const { callAi } = await import("./services/ai-provider");

    vi.mocked(getCreatorById).mockResolvedValue({
      id: 1,
      name: "Sakura Cosplay",
      bio: "Professional cosplayer from Japan specializing in anime characters",
      country: "Japan",
    } as any);

    vi.mocked(callAi).mockResolvedValue({
      content: JSON.stringify({
        focusKeyword: "Sakura Cosplay",
        metaTitle: "Japanese Anime Cosplayer Sakura | Yukvix",
        metaDescription: "Sakura Cosplay photo gallery from Japan. Browse albums on Yukvix.",
      }),
      model: "test",
    });

    const { seoRouter } = await import("./routers/seo");
    const caller = seoRouter.createCaller(makeCtx("admin"));
    const result = await caller.suggestCreator({ creatorId: 1 });

    expect(result.metaTitle).toBe("Sakura Cosplay | Yukvix");
    expect(result.metaDescription.length).toBeGreaterThan(50);
    expect(result.focusKeyword.toLowerCase()).toContain("sakura");
  });

  it("throws NOT_FOUND when creator does not exist", async () => {
    const { getCreatorById } = await import("./db");
    vi.mocked(getCreatorById).mockResolvedValue(undefined);

    const { seoRouter } = await import("./routers/seo");
    const caller = seoRouter.createCaller(makeCtx("admin"));

    await expect(caller.suggestCreator({ creatorId: 9999 })).rejects.toThrow("Creator not found");
  });

  it("throws FORBIDDEN for non-admin users", async () => {
    const { seoRouter } = await import("./routers/seo");
    const caller = seoRouter.createCaller(makeCtx("user"));

    await expect(caller.suggestCreator({ creatorId: 1 })).rejects.toThrow("FORBIDDEN");
  });

  it("builds LLM prompt with creator name and bio", async () => {
    const { getCreatorById } = await import("./db");
    const { callAi } = await import("./services/ai-provider");

    vi.mocked(getCreatorById).mockResolvedValue({
      id: 3,
      name: "Luna Cosplay",
      bio: "Korean cosplayer known for game characters",
      country: "South Korea",
    } as any);

    vi.mocked(callAi).mockResolvedValue({
      content: JSON.stringify({
        focusKeyword: "Luna Cosplay",
        metaTitle: "Luna Cosplay | Yukvix",
        metaDescription: "Luna Cosplay photo gallery from South Korea. Browse albums on Yukvix.",
      }),
      model: "test",
    });

    const { seoRouter } = await import("./routers/seo");
    const caller = seoRouter.createCaller(makeCtx("admin"));
    await caller.suggestCreator({ creatorId: 3 });

    const callArgs = vi.mocked(callAi).mock.calls[0][0];
    const userMessage = callArgs.messages.find((m: any) => m.role === "user");
    expect(userMessage.content).toContain("Luna Cosplay");
    expect(userMessage.content).toContain("Korean cosplayer");
  });
});

describe("SEO Router — getSettings", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDb.select.mockReturnThis();
    mockDb.from.mockReturnThis();
    mockDb.limit.mockResolvedValue([]);
  });

  it("returns null when no settings exist", async () => {
    mockDb.limit.mockResolvedValue([]);
    const { seoRouter } = await import("./routers/seo");
    const caller = seoRouter.createCaller(makeCtx("admin"));
    const result = await caller.getSettings();
    expect(result).toBeNull();
  });

  it("returns settings row when it exists", async () => {
    mockDb.limit.mockResolvedValue([{ id: 1, gtmContainerId: "GTM-XXXXX", gscVerificationMeta: "abc123" }]);
    const { seoRouter } = await import("./routers/seo");
    const caller = seoRouter.createCaller(makeCtx("admin"));
    const result = await caller.getSettings();
    expect(result?.gtmContainerId).toBe("GTM-XXXXX");
  });
});

describe("SEO Router — suggestTagsFromImages", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDb.select.mockReturnThis();
    mockDb.from.mockReturnThis();
    mockDb.where.mockReturnThis();
    mockDb.limit.mockResolvedValue([]);
  });

  it("returns tag suggestions from vision LLM", async () => {
    const { getAlbumById, getTagsByAlbumId, getPhotosByAlbumId, listTags } = await import("./db");
    const { callAi } = await import("./services/ai-provider");

    vi.mocked(getAlbumById).mockResolvedValue({
      id: 1, title: "Rem Re:Zero Cosplay", cosplayer: "Sakura", character: "Rem",
      series: "Re:Zero", coverUrl: "https://cdn.example.com/cover.jpg",
    } as any);
    vi.mocked(getTagsByAlbumId).mockResolvedValue([{ id: 1, name: "anime", slug: "anime", createdAt: new Date() }]);
    vi.mocked(getPhotosByAlbumId).mockResolvedValue([
      { id: 1, thumbUrl: "https://cdn.example.com/thumb1.jpg", webpUrl: null, originalUrl: null } as any,
      { id: 2, thumbUrl: "https://cdn.example.com/thumb2.jpg", webpUrl: null, originalUrl: null } as any,
    ]);
    vi.mocked(listTags).mockResolvedValue([
      { id: 1, name: "anime", slug: "anime", createdAt: new Date() },
      { id: 2, name: "rem", slug: "rem", createdAt: new Date() },
      { id: 3, name: "re:zero", slug: "re-zero", createdAt: new Date() },
    ]);
    vi.mocked(callAi).mockResolvedValue({
      content: JSON.stringify({
        tags: ["rem", "re:zero", "maid costume", "blue hair", "fantasy"],
        reasoning: "Character Rem from Re:Zero wearing maid costume",
      }),
      model: "test",
    });

    const { seoRouter } = await import("./routers/seo");
    const caller = seoRouter.createCaller(makeCtx("admin"));
    const result = await caller.suggestTagsFromImages({ albumId: 1 });

    expect(result.suggestions.length).toBeGreaterThan(0);
    // "anime" should be filtered out (already existing tag)
    expect(result.suggestions.map((s) => s.name)).not.toContain("anime");
    // "rem" should be marked as existsInDb
    const remTag = result.suggestions.find((s) => s.name === "rem");
    expect(remTag?.existsInDb).toBe(true);
    expect(result.imagesAnalyzed).toBeGreaterThan(0);
    // Verify LLM was called with image_url content
    const llmCall = vi.mocked(callAi).mock.calls[0][0];
    const userMsg = llmCall.messages.find((m: any) => m.role === "user");
    expect(Array.isArray(userMsg.content)).toBe(true);
    const imageContent = (userMsg.content as any[]).find((c: any) => c.type === "image_url");
    expect(imageContent).toBeDefined();
  });

  it("throws NOT_FOUND when album does not exist", async () => {
    const { getAlbumById } = await import("./db");
    vi.mocked(getAlbumById).mockResolvedValue(undefined);
    const { seoRouter } = await import("./routers/seo");
    const caller = seoRouter.createCaller(makeCtx("admin"));
    await expect(caller.suggestTagsFromImages({ albumId: 999 })).rejects.toThrow("Album not found");
  });

  it("throws BAD_REQUEST when album has no images", async () => {
    const { getAlbumById, getTagsByAlbumId, getPhotosByAlbumId, listTags } = await import("./db");
    vi.mocked(getAlbumById).mockResolvedValue({ id: 1, title: "Empty Album", coverUrl: null } as any);
    vi.mocked(getTagsByAlbumId).mockResolvedValue([]);
    vi.mocked(getPhotosByAlbumId).mockResolvedValue([]);
    vi.mocked(listTags).mockResolvedValue([]);
    const { seoRouter } = await import("./routers/seo");
    const caller = seoRouter.createCaller(makeCtx("admin"));
    await expect(caller.suggestTagsFromImages({ albumId: 1 })).rejects.toThrow("Album has no images to analyze");
  });

  it("throws FORBIDDEN for non-admin users", async () => {
    const { seoRouter } = await import("./routers/seo");
    const caller = seoRouter.createCaller(makeCtx("user"));
    await expect(caller.suggestTagsFromImages({ albumId: 1 })).rejects.toThrow("FORBIDDEN");
  });
});

describe("SEO Router — updateSettings", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDb.select.mockReturnThis();
    mockDb.from.mockReturnThis();
    mockDb.where.mockReturnThis();
    mockDb.limit.mockResolvedValue([]);
    mockDb.insert.mockReturnThis();
    mockDb.values.mockResolvedValue({ insertId: 1 });
    mockDb.update.mockReturnThis();
    mockDb.set.mockReturnThis();
  });

  it("inserts new settings when none exist", async () => {
    mockDb.limit.mockResolvedValue([]);
    const { seoRouter } = await import("./routers/seo");
    const caller = seoRouter.createCaller(makeCtx("admin"));
    const result = await caller.updateSettings({ gtmContainerId: "GTM-NEW", gscVerificationMeta: null });
    expect(result.success).toBe(true);
    expect(mockDb.insert).toHaveBeenCalled();
  });

  it("updates existing settings", async () => {
    // For select().from().where().limit() chain in updateSettings
    mockDb.where.mockReturnThis();
    mockDb.limit.mockResolvedValue([{ id: 1 }]);
    // For update().set().where() chain
    mockDb.set.mockReturnThis();
    const { seoRouter } = await import("./routers/seo");
    const caller = seoRouter.createCaller(makeCtx("admin"));
    const result = await caller.updateSettings({ gtmContainerId: "GTM-UPDATED", gscVerificationMeta: "meta123" });
    expect(result.success).toBe(true);
    expect(mockDb.update).toHaveBeenCalled();
  });

  it("throws FORBIDDEN for non-admin users", async () => {
    const { seoRouter } = await import("./routers/seo");
    const caller = seoRouter.createCaller(makeCtx("user"));
    await expect(caller.updateSettings({ gtmContainerId: "GTM-X" })).rejects.toThrow("FORBIDDEN");
  });
});
