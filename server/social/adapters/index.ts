import { blueskyAdapter, createBlueskyAdapterForAccount } from "./bluesky";
import { mastodonAdapter, createMastodonAdapterForAccount } from "./mastodon";
import {
  createTelegramAdapterForAccount,
  telegramAdapter,
} from "./telegram";
import { xAdapter } from "./x";
import type { SocialAdapter, SocialPlatform } from "../types";

const registry: Record<SocialPlatform, SocialAdapter> = {
  telegram: telegramAdapter,
  mastodon: mastodonAdapter,
  bluesky: blueskyAdapter,
  x: xAdapter,
};

const testOverrides: Partial<Record<SocialPlatform, SocialAdapter>> = {};

export function getSocialAdapter(platform: SocialPlatform): SocialAdapter {
  return testOverrides[platform] ?? registry[platform];
}

export async function resolveSocialAdapter(post: {
  platform: SocialPlatform;
  accountId: number;
}): Promise<SocialAdapter> {
  if (testOverrides[post.platform]) return testOverrides[post.platform]!;
  if (post.platform === "telegram") {
    return createTelegramAdapterForAccount(post.accountId);
  }
  if (post.platform === "mastodon") {
    return createMastodonAdapterForAccount(post.accountId);
  }
  if (post.platform === "bluesky") {
    return createBlueskyAdapterForAccount(post.accountId);
  }
  return getSocialAdapter(post.platform);
}

/** Test-only. Never use in production adapters to call each other. */
export function setSocialAdapterOverride(
  platform: SocialPlatform,
  adapter: SocialAdapter | null
): void {
  if (adapter) testOverrides[platform] = adapter;
  else delete testOverrides[platform];
}

export function clearSocialAdapterOverrides(): void {
  for (const key of Object.keys(testOverrides) as SocialPlatform[]) {
    delete testOverrides[key];
  }
}
