/**
 * SEO Generator Service (V4.17)
 * Generates SEO metadata for albums from ZIP/RAR filenames.
 * Uses standalone AI provider (NOT Manus invokeLLM).
 * Falls back to rule-based generation if AI fails.
 *
 * Key rules:
 * - AI always creates draft; admin must approve before publish
 * - Slug: Latin-only (no CJK), no pinyin hyphens (baixiaodie not bai-xiao-die)
 * - Categories: Japan | China | Korea | Euro | Cosplay | Gravure (fixed 6, no new)
 * - Focus keyword: creator > collection > filename
 * - No "cosplay" keywords unless category = Cosplay
 */

import crypto from "crypto";
import { getDb } from "../db";
import { seoCache } from "../../drizzle/schema";
import { and, eq, gt } from "drizzle-orm";
import { callAi, getAiProviderConfig } from "./ai-provider";

export const PROMPT_VERSION = "v4.17";

/** Yukvix fixed categories — do NOT add or change these */
export type YukvixCategory = "Japan" | "China" | "Korea" | "Euro" | "Cosplay" | "Gravure";

export interface SeoOutput {
  albumTitle: string;
  seoTitle: string;          // max 60 chars
  metaDescription: string;   // max 155 chars
  focusKeyword: string;      // creator > collection > filename
  relatedKeywords: string[]; // exactly 5, match category
  tags: string[];            // 5-8 tags
  category: YukvixCategory;  // one of the 6 fixed categories
  creator: string;           // model/person name (e.g. 白小蝶, Se-Ah)
  collectionName?: string;   // V4.13: collection/series name (e.g. XIUREN, ArtGravia) — NOT a creator
  slug: string;              // no pinyin hyphens, latin-only
  shortDescription: string;  // 2-3 sentences, human editorial
  altTextTemplate: string;   // "[Creator] [Album] photo #number"
  publishStatus?: "draft" | "processing" | "ready_for_review" | "published";
}

export interface SeoInput {
  originalFileName: string;
  adminTitle?: string;
  creator?: string;
  category?: string;
  existingTags?: string[];
  siteName?: string;
  /** If true, bypass both in-memory and DB cache (used by testSeoGeneration) */
  skipCache?: boolean;
}

// In-memory cache (also persisted to DB)
const memCache = new Map<string, SeoOutput>();

function filenameHash(filename: string): string {
  return crypto.createHash("md5").update(filename).digest("hex");
}

// ─── Main Entry Point ────────────────────────────────────────────────────────

/**
 * Generate SEO data for an album from its filename.
 * Flow:
 * 1. In-memory cache check
 * 2. DB cache check (keyed by filenameHash + promptVersion + model)
 * 3. Call external AI (OpenRouter / Gemini / OpenAI)
 * 4. Fallback to rule-based if AI fails
 */
