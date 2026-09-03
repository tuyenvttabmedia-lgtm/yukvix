import { describe, expect, it } from "vitest";
import {
  cmsMediaPath,
  extensionFromFilename,
  isCmsFolder,
  isCmsStorageKey,
  normalizeCmsContentType,
  rewriteCmsAssetUrl,
  rewriteCmsSettings,
} from "./cms-media";

describe("cms-media helpers", () => {
  it("accepts branding keys and folders", () => {
    expect(isCmsStorageKey("cms/logos/abc.png")).toBe(true);
    expect(isCmsStorageKey("cms/favicon/x.ico")).toBe(true);
    expect(isCmsStorageKey("albums/1/thumb/x.webp")).toBe(false);
    expect(isCmsStorageKey("cms/../secret")).toBe(false);
    expect(isCmsFolder("cms/logos")).toBe(true);
    expect(isCmsFolder("cms")).toBe(true);
    expect(isCmsFolder("albums")).toBe(false);
  });

  it("rewrites private Wasabi CMS URLs to the app proxy", () => {
    expect(
      rewriteCmsAssetUrl("https://s3.ap-southeast-1.wasabisys.com/bucket/cms/logos/abc.png")
    ).toBe("/api/cms-media/cms/logos/abc.png");
    expect(rewriteCmsAssetUrl("/api/cms-media/cms/favicon/x.ico")).toBe(
      "/api/cms-media/cms/favicon/x.ico"
    );
    expect(rewriteCmsAssetUrl("https://example.com/logo.png")).toBe("https://example.com/logo.png");
    expect(cmsMediaPath("cms/logos/a.png")).toBe("/api/cms-media/cms/logos/a.png");
  });

  it("infers content type from extension when browser sends empty type", () => {
    expect(extensionFromFilename("favicon.ico")).toBe("ico");
    expect(normalizeCmsContentType("favicon.ico", "")).toBe("image/x-icon");
    expect(normalizeCmsContentType("logo.png", "image/png")).toBe("image/png");
  });

  it("rewrites logo/favicon settings used by the public site", () => {
    const out = rewriteCmsSettings({
      logo_url: "https://s3.example.com/bucket/cms/logos/a.png",
      favicon_url: "https://s3.example.com/bucket/cms/favicon/b.ico",
      homepage_banners: JSON.stringify([
        { id: "1", imageUrl: "https://s3.example.com/bucket/cms/banners/c.jpg" },
      ]),
      site_name: "Yukvix",
    });
    expect(out.logo_url).toBe("/api/cms-media/cms/logos/a.png");
    expect(out.favicon_url).toBe("/api/cms-media/cms/favicon/b.ico");
    expect(JSON.parse(out.homepage_banners || "[]")[0].imageUrl).toBe(
      "/api/cms-media/cms/banners/c.jpg"
    );
  });
});
