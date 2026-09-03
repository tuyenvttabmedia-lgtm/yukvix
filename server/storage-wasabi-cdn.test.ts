import { describe, expect, it } from "vitest";
import { isCdnDeliveryHost, shouldSignMediaViaCdn } from "./storage-wasabi";

describe("CDN signed album URLs", () => {
  it("signs photo variants via media.yukvix.com when CDN is on", () => {
    expect(
      shouldSignMediaViaCdn("albums/a/webp/1.webp", {
        cdnEnabled: true,
        cdnBaseUrl: "https://media.yukvix.com",
      })
    ).toBe(true);
  });

  it("keeps ZIP downloads on the direct Wasabi endpoint", () => {
    expect(
      shouldSignMediaViaCdn("vip-zips/album.zip", {
        cdnEnabled: true,
        cdnBaseUrl: "https://media.yukvix.com",
      })
    ).toBe(false);
  });

  it("does not treat the VPS media-proxy path as a CDN host", () => {
    expect(isCdnDeliveryHost("https://yukvix.com/media-proxy")).toBe(false);
    expect(isCdnDeliveryHost("https://s3.ap-southeast-1.wasabisys.com")).toBe(false);
    expect(isCdnDeliveryHost("https://media.yukvix.com")).toBe(true);
  });
});