export async function generateSeoData(input: SeoInput): Promise<SeoOutput> {
  const siteName = input.siteName || process.env.SITE_NAME || "Yukvix";
  const cleaned = input.originalFileName.replace(/\.(zip|rar|7z)$/i, "").trim();
  const hash = filenameHash(cleaned);

  // 1. In-memory cache (skip if skipCache=true)
  if (!input.skipCache) {
    const cached = memCache.get(hash);
    if (cached) {
      console.log(`[SEO] Cache hit (memory): ${cleaned}`);
      return cached;
    }
  }

  // 2. DB cache — must match promptVersion + model to avoid stale results
  if (!input.skipCache) {
    try {
      const aiConfig = await getAiProviderConfig();
      const db = await getDb();
      if (!db) throw new Error("DB not available");
      const dbCached = await db
        .select()
        .from(seoCache)
        .where(
          and(
            eq(seoCache.filenameHash, hash),
            eq(seoCache.promptVersion, PROMPT_VERSION),
            eq(seoCache.model, aiConfig.model),
            gt(seoCache.expiresAt, new Date())
          )
        )
        .limit(1);

      if (dbCached.length > 0) {
        console.log(`[SEO] Cache hit (DB): ${cleaned}`);
        const data = JSON.parse(dbCached[0].seoJson) as SeoOutput;
        memCache.set(hash, data);
        return data;
      }
    } catch (err) {
      console.warn(`[SEO] DB cache check failed: ${(err as Error).message}`);
    }
  }

  // 3. Call external AI provider
  try {
    const aiConfig = await getAiProviderConfig();
    const detectedCategory = detectCategory(cleaned);
    const systemPrompt = buildSystemPrompt(siteName, detectedCategory);

    const result = await callAi({
      messages: [
        { role: "system", content: systemPrompt },
        {
          role: "user",
          content: `Generate SEO metadata for this album filename: "${cleaned}"`,
        },
      ],
      temperature: 0.7,
      maxTokens: 2048,
      responseFormat: { type: "json_object" },
    });

    // Parse and clean response (strip markdown code blocks if present)
    let jsonStr = result.content.trim();
    if (jsonStr.startsWith("```")) {
      jsonStr = jsonStr.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");
    }

    const data = JSON.parse(jsonStr) as SeoOutput;
    // Override albumTitle with filename to ensure consistency with original file name
    data.albumTitle = cleaned;
    data.publishStatus = "draft"; // AI always creates draft
    validateSeo(data);

    // Persist to DB cache
    memCache.set(hash, data);
    try {
      const dbForCache = await getDb();
      if (!dbForCache) throw new Error("DB not available");
      await dbForCache
        .insert(seoCache)
        .values({
          filenameHash: hash,
          filename: cleaned,
          promptVersion: PROMPT_VERSION,
          model: aiConfig.model,
          seoJson: JSON.stringify(data),
          expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
        })
        .onDuplicateKeyUpdate({
          set: {
            seoJson: JSON.stringify(data),
            expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
          },
        });
    } catch (cacheErr) {
      console.warn(`[SEO] DB cache write failed: ${(cacheErr as Error).message}`);
    }

    console.log(`[SEO] AI generated: ${cleaned} → category=${data.category} creator=${data.creator}`);
    return data;
  } catch (err) {
    console.warn(`[SEO] AI failed (${(err as Error).message}), using fallback`);
    return fallbackSeo(cleaned, { ...input, siteName });
  }
}

// ─── Category Detection ──────────────────────────────────────────────────────

/**
 * Detect Yukvix category from filename.
 * Fixed categories: Japan | China | Korea | Euro | Cosplay | Gravure
 * Do NOT create new categories.
 */
export function detectCategory(filename: string): YukvixCategory {
  const f = filename.toLowerCase();

  // Cosplay: anime/game character costume (check first to avoid misclassification)
  if (f.match(/cosplay|コスプレ|角色|character|costume|anime|game|manga/)) return "Cosplay";

  // Gravure: bikini/idol/swimsuit photoshoot
  if (f.match(/gravure|グラビア|bikini|idol|swimsuit|水着/)) return "Gravure";

  // China: known Chinese model sets
  if (f.match(/xiuren|xiu ren|imiss|uom|youmi|feilin|mfstar|ugirls|toutiao/)) return "China";

  // Korea: known Korean model sets + Korean characters
  if (f.match(/artgravia|djawa|pia|pure media|creamsoda|sweetbox/)) return "Korea";
  if (filename.match(/[가-힯]/)) return "Korea";

  // Japan: detect Japanese kana BEFORE Chinese kanji
  // Hiragana/katakana are unique to Japanese; kanji alone is ambiguous
  if (filename.match(/[぀-ゟ゠-ヿ]/)) return "Japan"; // hiragana or katakana → definitely Japan
  if (f.match(/japan|japanese|tokyo|kyoto|osaka|comiket/)) return "Japan";

  // China: Chinese characters only (after Japanese kana check above)
  if (filename.match(/[一-鿿]/)) return "China";

  // Euro: European names or western-style (Latin-only filenames)
  if (f.match(/euro|european|germany|france|italy|spain|russia|ukraine|czech|polish/)) return "Euro";
  if (f.match(/^[a-z0-9\s\-_]+$/)) return "Euro";

  // Safe fallback — do NOT default to Cosplay
  return "Japan";
}

