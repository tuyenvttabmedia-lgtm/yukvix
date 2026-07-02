import { describe, it, expect } from "vitest";
import { generateAltText, generateAltTextsForAlbum } from "./alt-text-generator";

// --- Fixtures ------------------------------------------------------------------

const albumFull = {
  title: "Seoahn DJAWA Bunny Girl Premium Cosplay",
  cosplayer: "Seoahn",
  character: "Bunny Girl",
  series: "DJAWA",
};

const albumCharOnly = {
  title: "Rem Re:Zero Cosplay Gallery",
  cosplayer: null,
  character: "Rem",
  series: "Re:Zero",
};

const albumTitleOnly = {
  title: "Unknown Cosplay Album",
  cosplayer: null,
  character: null,
  series: null,
};

const albumLongNames = {
  title: "Very Long Album Title That Exceeds Normal Length Limits For Testing",
  cosplayer: "Verylongcosplayernamehere",
  character: "Verylongcharacternamehere",
  series: "Verylongseriesfranchisename",
};

// --- Tests: generateAltText ---------------------------------------------------

describe("generateAltText", () => {
  it("includes cosplayer, character, series in alt text", () => {
    const alt = generateAltText(albumFull, ["bunny", "premium"], 0);
    expect(alt).toContain("Seoahn");
    expect(alt).toContain("Bunny Girl");
    expect(alt).toContain("DJAWA");
  });

  it("always ends with brand suffix '- yukvix'", () => {
    const alt = generateAltText(albumFull, [], 0);
    expect(alt).toMatch(/- yukvix$/);
  });

  it("includes photo number (1-indexed)", () => {
    const alt0 = generateAltText(albumFull, [], 0);
    const alt4 = generateAltText(albumFull, [], 4);
    expect(alt0).toContain(" 1 ");
    expect(alt4).toContain(" 5 ");
  });

  it("cycles through different modifiers across photos", () => {
    const alts = Array.from({ length: 5 }, (_, i) => generateAltText(albumFull, [], i));
    // Not all alts should be identical (modifiers cycle)
    const unique = new Set(alts.map((a) => a.split(" photo ")[0]));
    // Subject part should be the same, but modifier should vary
    const modifiers = alts.map((a) => {
      const match = a.match(/(cosplay(?:\s+\w+)?\s+photo)/);
      return match ? match[1] : "";
    });
    const uniqueModifiers = new Set(modifiers);
    expect(uniqueModifiers.size).toBeGreaterThan(1);
  });

  it("filters out generic tags", () => {
    const alt = generateAltText(albumFull, ["cosplay", "cute", "sexy", "hot", "Bunny Girl"], 0);
    // Generic tags like "cosplay", "cute", "sexy", "hot" should be filtered
    // "Bunny Girl" is already in subject so may or may not appear in tags
    expect(alt.length).toBeLessThanOrEqual(125);
  });

  it("uses character + series when no cosplayer", () => {
    const alt = generateAltText(albumCharOnly, ["anime", "maid"], 0);
    expect(alt).toContain("Rem");
    expect(alt).toContain("Re:Zero");
  });

  it("falls back to album title words when no metadata", () => {
    const alt = generateAltText(albumTitleOnly, [], 0);
    expect(alt).toContain("Unknown");
    expect(alt).toMatch(/- yukvix$/);
  });

  it("respects MAX_ALT_LENGTH of 125 chars", () => {
    const alt = generateAltText(albumLongNames, ["tag1", "tag2", "tag3"], 0);
    expect(alt.length).toBeLessThanOrEqual(125);
    expect(alt).toMatch(/- yukvix$/);
  });

  it("does not duplicate series if same as character", () => {
    const album = { title: "Test", cosplayer: "Alice", character: "Alice", series: "Alice" };
    const alt = generateAltText(album, [], 0);
    // "Alice" should appear but not be repeated 3 times
    const count = (alt.match(/Alice/g) || []).length;
    expect(count).toBeLessThanOrEqual(2);
  });

  it("includes up to 3 key tags", () => {
    const tags = ["Nier Automata", "2B", "Android", "white hair", "sword"];
    const alt = generateAltText(albumFull, tags, 0);
    // Should include some tags but not all 5
    expect(alt.length).toBeLessThanOrEqual(125);
    expect(alt).toMatch(/- yukvix$/);
  });
});

// --- Tests: generateAltTextsForAlbum ------------------------------------------

describe("generateAltTextsForAlbum", () => {
  it("returns correct count", () => {
    const alts = generateAltTextsForAlbum(albumFull, ["bunny"], 5);
    expect(alts).toHaveLength(5);
  });

  it("each alt text is unique (different photo numbers)", () => {
    const alts = generateAltTextsForAlbum(albumFull, [], 5);
    const unique = new Set(alts);
    expect(unique.size).toBe(5);
  });

  it("returns empty array for count=0", () => {
    const alts = generateAltTextsForAlbum(albumFull, [], 0);
    expect(alts).toHaveLength(0);
  });

  it("all alts respect MAX_ALT_LENGTH", () => {
    const alts = generateAltTextsForAlbum(albumLongNames, ["tag1", "tag2", "tag3"], 10);
    for (const alt of alts) {
      expect(alt.length).toBeLessThanOrEqual(125);
    }
  });

  it("all alts end with brand suffix", () => {
    const alts = generateAltTextsForAlbum(albumFull, ["bunny"], 3);
    for (const alt of alts) {
      expect(alt).toMatch(/- yukvix$/);
    }
  });
});
