/**
 * CMS Router — site settings, menus, static pages, category management
 * All admin mutations require admin role.
 * Public queries (getPublicSettings, getPublicPage, getPublicMenu) are open.
 */
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, publicProcedure, protectedProcedure } from "../_core/trpc";
import { getDb } from "../db";
import { siteSettings, menus, menuItems, staticPages, categories, contactSubmissions, dmcaSubmissions } from "../../drizzle/schema";
import { eq, asc, desc } from "drizzle-orm";
import { getPresignedPutUrl, isWasabiConfigured, refreshWasabiConfig, uploadToStorage } from "../storage-wasabi";
import {
  CMS_MAX_UPLOAD_BYTES,
  cmsMediaPath,
  extensionFromFilename,
  isCmsFolder,
  normalizeCmsContentType,
  rewriteCmsSettings,
} from "../cms-media";
import { getWasabiSettings, setSetting, deleteSetting, invalidateSettingsCache } from "../settings-service";
import { nanoid } from "nanoid";
import { invokeLLM } from "../_core/llm.js";
import { isAdmin, isVipOrAdmin } from '@shared/const';
// -- helpers -------------------------------------------------------------------
const adminProcedure = protectedProcedure.use(({ ctx, next }) => {
  if (!isAdmin(ctx.user.role)) throw new TRPCError({ code: "FORBIDDEN" });
  return next({ ctx });
});

/** Upsert a site_settings key */
async function upsertSetting(key: string, value: string | null) {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
  const existing = await db.select().from(siteSettings).where(eq(siteSettings.key, key));
  if (existing.length > 0) {
    await db.update(siteSettings).set({ value }).where(eq(siteSettings.key, key));
  } else {
    await db.insert(siteSettings).values({ key, value });
  }
}

/** Get all settings as a key→value map */
async function getAllSettings(): Promise<Record<string, string | null>> {
  const db = await getDb();
  if (!db) return {};
  const rows = await db.select().from(siteSettings);
  return rewriteCmsSettings(Object.fromEntries(rows.map((r) => [r.key, r.value])));
}

