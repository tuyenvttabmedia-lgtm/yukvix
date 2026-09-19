import { describe, expect, it } from "vitest";
import { albumSlugCandidate, isWeakAlbumSlug, nextUniqueAlbumSlug, slugifyAlbumTitle } from "./album-slug";

describe("slugifyAlbumTitle", () => {
  it("romanizes CJK instead of collapsing to coser", () => {
    expect(slugifyAlbumTitle("Coser 阿包也是兔娘 - 原神 希娜小姐.zip")).toBe(
      "coser-a-bao-ye-shi-tu-niang-yuan-shen-xi-na-xiao-jie"
    );
    expect(slugifyAlbumTitle("Coser 村上西瓜 - 多莉.zip")).toBe("coser-cun-shang-xi-gua-duo-li");
  });

  it("keeps mixed Latin titles unique from the generic coser slug", () => {
    expect(slugifyAlbumTitle("Coser 阿包也是兔娘 - My Rose.zip")).toBe(
      "coser-a-bao-ye-shi-tu-niang-my-rose"
    );
  });

  it("still slugifies Latin filenames", () => {
    expect(slugifyAlbumTitle("Espacia Korea EHC Vol.085 Saika Photoset")).toMatch(
      /^espacia-korea-ehc-vol-085-saika/
    );
  });
});

describe("isWeakAlbumSlug", () => {
  it("flags generic leftovers that collide in production", () => {
    expect(isWeakAlbumSlug("coser")).toBe(true);
    expect(isWeakAlbumSlug("coser-5")).toBe(false);
    expect(isWeakAlbumSlug("album")).toBe(true);
    expect(isWeakAlbumSlug("album-1")).toBe(true);
    expect(isWeakAlbumSlug("coser-my-rose")).toBe(false);
    expect(isWeakAlbumSlug("coser-a-bao-ye-shi-tu-niang-yuan-shen-xi-na-xiao-jie")).toBe(false);
  });
});

describe("albumSlugCandidate", () => {
  it("appends job id without exceeding max length", () => {
    const slug = albumSlugCandidate("Coser 阿包也是兔娘 - 原神 希娜小姐", 496);
    expect(slug.endsWith("-496")).toBe(true);
    expect(slug.length).toBeLessThanOrEqual(80);
    expect(isWeakAlbumSlug(slug)).toBe(false);
  });
});

describe("nextUniqueAlbumSlug", () => {
  it("keeps a unique specific slug", () => {
    const taken = new Set(["coser"]);
    expect(nextUniqueAlbumSlug("coser-a-bao-ye-shi-tu-niang-duo-li", 474, taken)).toBe(
      "coser-a-bao-ye-shi-tu-niang-duo-li"
    );
  });

  it("suffixes job id when the slug is already taken", () => {
    const taken = new Set(["coser-my-rose"]);
    expect(nextUniqueAlbumSlug("coser-my-rose", 482, taken)).toBe("coser-my-rose-482");
  });

  it("suffixes job id for weak leftovers like coser", () => {
    const taken = new Set(["coser"]);
    expect(nextUniqueAlbumSlug("coser", 496, taken)).toBe("coser-496");
  });
});
