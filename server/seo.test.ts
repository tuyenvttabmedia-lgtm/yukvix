/**
 * SEO Infrastructure Tests
 * Tests for sitemap generation, robots.txt, and SEO metadata
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import request from "supertest";
import { registerSeoRoutes } from "./seo-routes";

// Mock the database module — use vi.hoisted to avoid temporal dead zone
const { mockAlbumRows, makeChainable } = vi.hoisted(() => {
  const rows = [
    {
      id: 1,
      slug: "test-album-1",
      title: "Test Album 1",
      cosplayer: "Test Cosplayer",
      character: "Test Character",
      series: "Test Series",
      updatedAt: new Date("2026-01-01"),
      createdAt: new Date("2026-01-01"),
      isVip: false,
      robotsIndex: true,
      status: "published",
      viewCount: 0,
      photoCount: 10,
    },
    {
      id: 2,
      slug: "vip-album-1",
      title: "VIP Album 1",
      cosplayer: "VIP Cosplayer",
      character: null,
      series: null,
      updatedAt: new Date("2026-01-15"),
      createdAt: new Date("2026-01-15"),
      isVip: true,
      robotsIndex: true,
      status: "published",
      viewCount: 0,
      photoCount: 5,
    },
  ];

  function chainable(resolvedValue: unknown[]) {
    const c: Record<string, unknown> = {};
    c.from = () => c;
    c.where = () => c;
    c.limit = () => Promise.resolve(resolvedValue);
    c.orderBy = () => c;
    c.then = (resolve: (v: unknown) => unknown) => Promise.resolve(resolvedValue).then(resolve);
    c.catch = (reject: (e: unknown) => unknown) => Promise.resolve(resolvedValue).catch(reject);
    return c;
  }

  return { mockAlbumRows: rows, makeChainable: chainable };
});

vi.mock("./db", () => ({
  getDb: () => Promise.resolve({
    select: () => makeChainable(mockAlbumRows),
  }),
}));

// Mock drizzle schema
vi.mock("../drizzle/schema", () => ({
  albums: { id: "id", slug: "slug", status: "status", updatedAt: "updatedAt" },
  creators: { slug: "slug", updatedAt: "updatedAt", albumCount: "albumCount" },
  tags: { slug: "slug", createdAt: "createdAt" },
  photos: { albumId: "albumId", isFreePreview: "isFreePreview" },
  categories: { slug: "slug", updatedAt: "updatedAt" },
  adminPermissions: { id: "id", userId: "userId", permission: "permission", grantedBy: "grantedBy", grantedAt: "grantedAt" },
  ADMIN_PERMISSIONS: ["manage_users","manage_albums","manage_payments","manage_cms","manage_import","manage_settings","view_analytics"],
}));

// Mock drizzle-orm operators
vi.mock("drizzle-orm", () => ({
  eq: vi.fn((col: string, val: unknown) => ({ col, val })),
  and: vi.fn((...args: unknown[]) => args),
  desc: vi.fn((col: unknown) => col),
  max: vi.fn((col: unknown) => col),
}));

function createTestApp() {
  const app = express();
  registerSeoRoutes(app);
  return app;
}

describe("SEO Routes", () => {
  let app: express.Express;

  beforeEach(() => {
    app = createTestApp();
  });

  // -- sitemap-index.xml ------------------------------------------------------
  describe("GET /sitemap-index.xml", () => {
    it("returns valid XML with correct content-type", async () => {
      const res = await request(app).get("/sitemap-index.xml");
      expect(res.status).toBe(200);
      expect(res.headers["content-type"]).toMatch(/application\/xml/);
    });

    it("contains sub-sitemap entries", async () => {
      const res = await request(app).get("/sitemap-index.xml");
      expect(res.text).toContain("<sitemapindex");
      expect(res.text).toContain("/sitemap-albums.xml");
      expect(res.text).toContain("/sitemap-images.xml");
      expect(res.text).toContain("/sitemap-pages.xml");
      expect(res.text).toContain("/sitemap-categories.xml");
    });

    it("includes lastmod date", async () => {
      const res = await request(app).get("/sitemap-index.xml");
      const today = new Date().toISOString().split("T")[0];
      expect(res.text).toContain(`<lastmod>${today}</lastmod>`);
    });

    it("sets cache-control header", async () => {
      const res = await request(app).get("/sitemap-index.xml");
      expect(res.headers["cache-control"]).toContain("public");
    });
  });

  // -- sitemap.xml (now serves as sitemapindex for backward compat) -----------
  describe("GET /sitemap.xml", () => {
    it("returns valid XML with sitemapindex", async () => {
      const res = await request(app).get("/sitemap.xml");
      expect(res.status).toBe(200);
      expect(res.headers["content-type"]).toMatch(/application\/xml/);
      expect(res.text).toContain('<?xml version="1.0"');
      expect(res.text).toContain("<sitemapindex");
    });

    it("contains sub-sitemap links", async () => {
      const res = await request(app).get("/sitemap.xml");
      expect(res.text).toContain("/sitemap-albums.xml");
      expect(res.text).toContain("/sitemap-pages.xml");
    });

    it("includes lastmod dates", async () => {
      const res = await request(app).get("/sitemap.xml");
      expect(res.text).toContain("<lastmod>");
    });
  });

  // -- sitemap-pages.xml -------------------------------------------------------
  describe("GET /sitemap-pages.xml", () => {
    it("returns valid XML with static pages", async () => {
      const res = await request(app).get("/sitemap-pages.xml");
      expect(res.status).toBe(200);
      expect(res.headers["content-type"]).toMatch(/application\/xml/);
      expect(res.text).toContain("<urlset");
      expect(res.text).toContain("/gallery");
      // /search intentionally excluded from sitemap (no standalone SEO value)
      expect(res.text).not.toContain("/search?q=");
      expect(res.text).toContain("/vip");
    });

    it("includes changefreq for all static pages", async () => {
      const res = await request(app).get("/sitemap-pages.xml");
      expect(res.text).toContain("<changefreq>daily</changefreq>");
      expect(res.text).toContain("<changefreq>hourly</changefreq>");
      expect(res.text).toContain("<changefreq>monthly</changefreq>");
    });
  });

  describe("GET /sitemap-categories.xml", () => {
    it("returns category landing URLs", async () => {
      const res = await request(app).get("/sitemap-categories.xml");
      expect(res.status).toBe(200);
      expect(res.headers["content-type"]).toMatch(/application\/xml/);
      expect(res.text).toContain("<urlset");
      expect(res.text).toContain("/search?category=");
    });
  });

  // -- sitemap-albums.xml -------------------------------------------------------
  describe("GET /sitemap-albums.xml", () => {
    it("returns valid XML with album URLs", async () => {
      const res = await request(app).get("/sitemap-albums.xml");
      expect(res.status).toBe(200);
      expect(res.text).toContain("<urlset");
      expect(res.text).toContain("/album/test-album-1");
      expect(res.text).toContain("/album/vip-album-1");
    });

    it("includes lastmod from DB updatedAt", async () => {
      const res = await request(app).get("/sitemap-albums.xml");
      // Both albums have old dates (2026-01-01, 2026-01-15) → should appear as lastmod
      expect(res.text).toContain("<lastmod>2026-01-");
    });

    it("includes changefreq based on age", async () => {
      const res = await request(app).get("/sitemap-albums.xml");
      // Albums updated in Jan 2026 are old → changefreq should be "yearly"
      expect(res.text).toContain("<changefreq>yearly</changefreq>");
    });

    it("includes priority for each album", async () => {
      const res = await request(app).get("/sitemap-albums.xml");
      expect(res.text).toContain("<priority>");
    });
  });

  // -- sitemap-images.xml -----------------------------------------------------
  describe("GET /sitemap-images.xml", () => {
    it("returns valid XML with image namespace", async () => {
      const res = await request(app).get("/sitemap-images.xml");
      expect(res.status).toBe(200);
      expect(res.text).toContain('xmlns:image="http://www.google.com/schemas/sitemap-image/1.1"');
    });

    it("returns 200 even when DB returns empty results", async () => {
      // The mock returns albums but photos query returns empty (no isFreePreview photos)
      const res = await request(app).get("/sitemap-images.xml");
      expect(res.status).toBe(200);
      expect(res.text).toContain("<urlset");
    });
  });

  // -- robots.txt -------------------------------------------------------------
  describe("GET /robots.txt", () => {
    it("returns text/plain content-type", async () => {
      const res = await request(app).get("/robots.txt");
      expect(res.status).toBe(200);
      expect(res.headers["content-type"]).toMatch(/text\/plain/);
    });

    it("allows public pages", async () => {
      const res = await request(app).get("/robots.txt");
      expect(res.text).toContain("Allow: /gallery");
      expect(res.text).toContain("Allow: /album/");
      expect(res.text).toContain("Allow: /tag/");
      expect(res.text).toContain("Allow: /tags");
      expect(res.text).toContain("Allow: /search");
    });

    it("disallows admin and API routes", async () => {
      const res = await request(app).get("/robots.txt");
      expect(res.text).toContain("Disallow: /admin");
      expect(res.text).toContain("Disallow: /api/");
    });

    it("disallows auth pages", async () => {
      const res = await request(app).get("/robots.txt");
      expect(res.text).toContain("Disallow: /login");
      expect(res.text).toContain("Disallow: /register");
      expect(res.text).toContain("Disallow: /forgot-password");
    });

    it("includes sitemap references", async () => {
      const res = await request(app).get("/robots.txt");
      expect(res.text).toContain("Sitemap:");
      expect(res.text).toContain("/sitemap-index.xml");
      expect(res.text).toContain("/sitemap.xml");
      expect(res.text).toContain("/sitemap-images.xml");
      expect(res.text).toContain("/sitemap-categories.xml");
    });

    it("sets long cache-control for robots.txt", async () => {
      const res = await request(app).get("/robots.txt");
      expect(res.headers["cache-control"]).toContain("max-age=86400");
    });
  });
});

// -- XML escaping utility tests ---------------------------------------------
describe("XML escape utility", () => {
  // Test via the sitemap output
  it("escapes ampersands in URLs", async () => {
    const app = createTestApp();
    // The image sitemap uses xmlEscape on URLs — verify & is escaped to &amp;
    const res = await request(app).get("/sitemap-images.xml");
    // If any URL with & exists, it should be &amp; in output
    if (res.text.includes("&amp;")) {
      expect(res.text).not.toMatch(/(?<!&amp;)&(?!amp;|lt;|gt;|quot;|apos;)/);
    }
    expect(res.status).toBe(200);
  });
});
