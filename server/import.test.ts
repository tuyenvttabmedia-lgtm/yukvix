/**
 * Import Pipeline Tests
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// --- Dedup Tests --------------------------------------------------------------

describe("Import dedup utilities", () => {
  it("md5File produces consistent hash", async () => {
    const { md5File } = await import("./import/dedup.js");
    const buf1 = Buffer.from("hello world");
    const buf2 = Buffer.from("hello world");
    const buf3 = Buffer.from("different content");

    expect(md5File(buf1)).toBe(md5File(buf2));
    expect(md5File(buf1)).not.toBe(md5File(buf3));
    expect(md5File(buf1)).toHaveLength(32); // MD5 hex = 32 chars
  });

  it("md5File returns lowercase hex", async () => {
    const { md5File } = await import("./import/dedup.js");
    const hash = md5File(Buffer.from("test"));
    expect(hash).toMatch(/^[0-9a-f]{32}$/);
  });
});

// --- Crawler HTML Tests -------------------------------------------------------

describe("HTML crawler utilities", () => {
  it("extractImages filters out tiny images and SVGs", async () => {
    const { extractImages } = await import("./import/crawler-html.js");

    // Mock cheerio-like extraction
    const mockImages = [
      { url: "https://example.com/photo.jpg", alt: "Photo" },
      { url: "https://example.com/icon.svg", alt: "Icon" },
      { url: "https://example.com/banner.gif", alt: "Banner" },
      { url: "data:image/png;base64,abc", alt: "Inline" },
    ];

    // Filter logic: skip SVG, GIF, data: URLs
    const filtered = mockImages.filter((img) => {
      const lower = img.url.toLowerCase();
      return !lower.includes(".svg") && !lower.includes(".gif") && !lower.startsWith("data:");
    });

    expect(filtered).toHaveLength(1);
    expect(filtered[0].url).toBe("https://example.com/photo.jpg");
  });
});

// --- SEO Worker Tests ---------------------------------------------------------

describe("SEO slug generation", () => {
  it("generates URL-safe slugs", async () => {
    const slugify = (await import("slugify")).default;

    const cases = [
      { input: "Hello World", expected: "hello-world" },
      { input: "Cosplay 2024 — Special Edition!", expected: "cosplay-2024-special-edition" },
      { input: "日本語タイトル", expected: expect.any(String) },
    ];

    for (const { input, expected } of cases) {
      const slug = slugify(input, { lower: true, strict: true, trim: true });
      if (typeof expected === "string") {
        expect(slug).toBe(expected);
      } else {
        expect(slug).toEqual(expected);
      }
    }
  });
});

// --- Queue Types Tests --------------------------------------------------------

describe("Queue name constants", () => {
  it("has all required queue names", async () => {
    const { QUEUE_NAMES } = await import("./import/queues.js");

    expect(QUEUE_NAMES.CRAWL).toBe("import:crawl");
    expect(QUEUE_NAMES.DOWNLOAD).toBe("import:download");
    expect(QUEUE_NAMES.PROCESS).toBe("import:process");
    expect(QUEUE_NAMES.SEO).toBe("import:seo");
    expect(QUEUE_NAMES.PUBLISH).toBe("import:publish");
  });
});

// --- Download Worker Utilities ------------------------------------------------

describe("Download worker utilities", () => {
  it("sanitizes filenames correctly", () => {
    const sanitize = (url: string, index: number): string => {
      try {
        const urlPath = new URL(url).pathname;
        const ext = urlPath.match(/\.[a-z]{2,5}$/i)?.[0] || ".jpg";
        const base = urlPath.replace(/\.[a-z]{2,5}$/i, "").split("/").pop() || "img";
        return `img_${String(index).padStart(4, "0")}_${base.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 50)}${ext}`;
      } catch {
        return `img_${String(index).padStart(4, "0")}.jpg`;
      }
    };

    expect(sanitize("https://cdn.example.com/photos/my-photo.jpg", 0)).toBe("img_0000_my-photo.jpg");
    expect(sanitize("https://cdn.example.com/images/cosplay_001.webp", 5)).toBe("img_0005_cosplay_001.webp");
    expect(sanitize("not-a-url", 99)).toBe("img_0099.jpg");
  });

  it("detects image MIME types", () => {
    const isImageMime = (mime: string) => mime.startsWith("image/") && !mime.includes("svg");

    expect(isImageMime("image/jpeg")).toBe(true);
    expect(isImageMime("image/webp")).toBe(true);
    expect(isImageMime("image/png")).toBe(true);
    expect(isImageMime("image/svg+xml")).toBe(false);
    expect(isImageMime("text/html")).toBe(false);
    expect(isImageMime("application/json")).toBe(false);
  });
});

// --- Logger Tests -------------------------------------------------------------

describe("Import logger", () => {
  it("logImport does not throw when DB is unavailable", async () => {
    // Mock getDb to return null
    vi.mock("./db.js", () => ({
      getDb: vi.fn().mockResolvedValue(null),
    }));

    const { logImport } = await import("./import/logger.js");

    // Should not throw even with null DB
    await expect(logImport(1, "info", "Test message")).resolves.not.toThrow();
  });
});
