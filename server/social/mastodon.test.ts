import { describe, expect, it } from "vitest";
import { createMastodonAdapter, MASTODON_CAPABILITIES } from "./adapters/mastodon";
import { parseMastodonCredentials, normalizeMastodonInstanceUrl } from "./mastodon-config";
import { SocialApiError } from "./types";

describe("mastodon adapter", () => {
  it("caps images at 4 and supports CW + sensitive", () => {
    expect(MASTODON_CAPABILITIES.maxImages).toBe(4);
    expect(MASTODON_CAPABILITIES.supportsSensitiveLabel).toBe(true);
    expect(MASTODON_CAPABILITIES.supportsContentWarning).toBe(true);
    expect(MASTODON_CAPABILITIES.maxCaptionLength).toBe(500);
  });

  it("normalizes instance URL to https origin", () => {
    expect(normalizeMastodonInstanceUrl("mastodon.social")).toBe(
      "https://mastodon.social"
    );
    expect(() => normalizeMastodonInstanceUrl("http://mastodon.social")).toThrow(
      /https/
    );
  });

  it("publishes a status with uploaded media ids", async () => {
    const calls: Array<{ method: string; path: string }> = [];
    const adapter = createMastodonAdapter({
      credentials: parseMastodonCredentials({
        instanceUrl: "https://mastodon.social",
        accessToken: "token-token",
      }),
      config: {
        instanceUrl: "https://mastodon.social",
        maxImages: 4,
        visibility: "public",
      },
      uploadFiles: true,
      loadUpload: async () => Buffer.from("jpeg"),
      callApi: async (method, path) => {
        calls.push({ method, path });
        if (path === "/api/v1/accounts/verify_credentials") {
          return { id: "1", acct: "yukvix", display_name: "Yukvix" };
        }
        if (path === "/api/v2/media") return { id: `m${calls.length}` };
        if (path === "/api/v1/statuses") {
          return { id: "s1", url: "https://mastodon.social/@yukvix/s1" };
        }
        return {};
      },
    });
    const result = await adapter.publishPost({
      caption: "Hello https://yukvix.com/album/1",
      media: [
        { type: "thumb", url: "https://media.yukvix.com/albums/1/thumb/1.webp", sortOrder: 0 },
      ],
      labels: { sensitive: true, contentWarning: "Mature / 18+" },
    });
    expect(result.externalPostId).toBe("s1");
    expect(result.externalUrl).toContain("mastodon.social");
    expect(calls.some(c => c.path === "/api/v2/media")).toBe(true);
    expect(calls.some(c => c.path === "/api/v1/statuses")).toBe(true);
  });

  it("rejects empty media", async () => {
    const adapter = createMastodonAdapter({
      credentials: parseMastodonCredentials({
        instanceUrl: "https://mastodon.social",
        accessToken: "token-token",
      }),
      config: {
        instanceUrl: "https://mastodon.social",
        maxImages: 4,
        visibility: "public",
      },
      callApi: async () => ({}),
    });
    await expect(
      adapter.publishPost({ caption: "x", media: [] })
    ).rejects.toBeInstanceOf(SocialApiError);
  });
});
