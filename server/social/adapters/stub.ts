import {
  SocialNotImplementedError,
  type PlatformCapabilities,
  type SocialAdapter,
  type SocialPlatform,
} from "../types";

export function stubCapabilities(
  platform: SocialPlatform
): PlatformCapabilities {
  switch (platform) {
    case "telegram":
      return {
        platform,
        maxImages: 10,
        supportsSensitiveLabel: true,
        supportsContentWarning: true,
        maxCaptionLength: 1024,
      };
    case "mastodon":
      return {
        platform,
        maxImages: 4,
        supportsSensitiveLabel: true,
        supportsContentWarning: true,
        maxCaptionLength: 500,
      };
    case "bluesky":
      return {
        platform,
        maxImages: 4,
        supportsSensitiveLabel: true,
        supportsContentWarning: true,
        maxCaptionLength: 300,
      };
    case "x":
      return {
        platform,
        maxImages: 4,
        supportsSensitiveLabel: true,
        supportsContentWarning: false,
        maxCaptionLength: 280,
      };
  }
}

export function createStubAdapter(platform: SocialPlatform): SocialAdapter {
  return {
    getCapabilities: () => stubCapabilities(platform),
    validateConnection: async () => {
      throw new SocialNotImplementedError(platform, "validateConnection");
    },
    getAccountInfo: async () => {
      throw new SocialNotImplementedError(platform, "getAccountInfo");
    },
    uploadMedia: async () => {
      throw new SocialNotImplementedError(platform, "uploadMedia");
    },
    publishPost: async () => {
      throw new SocialNotImplementedError(platform, "publishPost");
    },
    deletePost: async () => {
      throw new SocialNotImplementedError(platform, "deletePost");
    },
  };
}