// ─── System Prompt ────────────────────────────────────────────────────────────

function buildSystemPrompt(siteName: string, detectedCategory: YukvixCategory): string {
  // Only use "cosplay album" if category is actually Cosplay
  const albumTypeLabel =
    detectedCategory === "Cosplay" ? "cosplay album" : "premium photo gallery album";

  return `You are a professional SEO editor for "${siteName}", a premium photo gallery website.

Your task: generate SEO metadata for a photo album from its archive filename.

═══════════════════════════════════════
WRITING RULES
═══════════════════════════════════════
- Write like a real human editor, NOT like AI
- Vary sentence structure — never repeat the same pattern across albums
- No keyword-stuffing
- Preserve original names exactly — do NOT translate Chinese/Japanese/Korean
- Style: premium, professional, clean — NOT explicit
- Avoid adult, vulgar, or sensitive wording
- Each album must have unique content
- BANNED WORDS (never use): allure, captivating, stunning, breathtaking, enchanting,
  mesmerizing, ethereal, exquisite, sensual, seductive, provocative, tantalizing,
  elegant (overused), sultry, irresistible, magnetic, spellbinding

═══════════════════════════════════════
FIELD RULES
═══════════════════════════════════════
- albumTitle:       WILL BE OVERRIDDEN with filename (do not generate)
                    The system will use the original filename as albumTitle
                    Do not include adjectives or modifications
- seoTitle:         UNDER 60 characters, includes focus keyword
                    Preferred format: "[Collection] No.[N] [Creator] Photo Gallery"
                    or "[Creator] [Collection] No.[N] Photos"
                    Keep it short and factual — no adjectives
- metaDescription:  UNDER 155 characters, compelling, includes focus keyword
- focusKeyword:     PRIORITY: creator name > collection name > filename
                    Do NOT append "cosplay" unless category = Cosplay
- relatedKeywords:  5 keywords (exactly 5) matching the detected category
                    Do NOT use "cosplay gallery" / "premium cosplay" unless Cosplay
                    China/Korea/Japan/Euro: use country-specific + creator-specific terms
                    Gravure: use gravure, idol, photoshoot terms
- tags:             5–8 specific, searchable tags
- shortDescription: 2–3 sentences, human editorial style
- slug:             lowercase, hyphens only, max 50 chars
                    Do NOT separate CJK pinyin: prefer "baixiaodie" not "bai-xiao-die"
- altTextTemplate:  Format: "[Creator] [AlbumName] photo #number"
                    Example: "白小蝶 XIUREN No.11299 photo #number"

═══════════════════════════════════════
CATEGORY RULES — choose exactly ONE
═══════════════════════════════════════
Japan    → Japanese models, gravure idols, Japanese characters (hiragana/katakana)
China    → XIUREN, XiuRen, IMISS, UOM, YouMi, FeiLin, MFStar, Ugirls, TouTiao, Chinese characters
Korea    → ArtGravia, DJAWA, PIA, Pure Media, Korean characters
Euro     → European model names, western-style photo sets
Cosplay  → Anime/game character costumes
Gravure  → Bikini, swimsuit, idol photoshoots, gravure keywords

Do NOT create new categories. If uncertain, choose the closest one.

═══════════════════════════════════════
ALBUM TYPE
═══════════════════════════════════════
Detected category: ${detectedCategory}
This is a ${albumTypeLabel}.

═══════════════════════════════════════
OUTPUT — return ONLY valid JSON, no markdown
═══════════════════════════════════════
{
  "albumTitle":       "string",
  "seoTitle":         "string (max 60 chars)",
  "metaDescription":  "string (max 155 chars)",
  "focusKeyword":     "string (creator/collection priority)",
  "relatedKeywords":  ["kw1","kw2","kw3","kw4","kw5"],
  "tags":             ["tag1","tag2","tag3","tag4","tag5"],
  "category":         "Japan|China|Korea|Euro|Cosplay|Gravure",
  "creator":          "string",
  "collectionName":   "string or null (e.g. XIUREN, IMISS, ArtGravia — NOT the creator name)",
  "slug":             "string (no pinyin hyphens)",
  "shortDescription": "string (2-3 sentences)",
  "altTextTemplate":  "[Creator] [AlbumName] photo #number"
}`;
}

