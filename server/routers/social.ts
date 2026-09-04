import { and, desc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { albums, socialAccounts, socialPosts } from "../../drizzle/schema";
import { adminProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import {
  decryptSocialCredentialsAsync,
  encryptSocialCredentialsAsync,
  generateSocialCredentialsKeyHex,
  peekSocialCredentialsKey,
  saveSocialCredentialsKey,
} from "../social/crypto";
import { loadSocialConfig, saveScheduleState, saveSocialConfig } from "../social/config";
import { runSocialDryRun } from "../social/dry-run";
import { cancelSocialPost, retrySocialPost } from "../social/queue";
import { createManualShare, loadSocialAccount } from "../social/share";
import {
  getPlatformScheduleStatus,
  runPlatformScheduleTick,
} from "../social/schedule";
import { createTelegramAdapter } from "../social/adapters/telegram";
import { createMastodonAdapter } from "../social/adapters/mastodon";
import { createBlueskyAdapter } from "../social/adapters/bluesky";
import {
  parseTelegramConfig,
  parseTelegramCredentials,
  telegramConfigForStorage,
} from "../social/telegram-config";
import {
  parseMastodonConfig,
  parseMastodonCredentials,
  mastodonConfigForStorage,
} from "../social/mastodon-config";
import {
  parseBlueskyConfig,
  parseBlueskyCredentials,
  blueskyConfigForStorage,
} from "../social/bluesky-config";
import {
  parseXConfig,
  parseXCredentials,
  xConfigForStorage,
} from "../social/x-config";
import { createXAdapter } from "../social/adapters/x";
import { sanitizeSocialErrorMessage } from "../social/sanitize";
import {
  SocialAccountDisabledError,
  SocialApiError,
  type SocialAccountFlags,
  type SocialAdapter,
  type SocialPlatform,
} from "../social/types";

const platformEnum = z.enum(["telegram", "mastodon", "bluesky", "x"]);
const LIVE_PLATFORMS = ["telegram", "mastodon", "bluesky", "x"] as const;
const schedulePlatformEnum = z.enum(LIVE_PLATFORMS);

function publicAccount(row: {
  id: number;
  platform: SocialPlatform;
  displayName: string;
  isEnabled: boolean;
  autoShare: boolean;
  requireApproval: boolean;
  configJson: string | null;
  createdAt: Date;
  updatedAt: Date;
  encryptedCredentials?: string;
}) {
  return {
    id: row.id,
    platform: row.platform,
    displayName: row.displayName,
    isEnabled: row.isEnabled,
    autoShare: row.autoShare,
    requireApproval: row.requireApproval,
    configJson: redactAccountConfigJson(row.configJson),
    hasCredentials: Boolean(row.encryptedCredentials),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

const CONFIG_SECRET_KEY_RE =
  /token|secret|password|credential|authorization|refresh|bearer|apikey|api_key/i;

function redactAccountConfigJson(raw: string | null): string | null {
  if (!raw) return raw;
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return raw;
    }
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
      out[k] = CONFIG_SECRET_KEY_RE.test(k) ? "[redacted]" : v;
    }
    return JSON.stringify(out);
  } catch {
    return raw;
  }
}

async function prepareAccountPayload(input: {
  platform: SocialPlatform;
  configJson?: string;
  credentials?: Record<string, unknown>;
}): Promise<{ configJson: string; encrypted?: string }> {
  if (input.platform === "telegram") {
    const incoming = input.credentials
      ? parseTelegramCredentials(input.credentials)
      : null;
    const configJson = telegramConfigForStorage(input.configJson, incoming?.chatId);
    const parsed = parseTelegramConfig(configJson, incoming ?? undefined);
    if (!parsed.chatId) throw new Error("Telegram chatId is required");
    return {
      configJson,
      encrypted: incoming
        ? await encryptSocialCredentialsAsync({
            botToken: incoming.botToken,
            chatId: incoming.chatId ?? parsed.chatId,
          })
        : undefined,
    };
  }
  if (input.platform === "mastodon") {
    const incoming = input.credentials
      ? parseMastodonCredentials(input.credentials)
      : null;
    const configJson = mastodonConfigForStorage(
      input.configJson,
      incoming?.instanceUrl
    );
    const parsed = parseMastodonConfig(configJson, incoming ?? undefined);
    if (!parsed.instanceUrl) throw new Error("Mastodon instance URL is required");
    return {
      configJson,
      encrypted: incoming
        ? await encryptSocialCredentialsAsync({
            instanceUrl: incoming.instanceUrl,
            accessToken: incoming.accessToken,
          })
        : undefined,
    };
  }
  if (input.platform === "bluesky") {
    const incoming = input.credentials
      ? parseBlueskyCredentials(input.credentials)
      : null;
    const configJson = blueskyConfigForStorage(input.configJson, {
      identifier: incoming?.identifier,
      pdsUrl: incoming?.pdsUrl,
    });
    const parsed = parseBlueskyConfig(configJson, incoming ?? undefined);
    if (!parsed.identifier && !incoming) {
      throw new Error("Bluesky handle is required");
    }
    return {
      configJson,
      encrypted: incoming
        ? await encryptSocialCredentialsAsync({
            identifier: incoming.identifier,
            appPassword: incoming.appPassword,
            pdsUrl: incoming.pdsUrl,
          })
        : undefined,
    };
  }
  if (input.platform === "x") {
    const incoming = input.credentials ? parseXCredentials(input.credentials) : null;
    const configJson = xConfigForStorage(input.configJson);
    parseXConfig(configJson);
    return {
      configJson,
      encrypted: incoming
        ? await encryptSocialCredentialsAsync({
            apiKey: incoming.apiKey,
            apiSecret: incoming.apiSecret,
            accessToken: incoming.accessToken,
            accessTokenSecret: incoming.accessTokenSecret,
          })
        : undefined,
    };
  }
  throw new Error("Unsupported platform");
}

async function adapterForAccountRow(row: {
  platform: string;
  encryptedCredentials: string | null;
  configJson: string | null;
}): Promise<SocialAdapter> {
  const raw = await decryptSocialCredentialsAsync(row.encryptedCredentials);
  if (row.platform === "telegram") {
    const credentials = parseTelegramCredentials(raw);
    const config = parseTelegramConfig(row.configJson, credentials);
    return createTelegramAdapter({ credentials, config });
  }
  if (row.platform === "mastodon") {
    const credentials = parseMastodonCredentials(raw);
    const config = parseMastodonConfig(row.configJson, credentials);
    return createMastodonAdapter({ credentials, config });
  }
  if (row.platform === "bluesky") {
    const credentials = parseBlueskyCredentials(raw);
    const config = parseBlueskyConfig(row.configJson, credentials);
    return createBlueskyAdapter({ credentials, config });
  }
  if (row.platform === "x") {
    const credentials = parseXCredentials(raw);
    const config = parseXConfig(row.configJson);
    return createXAdapter({ credentials, config });
  }
  throw new Error("Unsupported platform");
}

export const socialRouter = router({
  getConfig: adminProcedure.query(async () => loadSocialConfig()),

  getScheduleStatus: adminProcedure
    .input(z.object({ platform: schedulePlatformEnum.default("telegram") }).optional())
    .query(async ({ input }) => getPlatformScheduleStatus(input?.platform ?? "telegram")),

  saveSchedule: adminProcedure
    .input(
      z.object({
        platform: schedulePlatformEnum.default("telegram"),
        enabled: z.boolean(),
        intervalMinutes: z.number().finite(),
      })
    )
    .mutation(async ({ input }) => {
      const platform = input.platform;
      const before = await loadSocialConfig();
      const patch =
        platform === "telegram"
          ? {
              schedule: {
                enabled: input.enabled,
                intervalMinutes: input.intervalMinutes,
              },
            }
          : {
              schedules: {
                ...before.schedules,
                [platform]: {
                  enabled: input.enabled,
                  intervalMinutes: input.intervalMinutes,
                },
              },
            };
      const next = await saveSocialConfig(patch);
      const wasEnabled =
        platform === "telegram"
          ? before.schedule.enabled
          : before.schedules[platform].enabled;
      if (input.enabled && !wasEnabled) {
        await saveScheduleState(
          {
            lastRunAt: new Date().toISOString(),
            lastAlbumId: null,
            lastStatus: "enabled",
            lastPostId: null,
          },
          platform
        );
      }
      return platform === "telegram" ? next.schedule : next.schedules[platform];
    }),

  runScheduleNow: adminProcedure
    .input(z.object({ platform: schedulePlatformEnum.default("telegram") }).optional())
    .mutation(async ({ input }) => {
      return runPlatformScheduleTick(input?.platform ?? "telegram", { force: true });
    }),

  getCredentialsKeyStatus: adminProcedure.query(async () => peekSocialCredentialsKey()),

  saveCredentialsKey: adminProcedure
    .input(
      z.object({
        key: z.string().optional(),
      })
    )
    .mutation(async ({ input }) => {
      const raw = input.key?.trim() || generateSocialCredentialsKeyHex();
      return saveSocialCredentialsKey(raw);
    }),

  listAccounts: adminProcedure.query(async () => {
    const db = await getDb();
    if (!db) return [];
    const rows = await db.select().from(socialAccounts);
    return rows.map(publicAccount);
  }),

  deleteAccount: adminProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");
      const [row] = await db
        .select({ id: socialAccounts.id })
        .from(socialAccounts)
        .where(eq(socialAccounts.id, input.id))
        .limit(1);
      if (!row) throw new Error("Account not found");
      await db
        .update(socialPosts)
        .set({ status: "cancelled", processedAt: new Date() })
        .where(
          and(
            eq(socialPosts.accountId, input.id),
            inArray(socialPosts.status, [
              "pending",
              "awaiting_approval",
              "processing",
            ])
          )
        );
      await db.delete(socialAccounts).where(eq(socialAccounts.id, input.id));
      return { ok: true as const };
    }),

  upsertAccount: adminProcedure
    .input(
      z.object({
        id: z.number().optional(),
        platform: platformEnum,
        displayName: z.string().min(1).max(128),
        isEnabled: z.boolean().default(false),
        autoShare: z.boolean().default(false),
        requireApproval: z.boolean().optional(),
        configJson: z.string().optional(),
        credentials: z.record(z.string(), z.unknown()).optional(),
      })
    )
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");
      if (input.autoShare) {
        throw new Error("Auto-share lúc publish album chưa bật — dùng lịch random");
      }
      const requireApproval = input.requireApproval ?? false;
      const prepared = await prepareAccountPayload(input);

      if (input.id) {
        const [existing] = await db
          .select()
          .from(socialAccounts)
          .where(eq(socialAccounts.id, input.id))
          .limit(1);
        if (!existing) throw new Error("Account not found");
        if (existing.platform !== input.platform) {
          throw new Error("Cannot change account platform");
        }
        const patch: Record<string, unknown> = {
          displayName: input.displayName,
          isEnabled: input.isEnabled,
          autoShare: false,
          requireApproval,
          configJson: prepared.configJson,
        };
        if (prepared.encrypted) {
          patch.encryptedCredentials = prepared.encrypted;
        }
        await db
          .update(socialAccounts)
          .set(patch)
          .where(eq(socialAccounts.id, input.id));
        return { id: input.id };
      }

      if (!prepared.encrypted)
        throw new Error("credentials are required for a new account");
      const [result] = await db.insert(socialAccounts).values({
        platform: input.platform,
        displayName: input.displayName,
        isEnabled: input.isEnabled,
        autoShare: false,
        requireApproval,
        configJson: prepared.configJson,
        encryptedCredentials: prepared.encrypted,
      });
      return { id: Number((result as { insertId?: number }).insertId ?? 0) };
    }),

  dryRun: adminProcedure
    .input(z.object({ albumId: z.number(), accountId: z.number() }))
    .mutation(async ({ input }) => {
      const account = await loadSocialAccount(input.accountId);
      if (!account) throw new Error("Account not found");
      try {
        return await runSocialDryRun({ albumId: input.albumId, account });
      } catch (err) {
        if (err instanceof SocialAccountDisabledError) throw err;
        throw err;
      }
    }),

  validateAccount: adminProcedure
    .input(z.object({ accountId: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");
      const [row] = await db
        .select()
        .from(socialAccounts)
        .where(eq(socialAccounts.id, input.accountId))
        .limit(1);
      if (!row) throw new Error("Account not found");
      try {
        const adapter = await adapterForAccountRow(row);
        await adapter.validateConnection();
        const info = await adapter.getAccountInfo();
        return { ok: true as const, info };
      } catch (err) {
        return {
          ok: false as const,
          reason: sanitizeSocialErrorMessage(
            err instanceof SocialApiError ? err.message : err
          ),
        };
      }
    }),

  createManualShare: adminProcedure
    .input(
      z.object({
        albumId: z.number(),
        accountId: z.number(),
        scheduledAt: z.date().optional(),
        force: z.boolean().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const account = await loadSocialAccount(input.accountId);
      if (!account) throw new Error("Account not found");
      return createManualShare({
        albumId: input.albumId,
        account,
        createdBy: ctx.user.id,
        scheduledAt: input.scheduledAt,
        force: input.force,
      });
    }),

  listPosts: adminProcedure
    .input(
      z
        .object({
          albumId: z.number().optional(),
          platform: platformEnum.optional(),
          limit: z.number().min(1).max(100).default(50),
        })
        .optional()
    )
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];
      const filters = [];
      if (input?.albumId) filters.push(eq(socialPosts.albumId, input.albumId));
      if (input?.platform) filters.push(eq(socialPosts.platform, input.platform));
      const rows = await db
        .select({
          id: socialPosts.id,
          albumId: socialPosts.albumId,
          albumTitle: albums.title,
          accountId: socialPosts.accountId,
          platform: socialPosts.platform,
          trigger: socialPosts.trigger,
          status: socialPosts.status,
          scheduledAt: socialPosts.scheduledAt,
          contentRating: socialPosts.contentRating,
          caption: socialPosts.caption,
          mediaJson: socialPosts.mediaJson,
          policyJson: socialPosts.policyJson,
          externalPostId: socialPosts.externalPostId,
          externalUrl: socialPosts.externalUrl,
          attempts: socialPosts.attempts,
          lastError: socialPosts.lastError,
          createdAt: socialPosts.createdAt,
        })
        .from(socialPosts)
        .leftJoin(albums, eq(albums.id, socialPosts.albumId))
        .where(filters.length ? and(...filters) : undefined)
        .orderBy(desc(socialPosts.id))
        .limit(input?.limit ?? 50);
      return rows;
    }),

  cancelPost: adminProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      return { ok: await cancelSocialPost(input.id) };
    }),

  retryPost: adminProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      return { ok: await retrySocialPost(input.id) };
    }),
});

export type { SocialAccountFlags };
