import { describe, expect, it } from "vitest";
import { shouldAutoPublishAfterImport } from "./import-profile";

describe("import profile auto-publish", () => {
  it("publishes VIP albums only when zip copy is ready", () => {
    expect(
      shouldAutoPublishAfterImport(
        { profileVersion: "1.0.0", profile: "default", publish: "published", vip: true, preview: 10, seo: "gemini", watermark: false, vipZipMode: "copy", zipImportV2: true },
        { photoCount: 12, vipZipReady: true, isVipAlbum: true }
      )
    ).toBe(true);
    expect(
      shouldAutoPublishAfterImport(
        { profileVersion: "1.0.0", profile: "default", publish: "published", vip: true, preview: 10, seo: "gemini", watermark: false, vipZipMode: "copy", zipImportV2: true },
        { photoCount: 12, vipZipReady: false, isVipAlbum: true }
      )
    ).toBe(false);
  });
});