// ─── Validation ───────────────────────────────────────────────────────────────

function validateSeo(data: SeoOutput): void {
  const errors: string[] = [];
  if (!data.albumTitle || data.albumTitle.length < 3) errors.push("albumTitle too short");
  // Allow up to 70 chars — AI sometimes goes slightly over 60, still valid for SEO
  if (!data.seoTitle || data.seoTitle.length > 70)
    errors.push(`seoTitle > 70 chars (${data.seoTitle?.length})`);
  if (!data.metaDescription || data.metaDescription.length > 155)
    errors.push(`metaDescription > 155 chars (${data.metaDescription?.length})`);
  if (!data.focusKeyword || data.focusKeyword.length < 2) errors.push("focusKeyword too short");
  // Accept 5-8 related keywords (AI sometimes returns 6-8, strict 5 causes too many fallbacks)
  if (!Array.isArray(data.relatedKeywords) || data.relatedKeywords.length < 3)
    errors.push(`relatedKeywords must have at least 3 (got ${data.relatedKeywords?.length ?? 0})`);
  if (!Array.isArray(data.tags) || data.tags.length < 3) errors.push("tags must be at least 3");
  const validCats = ["Japan", "China", "Korea", "Euro", "Cosplay", "Gravure"];
  if (!validCats.includes(data.category)) errors.push(`invalid category: ${data.category}`);
  if (!data.slug || !/^[a-z0-9-]+$/.test(data.slug)) errors.push("invalid slug format");
  if (!data.altTextTemplate || !data.altTextTemplate.includes("#number"))
    errors.push("altTextTemplate must include #number");
  if (errors.length > 0) throw new Error(`SEO validation failed: ${errors.join(", ")}`);
}

// ─── Creator Detection ────────────────────────────────────────────────────────

/**
 * Detect creator from filename using known model set patterns.
 */
export function detectCreatorFromFilename(filename: string): string | null {
  // Chinese sets: extract model name after set name + number
  // e.g. "XIUREN No.11299 白小蝶" → "白小蝶"
  const chineseMatch = filename.match(
    /(?:XIUREN|XiuRen|IMISS|UOM|YouMi|FeiLin|MFStar|Ugirls|TouTiao)[\s\-_.]*(?:No\.?|Vol\.?)?[\d]+[\s\-_.]*(.*)/i
  );
  if (chineseMatch?.[1]?.trim()) return chineseMatch[1].trim();

  // Korean sets: extract model name after set name
  // e.g. "ArtGravia Vol.123 Kim Nari" → "Kim Nari"
  const koreanMatch = filename.match(
    /(?:ArtGravia|DJAWA|PIA|Pure Media|CreamSoda|SWEETBOX)[\s\-_.]*(?:Vol\.?|No\.?)?[\d]*[\s\-_.]*(.*)/i
  );
  if (koreanMatch?.[1]?.trim()) return koreanMatch[1].trim();

  // Japanese sets
  const japaneseMatch = filename.match(
    /(?:Gravure|Comiket)[\s\-_.]*(?:Vol\.?|No\.?)?[\d]*[\s\-_.]*(.*)/i
  );
  if (japaneseMatch?.[1]?.trim()) return japaneseMatch[1].trim();

  // Fallback: last meaningful segment
  const parts = filename.split(/[\s\-_]+/);
  const last = parts[parts.length - 1];
  return last && last.length > 1 ? last : null;
}

