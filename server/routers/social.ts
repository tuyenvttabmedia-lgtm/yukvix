import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { socialAccounts, socialPosts } from "../../drizzle/schema";
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
  getTelegramScheduleStatus,
  runTelegramScheduleTick,
} from "../social/schedule";
import { createTelegramAdapter } from "../social/adapters/telegram";
import {
  parseTelegramConfig,
  parseTelegramCredentials,
  telegramConfigForStorage,
} from "../social/telegram-config";
import { sanitizeSocialErrorMessage } from "../social/sanitize";
import {
  SocialAccountDisabledError,
  SocialApiError,
  type SocialAccountFlags,
  type SocialPlatform,
} from "../social/types";

const platformEnum = z.enum(["telegram", "mastodon", "bluesky", "x"]);

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

export const socialRouter = router({
  getConfig: adminProcedure.query(async () => loadSocialConfig()),

  getScheduleStatus: adminProcedure.query(async () => getTelegramScheduleStatus()),

  saveSchedule: adminProcedure
    .input(
      z.object({
        enabled: z.boolean(),
        intervalMinutes: z.number().finite(),
      })
    )
    .mutation(async ({ input }) => {
      const before = await loadSocialConfig();
      const next = await saveSocialConfig({
        schedule: {
          enabled: input.enabled,
          intervalMinutes: input.intervalMinutes,
        },
      });
      if (input.enabled && !before.schedule.enabled) {
        await saveScheduleState({
          lastRunAt: new Date().toISOString(),
          lastAlbumId: null,
          lastStatus: "enabled",
          lastPostId: null,
        });
      }
      return next.schedule;
    }),

  runScheduleNow: adminProcedure.mutation(async () => {
    return runTelegramScheduleTick({ force: true });
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
      if (input.platform !== "telegram") {
        throw new Error("Only Telegram accounts can be saved in this phase");
      }
      if (input.autoShare) {
        throw new Error("Telegram auto-share is not enabled yet");
      }
      const requireApproval = input.requireApproval ?? false;
      const incomingCreds = input.credentials
        ? parseTelegramCredentials(input.credentials)
        : null;
      const configJson = telegramConfigForStorage(
        input.configJson,
        incomingCreds?.chatId
      );
      const parsedConfig = parseTelegramConfig(configJson, incomingCreds ?? undefined);
      if (!parsedConfig.chatId) {
        throw new Error("Telegram chatId is required");
      }

      if (input.id) {
        const [existing] = await db
          .select()
          .from(socialAccounts)
          .where(eq(socialAccounts.id, input.id))
          .limit(1);
        if (!existing) throw new Error("Account not found");
        const patch: Record<string, unknown> = {
          platform: "telegram",
          displayName: input.displayName,
          isEnabled: input.isEnabled,
          autoShare: false,
          requireApproval,
          configJson,
        };
        if (incomingCreds) {
          patch.encryptedCredentials = await encryptSocialCredentialsAsync({
            botToken: incomingCreds.botToken,
            chatId: incomingCreds.chatId ?? parsedConfig.chatId,
          });
        }
        await db
          .update(socialAccounts)
          .set(patch)
          .where(eq(socialAccounts.id, input.id));
        return { id: input.id };
      }

      if (!incomingCreds)
        throw new Error("credentials are required for a new account");
      const [result] = await db.insert(socialAccounts).values({
        platform: "telegram",
        displayName: input.displayName,
        isEnabled: input.isEnabled,
        autoShare: false,
        requireApproval,
        configJson,
        encryptedCredentials: await encryptSocialCredentialsAsync({
          botToken: incomingCreds.botToken,
          chatId: incomingCreds.chatId ?? parsedConfig.chatId,
        }),
      });
      return { id: Number((result as { insertId?: number }).insertId ?? 0) };
    }),

  dryRun: adminProcedure
    .input(z.object({ albumId: z.number(), accountId: z.number() }))
    .mutation(async ({ input }) => {
      const account = await loadSocialAccount(input.accountId);
      if (!account) throw new Error("Account not found");
      if (account.platform !== "telegram") {
        throw new Error("Only Telegram dry-run is implemented");
      }
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
      if (row.platform !== "telegram") {
        throw new Error("Only Telegram validation is implemented");
      }
      try {
        const credentials = parseTelegramCredentials(
          await decryptSocialCredentialsAsync(row.encryptedCredentials)
        );
        const config = parseTelegramConfig(row.configJson, credentials);
        const adapter = createTelegramAdapter({ credentials, config });
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
      if (account.platform !== "telegram") {
        throw new Error("Only Telegram manual share is implemented");
      }
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
          limit: z.number().min(1).max(100).default(50),
        })
        .optional()
    )
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];
      const rows = input?.albumId
        ? await db
            .select()
            .from(socialPosts)
            .where(eq(socialPosts.albumId, input.albumId))
            .limit(input.limit ?? 50)
        : await db
            .select()
            .from(socialPosts)
            .limit(input?.limit ?? 50);
      return rows.map(row => ({
        id: row.id,
        albumId: row.albumId,
        accountId: row.accountId,
        platform: row.platform,
        trigger: row.trigger,
        status: row.status,
        scheduledAt: row.scheduledAt,
        contentRating: row.contentRating,
        caption: row.caption,
        mediaJson: row.mediaJson,
        policyJson: row.policyJson,
        externalPostId: row.externalPostId,
        externalUrl: row.externalUrl,
        attempts: row.attempts,
        lastError: row.lastError,
        createdAt: row.createdAt,
      }));
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
