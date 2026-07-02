/**
 * SEO Bulk Generate Tests
 * Tests for seo.startBulkJob, getBulkJobStatus, cancelBulkJob, clearBulkJob
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Mock DB ──────────────────────────────────────────────────────────────────
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
  getTagsByAlbumId: vi.fn().mockResolvedValue([]),
  updateAlbum: vi.fn().mockResolvedValue(undefined),
  updateCreator: vi.fn().mockResolvedValue(undefined),
  listTags: vi.fn().mockResolvedValue([{ id: 1, name: "cosplay", slug: "cosplay" }]),
  upsertTag: vi.fn().mockResolvedValue({ id: 99, name: "new-tag", slug: "new-tag" }),
  setAlbumTags: vi.fn().mockResolvedValue(undefined),
  getPhotosByAlbumId: vi.fn().mockResolvedValue([{ id: 1, webpUrl: "https://example.com/photo.jpg" }]),
}));

// ─── Mock LLM ─────────────────────────────────────────────────────────────────
vi.mock("./_core/llm.js", () => ({
  invokeLLM: vi.fn().mockResolvedValue({
    choices: [{
      message: {
        content: JSON.stringify({
          focusKeyword: "test cosplay",
          metaTitle: "Test Album Cosplay | Yukvix",
          metaDescription: "Browse stunning test cosplay photos on Yukvix.",
        }),
      },
    }],
  }),
}));

// ─── Mock schema ──────────────────────────────────────────────────────────────
vi.mock("../drizzle/schema", () => ({
  albums: { id: "id", title: "title", cosplayer: "cosplayer", character: "character", series: "series", isVip: "isVip", focusKeyword: "focus_keyword", seoTitle: "seoTitle", seoDescription: "seoDescription", categoryId: "categoryId" },
  creators: { id: "id", name: "name", bio: "bio", country: "country", focusKeyword: "focus_keyword", seoTitle: "seoTitle", seoDescription: "seoDescription" },
  albumTags: { albumId: "albumId", tagId: "tagId" },
  seoSettings: { id: "id", gtmContainerId: "gtmContainerId", gscVerificationMeta: "gscVerificationMeta" },
}));

// ─── Mock drizzle-orm ─────────────────────────────────────────────────────────
vi.mock("drizzle-orm", () => ({
  eq: vi.fn((col: string, val: unknown) => ({ col, val })),
  isNull: vi.fn((col: string) => ({ isNull: col })),
  or: vi.fn((...args: unknown[]) => ({ or: args })),
  and: vi.fn((...args: unknown[]) => ({ and: args })),
  inArray: vi.fn((col: string, vals: unknown[]) => ({ inArray: col, vals })),
  count: vi.fn(() => "count"),
  notExists: vi.fn((subq: unknown) => ({ notExists: subq })),
}));

// ─── Mock shared/const ────────────────────────────────────────────────────────
vi.mock("@shared/const", () => ({
  isAdmin: (role: string) => role === "admin",
}));

// ─── Helpers ──────────────────────────────────────────────────────────────────
function makeCtx(role: "admin" | "user" | "vip" = "admin") {
  return {
    user: { id: 1, openId: "test-open-id", name: "Test User", email: "test@example.com", role },
    req: { headers: { origin: "http://localhost:3000" } },
  } as any;
}

// ─── Tests ────────────────────────────────────────────────────────────────────
describe("SEO Bulk Router — startBulkJob", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDb.select.mockReturnThis();
    mockDb.from.mockReturnThis();
    mockDb.where.mockReturnThis();
    mockDb.limit.mockResolvedValue([]);
  });

  it("throws FORBIDDEN for non-admin users", async () => {
    const { seoRouter } = await import("./routers/seo");
    const caller = seoRouter.createCaller(makeCtx("user"));
    await expect(caller.startBulkJob({ type: "albums" })).rejects.toThrow("FORBIDDEN");
  });

  it("returns total=0 message when no albums need SEO", async () => {
    // DB returns empty array (no albums missing SEO)
    mockDb.where.mockResolvedValue([]);
    const { seoRouter } = await import("./routers/seo");
    const caller = seoRouter.createCaller(makeCtx("admin"));
    const result = await caller.startBulkJob({ type: "albums" });
    expect(result.total).toBe(0);
    expect(result.jobId).toBeNull();
    expect(result.message).toContain("already have SEO data");
  });

  it("returns total=0 message when no creators need SEO", async () => {
    mockDb.where.mockResolvedValue([]);
    const { seoRouter } = await import("./routers/seo");
    const caller = seoRouter.createCaller(makeCtx("admin"));
    const result = await caller.startBulkJob({ type: "creators" });
    expect(result.total).toBe(0);
    expect(result.jobId).toBeNull();
  });

  it("starts a job and returns jobId + total when albums need SEO", async () => {
    // DB returns 3 albums missing SEO
    mockDb.where.mockResolvedValue([
      { id: 1, title: "Album 1", cosplayer: "A", character: "B", series: "C", isVip: false },
      { id: 2, title: "Album 2", cosplayer: "D", character: "E", series: "F", isVip: false },
      { id: 3, title: "Album 3", cosplayer: "G", character: null, series: null, isVip: true },
    ]);
    const { seoRouter } = await import("./routers/seo");
    const caller = seoRouter.createCaller(makeCtx("admin"));
    const result = await caller.startBulkJob({ type: "albums" });
    expect(result.total).toBe(3);
    expect(result.jobId).toBeTruthy();
    expect(result.jobId).toContain("bulk-albums");
  });

  it("starts a job for creators", async () => {
    // Clear any previous job to avoid CONFLICT
    const { seoRouter } = await import("./routers/seo");
    const caller = seoRouter.createCaller(makeCtx("admin"));
    await caller.clearBulkJob();

    mockDb.where.mockResolvedValue([
      { id: 1, name: "Creator 1", bio: "Bio 1", country: "Japan" },
      { id: 2, name: "Creator 2", bio: null, country: null },
    ]);
    const result = await caller.startBulkJob({ type: "creators" });
    expect(result.total).toBe(2);
    expect(result.jobId).toContain("bulk-creators");
  });
});

describe("SEO Bulk Router — getBulkJobStatus", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("throws FORBIDDEN for non-admin users", async () => {
    const { seoRouter } = await import("./routers/seo");
    const caller = seoRouter.createCaller(makeCtx("user"));
    await expect(caller.getBulkJobStatus()).rejects.toThrow("FORBIDDEN");
  });

  it("returns null when no job is active", async () => {
    // Clear any active job by calling clearBulkJob first
    const { seoRouter } = await import("./routers/seo");
    const adminCaller = seoRouter.createCaller(makeCtx("admin"));
    await adminCaller.clearBulkJob();

    const result = await adminCaller.getBulkJobStatus();
    expect(result).toBeNull();
  });

  it("returns job status after starting a job", async () => {
    mockDb.where.mockResolvedValue([
      { id: 10, title: "Test Album", cosplayer: "X", character: "Y", series: "Z", isVip: false },
    ]);
    const { seoRouter } = await import("./routers/seo");
    const caller = seoRouter.createCaller(makeCtx("admin"));
    await caller.startBulkJob({ type: "albums" });

    const status = await caller.getBulkJobStatus();
    expect(status).not.toBeNull();
    expect(status!.total).toBe(1);
    expect(status!.type).toBe("albums");
    expect(status!.items).toHaveLength(1);
    expect(status!.items[0].name).toBe("Test Album");
  });
});

describe("SEO Bulk Router — cancelBulkJob", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("throws FORBIDDEN for non-admin users", async () => {
    const { seoRouter } = await import("./routers/seo");
    const caller = seoRouter.createCaller(makeCtx("user"));
    await expect(caller.cancelBulkJob()).rejects.toThrow("FORBIDDEN");
  });

  it("cancels an active job", async () => {
    // Clear any previous job first
    const { seoRouter } = await import("./routers/seo");
    const caller = seoRouter.createCaller(makeCtx("admin"));
    await caller.clearBulkJob();

    // Start a new job
    mockDb.where.mockResolvedValue([
      { id: 5, title: "Album to cancel", cosplayer: "A", character: "B", series: "C", isVip: false },
    ]);
    await caller.startBulkJob({ type: "albums" });

    // Cancel it immediately
    const result = await caller.cancelBulkJob();
    expect(result.success).toBe(true);

    const status = await caller.getBulkJobStatus();
    expect(status?.cancelled).toBe(true);
  });

  it("throws NOT_FOUND when no job is active", async () => {
    const { seoRouter } = await import("./routers/seo");
    const caller = seoRouter.createCaller(makeCtx("admin"));
    // Clear first
    await caller.clearBulkJob();
    await expect(caller.cancelBulkJob()).rejects.toThrow("No active job to cancel.");
  });
});

describe("SEO Bulk Router — clearBulkJob", () => {
  it("throws FORBIDDEN for non-admin users", async () => {
    const { seoRouter } = await import("./routers/seo");
    const caller = seoRouter.createCaller(makeCtx("user"));
    await expect(caller.clearBulkJob()).rejects.toThrow("FORBIDDEN");
  });

  it("clears the active job", async () => {
    mockDb.where.mockResolvedValue([
      { id: 99, title: "Album 99", cosplayer: null, character: null, series: null, isVip: false },
    ]);
    const { seoRouter } = await import("./routers/seo");
    const caller = seoRouter.createCaller(makeCtx("admin"));
    await caller.startBulkJob({ type: "albums" });

    await caller.clearBulkJob();
    const status = await caller.getBulkJobStatus();
    expect(status).toBeNull();
  });
});

describe("SEO Bulk Router — startBulkJob (tags)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDb.select.mockReturnThis();
    mockDb.from.mockReturnThis();
    mockDb.where.mockReturnThis();
    mockDb.limit.mockResolvedValue([]);
  });

  it("throws FORBIDDEN for non-admin users", async () => {
    const { seoRouter } = await import("./routers/seo");
    const caller = seoRouter.createCaller(makeCtx("user"));
    await expect(caller.startBulkJob({ type: "tags" })).rejects.toThrow("FORBIDDEN");
  });

  it("returns zero total when all albums already have tags", async () => {
    // mockDb.where returns empty (no albums without tags)
    mockDb.where.mockResolvedValue([]);
    const { seoRouter } = await import("./routers/seo");
    const caller = seoRouter.createCaller(makeCtx("admin"));
    // clear any existing job
    await caller.clearBulkJob();
    const result = await caller.startBulkJob({ type: "tags" });
    expect(result.total).toBe(0);
    expect(result.message).toContain("already have tags");
  });

  it("starts a tags job for albums without tags", async () => {
    // Clear any existing job first
    const { seoRouter } = await import("./routers/seo");
    const caller = seoRouter.createCaller(makeCtx("admin"));
    await caller.clearBulkJob();

    mockDb.where.mockResolvedValue([
      { id: 10, title: "Untagged Album", cosplayer: "Creator", character: "Char", series: "Series", coverUrl: "https://example.com/cover.jpg" },
    ]);
    const result = await caller.startBulkJob({ type: "tags" });
    expect(result.total).toBe(1);
    expect(result.jobId).toContain("bulk-tags");
  });

  it("getBulkStats returns tags bucket", async () => {
    mockDb.where.mockResolvedValue([]);
    const { seoRouter } = await import("./routers/seo");
    const caller = seoRouter.createCaller(makeCtx("admin"));
    const stats = await caller.getBulkStats();
    expect(stats).toHaveProperty("tags");
    expect(stats.tags).toHaveProperty("total");
    expect(stats.tags).toHaveProperty("missing");
  });
});
