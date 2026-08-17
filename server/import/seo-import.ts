/**

 * Phase 7 — Import-context SEO enrichment with audit metadata/metrics.

 * Optional step: never throws; caller always continues pipeline.

 */



import { eq } from "drizzle-orm";

import { getDb } from "../db";

import { albums, albumTags, seoGenerationHistory, tags, zipImportJobs } from "../../drizzle/schema";

import {

  generateSeoData,

  detectCategory,

  buildImportSeoSystemPrompt,

  parseAndValidateSeoResponse,

  buildSeoKeywords,

  PROMPT_VERSION,

  type SeoOutput,

} from "../services/seo-generator";

import { callAi, getAiProviderConfig } from "../services/ai-provider";



export interface AiSeoMetadata {

  provider: string;

  model: string;

  promptVersion: string;

  generatedAt: string;

  usedFallback: boolean;

  error?: string;

}



export interface AiSeoMetrics {

  latencyMs: number;

  tokenUsage?: {

    promptTokens: number;

    completionTokens: number;

    totalTokens: number;

  };

  estimatedCost?: number;

}



export interface ImportSeoInput {

  originalFileName: string;

  adminTitle?: string;

  creator?: string;

  category?: string;

  imageCount?: number;

  siteName?: string;

  skipCache?: boolean;

}



export interface ImportSeoResult {

  seo: SeoOutput;

  metadata: AiSeoMetadata;

  metrics: AiSeoMetrics;

}



const CATEGORY_ID_MAP: Record<string, number> = {

  Japan: 30005,

  Korea: 30008,

  China: 4,

  Cosplay: 3,

  Euro: 30006,

  Gravure: 30008,

};



/** Rough Gemini Flash pricing for audit (USD). */

function estimateGeminiCost(

  usage: AiSeoMetrics["tokenUsage"],

  _model: string

): number | undefined {

  if (!usage) return undefined;

  const inputRate = 0.075 / 1_000_000;

  const outputRate = 0.3 / 1_000_000;

  return usage.promptTokens * inputRate + usage.completionTokens * outputRate;

}



function buildEnrichedUserMessage(input: ImportSeoInput, cleaned: string): string {

  const lines = [

    `Generate SEO metadata for this album archive.`,

    `- Filename: "${cleaned}"`,

  ];

  if (input.creator) lines.push(`- Creator: ${input.creator}`);

  if (input.category) lines.push(`- Category hint: ${input.category}`);

  if (input.imageCount != null && input.imageCount > 0) {

    lines.push(`- Image count: ${input.imageCount}`);

  }

  if (input.adminTitle) lines.push(`- Admin title: ${input.adminTitle}`);

  return lines.join("\n");

}



function safeJsonArray(value: string[] | undefined | null): string | null {

  if (!value?.length) return null;

  return JSON.stringify(value);

}



async function upsertAlbumTags(

  db: NonNullable<Awaited<ReturnType<typeof getDb>>>,

  albumId: number,

  tagNames: string[]

): Promise<void> {

  for (const name of tagNames) {

    const slug = name

      .toLowerCase()

      .replace(/[^a-z0-9]+/g, "-")

      .replace(/^-|-$/g, "");

    if (!slug) continue;



    const existing = await db.select({ id: tags.id }).from(tags).where(eq(tags.slug, slug)).limit(1);

    let tagId = existing[0]?.id;

    if (!tagId) {

      const [result] = await db.insert(tags).values({ name, slug });

      tagId = (result as { insertId?: number }).insertId;

    }

    if (tagId) {

      await db.insert(albumTags).ignore().values({ albumId, tagId });

    }

  }

}



/**

 * Run enriched SEO for import worker / retrySeo.

 * AI failure → rule-based fallback via generateSeoData; never throws.

 */

