import { describe, expect, it } from "vitest";
import { fallbackCreatorBio, fallbackCreatorSeo } from "./creator-service";

describe("fallbackCreatorSeo", () => {
  it("builds English title and description within SEO limits", () => {
    const seo = fallbackCreatorSeo("Hinano");
    expect(seo.focusKeyword).toBe("Hinano cosplay");
    expect(seo.seoTitle).toBe("Hinano Cosplay Photos | Yukvix");
    expect(seo.seoTitle.length).toBeLessThanOrEqual(60);
    expect(seo.seoDescription).toContain("Hinano");
    expect(seo.seoDescription.length).toBeLessThanOrEqual(160);
  });

  it("clips a long name instead of overflowing title length", () => {
    const seo = fallbackCreatorSeo("A".repeat(80));
    expect(seo.seoTitle.length).toBeLessThanOrEqual(60);
    expect(seo.seoTitle.endsWith("…")).toBe(true);
    expect(seo.seoDescription.length).toBeLessThanOrEqual(160);
  });
});

describe("fallbackCreatorBio", () => {
  it("writes a short English intro with the creator name", () => {
    const bio = fallbackCreatorBio("Hinano");
    expect(bio).toContain("Hinano");
    expect(bio.toLowerCase()).toContain("cosplayer");
    expect(bio.length).toBeGreaterThan(40);
    expect(bio.length).toBeLessThanOrEqual(300);
  });

  it("mentions album characters when available", () => {
    const bio = fallbackCreatorBio("Seoahn", {
      characters: ["Hatsune Miku", "  Hatsune Miku  ", "Asuna"],
    });
    expect(bio).toContain("Hatsune Miku");
    expect(bio).toContain("Asuna");
    expect(bio.length).toBeLessThanOrEqual(300);
  });
});

describe("fallbackCreatorSeo", () => {
  it("builds English title and description within SEO limits", () => {
    const seo = fallbackCreatorSeo("Hinano");
    expect(seo.focusKeyword).toBe("Hinano cosplay");
    expect(seo.seoTitle).toBe("Hinano Cosplay Photos | Yukvix");
    expect(seo.seoTitle.length).toBeLessThanOrEqual(60);
    expect(seo.seoDescription).toContain("Hinano");
    expect(seo.seoDescription.length).toBeLessThanOrEqual(160);
  });

  it("clips a long name instead of overflowing title length", () => {
    const seo = fallbackCreatorSeo("A".repeat(80));
    expect(seo.seoTitle.length).toBeLessThanOrEqual(60);
    expect(seo.seoTitle.endsWith("…")).toBe(true);
    expect(seo.seoDescription.length).toBeLessThanOrEqual(160);
  });
});
