import { describe, expect, it, beforeEach } from "vitest";
import {
  clearSignedMediaUrlCache,
  peekSignedMediaUrl,
  rememberSignedMediaUrl,
  signedMediaUrlCacheSize,
} from "./signed-url-cache";

describe("signed media URL cache", () => {
  beforeEach(() => clearSignedMediaUrlCache());

  it("returns the same URL while enough TTL remains", () => {
    const now = 1_700_000_000_000;
    rememberSignedMediaUrl("albums/a/medium/1.webp", "https://cdn/a?sig=1", 3600, now);
    expect(peekSignedMediaUrl("albums/a/medium/1.webp", 3600, now + 5 * 60 * 1000)).toBe(
      "https://cdn/a?sig=1"
    );
  });

  it("does not reuse a URL with less than 10 minutes left", () => {
    const now = 1_700_000_000_000;
    rememberSignedMediaUrl("albums/a/webp/1.webp", "https://cdn/a?sig=2", 3600, now);
    expect(
      peekSignedMediaUrl("albums/a/webp/1.webp", 3600, now + 51 * 60 * 1000)
    ).toBeNull();
  });

  it("keeps different TTLs on the same object key separate", () => {
    const now = 1_700_000_000_000;
    rememberSignedMediaUrl("albums/a/webp/1.webp", "https://cdn/hour", 3600, now);
    rememberSignedMediaUrl("albums/a/webp/1.webp", "https://cdn/zip", 900, now);
    expect(peekSignedMediaUrl("albums/a/webp/1.webp", 3600, now)).toBe("https://cdn/hour");
    expect(peekSignedMediaUrl("albums/a/webp/1.webp", 900, now)).toBe("https://cdn/zip");
  });

  it("evicts oldest entries when the cache is full", () => {
    const now = 1_700_000_000_000;
    for (let i = 0; i < 8001; i++) {
      rememberSignedMediaUrl(`k/${i}`, `https://cdn/${i}`, 3600, now);
    }
    expect(signedMediaUrlCacheSize()).toBe(8000);
    expect(peekSignedMediaUrl("k/0", 3600, now)).toBeNull();
    expect(peekSignedMediaUrl("k/8000", 3600, now)).toBe("https://cdn/8000");
  });
});
