import { describe, expect, it } from "vitest";
import { albumCosplayerHint, displayCosplayerName } from "./cosplayer-name";

describe("displayCosplayerName", () => {
  it("prefers the linked catalog name", () => {
    expect(
      displayCosplayerName({
        creatorName: "Seoahn",
        cosplayer: "old zip name",
        creator: "ZIP",
      })
    ).toBe("Seoahn");
  });

  it("falls back to album cosplayer then ZIP creator text", () => {
    expect(
      displayCosplayerName({ cosplayer: "  A  ", creator: "B" })
    ).toBe("A");
    expect(displayCosplayerName({ creator: "B" })).toBe("B");
    expect(displayCosplayerName({})).toBeNull();
  });
});

describe("albumCosplayerHint", () => {
  it("ignores blank strings", () => {
    expect(albumCosplayerHint({ cosplayer: "  ", creator: "" })).toBeNull();
    expect(albumCosplayerHint({ creator: "Hinano" })).toBe("Hinano");
  });
});
