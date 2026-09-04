import { describe, expect, it } from "vitest";
import { createBlueskyAdapter, BLUESKY_CAPABILITIES } from "./adapters/bluesky";
import { parseBlueskyCredentials, BLUESKY_DEFAULT_PDS } from "./bluesky-config";
import { SocialApiError } from "./types";

describe("bluesky adapter", () => {
  it("caps images at 4 and supports adult self-labels", () => {
    expect(BLUESKY_CAPABILITIES.maxImages).toBe(4);
    expect(BLUESKY_CAPABILITIES.supportsSensitiveLabel).toBe(true);
    expect(BLUESKY_CAPABILITIES.maxCaptionLength).toBe(300);
  });

  it("defaults PDS to bsky.social", () => {
    const creds = parseBlueskyCredentials({
      identifier: "yukvix.bsky.social",
      appPassword: "xxxx-xxxx-xxxx-xxxx",
    });
    expect(creds.pdsUrl).toBe(BLUESKY_DEFAULT_PDS);
  });

  it("creates a session, uploads blobs, then posts", async () => {
    const calls: string[] = [];
    const adapter = createBlueskyAdapter({
      credentials: parseBlueskyCredentials({
        identifier: "yukvix.bsky.social",
        appPassword: "xxxx-xxxx-xxxx-xxxx",
      }),
      config: {
        identifier: "yukvix.bsky.social",
        pdsUrl: BLUESKY_DEFAULT_PDS,
        maxImages: 4,
      },
      uploadFiles: true,
      loadUpload: async () => ({ bytes: Buffer.from("jpeg"), width: 800, height: 1200 }),
      callApi: async (_method, path) => {
        calls.push(path);
        if (path.endsWith("createSession")) {
          return {
            did: "did:plc:test",
            handle: "yukvix.bsky.social",
            accessJwt: "jwt",
          };
        }
        if (path.endsWith("uploadBlob")) return { blob: { $type: "blob", ref: { $link: "bafy" } } };
        if (path.endsWith("createRecord")) {
          return { uri: "at://did:plc:test/app.bsky.feed.post/abc123" };
        }
        return {};
      },
    });
    const result = await adapter.publishPost({
      caption: "Hello https://yukvix.com/album/1",
      media: [
        { type: "cover", url: "https://media.yukvix.com/albums/1/thumb/cover.webp", sortOrder: 0 },
      ],
      labels: { sensitive: true },
    });
    expect(result.externalPostId).toContain("app.bsky.feed.post");
    expect(result.externalUrl).toBe(
      "https://bsky.app/profile/yukvix.bsky.social/post/abc123"
    );
    expect(calls.some(p => p.includes("createSession"))).toBe(true);
    expect(calls.some(p => p.includes("uploadBlob"))).toBe(true);
    expect(calls.some(p => p.includes("createRecord"))).toBe(true);
  });

  it("rejects empty media", async () => {
    const adapter = createBlueskyAdapter({
      credentials: parseBlueskyCredentials({
        identifier: "yukvix.bsky.social",
        appPassword: "xxxx-xxxx-xxxx-xxxx",
      }),
      config: {
        identifier: "yukvix.bsky.social",
        pdsUrl: BLUESKY_DEFAULT_PDS,
        maxImages: 4,
      },
      callApi: async (_m, path) => {
        if (path.endsWith("createSession")) {
          return { did: "did:plc:test", handle: "yukvix.bsky.social", accessJwt: "jwt" };
        }
        return {};
      },
    });
    await expect(
      adapter.publishPost({ caption: "x", media: [] })
    ).rejects.toBeInstanceOf(SocialApiError);
  });
});
