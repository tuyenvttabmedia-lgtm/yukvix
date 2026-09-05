import { beforeEach, describe, expect, it, vi } from "vitest";

const updateWhere = vi.fn().mockResolvedValue(undefined);
const mockDb = {
  select: vi.fn().mockReturnThis(),
  from: vi.fn(),
  update: vi.fn().mockReturnThis(),
  set: vi.fn().mockReturnThis(),
  where: updateWhere,
};

vi.mock("../db", () => ({
  getDb: vi.fn(async () => mockDb),
}));

vi.mock("./ai-provider", () => ({
  callAi: vi.fn(),
}));

describe("repairAlbumSeoTitles", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDb.select.mockReturnThis();
    mockDb.update.mockReturnThis();
    mockDb.set.mockReturnThis();
    mockDb.where = updateWhere;
    updateWhere.mockResolvedValue(undefined);
  });

  it("updates scrambled titles and skips titles that already match", async () => {
    const original = "Espacia Korea EXC Vol.003 TSUBAKI SANNOMIYA Photoset";
    mockDb.from.mockResolvedValue([
      {
        id: 1,
        title: original,
        seoTitle: "TSUBAKI SANNOMIYA Cosplay | Yukvix",
        metaTitle: "TSUBAKI SANNOMIYA Cosplay | Yukvix",
      },
      {
        id: 2,
        title: "Short Set",
        seoTitle: "Short Set | Yukvix",
        metaTitle: "Short Set | Yukvix",
      },
    ]);

    const { repairAlbumSeoTitles } = await import("./album-seo");
    const result = await repairAlbumSeoTitles();
    expect(result.total).toBe(2);
    expect(result.updated).toBe(1);
    expect(result.skipped).toBe(1);
    expect(updateWhere).toHaveBeenCalledTimes(1);
  });
});
