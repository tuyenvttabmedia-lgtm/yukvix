/**
 * Scheduled handler: auto-run Bulk SEO generation daily for albums, creators, and tags missing SEO.
 * Triggered by Linux crontab daily via POST /api/scheduled/auto-bulk-seo.
 * Auth: X-Cron-Secret header must match CRON_SECRET env var or admin_settings key 'cron.secret'.
 *
 * Setup on VPS:
 *   1. Set CRON_SECRET in /etc/systemd/system/cosplay-gallery.service (Environment=CRON_SECRET=your-secret)
 *   2. Add to crontab: 0 2 * * * curl -s -X POST http://localhost:3000/api/scheduled/auto-bulk-seo -H "X-Cron-Secret: your-secret"
 */
import type { Request, Response } from "express";
import { getDb } from "../db";
import { albums, creators, adminSettings } from "../../drizzle/schema";
import { and, eq, isNull, or, sql } from "drizzle-orm";
import { callAi } from "../services/ai-provider";
import { notifyOwner } from "../_core/notification";

async function verifyCronSecret(req: Request): Promise<boolean> {
  const provided = (req.headers["x-cron-secret"] as string | undefined)?.trim();
  if (!provided) return false;
  // 1. Check CRON_SECRET env var
  const envSecret = process.env.CRON_SECRET;
  if (envSecret && provided === envSecret) return true;
  // 2. Fallback: check admin_settings table key 'cron.secret'
  try {
    const db = await getDb();
    if (!db) return false;
    const rows = await db
      .select({ value: adminSettings.value })
      .from(adminSettings)
      .where(eq(adminSettings.key, "cron.secret"))
      .limit(1);
    if (rows.length > 0 && rows[0].value && provided === rows[0].value) return true;
  } catch {}
  return false;
}

