import { describe, expect, it } from "vitest";
import { staticAssetCacheControl } from "./static-cache";

describe("staticAssetCacheControl", () => {
  it("pins hashed Vite assets and self-hosted fonts for a year", () => {
    expect(staticAssetCacheControl("/var/www/dist/public/assets/index-DC2RsEY-.js")).toBe(
      "public, max-age=31536000, immutable"
    );
    expect(staticAssetCacheControl("C:\\app\\dist\\public\\assets\\index-DZvjP6R3.css")).toBe(
      "public, max-age=31536000, immutable"
    );
    expect(staticAssetCacheControl("/var/www/dist/public/fonts/inter-latin.woff2")).toBe(
      "public, max-age=31536000, immutable"
    );
  });

  it("gives unhashed public files a one-day cache", () => {
    expect(staticAssetCacheControl("/var/www/dist/public/favicon.svg")).toBe(
      "public, max-age=86400"
    );
  });
});
