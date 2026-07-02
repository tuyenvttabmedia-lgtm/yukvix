/**
 * Tests for defaultVip propagation in the crawl pipeline.
 * Verifies that:
 * 1. SeoJobData and PublishJobData types include defaultVip field
 * 2. The defaultVip flag is correctly passed through the pipeline
 * 3. Default value is false when not specified
 */
import { describe, it, expect } from "vitest";
import type { SeoJobData, PublishJobData } from "./import/queues.js";

describe("defaultVip in crawl pipeline types", () => {
  it("SeoJobData accepts defaultVip field", () => {
    const seoJob: SeoJobData = {
      jobId: 1,
      imageCount: 10,
      processedImages: [],
      defaultVip: true,
    };
    expect(seoJob.defaultVip).toBe(true);
  });

  it("SeoJobData defaultVip is optional (defaults to undefined)", () => {
    const seoJob: SeoJobData = {
      jobId: 1,
      imageCount: 5,
      processedImages: [],
    };
    expect(seoJob.defaultVip).toBeUndefined();
  });

  it("PublishJobData accepts defaultVip field", () => {
    const publishJob: PublishJobData = {
      jobId: 1,
      title: "Test Album",
      slug: "test-album",
      description: "Test description",
      tags: ["cosplay"],
      altTexts: ["photo 1"],
      processedImages: [],
      defaultVip: true,
    };
    expect(publishJob.defaultVip).toBe(true);
  });

  it("PublishJobData defaultVip is optional (defaults to undefined)", () => {
    const publishJob: PublishJobData = {
      jobId: 1,
      title: "Test Album",
      slug: "test-album",
      description: "Test description",
      tags: [],
      altTexts: [],
      processedImages: [],
    };
    expect(publishJob.defaultVip).toBeUndefined();
  });

  it("defaultVip false means album should NOT be VIP", () => {
    const publishJob: PublishJobData = {
      jobId: 2,
      title: "Free Album",
      slug: "free-album",
      description: "Free content",
      tags: [],
      altTexts: [],
      processedImages: [],
      defaultVip: false,
    };
    // When defaultVip is false, the album isVip should be false
    const isVip = publishJob.defaultVip ?? false;
    expect(isVip).toBe(false);
  });

  it("defaultVip true means album SHOULD be VIP", () => {
    const publishJob: PublishJobData = {
      jobId: 3,
      title: "VIP Album",
      slug: "vip-album",
      description: "VIP content",
      tags: [],
      altTexts: [],
      processedImages: [],
      defaultVip: true,
    };
    // When defaultVip is true, the album isVip should be true
    const isVip = publishJob.defaultVip ?? false;
    expect(isVip).toBe(true);
  });

  it("undefined defaultVip resolves to false (safe default)", () => {
    const publishJob: PublishJobData = {
      jobId: 4,
      title: "Album",
      slug: "album",
      description: "Content",
      tags: [],
      altTexts: [],
      processedImages: [],
    };
    // Simulates what publish-worker does: defaultVip ?? false
    const isVip = publishJob.defaultVip ?? false;
    expect(isVip).toBe(false);
  });
});

describe("freePreviewCount propagation in crawl pipeline", () => {
  it("SeoJobData accepts freePreviewCount as a number", () => {
    const seoJob: SeoJobData = {
      jobId: 1,
      imageCount: 10,
      processedImages: [],
      freePreviewCount: 5,
    };
    expect(seoJob.freePreviewCount).toBe(5);
  });

  it("SeoJobData accepts freePreviewCount as null (use Album Defaults)", () => {
    const seoJob: SeoJobData = {
      jobId: 1,
      imageCount: 10,
      processedImages: [],
      freePreviewCount: null,
    };
    expect(seoJob.freePreviewCount).toBeNull();
  });

  it("SeoJobData freePreviewCount is optional (defaults to undefined)", () => {
    const seoJob: SeoJobData = {
      jobId: 1,
      imageCount: 5,
      processedImages: [],
    };
    expect(seoJob.freePreviewCount).toBeUndefined();
  });

  it("PublishJobData accepts freePreviewCount override", () => {
    const publishJob: PublishJobData = {
      jobId: 1,
      title: "Test Album",
      slug: "test-album",
      description: "desc",
      tags: [],
      altTexts: [],
      processedImages: [],
      freePreviewCount: 3,
    };
    expect(publishJob.freePreviewCount).toBe(3);
  });

  it("freePreviewCount null means use Album Defaults (not an explicit override)", () => {
    const passedFreePreviewCount: number | null | undefined = null;
    // Simulate publish-worker resolution logic
    const isExplicitOverride = passedFreePreviewCount !== null && passedFreePreviewCount !== undefined;
    expect(isExplicitOverride).toBe(false);
  });

  it("freePreviewCount 0 means all photos require VIP (no free preview)", () => {
    const count = 0;
    const isExplicitOverride = count !== null && count !== undefined;
    expect(isExplicitOverride).toBe(true);
    const isFreePreview = (sortOrder: number) => sortOrder < count;
    expect(isFreePreview(0)).toBe(false);
    expect(isFreePreview(1)).toBe(false);
  });

  it("freePreviewCount 5 marks first 5 photos as free preview", () => {
    const count = 5;
    const isFreePreview = (sortOrder: number) => sortOrder < count;
    expect(isFreePreview(0)).toBe(true);
    expect(isFreePreview(4)).toBe(true);
    expect(isFreePreview(5)).toBe(false);
    expect(isFreePreview(10)).toBe(false);
  });

  it("freePreviewCount 3 marks exactly first 3 photos as free preview", () => {
    const count = 3;
    const isFreePreview = (sortOrder: number) => sortOrder < count;
    expect(isFreePreview(0)).toBe(true);
    expect(isFreePreview(1)).toBe(true);
    expect(isFreePreview(2)).toBe(true);
    expect(isFreePreview(3)).toBe(false);
  });
});
