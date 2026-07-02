/**
 * SEO Worker — generates SEO-optimized metadata using LLM
 */
import slugify from "slugify";
import type { SeoJobData, PublishJobData } from "../queues.js";
import { enqueuePublishJob, isCancelled } from "../queues.js";
import { callAi } from "../../services/ai-provider.js";
import { logImport, updateJobStatus } from "../logger.js";
import { getDb } from "../../db.js";
import { importJobs } from "../../../drizzle/schema.js";
import { eq } from "drizzle-orm";
import type { GeneratedSeo } from "../types.js";

const STOP_WORDS = new Set([
  "a", "an", "the", "and", "or", "but", "in", "on", "at", "to", "for",
  "of", "with", "by", "from", "is", "are", "was", "were", "be", "been",
  "have", "has", "had", "do", "does", "did", "will", "would", "could",
  "should", "may", "might", "shall", "can", "this", "that", "these", "those",
]);

function generateSlug(title: string): string {
  // Remove stop words, slugify, limit to 60 chars, trim trailing dash
  const words = title
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 0 && !STOP_WORDS.has(w));
  const slug = words.join("-").slice(0, 60).replace(/-+$/, "");
  return slug || slugify(title, { lower: true, strict: true, trim: true }).slice(0, 60);
}

function ensureUniqueSlug(slug: string): string {
  const timestamp = Date.now().toString(36);
  return `${slug}-${timestamp}`;
}

async function generateSeoWithLLM(
  rawTitle?: string,
  rawCreator?: string,
  rawTags?: string[],
  imageCount?: number
): Promise<GeneratedSeo> {
  const prompt = `You are an SEO expert for a premium cosplay gallery platform.

Generate SEO metadata for a cosplay/gravure photo album with the following raw data:
- Raw title: ${rawTitle || "Unknown"}
- Creator/Model: ${rawCreator || "Unknown"}
- Raw tags: ${rawTags?.join(", ") || "none"}
- Number of photos: ${imageCount || 0}
- Brand: yukvix

Requirements:
1. Create an engaging, SEO-optimized title (max 60 chars) that includes the model name if known
2. Generate a compelling meta description (max 160 chars)
3. Extract or generate 5-10 relevant tags (model name, series, costume type, etc.)
4. Detect/confirm creator/model name from the title if possible
5. Generate ${Math.min(imageCount || 5, 5)} alt text entries in format: "[Model Name] [Series/Character] cosplay photo [N] - yukvix" (e.g. "Seoahn DJAWA cosplay photo 1 - yukvix")
6. Create OpenGraph title and description
7. Slug must be max 50 chars, lowercase, hyphens only, no stop words (a/an/the/of/in/at/to/for)

Return ONLY valid JSON matching this schema:
{
  "title": "string (max 60 chars)",
  "slug": "url-friendly-slug (max 50 chars, no stop words)",
  "description": "string (max 160 chars)",
  "tags": ["tag1", "tag2", ...],
  "creator": "string or null",
  "altTexts": ["[Model] [Series] cosplay photo 1 - yukvix", ...],
  "ogTitle": "string",
  "ogDescription": "string"
}`;

  try {
    const seoResult = await callAi({
      messages: [
        { role: "system", content: "You are an SEO expert. Always respond with valid JSON only." },
        { role: "user", content: prompt },
      ],
      responseFormat: {
        type: "json_schema",
        json_schema: {
          name: "seo_metadata",
          strict: true,
          schema: {
            type: "object",
            properties: {
              title: { type: "string" },
              slug: { type: "string" },
              description: { type: "string" },
              tags: { type: "array", items: { type: "string" } },
              creator: { type: ["string", "null"] },
              altTexts: { type: "array", items: { type: "string" } },
              ogTitle: { type: "string" },
              ogDescription: { type: "string" },
            },
            required: ["title", "slug", "description", "tags", "creator", "altTexts", "ogTitle", "ogDescription"],
            additionalProperties: false,
          },
        },
      },
    });

    const content = seoResult.content;
    if (content) {
      const parsed = JSON.parse(content);
      // Ensure slug from LLM respects 50-char limit
      const rawSlug = parsed.slug || generateSlug(parsed.title || rawTitle || "cosplay-album");
      const cleanSlug = rawSlug.toLowerCase().replace(/[^a-z0-9-]/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "").slice(0, 50);
      return {
        title: parsed.title || rawTitle || "Cosplay Album",
        slug: cleanSlug,
        description: parsed.description || "",
        tags: parsed.tags || [],
        creator: parsed.creator || rawCreator,
        altTexts: parsed.altTexts || [],
        ogTitle: parsed.ogTitle || parsed.title || "",
        ogDescription: parsed.ogDescription || parsed.description || "",
      };
    }
  } catch (err) {
    console.warn("[SeoWorker] LLM failed, using fallback:", err);
  }

  // Fallback
  const title = rawTitle || "Cosplay Album";
  const slug = generateSlug(title);
  const modelName = rawCreator || title.split(" ")[0] || "Model";
  return {
    title,
    slug,
    description: `${title} — Premium cosplay photo collection${rawCreator ? ` by ${rawCreator}` : ""}`,
    tags: rawTags || [],
    creator: rawCreator,
    altTexts: Array.from({ length: Math.min(imageCount || 1, 5) }, (_, i) =>
      `${modelName} cosplay photo ${i + 1} - yukvix`
    ),
    ogTitle: title,
    ogDescription: `View ${imageCount || 0} photos from ${title}`,
  };
}

