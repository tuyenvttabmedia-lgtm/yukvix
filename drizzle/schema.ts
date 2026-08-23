import {
  boolean,
  decimal,
  int,
  mediumtext,
  mysqlEnum,
  mysqlTable,
  text,
  timestamp,
  varchar,
  index,
  bigint,
} from "drizzle-orm/mysql-core";

// ─── Users ───────────────────────────────────────────────────────────────────
export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  passwordHash: varchar("passwordHash", { length: 255 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "vip", "admin", "super_admin"]).default("user").notNull(),
  status: mysqlEnum("status", ["active", "banned"]).default("active").notNull(),
  emailVerified: boolean("emailVerified").default(false).notNull(),
  avatarUrl: text("avatarUrl"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
  /** JWTs with iat before this instant are rejected (password change / ban). */
  sessionInvalidBefore: timestamp("sessionInvalidBefore"),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

// ─── Categories ───────────────────────────────────────────────────────────────
export const categories = mysqlTable("categories", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 128 }).notNull().unique(),
  slug: varchar("slug", { length: 128 }).notNull().unique(),
  description: text("description"),
  coverUrl: text("coverUrl"),
  coverKey: text("coverKey"),
  seoTitle: varchar("seoTitle", { length: 256 }),
  seoDescription: text("seoDescription"),
  sortOrder: int("sortOrder").default(0).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Category = typeof categories.$inferSelect;

