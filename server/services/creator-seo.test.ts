import { describe, expect, it } from "vitest";
import { fallbackCreatorSeo } from "./creator-service";

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
