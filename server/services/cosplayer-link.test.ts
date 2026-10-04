import { describe, expect, it } from "vitest";
import { likeContainsPattern } from "./cosplayer-link";

describe("likeContainsPattern", () => {
  it("wraps a trimmed name for SQL LIKE", () => {
    expect(likeContainsPattern("  阿包也是兔娘  ")).toBe("%阿包也是兔娘%");
  });

  it("strips LIKE wildcards so a search cannot match every album", () => {
    expect(likeContainsPattern("a%b_c")).toBe("%abc%");
  });

  it("returns undefined for blank input", () => {
    expect(likeContainsPattern("")).toBeUndefined();
    expect(likeContainsPattern("   ")).toBeUndefined();
    expect(likeContainsPattern("%%%")).toBeUndefined();
  });
});
