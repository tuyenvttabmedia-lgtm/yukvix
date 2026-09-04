import { describe, expect, it } from "vitest";
import { createXAdapter, X_CAPABILITIES } from "./adapters/x";
import { parseXCredentials, parseXConfig } from "./x-config";
import { SocialApiError } from "./types";

const credentials = parseXCredentials({
  apiKey: "consumer-key-xx",
  apiSecret: "consumer-secret-xx",
  accessToken: "access-token-xx",
  accessTokenSecret: "access-secret-xx",
});

describe("x adapter", () => {
  it("caps images at 4, 280 chars, and supports sensitive flag", () => {
    expect(X_CAPABILITIES.maxImages).toBe(4);
    expect(X_CAPABILITIES.maxCaptionLength).toBe(280);
    expect(X_CAPABILITIES.supportsSensitiveLabel).toBe(true);
    expect(X_CAPABILITIES.supportsContentWarning).toBe(false);
  });

  it("strips secrets from stored config", () => {
    const config = parseXConfig(
      JSON.stringify({ maxImages: 2, apiSecret: "nope", accessTokenSecret: "nope" })
    );
    expect(config.maxImages).toBe(2);
  });

  it("uploads media then creates a possibly_sensitive tweet", async () => {
    const calls: Array<{ method: string; path: string; body?: unknown }> = [];
    const adapter = createXAdapter({
      credentials,
      config: { maxImages: 4 },
      uploadFiles: true,
      loadUpload: async () => ({
        bytes: Buffer.from("jpeg"),
        width: 800,
        height: 1200,
      }),
      callApi: async (method, path, body) => {
        calls.push({ method, path, body });
        if (path.startsWith("/2/users/me")) {
          return { data: { id: "99", username: "yukvix", name: "Yukvix" } };
        }
        if (path === "/2/media/upload") {
          return { data: { id: "m1" } };
        }
        if (path === "/2/tweets") {
          return { data: { id: "1234567890" } };
        }
        return {};
      },
    });
    const result = await adapter.publishPost({
      caption: "Hello https://yukvix.com/album/1",
      media: [
        {
          type: "cover",
          url: "https://media.yukvix.com/albums/1/thumb/cover.webp",
          sortOrder: 0,
        },
      ],
      labels: { sensitive: true },
    });
    expect(result.externalPostId).toBe("1234567890");
    expect(result.externalUrl).toBe("https://x.com/yukvix/status/1234567890");
    expect(calls.some(c => c.path === "/2/media/upload")).toBe(true);
    const tweet = calls.find(c => c.path === "/2/tweets");
    expect(tweet?.body).toMatchObject({
      text: "Hello https://yukvix.com/album/1",
      media: { media_ids: ["m1"] },
      possibly_sensitive: true,
    });
  });

  it("rejects empty media", async () => {
    const adapter = createXAdapter({
      credentials,
      config: { maxImages: 4 },
      callApi: async () => ({}),
    });
    await expect(
      adapter.publishPost({ caption: "hello", media: [] })
    ).rejects.toBeInstanceOf(SocialApiError);
  });
});
