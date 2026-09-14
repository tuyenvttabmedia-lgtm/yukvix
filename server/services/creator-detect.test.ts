import { describe, expect, it } from "vitest";
import {
  looksLikeCreatorName,
  parseCreatorFromFilename,
} from "./creator-detect";

describe("parseCreatorFromFilename", () => {
  it("keeps stage name + Hangul and drops Korean Model Gallery leftover", () => {
    expect(
      parseCreatorFromFilename(
        "ArtGravia Vol.481 Dami (퀸다미) Korean Model Gallery.zip"
      )
    ).toBe("Dami (퀸다미)");
    expect(
      parseCreatorFromFilename(
        "ArtGravia Vol.481 Dami (퀸다미) Korean Model Gallery"
      )
    ).toBe("Dami (퀸다미)");
  });

  it("parses ArtGravia without SEO suffix", () => {
    expect(parseCreatorFromFilename("ArtGravia Vol.481 Dami (퀸다미).zip")).toBe(
      "Dami (퀸다미)"
    );
  });

  it("keeps existing Espacia Korea cases", () => {
    expect(
      parseCreatorFromFilename("Espacia Korea EHC Vol.085 Saika (河北彩花) Photoset.zip")
    ).toBe("Saika");
    expect(
      parseCreatorFromFilename("Espacia Korea EHC Vol.082 Rahee (행위) Photoset.zip")
    ).toBe("Rahee");
    expect(
      parseCreatorFromFilename("Espacia Korea EHC Vol.086 SOMI (소미) Photoset.zip")
    ).toBe("SOMI (소미)");
    expect(
      parseCreatorFromFilename("Espacia Korea EHC Vol.041 Lee Snow (리 스노우) Photoset.zip")
    ).toBe("Lee Snow (리 스노우)");
  });
});

describe("looksLikeCreatorName", () => {
  it("accepts a model name and rejects leftover title text", () => {
    expect(looksLikeCreatorName("Dami (퀸다미)")).toBe(true);
    expect(looksLikeCreatorName("Dami (퀸다미) Korean Model Gallery")).toBe(false);
    expect(looksLikeCreatorName("ArtGravia")).toBe(false);
  });
});
