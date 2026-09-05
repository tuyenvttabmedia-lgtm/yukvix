import { describe, expect, it } from "vitest";
import { generateSeoFromFilename } from "./seo-generator";
import {
  mergeAiAlbumSeo,
  naturalAlbumSeoTitle,
  titleKeepsOriginalOrder,
} from "./seo-title";

const ORIGINAL =
  "Espacia Korea EXC Vol.003 TSUBAKI SANNOMIYA Photoset";

describe("naturalAlbumSeoTitle", () => {
  it("keeps original filename order instead of putting the model name first", () => {
    const title = naturalAlbumSeoTitle(ORIGINAL);
    expect(titleKeepsOriginalOrder(ORIGINAL, title)).toBe(true);
    expect(title.toLowerCase().indexOf("espacia")).toBeLessThan(title.toLowerCase().indexOf("tsubaki"));
    expect(title.length).toBeLessThanOrEqual(60);
    expect(title.toLowerCase()).not.toContain("cosplay");
  });

  it("does not scramble CJK names", () => {
    const original = "XIUREN No.11299 白小蝶";
    const title = naturalAlbumSeoTitle(original);
    expect(titleKeepsOriginalOrder(original, title)).toBe(true);
    expect(title).toContain("白小蝶");
    expect(title.indexOf("XIUREN")).toBeLessThan(title.indexOf("白小蝶"));
  });

  it("clips long titles at a word boundary", () => {
    const original =
      "ArtGravia Vol.999 Very Long Photoset Name With Extra Words That Exceed Sixty Characters";
    const title = naturalAlbumSeoTitle(original);
    expect(title.length).toBeLessThanOrEqual(60);
    expect(title.startsWith("ArtGravia")).toBe(true);
    expect(title).not.toMatch(/[…]$/);
  });
});

describe("mergeAiAlbumSeo", () => {
  it("discards an AI title that rearranges the original filename", () => {
    const seo = mergeAiAlbumSeo(
      { title: ORIGINAL, cosplayer: "TSUBAKI SANNOMIYA" },
      {
        focusKeyword: "TSUBAKI SANNOMIYA cosplay",
        metaTitle: "TSUBAKI SANNOMIYA Cosplay – Espacia Korea Premium Gallery | Yukvix",
        metaDescription: "Stunning TSUBAKI SANNOMIYA cosplay photos. Unlock this captivating gallery now.",
      }
    );
    expect(titleKeepsOriginalOrder(ORIGINAL, seo.metaTitle)).toBe(true);
    expect(seo.metaTitle.toLowerCase().indexOf("espacia")).toBeLessThan(
      seo.metaTitle.toLowerCase().indexOf("tsubaki")
    );
    expect(seo.metaTitle.toLowerCase()).not.toContain("cosplay");
    expect(seo.metaDescription.toLowerCase()).not.toMatch(/stunning|captivating|unlock/);
    expect(seo.metaDescription).toContain("Espacia Korea");
    expect(seo.focusKeyword.toLowerCase()).not.toContain("cosplay");
    expect(seo.metaDescription.length).toBeLessThanOrEqual(160);
  });

  it("keeps a factual AI description that mentions the original title", () => {
    const seo = mergeAiAlbumSeo(
      { title: ORIGINAL },
      {
        focusKeyword: "Espacia Korea EXC",
        metaTitle: "ignored",
        metaDescription: "Photos from Espacia Korea EXC Vol.003 TSUBAKI SANNOMIYA. View the full set on Yukvix.",
      }
    );
    expect(seo.metaDescription).toContain("Espacia Korea EXC");
    expect(seo.focusKeyword).toBe("Espacia Korea EXC");
  });
});

describe("generateSeoFromFilename fallback", () => {
  it("does not prefix the creator in front of a sliced filename", () => {
    const seo = generateSeoFromFilename(ORIGINAL, "Yukvix");
    expect(titleKeepsOriginalOrder(ORIGINAL, seo.seoTitle)).toBe(true);
    expect(seo.seoTitle.toLowerCase().indexOf("espacia")).toBeLessThan(
      seo.seoTitle.toLowerCase().indexOf("tsubaki")
    );
    expect(seo.albumTitle).toBe(ORIGINAL);
    expect(seo.metaDescription.toLowerCase()).not.toContain("premium");
  });
});