// ─── Slug Generation ──────────────────────────────────────────────────────────

/**
 * Generate a Latin-only slug from a filename.
 * - Removes CJK characters
 * - No pinyin hyphens (baixiaodie not bai-xiao-die)
 * - Max 50 chars
 */
export function generateSlug(filename: string): string {
  return (
    filename
      .toLowerCase()
      .replace(/\.(zip|rar|7z)$/i, "")
      // Remove CJK and all non-latin characters
      .replace(/[\u4e00-\u9fff\u3040-\u309f\u30a0-\u30ff\uac00-\ud7af]/g, "")
      .replace(/[^a-z0-9\s-]/g, "")
      .replace(/\s+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 50) || "album"
  );
}

// ─── Rule-Based Fallback ──────────────────────────────────────────────────────

/**
 * Rule-based fallback SEO generation.
 * Used when AI fails or is not configured.
 */
function fallbackSeo(filename: string, input: SeoInput & { siteName: string }): SeoOutput {
  const category = detectCategory(filename);
  const creator =
    input.creator ||
    detectCreatorFromFilename(filename) ||
    filename.split(/[\s\-_]+/).pop() ||
    "Unknown";
  const collectionName = detectCollectionName(filename);

  const generatedSlug = generateSlug(filename);
  // Use filename directly as albumTitle (no AI inference)
  const albumTitle = filename;
  const seoTitle = `${creator} ${filename.slice(0, 35)} - ${input.siteName}`.slice(0, 60);
  const metaDescription =
    `Explore premium ${creator} photos on ${input.siteName}. High-quality images from ${filename}.`.slice(
      0,
      155
    );

  // Focus keyword — creator priority, no auto-append cosplay
  const focusKeyword =
    creator !== "Unknown" ? `${creator} photos` : `${filename} photo gallery`;

  // Related keywords — match category, no cosplay unless Cosplay
  const categoryLabel = category.toLowerCase();
  const relatedKeywords: string[] =
    category === "Cosplay"
      ? [
          `${creator} cosplay`,
          `${creator} cosplay photos`,
          `cosplay gallery`,
          `premium cosplay`,
          `${input.siteName} cosplay`,
        ]
      : [
          `${creator} photos`,
          `${categoryLabel} photo gallery`,
          `premium ${categoryLabel} photos`,
          `${creator} collection`,
          `${input.siteName} ${categoryLabel}`,
        ];

  const tags = [category, "photo", creator, "premium", "gallery"];

  const albumTypeLabel =
    category === "Cosplay" ? "cosplay album" : "premium photo gallery album";
  const shortDescription = `A ${albumTypeLabel} featuring ${creator}. High-quality photography with professional styling. Exclusive to ${input.siteName}.`;
  const altTextTemplate = `${creator} ${filename.slice(0, 30)} photo #number`;

  return {
    albumTitle,
    seoTitle,
    metaDescription,
    focusKeyword,
    relatedKeywords,
    tags,
    category,
    creator,
    collectionName: collectionName || undefined,
    slug: generatedSlug,
    shortDescription,
    altTextTemplate,
    publishStatus: "draft",
  };
}

/** Detect collection name (e.g. XIUREN, ArtGravia) from filename */
function detectCollectionName(filename: string): string | null {
  const collections = [
    "XIUREN", "XiuRen", "IMISS", "UOM", "YouMi", "FeiLin", "MFStar", "Ugirls", "TouTiao",
    "ArtGravia", "DJAWA", "PIA", "Pure Media", "CreamSoda", "SWEETBOX",
    "MissKON", "MrCong",
  ];
  for (const c of collections) {
    if (filename.toLowerCase().includes(c.toLowerCase())) return c;
  }
  return null;
}

/** Invalidate in-memory cache (call after admin clears SEO cache) */
export function clearSeoMemCache(): void {
  memCache.clear();
}