// ─── Creators ────────────────────────────────────────────────────────────────
export const creators = mysqlTable(
  "creators",
  {
    id: int("id").autoincrement().primaryKey(),
    name: varchar("name", { length: 128 }).notNull(),
    slug: varchar("slug", { length: 128 }).notNull().unique(),
    bio: text("bio"),
    avatarKey: text("avatarKey"),
    avatarUrl: text("avatarUrl"),
    bannerKey: text("bannerKey"),
    bannerUrl: text("bannerUrl"),
    socialLinks: text("socialLinks"),   // JSON: {twitter, instagram, patreon, ...}
    seoTitle: varchar("seoTitle", { length: 60 }),
    seoDescription: varchar("seoDescription", { length: 160 }),
    seoKeywords: text("seoKeywords"),
    focusKeyword: varchar("focus_keyword", { length: 200 }),
    canonicalUrl: varchar("canonical_url", { length: 500 }),
    ogImage: varchar("og_image", { length: 500 }),
    robotsIndex: boolean("robots_index").default(true),
    seoLanguage: varchar("seo_language", { length: 10 }).default("en"),
    avatarAlt: varchar("avatar_alt", { length: 100 }),
    bannerAlt: varchar("banner_alt", { length: 100 }),
    country: varchar("country", { length: 50 }),
    albumCount: int("albumCount").default(0).notNull(),
    // V4.13: ZIP Import additions
    aliases: text("aliases"),                          // JSON array of known aliases/romanizations
    normalizedName: varchar("normalizedName", { length: 255 }), // lowercase, no special chars (for matching)
    publishStatus: mysqlEnum("publishStatus", ["draft", "ready_for_review", "published"]).default("draft").notNull(),
    aiGenerated: boolean("aiGenerated").default(false).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  (t) => [
    index("idx_creators_slug").on(t.slug),
    index("idx_creators_createdAt").on(t.createdAt),
    index("idx_creators_normalizedName").on(t.normalizedName),
    index("idx_creators_publishStatus").on(t.publishStatus),
  ]
);

export type Creator = typeof creators.$inferSelect;
export type InsertCreator = typeof creators.$inferInsert;

// ─── Tags ─────────────────────────────────────────────────────────────────────
export const tags = mysqlTable("tags", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 64 }).notNull().unique(),
  slug: varchar("slug", { length: 64 }).notNull().unique(),
  seoTitle: varchar("seoTitle", { length: 256 }),
  seoDescription: text("seoDescription"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type Tag = typeof tags.$inferSelect;

// ─── Albums ───────────────────────────────────────────────────────────────────
export const albums = mysqlTable(
  "albums",
  {
    id: int("id").autoincrement().primaryKey(),
    title: varchar("title", { length: 256 }).notNull(),
    slug: varchar("slug", { length: 256 }).notNull().unique(),
    description: text("description"),
    coverKey: text("coverKey"),       // S3 key for cover image
    coverUrl: text("coverUrl"),       // cached public URL
    categoryId: int("categoryId"),
    isVip: boolean("isVip").default(false).notNull(),
    freePreviewCount: int("freePreviewCount").default(10).notNull(),
    photoCount: int("photoCount").default(0).notNull(),
    viewCount: int("viewCount").default(0).notNull(),
    status: mysqlEnum("status", ["draft", "published", "archived"]).default("draft").notNull(),
    // SEO
    seoTitle: varchar("seoTitle", { length: 60 }),
    seoDescription: varchar("seoDescription", { length: 160 }),
    seoKeywords: text("seoKeywords"),
    focusKeyword: varchar("focus_keyword", { length: 100 }),
    canonicalUrl: varchar("canonical_url", { length: 500 }),
    ogImage: varchar("og_image", { length: 500 }),
    robotsIndex: boolean("robots_index").default(true),
    seoLanguage: varchar("seo_language", { length: 10 }).default("en"),
    // Cosplayer info
    cosplayer: varchar("cosplayer", { length: 128 }),
    character: varchar("character", { length: 128 }),
    series: varchar("series", { length: 128 }),
    creatorId: int("creatorId"),           // FK → creators.id
    creator: varchar("creator", { length: 100 }),              // plain text creator name (V4.13: kept for display)
    // V4.13: ZIP Import additions
    collectionName: varchar("collectionName", { length: 100 }),  // e.g. XIUREN, ArtGravia (NOT a creator)
    metaTitle: varchar("metaTitle", { length: 60 }),            // V4.13: alias for seoTitle (ZIP import uses this)
    metaDescription: varchar("metaDescription", { length: 160 }), // V4.13: alias for seoDescription (ZIP import uses this)
    publishStatus: mysqlEnum("publishStatus", ["draft", "processing", "ready_for_review", "published"]).default("draft").notNull(),
    seoQualityScore: int("seoQualityScore").default(0).notNull(), // 0-100, computed by quality check
    aiGenerated: boolean("aiGenerated").default(false).notNull(), // true if SEO was AI-generated
    originalFileName: varchar("originalFileName", { length: 500 }), // original ZIP/RAR filename for re-generation
    shortDescription: text("shortDescription"),                  // 2-3 sentence editorial summary
    altTextTemplate: varchar("altTextTemplate", { length: 500 }), // e.g. "[Creator] [Album] photo #number"
    relatedKeywords: text("relatedKeywords"),                    // JSON array of related keywords
    // ZIP download — Original quality (permanent cache)
    zipKey: text("zipKey"),
    zipUrl: text("zipUrl"),
    zipSize: bigint("zipSize", { mode: "number" }),
    zipGeneratedAt: timestamp("zipGeneratedAt"),
    // ZIP download — WebP quality (permanent cache)
    zipWebpKey: text("zipWebpKey"),
    zipWebpUrl: text("zipWebpUrl"),
    zipWebpSize: bigint("zipWebpSize", { mode: "number" }),
    createdBy: int("createdBy"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  (t) => [
    index("idx_albums_status").on(t.status),
    index("idx_albums_isVip").on(t.isVip),
    index("idx_albums_categoryId").on(t.categoryId),
    index("idx_albums_createdAt").on(t.createdAt),
    // Composite indexes for hot gallery queries:
    // - Gallery list: WHERE status='published' ORDER BY createdAt DESC
    index("idx_albums_status_createdAt").on(t.status, t.createdAt),
    // - VIP gallery: WHERE status='published' AND isVip=1 ORDER BY createdAt DESC
    index("idx_albums_status_isVip_createdAt").on(t.status, t.isVip, t.createdAt),
    // - Category filter: WHERE status='published' AND categoryId=? ORDER BY createdAt DESC
    index("idx_albums_status_categoryId_createdAt").on(t.status, t.categoryId, t.createdAt),
    // - Popular sort: WHERE status='published' ORDER BY viewCount DESC
    index("idx_albums_status_viewCount").on(t.status, t.viewCount),
    // - Creator filter: WHERE creatorId=? AND status='published'
    index("idx_albums_creatorId_status").on(t.creatorId, t.status),
    // - ZIP Import: publishStatus filter
    index("idx_albums_publishStatus").on(t.publishStatus),
  ]
);

export type Album = typeof albums.$inferSelect;
export type InsertAlbum = typeof albums.$inferInsert;

// ─── Album Tags (junction) ────────────────────────────────────────────────────
export const albumTags = mysqlTable(
  "album_tags",
  {
    albumId: int("albumId").notNull(),
    tagId: int("tagId").notNull(),
  },
  (t) => [
    index("idx_album_tags_albumId").on(t.albumId),
    index("idx_album_tags_tagId").on(t.tagId),
  ]
);

// ─── Photos ───────────────────────────────────────────────────────────────────
export const photos = mysqlTable(
  "photos",
  {
    id: int("id").autoincrement().primaryKey(),
    albumId: int("albumId").notNull(),
    // Original file
    originalKey: text("originalKey").notNull(),   // S3 key
    originalUrl: text("originalUrl"),             // cached URL
    // WebP optimized (max 2400px)
    webpKey: text("webpKey"),
    webpUrl: text("webpUrl"),
    // Medium WebP (max 1200px, mobile/tablet)
    mediumKey: text("mediumKey"),
    mediumUrl: text("mediumUrl"),
    // Thumbnail (400x400 WebP)
    thumbKey: text("thumbKey"),
    thumbUrl: text("thumbUrl"),
    // Metadata
    width: int("width"),
    height: int("height"),
    fileSize: bigint("fileSize", { mode: "number" }),
    mimeType: varchar("mimeType", { length: 64 }),
    sortOrder: int("sortOrder").default(0).notNull(),
    isFreePreview: boolean("isFreePreview").default(false).notNull(),
    altText: varchar("altText", { length: 512 }),
    // Signed URL cache — avoids regenerating per-request (TTL 1h)
    signedUrl: text("signedUrl"),
    signedUrlExpiresAt: bigint("signedUrlExpiresAt", { mode: "number" }),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (t) => [
    index("idx_photos_albumId").on(t.albumId),
    index("idx_photos_sortOrder").on(t.sortOrder),
    index("idx_photos_isFreePreview").on(t.isFreePreview),
  ]
);

export type Photo = typeof photos.$inferSelect;
export type InsertPhoto = typeof photos.$inferInsert;

// ─── Subscription Plans ───────────────────────────────────────────────────────
export const subscriptionPlans = mysqlTable("subscription_plans", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 64 }).notNull(),
  slug: varchar("slug", { length: 64 }).notNull().unique(),
  description: text("description"),
  price: decimal("price", { precision: 10, scale: 2 }).notNull(),
  currency: varchar("currency", { length: 8 }).default("usd").notNull(),
  intervalDays: int("intervalDays").notNull(),   // 30 = monthly, 365 = yearly
  stripePriceId: varchar("stripePriceId", { length: 128 }),
  badge: varchar("badge", { length: 32 }),              // e.g. "Popular", "Best Value"
  sortOrder: int("sortOrder").default(0).notNull(),
  isActive: boolean("isActive").default(true).notNull(),
  features: text("features"),   // JSON array of feature strings
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type SubscriptionPlan = typeof subscriptionPlans.$inferSelect;

// ─── Subscriptions ────────────────────────────────────────────────────────────
export const subscriptions = mysqlTable(
  "subscriptions",
  {
    id: int("id").autoincrement().primaryKey(),
    userId: int("userId").notNull(),
    planId: int("planId").notNull(),
    status: mysqlEnum("status", ["active", "expired", "cancelled", "pending"]).default("pending").notNull(),
    provider: varchar("provider", { length: 32 }).default("ccbill").notNull(),
    paymentMethod: varchar("paymentMethod", { length: 32 }).default("card").notNull(),
    stripeSessionId: varchar("stripeSessionId", { length: 256 }),
    stripeSubscriptionId: varchar("stripeSubscriptionId", { length: 256 }),
    stripeCustomerId: varchar("stripeCustomerId", { length: 256 }),
    cryptoOrderId: varchar("cryptoOrderId", { length: 256 }),
    startedAt: timestamp("startedAt"),
    expiresAt: timestamp("expiresAt"),
    cancelledAt: timestamp("cancelledAt"),
    vipExpiryNotifiedAt: bigint("vipExpiryNotifiedAt", { mode: "number" }),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  (t) => [
    index("idx_subscriptions_userId").on(t.userId),
    index("idx_subscriptions_status").on(t.status),
    index("idx_subscriptions_expiresAt").on(t.expiresAt),
  ]
);

export type Subscription = typeof subscriptions.$inferSelect;

// ─── Bookmarks ────────────────────────────────────────────────────────────────
export const bookmarks = mysqlTable(
  "bookmarks",
  {
    id: int("id").autoincrement().primaryKey(),
    userId: int("userId").notNull(),
    albumId: int("albumId").notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (t) => [
    index("idx_bookmarks_userId").on(t.userId),
    index("idx_bookmarks_albumId").on(t.albumId),
  ]
);

export type Bookmark = typeof bookmarks.$inferSelect;

// ─── Upload Jobs ──────────────────────────────────────────────────────────────
export const uploadJobs = mysqlTable(
  "upload_jobs",
  {
    id: int("id").autoincrement().primaryKey(),
    albumId: int("albumId").notNull(),
    userId: int("userId").notNull(),
    fileName: varchar("fileName", { length: 256 }),
    status: mysqlEnum("status", ["pending", "processing", "completed", "failed"]).default("pending").notNull(),
    totalFiles: int("totalFiles").default(0),
    processedFiles: int("processedFiles").default(0),
    errorMessage: text("errorMessage"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  (t) => [index("idx_upload_jobs_albumId").on(t.albumId)]
);

export type UploadJob = typeof uploadJobs.$inferSelect;

// ─── Password Reset Tokens ────────────────────────────────────────────────────
export const passwordResetTokens = mysqlTable(
  "password_reset_tokens",
  {
    id: int("id").autoincrement().primaryKey(),
    userId: int("userId").notNull(),
    token: varchar("token", { length: 128 }).notNull().unique(),
    expiresAt: timestamp("expiresAt").notNull(),
    usedAt: timestamp("usedAt"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (t) => [
    index("idx_prt_token").on(t.token),
    index("idx_prt_userId").on(t.userId),
    index("idx_prt_expiresAt").on(t.expiresAt),
  ]
);

export type PasswordResetToken = typeof passwordResetTokens.$inferSelect;
export type InsertPasswordResetToken = typeof passwordResetTokens.$inferInsert;

// ─── Site Settings (CMS key-value store) ─────────────────────────────────────
export const siteSettings = mysqlTable("site_settings", {
  id: int("id").autoincrement().primaryKey(),
  key: varchar("key", { length: 128 }).notNull().unique(),
  value: text("value"),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type SiteSetting = typeof siteSettings.$inferSelect;

// ─── Menus ────────────────────────────────────────────────────────────────────
export const menus = mysqlTable("menus", {
  id: int("id").autoincrement().primaryKey(),
  location: mysqlEnum("location", ["main", "footer", "mobile"]).notNull().unique(),
  label: varchar("label", { length: 128 }).notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Menu = typeof menus.$inferSelect;

// ─── Menu Items ───────────────────────────────────────────────────────────────
export const menuItems = mysqlTable(
  "menu_items",
  {
    id: int("id").autoincrement().primaryKey(),
    menuId: int("menuId").notNull(),
    label: varchar("label", { length: 128 }).notNull(),
    url: varchar("url", { length: 512 }).notNull(),
    target: mysqlEnum("target", ["_self", "_blank"]).default("_self").notNull(),
    sortOrder: int("sortOrder").default(0).notNull(),
    parentId: int("parentId"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (t) => [
    index("idx_menu_items_menuId").on(t.menuId),
    index("idx_menu_items_sortOrder").on(t.sortOrder),
  ]
);

export type MenuItem = typeof menuItems.$inferSelect;
export type InsertMenuItem = typeof menuItems.$inferInsert;

// ─── Static Pages ─────────────────────────────────────────────────────────────
export const staticPages = mysqlTable("static_pages", {
  id: int("id").autoincrement().primaryKey(),
  slug: varchar("slug", { length: 128 }).notNull().unique(),
  title: varchar("title", { length: 256 }).notNull(),
  content: text("content"),
  contentVi: text("content_vi"),
  contentJa: text("content_ja"),
  contentKo: text("content_ko"),
  contentZhTw: text("content_zh_tw"),
  contentZhCn: text("content_zh_cn"),
  titleVi: varchar("title_vi", { length: 256 }),
  titleJa: varchar("title_ja", { length: 256 }),
  titleKo: varchar("title_ko", { length: 256 }),
  titleZhTw: varchar("title_zh_tw", { length: 256 }),
  titleZhCn: varchar("title_zh_cn", { length: 256 }),
  seoTitle: varchar("seoTitle", { length: 256 }),
  seoDescription: text("seoDescription"),
  status: mysqlEnum("status", ["draft", "published"]).default("draft").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type StaticPage = typeof staticPages.$inferSelect;
export type InsertStaticPage = typeof staticPages.$inferInsert;

// ─── Webhook Events ───────────────────────────────────────────────────────────
export const webhookEvents = mysqlTable(
  "webhook_events",
  {
    id: int("id").autoincrement().primaryKey(),
    providerEventId: varchar("providerEventId", { length: 128 }).notNull().unique(),
    provider: varchar("provider", { length: 32 }).default("stripe").notNull(),
    type: varchar("type", { length: 64 }).notNull(),
    status: mysqlEnum("status", ["success", "failed", "skipped"]).default("success").notNull(),
    relatedUserId: int("relatedUserId"),
    relatedSessionId: varchar("relatedSessionId", { length: 256 }),
    errorMessage: text("errorMessage"),
    processedAt: timestamp("processedAt").defaultNow().notNull(),
  },
  (t) => [
    index("idx_webhook_events_type").on(t.type),
    index("idx_webhook_events_status").on(t.status),
    index("idx_webhook_events_processedAt").on(t.processedAt),
  ]
);

export type WebhookEvent = typeof webhookEvents.$inferSelect;

// ─── Image Processing Jobs (background queue) ─────────────────────────────────
export const imageProcessingJobs = mysqlTable(
  "image_processing_jobs",
  {
    id: int("id").autoincrement().primaryKey(),
    albumId: int("albumId"),
    originalKey: varchar("originalKey", { length: 512 }).notNull(),
    fileName: varchar("fileName", { length: 256 }).notNull(),
    mimeType: varchar("mimeType", { length: 64 }).notNull(),
    fileSize: bigint("fileSize", { mode: "number" }).notNull(),
    status: mysqlEnum("status", ["pending", "processing", "done", "failed"]).default("pending").notNull(),
    error: text("error"),
    retryCount: int("retry_count").default(0).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    processedAt: timestamp("processedAt"),
  },
  (t) => [
    index("idx_ipj_albumId").on(t.albumId),
    index("idx_ipj_status").on(t.status),
    index("idx_ipj_createdAt").on(t.createdAt),
    // Note: originalKey is VARCHAR(512), dedup enforced in application layer
  ]
);
export type ImageProcessingJob = typeof imageProcessingJobs.$inferSelect;

// ─── Media Items (source of truth for all uploaded media) ─────────────────────
export const mediaItems = mysqlTable(
  "media_items",
  {
    id: int("id").autoincrement().primaryKey(),
    // Storage keys
    originalKey: text("originalKey").notNull(),
    thumbKey: text("thumbKey"),
    webpKey: text("webpKey"),
    // Public URLs (CDN or direct Wasabi)
    originalUrl: text("originalUrl"),
    thumbUrl: text("thumbUrl"),
    webpUrl: text("webpUrl"),
    // Metadata
    filename: varchar("filename", { length: 256 }).notNull(),
    width: int("width"),
    height: int("height"),
    fileSize: bigint("fileSize", { mode: "number" }),
    mimeType: varchar("mimeType", { length: 64 }),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (t) => [
    index("idx_media_items_createdAt").on(t.createdAt),
    index("idx_media_items_filename").on(t.filename),
    // Note: originalKey is TEXT (too long for unique index in MySQL), dedup is enforced in application layer
  ]
);

export type MediaItem = typeof mediaItems.$inferSelect;
export type InsertMediaItem = typeof mediaItems.$inferInsert;

// ─── Album Media Items (junction: album ↔ media) ──────────────────────────────
export const albumMediaItems = mysqlTable(
  "album_media_items",
  {
    id: int("id").autoincrement().primaryKey(),
    albumId: int("albumId").notNull(),
    mediaItemId: int("mediaItemId").notNull(),
    sortOrder: int("sortOrder").default(0).notNull(),
    isFreePreview: boolean("isFreePreview").default(false).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (t) => [
    index("idx_ami_albumId").on(t.albumId),
    index("idx_ami_mediaItemId").on(t.mediaItemId),
    index("idx_ami_sortOrder").on(t.sortOrder),
  ]
);

export type AlbumMediaItem = typeof albumMediaItems.$inferSelect;
export type InsertAlbumMediaItem = typeof albumMediaItems.$inferInsert;

// ─── Import Sources (crawler config per website) ──────────────────────────────
export const importSources = mysqlTable(
  "import_sources",
  {
    id: int("id").autoincrement().primaryKey(),
    siteName: varchar("siteName", { length: 128 }).notNull(),
    baseUrl: varchar("baseUrl", { length: 512 }).notNull(),
    // CSS selectors
    titleSelector: varchar("titleSelector", { length: 256 }),
    contentSelector: varchar("contentSelector", { length: 256 }),
    imageSelector: varchar("imageSelector", { length: 256 }),
    nextPageSelector: varchar("nextPageSelector", { length: 256 }),
    tagSelector: varchar("tagSelector", { length: 256 }),
    creatorSelector: varchar("creatorSelector", { length: 256 }),
    publishDateSelector: varchar("publishDateSelector", { length: 256 }),
    // Pagination type
    paginationType: mysqlEnum("paginationType", ["next_page", "numbered", "infinite_scroll", "none"]).default("next_page").notNull(),
    // Page URL pattern for numbered pagination: [url]/[page]/ or [url]/page/[page]/
    pageUrlPattern: varchar("pageUrlPattern", { length: 256 }),
    // Content area selector: limit image extraction to this container
    contentAreaSelector: varchar("contentAreaSelector", { length: 256 }),
    // Browser settings
    requiresBrowser: boolean("requiresBrowser").default(false).notNull(),
    userAgent: varchar("userAgent", { length: 512 }),
    cookieString: text("cookieString"),
    // Crawl settings
    crawlDelayMs: int("crawlDelayMs").default(1500).notNull(),
    maxPages: int("maxPages").default(50).notNull(),
    // Filters
    crawlStartDate: timestamp("crawlStartDate"),
    crawlEndDate: timestamp("crawlEndDate"),
    keywordFilter: varchar("keywordFilter", { length: 256 }),
    creatorFilter: varchar("creatorFilter", { length: 256 }),
    // Publish settings
    publishMode: mysqlEnum("publishMode", ["draft", "published"]).default("draft").notNull(),
    // VIP default: albums created from this source will be marked as VIP automatically
    defaultVip: boolean("defaultVip").default(false).notNull(),
    // Free preview count: number of photos visible without VIP. null = use Album Defaults (default_free_preview_count setting)
    freePreviewCount: int("freePreviewCount"),
    // Skip SEO AI: if true, use fallback SEO (no LLM call) to save credits
    skipSeoAi: boolean("skipSeoAi").default(false).notNull(),
    // Auto-schedule
    autoSchedule: boolean("autoSchedule").default(false).notNull(),
    scheduleIntervalHours: int("scheduleIntervalHours").default(6).notNull(),
    // Category crawl: JSON array of {url, categoryId?} — maps source category URL to local category
    // Example: [{"url":"https://everia.club/category/korea/","categoryId":1}]
    // Legacy plain-text URLs (one per line) are still supported for backward compat
    categoryUrls: text("categoryUrls"),
    // Title cleanup: JSON array of {find, replace} patterns applied to raw title before SEO
    // Example: [{"find":" – EVERIA.CLUB","replace":""},{"find":" – everia.club","replace":""}]
    titleCleanupRules: text("titleCleanupRules"),
    // State
    enabled: boolean("enabled").default(true).notNull(),
    lastCrawledAt: timestamp("lastCrawledAt"),
    lastCrawledUrl: text("lastCrawledUrl"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  (t) => [
    index("idx_import_sources_enabled").on(t.enabled),
  ]
);

export type ImportSource = typeof importSources.$inferSelect;
export type InsertImportSource = typeof importSources.$inferInsert;

// ─── Import Jobs ──────────────────────────────────────────────────────────────
export const importJobs = mysqlTable(
  "import_jobs",
  {
    id: int("id").autoincrement().primaryKey(),
    sourceId: int("sourceId"),                          // null = manual URL paste
    sourceUrl: text("sourceUrl").notNull(),
    status: mysqlEnum("status", ["queued", "crawling", "downloading", "processing", "seo", "done", "failed", "cancelled"]).default("queued").notNull(),
    // Progress
    totalPages: int("totalPages").default(0).notNull(),
    crawledPages: int("crawledPages").default(0).notNull(),
    totalImages: int("totalImages").default(0).notNull(),
    downloadedImages: int("downloadedImages").default(0).notNull(),
    processedImages: int("processedImages").default(0).notNull(),
    // Result
    albumId: int("albumId"),                            // created album (after done)
    errorMessage: text("errorMessage"),
    // Metadata extracted
    extractedTitle: varchar("extractedTitle", { length: 512 }),
    extractedCreator: varchar("extractedCreator", { length: 256 }),
    extractedTags: text("extractedTags"),               // JSON array
    processedImagesData: mediumtext("processedImagesData"), // JSON array of ProcessedImage
    // Dedup
    isDuplicate: boolean("isDuplicate").default(false).notNull(),
    duplicateOfJobId: int("duplicateOfJobId"),
    // Scheduling
    scheduledPublishAt: timestamp("scheduledPublishAt"),
    // Timestamps
    startedAt: timestamp("startedAt"),
    completedAt: timestamp("completedAt"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  (t) => [
    index("idx_import_jobs_status").on(t.status),
    index("idx_import_jobs_sourceId").on(t.sourceId),
    index("idx_import_jobs_createdAt").on(t.createdAt),
    index("idx_import_jobs_albumId").on(t.albumId),
  ]
);

export type ImportJob = typeof importJobs.$inferSelect;
export type InsertImportJob = typeof importJobs.$inferInsert;

// ─── Import Logs (per-job log entries) ───────────────────────────────────────
export const importLogs = mysqlTable(
  "import_logs",
  {
    id: int("id").autoincrement().primaryKey(),
    jobId: int("jobId").notNull(),
    level: mysqlEnum("level", ["info", "warn", "error", "debug"]).default("info").notNull(),
    message: text("message").notNull(),
    data: text("data"),                                 // JSON extra context
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (t) => [
    index("idx_import_logs_jobId").on(t.jobId),
    index("idx_import_logs_level").on(t.level),
    index("idx_import_logs_createdAt").on(t.createdAt),
  ]
);

export type ImportLog = typeof importLogs.$inferSelect;
export type InsertImportLog = typeof importLogs.$inferInsert;

// ─── Imported URLs (dedup by source URL) ─────────────────────────────────────
export const importedUrls = mysqlTable(
  "imported_urls",
  {
    id: int("id").autoincrement().primaryKey(),
    urlHash: varchar("urlHash", { length: 64 }).notNull().unique(), // SHA-256 of normalized URL
    sourceUrl: text("sourceUrl").notNull(),
    jobId: int("jobId").notNull(),
    albumId: int("albumId"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (t) => [
    index("idx_imported_urls_urlHash").on(t.urlHash),
    index("idx_imported_urls_jobId").on(t.jobId),
  ]
);

export type ImportedUrl = typeof importedUrls.$inferSelect;

// ─── Image Hashes (perceptual hash dedup) ────────────────────────────────────
export const imageHashes = mysqlTable(
  "image_hashes",
  {
    id: int("id").autoincrement().primaryKey(),
    mediaItemId: int("mediaItemId").notNull(),
    pHash: varchar("pHash", { length: 64 }),            // perceptual hash
    dHash: varchar("dHash", { length: 64 }),            // difference hash
    md5: varchar("md5", { length: 32 }),                // exact match
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (t) => [
    index("idx_image_hashes_pHash").on(t.pHash),
    index("idx_image_hashes_md5").on(t.md5),
    index("idx_image_hashes_mediaItemId").on(t.mediaItemId),
  ]
);

export type ImageHash = typeof imageHashes.$inferSelect;

// ─── Downloads (ZIP download history) ────────────────────────────────────────
export const downloads = mysqlTable(
  "downloads",
  {
    id: int("id").autoincrement().primaryKey(),
    userId: int("userId").notNull(),
    albumId: int("albumId").notNull(),
    zipSize: bigint("zipSize", { mode: "number" }),
    quality: mysqlEnum("quality", ["original", "high", "medium"]).default("original"),
    downloadedAt: timestamp("downloadedAt").defaultNow().notNull(),
  },
  (t) => [
    index("idx_downloads_userId").on(t.userId),
    index("idx_downloads_albumId").on(t.albumId),
    index("idx_downloads_downloadedAt").on(t.downloadedAt),
  ]
);

export type Download = typeof downloads.$inferSelect;
export type InsertDownload = typeof downloads.$inferInsert;

// --- Email Verification Tokens ---
export const emailVerificationTokens = mysqlTable(
  "email_verification_tokens",
  {
    id: int("id").autoincrement().primaryKey(),
    userId: int("userId").notNull(),
    token: varchar("token", { length: 128 }).notNull().unique(),
    expiresAt: timestamp("expiresAt").notNull(),
    usedAt: timestamp("usedAt"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (t) => [
    index("idx_evt_token").on(t.token),
    index("idx_evt_userId").on(t.userId),
    index("idx_evt_expiresAt").on(t.expiresAt),
  ]
);

export type EmailVerificationToken = typeof emailVerificationTokens.$inferSelect;
export type InsertEmailVerificationToken = typeof emailVerificationTokens.$inferInsert;

// --- SMTP Settings ---
export const smtpSettings = mysqlTable("smtp_settings", {
  id: int("id").autoincrement().primaryKey(),
  host: varchar("host", { length: 256 }).notNull(),
  port: int("port").default(587).notNull(),
  secure: boolean("secure").default(false).notNull(),
  user: varchar("user", { length: 256 }).notNull(),
  password: varchar("password", { length: 512 }).notNull(),
  fromName: varchar("fromName", { length: 128 }).notNull(),
  fromEmail: varchar("fromEmail", { length: 320 }).notNull(),
  enabled: boolean("enabled").default(true).notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type SmtpSetting = typeof smtpSettings.$inferSelect;
export type InsertSmtpSetting = typeof smtpSettings.$inferInsert;


// --- Email Logs ---
export const emailLogs = mysqlTable(
  "email_logs",
  {
    id: int("id").autoincrement().primaryKey(),
    type: varchar("type", { length: 64 }).notNull(),        // e.g. "password_reset", "vip_expiry", "email_verify"
    recipient: varchar("recipient", { length: 320 }).notNull(),
    subject: varchar("subject", { length: 512 }).notNull(),
    status: mysqlEnum("status", ["sent", "failed"]).notNull(),
    attempts: int("attempts").default(1).notNull(),
    error: text("error"),
    messageId: varchar("messageId", { length: 256 }),
    metadata: text("metadata"),                             // JSON string for extra context
    sentAt: timestamp("sentAt").defaultNow().notNull(),
  },
  (t) => [
    index("idx_email_logs_recipient").on(t.recipient),
    index("idx_email_logs_status").on(t.status),
    index("idx_email_logs_type").on(t.type),
    index("idx_email_logs_sentAt").on(t.sentAt),
  ]
);
export type EmailLog = typeof emailLogs.$inferSelect;
export type InsertEmailLog = typeof emailLogs.$inferInsert;

// --- Email Queue ---
export const emailQueue = mysqlTable(
  "email_queue",
  {
    id: int("id").autoincrement().primaryKey(),
    type: varchar("type", { length: 64 }).notNull(),
    recipient: varchar("recipient", { length: 320 }).notNull(),
    subject: varchar("subject", { length: 512 }).notNull(),
    html: mediumtext("html").notNull(),
    textContent: text("textContent"),
    priority: int("priority").default(5).notNull(),         // 1=highest, 10=lowest
    status: mysqlEnum("status", ["pending", "processing", "sent", "failed"]).default("pending").notNull(),
    attempts: int("attempts").default(0).notNull(),
    maxAttempts: int("maxAttempts").default(3).notNull(),
    scheduledAt: timestamp("scheduledAt").defaultNow().notNull(),
    processedAt: timestamp("processedAt"),
    error: text("error"),
    metadata: text("metadata"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (t) => [
    index("idx_email_queue_status").on(t.status),
    index("idx_email_queue_priority").on(t.priority),
    index("idx_email_queue_scheduledAt").on(t.scheduledAt),
  ]
);
export type EmailQueueItem = typeof emailQueue.$inferSelect;
export type InsertEmailQueueItem = typeof emailQueue.$inferInsert;

// ─── Contact Submissions ──────────────────────────────────────────────────────
export const contactSubmissions = mysqlTable(
  "contact_submissions",
  {
    id: int("id").autoincrement().primaryKey(),
    name: varchar("name", { length: 128 }).notNull(),
    email: varchar("email", { length: 256 }).notNull(),
    subject: varchar("subject", { length: 256 }).notNull(),
    message: text("message").notNull(),
    status: mysqlEnum("status", ["new", "read", "replied", "closed"]).default("new").notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (t) => [
    index("idx_contact_status").on(t.status),
    index("idx_contact_createdAt").on(t.createdAt),
  ]
);
export type ContactSubmission = typeof contactSubmissions.$inferSelect;
export type InsertContactSubmission = typeof contactSubmissions.$inferInsert;

// ─── DMCA Submissions ─────────────────────────────────────────────────────────
export const dmcaSubmissions = mysqlTable(
  "dmca_submissions",
  {
    id: int("id").autoincrement().primaryKey(),
    name: varchar("name", { length: 128 }).notNull(),
    email: varchar("email", { length: 256 }).notNull(),
    reporterUrl: varchar("reporterUrl", { length: 512 }),
    infringingUrl: text("infringingUrl").notNull(),
    originalWorkUrl: varchar("originalWorkUrl", { length: 512 }),
    description: text("description").notNull(),
    declaration: boolean("declaration").default(false).notNull(),
    status: mysqlEnum("status", ["pending", "reviewing", "resolved", "rejected"]).default("pending").notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (t) => [
    index("idx_dmca_status").on(t.status),
    index("idx_dmca_createdAt").on(t.createdAt),
  ]
);
export type DmcaSubmission = typeof dmcaSubmissions.$inferSelect;
export type InsertDmcaSubmission = typeof dmcaSubmissions.$inferInsert;

// ─── Admin Permissions ────────────────────────────────────────────────────────
// Granular permissions for admin accounts, managed by super_admin
export const adminPermissions = mysqlTable(
  "admin_permissions",
  {
    id: int("id").autoincrement().primaryKey(),
    userId: int("userId").notNull(),
    permission: mysqlEnum("permission", [
      "manage_users",
      "manage_albums",
      "manage_payments",
      "manage_cms",
      "manage_import",
      "manage_settings",
      "view_analytics",
    ]).notNull(),
    grantedBy: int("grantedBy").notNull(), // super_admin userId
    grantedAt: timestamp("grantedAt").defaultNow().notNull(),
  },
  (t) => [
    index("idx_admin_perm_userId").on(t.userId),
    index("idx_admin_perm_userId_perm").on(t.userId, t.permission),
  ]
);
export type AdminPermission = typeof adminPermissions.$inferSelect;
export type InsertAdminPermission = typeof adminPermissions.$inferInsert;

export const ADMIN_PERMISSIONS = [
  "manage_users",
  "manage_albums",
  "manage_payments",
  "manage_cms",
  "manage_import",
  "manage_settings",
  "view_analytics",
] as const;
export type AdminPermissionKey = typeof ADMIN_PERMISSIONS[number];

// --- ZIP Jobs (background ZIP generation) ------------------------------------
export const zipJobs = mysqlTable(
  "zip_jobs",
  {
    id: int("id").primaryKey().autoincrement(),
    albumId: int("albumId").notNull(),
    userId: int("userId").notNull(),
    status: mysqlEnum("status", ["queued", "processing", "done", "failed"]).notNull().default("queued"),
    progress: int("progress").notNull().default(0),
    totalFiles: int("totalFiles").notNull().default(0),
    processedFiles: int("processedFiles").notNull().default(0),
    zipUrl: text("zipUrl"),
    zipKey: text("zipKey"),
    zipSize: int("zipSize"),
    quality: mysqlEnum("quality", ["original", "high", "medium"]).default("original"),
    errorMessage: text("errorMessage"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  (t) => [
    index("idx_zip_jobs_albumId").on(t.albumId),
    index("idx_zip_jobs_userId").on(t.userId),
    index("idx_zip_jobs_status").on(t.status),
  ]
);
export type ZipJob = typeof zipJobs.$inferSelect;
export type InsertZipJob = typeof zipJobs.$inferInsert;

// ─── SEO Settings ─────────────────────────────────────────────────────────────
export const seoSettings = mysqlTable("seo_settings", {
  id: int("id").primaryKey().default(1),
  gtmContainerId: varchar("gtm_container_id", { length: 50 }),
  gscVerificationMeta: varchar("gsc_verification_meta", { length: 500 }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});
export type SeoSetting = typeof seoSettings.$inferSelect;
export type InsertSeoSetting = typeof seoSettings.$inferInsert;

// ─── ZIP Import Jobs (V4.17: Admin ZIP/RAR → Album pipeline) ─────────────────
export const zipImportJobs = mysqlTable(
  "zip_import_jobs",
  {
    id: int("id").autoincrement().primaryKey(),
    albumId: int("albumId"),                  // NULL until admin submits SEO form

    // Source archive staging (Wasabi)
    sourceArchiveKey: varchar("sourceArchiveKey", { length: 500 }),      // Wasabi key: imports/staging/{jobId}/{filename}
    sourceArchiveSize: bigint("sourceArchiveSize", { mode: "number" }),  // bytes
    sourceArchiveOriginalName: varchar("sourceArchiveOriginalName", { length: 500 }), // original filename

    // Status lifecycle
    status: mysqlEnum("status", [
      "uploaded",           // archive uploaded to Wasabi, awaiting SEO + form submit
      "waiting",            // form submitted, queued for processing
      "scheduled",          // scheduler picked this job, about to start
      "processing",         // worker actively processing
      "waiting_disk_space", // disk too full, will retry next scheduler tick
      "completed",          // all done, album ready_for_review
      "failed",             // processing failed, source moved to imports/failed/
      "cancelled",          // admin cancelled
      "expired",            // uploaded but never submitted (>24h), staging file deleted
    ]).default("uploaded").notNull(),

    // Progress tracking
    progress: int("progress").default(0).notNull(),
    totalImages: int("totalImages").default(0).notNull(),
    processedImages: int("processedImages").default(0).notNull(),
    failedImages: int("failedImages").default(0).notNull(),
    cancelRequested: boolean("cancelRequested").default(false).notNull(),
    importLogs: mediumtext("importLogs"),        // JSON array of log entries
    failedImageList: mediumtext("failedImageList"), // JSON array of {file, reason}

    // V4.17: Store password index, not plaintext password
    // 0 = no password, 1 = IMPORT_ARCHIVE_PASSWORDS[0], 2 = IMPORT_ARCHIVE_PASSWORDS[1], etc.
    archivePasswordIndex: int("archivePasswordIndex").default(0).notNull(),

    // VIP ZIP lifecycle
    vipZipStatus: mysqlEnum("vipZipStatus", ["pending", "generating", "ready", "failed"]).default("pending").notNull(),
    vipZipKey: varchar("vipZipKey", { length: 500 }),    // S3 key (not URL)
    vipZipSize: bigint("vipZipSize", { mode: "number" }),
    vipZipGeneratedAt: timestamp("vipZipGeneratedAt"),

    // Timestamps

    // Phase 3: Duplicate detection
    sourceArchiveSha256: varchar("sourceArchiveSha256", { length: 64 }),
    duplicateInfo: text("duplicateInfo"),
    duplicateOverride: boolean("duplicateOverride").default(false).notNull(),
    duplicateOverrideAudit: text("duplicateOverrideAudit"),
    pipelineStep: varchar("pipelineStep", { length: 32 }),
    stepMetrics: text("stepMetrics"),
    lastError: text("lastError"),
    resumeHistory: mediumtext("resumeHistory"),
    checkpoint: mediumtext("checkpoint"),
    pendingAlbumData: text("pendingAlbumData"),
    importProfile: text("importProfile"),
    aiSeoMetrics: text("aiSeoMetrics"),
    aiSeoMetadata: text("aiSeoMetadata"),


    workerId: varchar("workerId", { length: 64 }),
    lockedAt: timestamp("lockedAt"),
    heartbeatAt: timestamp("heartbeatAt"),

    scheduledAt: timestamp("scheduledAt"),
    startedAt: timestamp("startedAt"),
    completedAt: timestamp("completedAt"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  (t) => [
    index("idx_zip_import_jobs_status").on(t.status),
    index("idx_zip_import_jobs_albumId").on(t.albumId),
    index("idx_zip_import_jobs_createdAt").on(t.createdAt),
  ]
);


// ─── Phase 8: Operational Layer ───────────────────────────────────────────────
export const adminNotifications = mysqlTable(
  "admin_notifications",
  {
    id: int("id").autoincrement().primaryKey(),
    level: mysqlEnum("level", ["info", "success", "warning", "error"]).default("info").notNull(),
    type: varchar("type", { length: 64 }).notNull(),
    jobId: int("jobId"),
    title: varchar("title", { length: 255 }).notNull(),
    message: text("message"),
    readAt: timestamp("readAt"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (t) => [
    index("idx_admin_notifications_read").on(t.readAt),
    index("idx_admin_notifications_created").on(t.createdAt),
  ]
);
export type AdminNotification = typeof adminNotifications.$inferSelect;

export const zipImportJobEvents = mysqlTable(
  "zip_import_job_events",
  {
    id: int("id").autoincrement().primaryKey(),
    jobId: int("jobId").notNull(),
    event: varchar("event", { length: 64 }).notNull(),
    step: varchar("step", { length: 32 }),
    payload: text("payload"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (t) => [
    index("idx_zip_import_job_events_job").on(t.jobId),
    index("idx_zip_import_job_events_created").on(t.createdAt),
  ]
);
export type ZipImportJobEvent = typeof zipImportJobEvents.$inferSelect;

export const zipImportMetricsSnapshots = mysqlTable(
  "zip_import_metrics_snapshots",
  {
    id: int("id").autoincrement().primaryKey(),
    snapshotAt: timestamp("snapshotAt").notNull(),
    payload: mediumtext("payload").notNull(),
  },
  (t) => [index("idx_zip_import_metrics_snapshot_at").on(t.snapshotAt)]
);
export type ZipImportMetricsSnapshot = typeof zipImportMetricsSnapshots.$inferSelect;

export type ZipImportJob = typeof zipImportJobs.$inferSelect;
export type InsertZipImportJob = typeof zipImportJobs.$inferInsert;

// ─── SEO Cache (V4.17: keyed by filenameHash + promptVersion + model) ────────
export const seoCache = mysqlTable(
  "seo_cache",
  {
    id: int("id").autoincrement().primaryKey(),
    filenameHash: varchar("filenameHash", { length: 32 }).notNull(),  // MD5 of cleaned filename
    filename: varchar("filename", { length: 255 }).notNull(),
    promptVersion: varchar("promptVersion", { length: 20 }).notNull(), // e.g. "v4.17" — bump to invalidate
    model: varchar("model", { length: 100 }).notNull(),               // e.g. "google/gemini-2.0-flash-exp"
    seoJson: mediumtext("seoJson").notNull(),                          // Full SeoOutput JSON
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    expiresAt: timestamp("expiresAt"),
  },
  (t) => [
    index("idx_seo_cache_hash_version_model").on(t.filenameHash, t.promptVersion, t.model),
    index("idx_seo_cache_expiresAt").on(t.expiresAt),
  ]
);

export type SeoCache = typeof seoCache.$inferSelect;
export type InsertSeoCache = typeof seoCache.$inferInsert;

// ─── Admin Settings (V4.17: key-value store for import config + AI provider) ──
export const adminSettings = mysqlTable(
  "admin_settings",
  {
    id: int("id").autoincrement().primaryKey(),
    key: varchar("key", { length: 100 }).notNull().unique(),
    value: mediumtext("value").notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  (t) => [
    index("idx_admin_settings_key").on(t.key),
  ]
);

export type AdminSetting = typeof adminSettings.$inferSelect;
export type InsertAdminSetting = typeof adminSettings.$inferInsert;

// ─── SEO Generation History (V4.9 Final — track AI generation per album) ──────
export const seoGenerationHistory = mysqlTable(
  "seo_generation_history",
  {
    id: int("id").autoincrement().primaryKey(),
    albumId: int("albumId").notNull(),
    promptVersion: varchar("promptVersion", { length: 20 }).notNull(),  // e.g. "v4.17"
    model: varchar("model", { length: 100 }).notNull(),                 // e.g. "google/gemini-2.0-flash-exp"
    generatedJson: mediumtext("generatedJson").notNull(),               // raw AI output JSON
    editedByAdmin: boolean("editedByAdmin").default(false).notNull(),   // true if admin modified the SEO
    qualityPassed: boolean("qualityPassed").default(false).notNull(),   // true if quality check passed
    qualityWarnings: text("qualityWarnings"),                           // JSON array of warning strings
    approvedAt: timestamp("approvedAt"),
    approvedBy: int("approvedBy"),                                      // FK to users.id
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (t) => [
    index("idx_seo_history_albumId").on(t.albumId),
    index("idx_seo_history_approvedAt").on(t.approvedAt),
  ]
);
export type SeoGenerationHistory = typeof seoGenerationHistory.$inferSelect;
export type InsertSeoGenerationHistory = typeof seoGenerationHistory.$inferInsert;
