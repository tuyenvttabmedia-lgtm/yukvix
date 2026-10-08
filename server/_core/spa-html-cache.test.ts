import { describe, expect, it } from "vitest";
import { spaHtmlCacheControl } from "./meta-injection";

describe("spaHtmlCacheControl", () => {
  it("does not cache admin/account/auth HTML", () => {
    expect(spaHtmlCacheControl("/admin")).toBe("private, no-store");
    expect(spaHtmlCacheControl("/admin/creators/link")).toBe("private, no-store");
    expect(spaHtmlCacheControl("/account")).toBe("private, no-store");
    expect(spaHtmlCacheControl("/login")).toBe("private, no-store");
  });

  it("allows short CDN cache for public pages", () => {
    expect(spaHtmlCacheControl("/")).toContain("s-maxage=60");
    expect(spaHtmlCacheControl("/gallery")).toContain("s-maxage=60");
    expect(spaHtmlCacheControl("/album/test-slug")).toContain("stale-while-revalidate=300");
  });
});