// -- Router --------------------------------------------------------------------
export const cmsRouter = router({
  // -- Public: site settings (logo, social links, footer text) -----------------
  getPublicSettings: publicProcedure.query(async () => {
    return getAllSettings();
  }),

  // -- Public: get a single published page -------------------------------------
  getPublicPage: publicProcedure
    .input(z.object({ slug: z.string(), lang: z.string().optional() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const rows = await db
        .select()
        .from(staticPages)
        .where(eq(staticPages.slug, input.slug));
      const page = rows[0];
      if (!page || page.status !== "published") {
        throw new TRPCError({ code: "NOT_FOUND", message: "Page not found" });
      }
      // Return localized content based on requested language, fallback to English
      const lang = input.lang ?? "en";
      const langMap: Record<string, { title: string | null; content: string | null }> = {
        vi: { title: page.titleVi, content: page.contentVi },
        ja: { title: page.titleJa, content: page.contentJa },
        ko: { title: page.titleKo, content: page.contentKo },
        "zh-TW": { title: page.titleZhTw, content: page.contentZhTw },
        "zh-CN": { title: page.titleZhCn, content: page.contentZhCn },
      };
      const localized = langMap[lang];
      return {
        ...page,
        title: (localized?.title) || page.title,
        content: (localized?.content) || page.content,
      };
    }),

  // -- Public: get menu by location ---------------------------------------------
  getPublicMenu: publicProcedure
    .input(z.object({ location: z.enum(["main", "footer", "mobile"]) }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return { items: [] };
      const menuRows = await db
        .select()
        .from(menus)
        .where(eq(menus.location, input.location));
      if (!menuRows[0]) return { items: [] };
      const items = await db
        .select()
        .from(menuItems)
        .where(eq(menuItems.menuId, menuRows[0].id))
        .orderBy(asc(menuItems.sortOrder));
      return { menu: menuRows[0], items };
    }),

  // -- Admin: get all settings ---------------------------------------------------
  getSettings: adminProcedure.query(async () => {
    return getAllSettings();
  }),

  // -- Admin: update appearance settings ----------------------------------------
  updateSettings: adminProcedure
    .input(
      z.object({
        settings: z.record(z.string(), z.string().nullable()),
      })
    )
    .mutation(async ({ input }) => {
      for (const [key, value] of Object.entries(input.settings)) {
        await upsertSetting(key, value);
      }
      return { success: true };
    }),

  // -- Admin: presigned PUT URL for CMS media uploads ---------------------------
  presignedUpload: adminProcedure
    .input(
      z.object({
        filename: z.string(),
        contentType: z.string(),
        folder: z.string().default("cms"),
      })
    )
    .mutation(async ({ input }) => {
      if (!isCmsFolder(input.folder)) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Invalid CMS folder" });
      }
      const ext = extensionFromFilename(input.filename) || "png";
      const key = `${input.folder}/${nanoid(12)}.${ext}`;
      const contentType = normalizeCmsContentType(input.filename, input.contentType);
      const uploadUrl = await getPresignedPutUrl(key, contentType);
      // Bucket is private — public Wasabi URLs 403. Serve via same-origin proxy.
      return { uploadUrl, key, publicUrl: cmsMediaPath(key) };
    }),

  // -- Admin: server-side CMS upload (avoids browser CORS to Wasabi) ------------
  uploadAsset: adminProcedure
    .input(
      z.object({
        filename: z.string(),
        contentType: z.string().optional(),
        folder: z.string().default("cms"),
        fileBase64: z.string(),
      })
    )
    .mutation(async ({ input }) => {
      if (!isCmsFolder(input.folder)) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Invalid CMS folder" });
      }
      if (!isWasabiConfigured()) {
        throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Wasabi chưa được cấu hình" });
      }
      const ext = extensionFromFilename(input.filename);
      if (!ext) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Chỉ nhận PNG, JPG, WebP, SVG, ICO, GIF",
        });
      }
      const buffer = Buffer.from(input.fileBase64, "base64");
      if (!buffer.length) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "File rỗng hoặc không đọc được" });
      }
      if (buffer.length > CMS_MAX_UPLOAD_BYTES) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "File quá lớn (tối đa 2MB)" });
      }
      const key = `${input.folder}/${nanoid(12)}.${ext}`;
      const contentType = normalizeCmsContentType(input.filename, input.contentType);
      await uploadToStorage(key, buffer, contentType, { isPrivate: false });
      return { key, publicUrl: cmsMediaPath(key) };
    }),

  // -- Admin: list all static pages ---------------------------------------------
  listPages: adminProcedure.query(async () => {
    const db = await getDb();
    if (!db) return [];
    return db
      .select({
        id: staticPages.id,
        slug: staticPages.slug,
        title: staticPages.title,
        status: staticPages.status,
        updatedAt: staticPages.updatedAt,
      })
      .from(staticPages)
      .orderBy(asc(staticPages.slug));
  }),

  // -- Admin: get single page by slug -------------------------------------------
  getPage: adminProcedure
    .input(z.object({ slug: z.string() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const rows = await db
        .select()
        .from(staticPages)
        .where(eq(staticPages.slug, input.slug));
      if (!rows[0]) throw new TRPCError({ code: "NOT_FOUND" });
      return rows[0];
    }),

  // -- Admin: save (upsert) a static page ---------------------------------------
  savePage: adminProcedure
    .input(
      z.object({
        slug: z.string().min(1).max(128),
        title: z.string().min(1).max(256),
        content: z.string().default(""),
        // Multilingual content
        contentVi: z.string().optional().nullable(),
        contentJa: z.string().optional().nullable(),
        contentKo: z.string().optional().nullable(),
        contentZhTw: z.string().optional().nullable(),
        contentZhCn: z.string().optional().nullable(),
        titleVi: z.string().max(256).optional().nullable(),
        titleJa: z.string().max(256).optional().nullable(),
        titleKo: z.string().max(256).optional().nullable(),
        titleZhTw: z.string().max(256).optional().nullable(),
        titleZhCn: z.string().max(256).optional().nullable(),
        seoTitle: z.string().max(256).optional(),
        seoDescription: z.string().optional(),
        status: z.enum(["draft", "published"]).default("published"),
      })
    )
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const existing = await db
        .select({ id: staticPages.id })
        .from(staticPages)
        .where(eq(staticPages.slug, input.slug));
      const pageData = {
        title: input.title,
        content: input.content,
        contentVi: input.contentVi ?? null,
        contentJa: input.contentJa ?? null,
        contentKo: input.contentKo ?? null,
        contentZhTw: input.contentZhTw ?? null,
        contentZhCn: input.contentZhCn ?? null,
        titleVi: input.titleVi ?? null,
        titleJa: input.titleJa ?? null,
        titleKo: input.titleKo ?? null,
        titleZhTw: input.titleZhTw ?? null,
        titleZhCn: input.titleZhCn ?? null,
        seoTitle: input.seoTitle ?? null,
        seoDescription: input.seoDescription ?? null,
        status: input.status,
      };
      if (existing.length > 0) {
        await db
          .update(staticPages)
          .set(pageData)
          .where(eq(staticPages.slug, input.slug));
      } else {
        await db.insert(staticPages).values({ slug: input.slug, ...pageData });
      }
      return { success: true };
    }),

  // -- Admin: get all menus with items ------------------------------------------
  getMenus: adminProcedure.query(async () => {
    const db = await getDb();
    if (!db) return [];
    const allMenus = await db.select().from(menus);
    const allItems = await db
      .select()
      .from(menuItems)
      .orderBy(asc(menuItems.sortOrder));
    return allMenus.map((m) => ({
      ...m,
      items: allItems.filter((i) => i.menuId === m.id),
    }));
  }),

  // -- Admin: save menu items (replace all items for a menu location) ------------
  saveMenu: adminProcedure
    .input(
      z.object({
        location: z.enum(["main", "footer", "mobile"]),
        items: z.array(
          z.object({
            label: z.string().min(1).max(128),
            url: z.string().min(1).max(512),
            target: z.enum(["_self", "_blank"]).default("_self"),
            sortOrder: z.number().int().default(0),
            parentId: z.number().int().nullable().optional(),
          })
        ),
      })
    )
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      // Ensure menu row exists
      let menuRows = await db
        .select()
        .from(menus)
        .where(eq(menus.location, input.location));
      let menuId: number;
      if (menuRows.length === 0) {
        const label =
          input.location === "main"
            ? "Main Navigation"
            : input.location === "footer"
            ? "Footer Navigation"
            : "Mobile Navigation";
        const result = await db.insert(menus).values({ location: input.location, label });
        menuId = (result as any).insertId;
      } else {
        menuId = menuRows[0].id;
      }

      // Delete existing items and re-insert
      await db.delete(menuItems).where(eq(menuItems.menuId, menuId));
      if (input.items.length > 0) {
        await db.insert(menuItems).values(
          input.items.map((item, idx) => ({
            menuId,
            label: item.label,
            url: item.url,
            target: item.target,
            sortOrder: item.sortOrder ?? idx,
            parentId: item.parentId ?? null,
          }))
        );
      }
      return { success: true };
    }),

  // -- Admin: list categories (with new SEO fields) ------------------------------
  listCategories: adminProcedure.query(async () => {
    const db = await getDb();
    if (!db) return [];
    return db.select().from(categories).orderBy(asc(categories.sortOrder), asc(categories.name));
  }),

  // -- Admin: upsert category ----------------------------------------------------
  saveCategory: adminProcedure
    .input(
      z.object({
        id: z.number().int().optional(),
        name: z.string().min(1).max(128),
        slug: z.string().min(1).max(128),
        description: z.string().optional(),
        coverUrl: z.string().optional(),
        coverKey: z.string().optional(),
        seoTitle: z.string().max(256).optional(),
        seoDescription: z.string().optional(),
        sortOrder: z.number().int().default(0),
      })
    )
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const { id, ...data } = input;
      if (id) {
        await db
          .update(categories)
          .set({
            name: data.name,
            slug: data.slug,
            description: data.description ?? null,
            coverUrl: data.coverUrl ?? null,
            coverKey: data.coverKey ?? null,
            seoTitle: data.seoTitle ?? null,
            seoDescription: data.seoDescription ?? null,
            sortOrder: data.sortOrder,
          })
          .where(eq(categories.id, id));
        return { id };
      } else {
        const result = await db.insert(categories).values({
          name: data.name,
          slug: data.slug,
          description: data.description ?? null,
          coverUrl: data.coverUrl ?? null,
          coverKey: data.coverKey ?? null,
          seoTitle: data.seoTitle ?? null,
          seoDescription: data.seoDescription ?? null,
          sortOrder: data.sortOrder,
        });
        return { id: (result as any).insertId };
      }
    }),

  // -- Admin: get Wasabi / S3 storage configuration ------------------------------------------------------------------------------
  getStorageConfig: adminProcedure.query(async () => {
    const cfg = await getWasabiSettings();
    const maskVal = (v: string) =>
      v.length <= 8 ? (v ? "••••••••" : "") : v.slice(0, 4) + "••••••••" + v.slice(-4);
    return {
      bucket: cfg.bucket,
      region: cfg.region,
      endpoint: cfg.endpoint,
      cdnBaseUrl: cfg.cdnBaseUrl,
      cdnEnabled: cfg.cdnEnabled,
      accessKeyId: cfg.accessKeyId ? maskVal(cfg.accessKeyId) : "",
      secretAccessKey: cfg.secretAccessKey ? maskVal(cfg.secretAccessKey) : "",
      accessKeyIdConfigured: !!cfg.accessKeyId,
      secretAccessKeyConfigured: !!cfg.secretAccessKey,
      configured: !!(cfg.bucket && cfg.accessKeyId && cfg.secretAccessKey),
      bucketSource: (process.env.WASABI_BUCKET ? "env" : cfg.bucket ? "db" : "none") as "env" | "db" | "none",
    };
  }),

  // -- Admin: save Wasabi / S3 storage configuration ------------------------------------------------------------------------------
  saveStorageConfig: adminProcedure
    .input(z.object({
      bucket: z.string().optional(),
      region: z.string().optional(),
      endpoint: z.string().optional(),
      cdnBaseUrl: z.string().optional(),
      cdnEnabled: z.boolean().optional(),
      accessKeyId: z.string().optional(),
      secretAccessKey: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const save = async (key: string, val: string | undefined) => {
        if (val === undefined) return;
        if (val.includes("•")) return; // masked display value — unchanged
        if (val === "") await deleteSetting(key);
        else await setSetting(key, val);
      };
      await save("wasabi.bucket", input.bucket);
      await save("wasabi.region", input.region);
      await save("wasabi.endpoint", input.endpoint);
      await save("wasabi.cdn_base_url", input.cdnBaseUrl);
      if (input.cdnEnabled !== undefined) {
        await setSetting("wasabi.cdn_enabled", String(input.cdnEnabled));
      }
      await save("wasabi.access_key_id", input.accessKeyId);
      await save("wasabi.secret_access_key", input.secretAccessKey);
      invalidateSettingsCache();
      await refreshWasabiConfig();
      return { success: true };
    }),

  // -- Admin: get watermark config
  getWatermarkConfig: adminProcedure.query(async () => {
    const { getWatermarkSettings } = await import("../settings-service");
    const cfg = await getWatermarkSettings();
    return cfg;
  }),
  saveWatermarkConfig: adminProcedure
    .input(z.object({
      enabled: z.boolean().optional(),
      key: z.string().optional(),
      opacity: z.number().min(0).max(1).optional(),
      position: z.enum(["southeast","southwest","northeast","northwest","center"]).optional(),
    }))
    .mutation(async ({ input }) => {
      const { setSetting, invalidateSettingsCache } = await import("../settings-service");
      if (input.enabled !== undefined) await setSetting("watermark.enabled", String(input.enabled));
      if (input.key !== undefined) await setSetting("watermark.key", input.key);
      if (input.opacity !== undefined) await setSetting("watermark.opacity", String(input.opacity));
      if (input.position !== undefined) await setSetting("watermark.position", input.position);
      invalidateSettingsCache();
      return { success: true };
    }),
  // -- Admin: delete category ------------------------------------------------------------------------------
  deleteCategory: adminProcedure
    .input(z.object({ id: z.number().int() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      await db.delete(categories).where(eq(categories.id, input.id));
      return { success: true };
    }),

  // -- Public: submit contact form -----------------------------------------------
  submitContact: publicProcedure
    .input(z.object({
      name: z.string().min(2).max(128),
      email: z.string().email().max(256),
      subject: z.string().min(3).max(256),
      message: z.string().min(10).max(5000),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      await db.insert(contactSubmissions).values({
        name: input.name,
        email: input.email,
        subject: input.subject,
        message: input.message,
      });
      // Send notification email to admin
      try {
        const { sendAdminNotificationEmail } = await import("../email");
        await sendAdminNotificationEmail({
          subject: `[Contact] ${input.subject}`,
          body: `<p><strong>From:</strong> ${input.name} &lt;${input.email}&gt;</p><p><strong>Subject:</strong> ${input.subject}</p><p><strong>Message:</strong></p><p>${input.message.replace(/\n/g, "<br>")}</p>`,
        });
      } catch (e) {
        // Non-fatal: log but don't fail the submission
        console.error("[Contact] Failed to send admin notification:", e);
      }
      return { success: true };
    }),

  // -- Public: submit DMCA takedown notice ---------------------------------------
  submitDmca: publicProcedure
    .input(z.object({
      name: z.string().min(2).max(128),
      email: z.string().email().max(256),
      reporterUrl: z.string().url().max(512).optional(),
      infringingUrl: z.string().min(5).max(5000),
      originalWorkUrl: z.string().url().max(512).optional(),
      description: z.string().min(20).max(5000),
      declaration: z.boolean().refine((v) => v === true, { message: "You must confirm the declaration" }),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      await db.insert(dmcaSubmissions).values({
        name: input.name,
        email: input.email,
        reporterUrl: input.reporterUrl,
        infringingUrl: input.infringingUrl,
        originalWorkUrl: input.originalWorkUrl,
        description: input.description,
        declaration: input.declaration,
      });
      // Send notification email to admin
      try {
        const { sendAdminNotificationEmail } = await import("../email");
        await sendAdminNotificationEmail({
          subject: `[DMCA] Takedown Notice from ${input.name}`,
          body: `<p><strong>Reporter:</strong> ${input.name} &lt;${input.email}&gt;</p><p><strong>Infringing URL:</strong> ${input.infringingUrl}</p><p><strong>Original Work:</strong> ${input.originalWorkUrl || "Not provided"}</p><p><strong>Description:</strong></p><p>${input.description.replace(/\n/g, "<br>")}</p>`,
        });
      } catch (e) {
        console.error("[DMCA] Failed to send admin notification:", e);
      }
      return { success: true };
    }),

  // -- Admin: list contact submissions ------------------------------------------
  adminListContacts: adminProcedure
    .input(z.object({ page: z.number().int().default(1), limit: z.number().int().default(20) }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const offset = (input.page - 1) * input.limit;
      const rows = await db.select().from(contactSubmissions)
        .orderBy(desc(contactSubmissions.createdAt))
        .limit(input.limit).offset(offset);
      return rows;
    }),

  // -- Admin: update contact status ---------------------------------------------
  adminUpdateContactStatus: adminProcedure
    .input(z.object({ id: z.number().int(), status: z.enum(["new", "read", "replied", "closed"]) }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      await db.update(contactSubmissions).set({ status: input.status }).where(eq(contactSubmissions.id, input.id));
      return { success: true };
    }),

  // -- Admin: list DMCA submissions ---------------------------------------------
  adminListDmca: adminProcedure
    .input(z.object({ page: z.number().int().default(1), limit: z.number().int().default(20) }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const offset = (input.page - 1) * input.limit;
      const rows = await db.select().from(dmcaSubmissions)
        .orderBy(desc(dmcaSubmissions.createdAt))
        .limit(input.limit).offset(offset);
      return rows;
    }),

  // -- Admin: update DMCA status ------------------------------------------------
  adminUpdateDmcaStatus: adminProcedure
    .input(z.object({ id: z.number().int(), status: z.enum(["pending", "reviewing", "resolved", "rejected"]) }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      await db.update(dmcaSubmissions).set({ status: input.status }).where(eq(dmcaSubmissions.id, input.id));
      return { success: true };
    }),

  // -- Admin: AI translate static page content ----------------------------------
  translatePage: adminProcedure
    .input(
      z.object({
        title: z.string(),
        content: z.string(),
        targetLanguages: z.array(
          z.enum(["vi", "ja", "ko", "zh-TW", "zh-CN"])
        ),
      })
    )
    .mutation(async ({ input }) => {
      const LANG_NAMES: Record<string, string> = {
        vi: "Vietnamese",
        ja: "Japanese",
        ko: "Korean",
        "zh-TW": "Traditional Chinese (Taiwan)",
        "zh-CN": "Simplified Chinese (Mainland China)",
      };

      const results: Record<string, { title: string; content: string }> = {};

      // Translate each language sequentially to avoid rate limits
      for (const lang of input.targetLanguages) {
        const langName = LANG_NAMES[lang];
        try {
          const response = await invokeLLM({
            messages: [
              {
                role: "system",
                content: `You are a professional translator specializing in website content. Translate the given HTML content accurately to ${langName}. 
Rules:
- Preserve ALL HTML tags, attributes, and structure exactly as-is
- Only translate the visible text content between HTML tags
- Keep proper nouns, brand names (Yukvix), URLs, email addresses unchanged
- Maintain the same tone and formality as the source
- Return a JSON object with keys "title" (string) and "content" (string with HTML)
- Do not add any explanation or markdown formatting`,
              },
              {
                role: "user",
                content: `Translate this page to ${langName}:\n\nTITLE: ${input.title}\n\nCONTENT (HTML):\n${input.content}`,
              },
            ],
            response_format: {
              type: "json_schema",
              json_schema: {
                name: "translation_result",
                strict: true,
                schema: {
                  type: "object",
                  properties: {
                    title: { type: "string", description: "Translated page title" },
                    content: { type: "string", description: "Translated HTML content" },
                  },
                  required: ["title", "content"],
                  additionalProperties: false,
                },
              },
            },
          });

          const rawContent = response.choices?.[0]?.message?.content;
          const raw = typeof rawContent === "string" ? rawContent : null;
          if (!raw) throw new Error("Empty response from LLM");
          const parsed = JSON.parse(raw) as { title: string; content: string };
          results[lang] = { title: parsed.title ?? "", content: parsed.content ?? "" };
        } catch (err) {
          console.error(`[translatePage] Failed to translate to ${lang}:`, err);
          // Return empty for this language so frontend can show error
          results[lang] = { title: "", content: "" };
        }
      }

      return results;
    }),
});
