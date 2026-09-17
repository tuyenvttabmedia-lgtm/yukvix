import { describe, expect, it } from "vitest";
import {
  isPlaceholderCreatorSlug,
  isUsableLatinSlug,
  slugifyCreatorName,
} from "./creator-slug";

describe("slugifyCreatorName", () => {
  it("romanizes Chinese names as hyphenated pinyin", () => {
    expect(slugifyCreatorName("阿包也是兔娘")).toBe("a-bao-ye-shi-tu-niang");
    expect(slugifyCreatorName("村上西瓜")).toBe("cun-shang-xi-gua");
  });

  it("keeps Latin mixed into a Chinese name", () => {
    expect(slugifyCreatorName("年年Nnian")).toBe("nian-nian-nnian");
  });

  it("romanizes Korean hangul", () => {
    expect(slugifyCreatorName("퀸다미")).toBe("kwin-da-mi");
    expect(slugifyCreatorName("윤하")).toBe("yun-ha");
    expect(slugifyCreatorName("Dami (퀸다미)")).toBe("dami-kwin-da-mi");
  });

  it("romanizes Japanese kana", () => {
    expect(slugifyCreatorName("さくら")).toBe("sakura");
    expect(slugifyCreatorName("キョウカ")).toBe("kyouka");
  });

  it("keeps an already-Latin name", () => {
    expect(slugifyCreatorName("ArtGravia Dami")).toBe("artgravia-dami");
  });
});

describe("placeholder slug detection", () => {
  it("flags album-N leftovers and accepts real latin slugs", () => {
    expect(isPlaceholderCreatorSlug("album-1")).toBe(true);
    expect(isPlaceholderCreatorSlug("album-2")).toBe(true);
    expect(isPlaceholderCreatorSlug("creator")).toBe(true);
    expect(isUsableLatinSlug("a-bao-ye-shi-tu-niang")).toBe(true);
    expect(isUsableLatinSlug("album-1")).toBe(false);
  });
});
