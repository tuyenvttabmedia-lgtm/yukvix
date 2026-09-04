import { describe, expect, it } from "vitest";
import { createBlueskyAdapter, BLUESKY_CAPABILITIES } from "./adapters/bluesky";
import { parseBlueskyCredentials, BLUESKY_DEFAULT_PDS } from "./bluesky-config";
import { buildBlueskyLinkFacets } from "./bluesky-facets";
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

  it("indexes album URLs as clickable rich-text facets", () => {
    const caption =
      "Espacia Korea EXC Vol.150 Rahee (행위)\nhttps://yukvix.com/album/espacia-korea-exc-vol-150-rahee";
    const facets = buildBlueskyLinkFacets(caption);
    expect(facets).toHaveLength(1);
    const url = "https://yukvix.com/album/espacia-korea-exc-vol-150-rahee";
    expect(facets[0].features[0]).toEqual({
      $type: "app.bsky.richtext.facet#link",
      uri: url,
    });
    const bytes = Buffer.from(caption, "utf8");
    expect(
      bytes.subarray(facets[0].index.byteStart, facets[0].index.byteEnd).toString("utf8")
    ).toBe(url);
  });

  it("creates a session, uploads blobs, then posts with a link facet", async () => {
    const calls: string[] = [];
    let createdRecord: Record<string, unknown> | null = null;
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
      loadUpload: async () => ({
        bytes: Buffer.from("jpeg"),
        width: 800,
        height: 1200,
      }),
      callApi: async (_method, path, body) => {
        calls.push(path);
        if (path.endsWith("createSession")) {
          return {
            did: "did:plc:test",
            handle: "yukvix.bsky.social",
            accessJwt: "jwt",
          };
        }
        if (path.endsWith("uploadBlob")) {
          return { blob: { $type: "blob", ref: { $link: "bafy" } } };
        }
        if (path.endsWith("createRecord")) {
          const payload =
            body && typeof body === "object" ? (body as Record<string, unknown>) : {};
          createdRecord = payload.record as Record<string, unknown>;
          return { uri: "at://did:plc:test/app.bsky.feed.post/abc123" };
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
    expect(result.externalPostId).toContain("app.bsky.feed.post");
    expect(result.externalUrl).toBe(
      "https://bsky.app/profile/yukvix.bsky.social/post/abc123"
    );
    expect(calls.some(p => p.includes("createSession"))).toBe(true);
    expect(calls.some(p => p.includes("uploadBlob"))).toBe(true);
    expect(calls.some(p => p.includes("createRecord"))).toBe(true);
    const facets = createdRecord?.facets as Array<{
      features: Array<{ $type: string; uri: string }>;
    }>;
    expect(facets).toHaveLength(1);
    expect(facets[0].features[0]).toEqual({
      $type: "app.bsky.richtext.facet#link",
      uri: "https://yukvix.com/album/1",
    });
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