/**
 * Apply titleCleanupRules to strip brand/domain suffixes from raw title.
 * Rules are applied in order; each is a simple string replacement (case-sensitive).
 */
function applyTitleCleanup(title: string, rules?: Array<{ find: string; replace: string }>): string {
  if (!rules || rules.length === 0) return title;
  let result = title;
  for (const rule of rules) {
    if (rule.find) {
      result = result.split(rule.find).join(rule.replace ?? "");
    }
  }
  return result.trim();
}

export async function processSeoJob(data: SeoJobData): Promise<void> {
  const { jobId, rawTitle, rawCreator, rawTags, imageCount, processedImages, categoryId, titleCleanupRules, defaultVip: passedDefaultVip, freePreviewCount: passedFreePreviewCount } = data;

  try {
    await logImport(jobId, "info", "Starting SEO generation");
    await updateJobStatus(jobId, "seo");

    // Get extracted metadata from DB (set by crawl worker)
    const db = await getDb();
    let title = rawTitle;
    let creator = rawCreator;
    let tags = rawTags;

    // Also load sourceId to get titleCleanupRules, defaultVip, freePreviewCount if not passed directly
    let resolvedCleanupRules = titleCleanupRules;
    let resolvedDefaultVip = passedDefaultVip ?? false;
    // undefined = not set yet; null = explicitly "use Album Defaults"
    let resolvedFreePreviewCount: number | null | undefined = passedFreePreviewCount;
    if (db) {
      const [jobRecord] = await db.select().from(importJobs).where(eq(importJobs.id, jobId)).limit(1);
      if (jobRecord) {
        title = title || jobRecord.extractedTitle || undefined;
        creator = creator || jobRecord.extractedCreator || undefined;
        tags = tags || (jobRecord.extractedTags ? JSON.parse(jobRecord.extractedTags as string) : undefined);
        // Load titleCleanupRules and defaultVip from source if not already provided
        if (jobRecord.sourceId) {
          const { importSources } = await import("../../../drizzle/schema.js");
          const [src] = await db.select().from(importSources).where(eq(importSources.id, jobRecord.sourceId)).limit(1);
          if (src) {
            if (!resolvedCleanupRules && src.titleCleanupRules) {
              try { resolvedCleanupRules = JSON.parse(src.titleCleanupRules); } catch {}
            }
            // Always read defaultVip and freePreviewCount from source (source is authoritative)
            resolvedDefaultVip = src.defaultVip ?? false;
            // src.freePreviewCount === null means "use Album Defaults"
            resolvedFreePreviewCount = src.freePreviewCount ?? null;
          }
        }
      }
    }

    // Apply title cleanup rules BEFORE sending to LLM
    if (title && resolvedCleanupRules?.length) {
      const cleaned = applyTitleCleanup(title, resolvedCleanupRules);
      await logImport(jobId, "info", `Title cleanup: "${title}" → "${cleaned}"`);
      title = cleaned;
    }

    // Check cancellation before expensive LLM call
    if (isCancelled(jobId)) {
      await logImport(jobId, "warn", "SEO cancelled by user before LLM call");
      await updateJobStatus(jobId, "cancelled", { completedAt: new Date() });
      return;
    }

    const seo = await generateSeoWithLLM(title, creator, tags, imageCount);
    const finalSlug = ensureUniqueSlug(seo.slug);

    await logImport(jobId, "info", `SEO generated: "${seo.title}" → /${finalSlug}`);

    // Get full processed images from DB (stored by process worker)
    let allProcessedImages = processedImages as any[];
    if (db) {
      const [jobRecord] = await db.select().from(importJobs).where(eq(importJobs.id, jobId)).limit(1);
      if (jobRecord?.processedImagesData) {
        try {
          const parsed = JSON.parse(jobRecord.processedImagesData);
          if (Array.isArray(parsed) && parsed.length > 0) {
            allProcessedImages = parsed;
          }
        } catch {}
      }
    }

    const publishData: PublishJobData = {
      jobId,
      title: seo.title,
      slug: finalSlug,
      description: seo.description,
      creator: seo.creator || undefined,
      tags: seo.tags,
      altTexts: seo.altTexts,
      processedImages: allProcessedImages,
      categoryId, // pass through to publish worker
      defaultVip: resolvedDefaultVip, // pass VIP default from source config
      freePreviewCount: resolvedFreePreviewCount, // null = use Album Defaults
    };

    await enqueuePublishJob(publishData);
    await logImport(jobId, "info", "Enqueued publish job");
  } catch (err: any) {
    await logImport(jobId, "error", `SEO failed: ${err.message}`);
    await updateJobStatus(jobId, "failed", {
      errorMessage: err.message,
      completedAt: new Date(),
    });
  }
}