export async function autoBulkSeoHandler(req: Request, res: Response) {
  try {
    // Authenticate — verify cron secret
    const valid = await verifyCronSecret(req);
    if (!valid) {
      return res.status(403).json({ error: "Invalid or missing X-Cron-Secret header" });
    }

    const db = await getDb();
    if (!db) {
      return res.status(500).json({ error: "DB unavailable", timestamp: new Date().toISOString() });
    }

    // ── Load config from admin_settings ─────────────────────────────────────
    let autoSeoConfig = { enabled: true, cronHour: 2, maxAlbums: 20, maxCreators: 10, maxTags: 10 };
    try {
      const configRows = await db.select({ value: adminSettings.value }).from(adminSettings).where(eq(adminSettings.key, "auto_seo_config")).limit(1);
      if (configRows[0]?.value) {
        const parsed = JSON.parse(configRows[0].value);
        autoSeoConfig = { ...autoSeoConfig, ...parsed };
      }
    } catch {}

    // If schedule is disabled and this is a cron call (not manual), skip
    const isManualRun = req.headers["x-manual-run"] === "1";
    if (!autoSeoConfig.enabled && !isManualRun) {
      return res.json({ ok: true, skipped: true, message: "Auto Schedule is disabled. Enable it in Admin → Bulk SEO → Auto Schedule.", timestamp: new Date().toISOString() });
    }

    const results = {
      albumsProcessed: 0,
      albumsFailed: 0,
      creatorsProcessed: 0,
      creatorsFailed: 0,
      tagsProcessed: 0,
      tagsFailed: 0,
    };

    // ── 1. Albums missing SEO (focusKeyword or metaTitle is null/empty) ──────
    const albumsMissingSeo = await db
      .select({ id: albums.id, title: albums.title, cosplayer: albums.cosplayer, character: albums.character, series: albums.series })
      .from(albums)
      .where(
        and(
          eq(albums.status, "published"),
          or(isNull(albums.focusKeyword), eq(albums.focusKeyword, ""), isNull(albums.metaTitle), eq(albums.metaTitle, ""))
        )
      )
      .limit(autoSeoConfig.maxAlbums); // Configurable via Admin → Bulk SEO → Auto Schedule

    for (const album of albumsMissingSeo) {
      try {
        const seoResult = await callAi({
          messages: [
            { role: "system", content: "You are an SEO expert for a cosplay gallery. Return only valid JSON." },
            {
              role: "user",
              content: `Generate SEO metadata for this cosplay album:
Title: ${album.title || "Unknown"}
Cosplayer: ${album.cosplayer || "Unknown"}
Character: ${album.character || ""}
Series: ${album.series || ""}

Return JSON: { "metaTitle": "string (max 60 chars)", "metaDescription": "string (max 160 chars)", "focusKeyword": "string (1-3 words)", "shortDescription": "string (max 300 chars)" }`,
            },
          ],
          responseFormat: {
            type: "json_schema",
            json_schema: {
              name: "album_seo",
              strict: true,
              schema: {
                type: "object",
                properties: {
                  metaTitle: { type: "string" },
                  metaDescription: { type: "string" },
                  focusKeyword: { type: "string" },
                  shortDescription: { type: "string" },
                },
                required: ["metaTitle", "metaDescription", "focusKeyword", "shortDescription"],
                additionalProperties: false,
              },
            },
          },
        });

        if (seoResult.content) {
          const seo = JSON.parse(seoResult.content);
          await db
            .update(albums)
            .set({
              metaTitle: seo.metaTitle || undefined,
              seoTitle: seo.metaTitle || undefined,
              metaDescription: seo.metaDescription || undefined,
              seoDescription: seo.metaDescription || undefined,
              focusKeyword: seo.focusKeyword || undefined,
              shortDescription: seo.shortDescription || undefined,
              updatedAt: new Date(),
            })
            .where(eq(albums.id, album.id));
          results.albumsProcessed++;
        }
      } catch {
        results.albumsFailed++;
      }
      // Small delay to avoid rate limiting
      await new Promise((r) => setTimeout(r, 300));
    }

    // ── 2. Creators missing SEO (bio is null/empty) ──────────────────────────
    const creatorsMissingSeo = await db
      .select({ id: creators.id, name: creators.name, slug: creators.slug })
      .from(creators)
      .where(or(isNull(creators.bio), eq(creators.bio, "")))
      .limit(autoSeoConfig.maxCreators);

    for (const creator of creatorsMissingSeo) {
      try {
        const seoResult = await callAi({
          messages: [
            { role: "system", content: "You are an SEO expert for a cosplay gallery. Return only valid JSON." },
            {
              role: "user",
              content: `Generate a short bio/description for this cosplay creator:
Name: ${creator.name}

Return JSON: { "bio": "string (2-3 sentences, max 300 chars)", "metaDescription": "string (max 160 chars)" }`,
            },
          ],
          responseFormat: {
            type: "json_schema",
            json_schema: {
              name: "creator_seo",
              strict: true,
              schema: {
                type: "object",
                properties: {
                  bio: { type: "string" },
                  metaDescription: { type: "string" },
                },
                required: ["bio", "metaDescription"],
                additionalProperties: false,
              },
            },
          },
        });

        if (seoResult.content) {
          const seo = JSON.parse(seoResult.content);
          await db
            .update(creators)
            .set({
              bio: seo.bio || undefined,
              seoDescription: seo.metaDescription || undefined,
              updatedAt: new Date(),
            })
            .where(eq(creators.id, creator.id));
          results.creatorsProcessed++;
        }
      } catch {
        results.creatorsFailed++;
      }
      await new Promise((r) => setTimeout(r, 300));
    }

    // ── 3. Albums missing tags (no tags linked) ──────────────────────────────
    const albumsMissingTags = await db
      .select({ id: albums.id, title: albums.title, cosplayer: albums.cosplayer })
      .from(albums)
      .where(
        and(
          eq(albums.status, "published"),
          sql`NOT EXISTS (SELECT 1 FROM album_tags WHERE album_tags.albumId = ${albums.id})`
        )
      )
      .limit(autoSeoConfig.maxTags);

    for (const album of albumsMissingTags) {
      try {
        const tagResult = await callAi({
          messages: [
            { role: "system", content: "You are a cosplay content tagging expert. Return only valid JSON." },
            {
              role: "user",
              content: `Suggest 5-8 tags for this cosplay album:
Title: ${album.title || "Unknown"}
Cosplayer: ${album.cosplayer || "Unknown"}

Return JSON: { "tags": ["tag1", "tag2", ...] }`,
            },
          ],
          responseFormat: {
            type: "json_schema",
            json_schema: {
              name: "tag_suggestions",
              strict: true,
              schema: {
                type: "object",
                properties: {
                  tags: { type: "array", items: { type: "string" } },
                },
                required: ["tags"],
                additionalProperties: false,
              },
            },
          },
        });

        if (tagResult.content) {
          const { tags: suggestedTags } = JSON.parse(tagResult.content);
          if (Array.isArray(suggestedTags) && suggestedTags.length > 0) {
            const { upsertTag, setAlbumTags } = await import("../db");
            const tagIds: number[] = [];
            for (const tagName of suggestedTags.slice(0, 8)) {
              const slug = tagName.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
              const tag = await upsertTag(tagName, slug);
              if (tag?.id) tagIds.push(tag.id);
            }
            if (tagIds.length > 0) {
              await setAlbumTags(album.id, tagIds);
            }
            results.tagsProcessed++;
          }
        }
      } catch {
        results.tagsFailed++;
      }
      await new Promise((r) => setTimeout(r, 300));
    }

    // ── Notify owner if anything was processed ────────────────────────────────
    const totalProcessed = results.albumsProcessed + results.creatorsProcessed + results.tagsProcessed;
    if (totalProcessed > 0) {
      await notifyOwner({
        title: "Auto Bulk SEO hoàn thành",
        content: `Đã tự động tạo SEO:\n- Albums: ${results.albumsProcessed} (${results.albumsFailed} lỗi)\n- Creators: ${results.creatorsProcessed} (${results.creatorsFailed} lỗi)\n- Tags cho albums: ${results.tagsProcessed} (${results.tagsFailed} lỗi)`,
      });
    }

    return res.json({
      ok: true,
      timestamp: new Date().toISOString(),
      results,
      message: totalProcessed > 0 ? `Processed ${totalProcessed} items` : "Nothing to process",
    });
  } catch (err: any) {
    console.error("[AutoBulkSEO] Error:", err);
    return res.status(500).json({ error: err.message, timestamp: new Date().toISOString() });
  }
}
