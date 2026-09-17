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

  it("takes the cosplayer before the dash in Coser titles, not the set name", () => {
    expect(
      parseCreatorFromFilename("Coser 阿包也是兔娘 - My rose 玫瑰.zip")
    ).toBe("阿包也是兔娘");
    expect(
      parseCreatorFromFilename("Coser 阿包也是兔娘 - Kuuka")
    ).toBe("阿包也是兔娘");
    expect(
      parseCreatorFromFilename("Coser 村上西瓜-问琴武士的重启人生 刹那 (旗袍)")
    ).toBe("村上西瓜");
  });

  it("does not guess a leftover English token as the creator", () => {
    expect(parseCreatorFromFilename("My rose 玫瑰.zip")).toBeNull();
  });
});

describe("looksLikeCreatorName", () => {
  it("accepts a model name and rejects leftover title text", () => {
    expect(looksLikeCreatorName("Dami (퀸다미)")).toBe(true);
    expect(looksLikeCreatorName("阿包也是兔娘")).toBe(true);
    expect(looksLikeCreatorName("Dami (퀸다미) Korean Model Gallery")).toBe(false);
    expect(looksLikeCreatorName("ArtGravia")).toBe(false);
    expect(looksLikeCreatorName("Coser")).toBe(false);
  });
});