export async function runImportSeo(input: ImportSeoInput): Promise<ImportSeoResult> {

  const t0 = Date.now();

  const siteName = input.siteName || process.env.SITE_NAME || "Yukvix";

  const cleaned = input.originalFileName.replace(/\.(zip|rar|7z)$/i, "").trim();

  const aiConfig = await getAiProviderConfig();



  let usedFallback = false;

  let errorMsg: string | undefined;

  let tokenUsage: AiSeoMetrics["tokenUsage"];

  let seo: SeoOutput;



  try {

    const detectedCategory = detectCategory(cleaned);

    const systemPrompt = buildImportSeoSystemPrompt(siteName, detectedCategory);

    const result = await callAi({

      messages: [

        { role: "system", content: systemPrompt },

        { role: "user", content: buildEnrichedUserMessage(input, cleaned) },

      ],

      temperature: 0.7,

      maxTokens: 2048,

      responseFormat: { type: "json_object" },

    });



    tokenUsage = result.usage;

    seo = parseAndValidateSeoResponse(result.content, cleaned);

  } catch (err) {

    usedFallback = true;

    errorMsg = (err as Error).message;

    seo = await generateSeoData({

      originalFileName: input.originalFileName,

      adminTitle: input.adminTitle,

      creator: input.creator,

      category: input.category,

      siteName,

      skipCache: input.skipCache ?? true,

    });

  }



  const latencyMs = Date.now() - t0;

  const metadata: AiSeoMetadata = {

    provider: aiConfig.provider,

    model: aiConfig.model,

    promptVersion: PROMPT_VERSION,

    generatedAt: new Date().toISOString(),

    usedFallback,

    ...(errorMsg ? { error: errorMsg } : {}),

  };



  const metrics: AiSeoMetrics = {

    latencyMs,

    ...(tokenUsage ? { tokenUsage } : {}),

    estimatedCost: estimateGeminiCost(tokenUsage, aiConfig.model),

  };



  return { seo, metadata, metrics };

}



/** Apply full SEO output to album row + album_tags junction (UAT BUG-003). */

export async function applySeoToAlbum(albumId: number, seo: SeoOutput): Promise<void> {

  const db = await getDb();

  if (!db) throw new Error("DB not available");



  const categoryId = CATEGORY_ID_MAP[seo.category] ?? null;



  await db

    .update(albums)

    .set({
      description: seo.shortDescription,

      creator: seo.creator || undefined,

      collectionName: seo.collectionName || undefined,

      categoryId,

      seoTitle: seo.seoTitle,

      seoDescription: seo.metaDescription,

      metaTitle: seo.seoTitle,

      metaDescription: seo.metaDescription,

      focusKeyword: seo.focusKeyword,
      seoKeywords: seo.seoKeywords?.trim() || buildSeoKeywords(seo),

      relatedKeywords: safeJsonArray(seo.relatedKeywords),

      shortDescription: seo.shortDescription,

      altTextTemplate: seo.altTextTemplate,

      aiGenerated: true,

      updatedAt: new Date(),

    })

    .where(eq(albums.id, albumId));



  if (seo.tags?.length) {

    await upsertAlbumTags(db, albumId, seo.tags);

  }

}



export async function persistJobSeoAudit(

  jobId: number,

  metadata: AiSeoMetadata,

  metrics: AiSeoMetrics

): Promise<void> {

  const db = await getDb();

  if (!db) throw new Error("DB not available");



  await db

    .update(zipImportJobs)

    .set({

      aiSeoMetadata: JSON.stringify(metadata),

      aiSeoMetrics: JSON.stringify(metrics),

      updatedAt: new Date(),

    })

    .where(eq(zipImportJobs.id, jobId));

}



export async function recordSeoGenerationHistory(

  albumId: number,

  seo: SeoOutput,

  metadata: AiSeoMetadata

): Promise<void> {

  const db = await getDb();

  if (!db) return;



  await db.insert(seoGenerationHistory).values({

    albumId,

    promptVersion: metadata.promptVersion,

    model: metadata.model,

    generatedJson: JSON.stringify(seo),

    editedByAdmin: false,

    qualityPassed: false,

  });

}



/** Full SEO enrichment for a completed import job (used by step + retrySeo). */

export async function enrichAlbumSeoForJob(

  jobId: number,

  albumId: number,

  input: ImportSeoInput

): Promise<ImportSeoResult> {

  const result = await runImportSeo(input);



  try {

    await applySeoToAlbum(albumId, result.seo);

  } catch (err) {

    result.metadata.usedFallback = true;

    result.metadata.error = [result.metadata.error, (err as Error).message]

      .filter(Boolean)

      .join("; ");

  }



  try {

    await persistJobSeoAudit(jobId, result.metadata, result.metrics);

  } catch {

    // audit write is best-effort

  }



  try {

    await recordSeoGenerationHistory(albumId, result.seo, result.metadata);

  } catch {

    // history write is best-effort

  }



  return result;

}


