/**
 * Bulk AI SEO generation for tag entities (SEO Foundation Phase C).
 * Tool only — invoked manually from Admin; no auto-run.
 */

import { callAi } from "./ai-provider.js";

export type TagSeoBulkItem = {
  id: number;
  name: string;
  slug: string;
  status: "pending" | "processing" | "done" | "failed";
  error?: string;
  seoTitle?: string;
  seoDescription?: string;
};

export type TagSeoBulkJob = {
  id: string;
  items: TagSeoBulkItem[];
  cancelled: boolean;
  startedAt: number;
  finishedAt?: number;
};

let activeTagSeoJob: TagSeoBulkJob | null = null;

export function getActiveTagSeoJob() {
  return activeTagSeoJob;
}

export function cancelTagSeoJob() {
  if (activeTagSeoJob) activeTagSeoJob.cancelled = true;
}

export function getTagSeoJobSummary(job: TagSeoBulkJob) {
  const total = job.items.length;
  const done = job.items.filter((i) => i.status === "done").length;
  const failed = job.items.filter((i) => i.status === "failed").length;
  const processing = job.items.filter((i) => i.status === "processing").length;
  const pending = job.items.filter((i) => i.status === "pending").length;
  const finished = !job.cancelled && pending === 0 && processing === 0;
  return { total, done, failed, processing, pending, finished, cancelled: job.cancelled };
}

async function generateTagEntitySeo(tag: { name: string; slug: string; albumCount?: number }) {
  const context = [
    `Tag name: ${tag.name}`,
    `URL slug: ${tag.slug}`,
    tag.albumCount != null ? `Albums tagged: ${tag.albumCount}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  const result = await callAi({
    messages: [
      {
        role: "system",
        content: `You are an SEO expert for a cosplay gallery website.
Generate SEO metadata for a tag/collection page.
Rules:
- seoTitle: 50-60 characters, include tag name and "cosplay gallery" context
- seoDescription: 140-160 characters, engaging intro for the tag collection page (also used as page intro)
- Use English
- Return valid JSON only`,
      },
      {
        role: "user",
        content: `Generate SEO title and meta description (intro) for this tag page:\n\n${context}`,
      },
    ],
    responseFormat: {
      type: "json_schema",
      json_schema: {
        name: "tag_seo",
        strict: true,
        schema: {
          type: "object",
          properties: {
            seoTitle: { type: "string", description: "SEO page title (50-60 chars)" },
            seoDescription: { type: "string", description: "Meta description / intro (140-160 chars)" },
          },
          required: ["seoTitle", "seoDescription"],
          additionalProperties: false,
        },
      },
    },
  });

  const raw = result.content;
  if (!raw) throw new Error("Empty AI response");
  return JSON.parse(raw) as { seoTitle: string; seoDescription: string };
}

export async function runTagSeoBulkJob(job: TagSeoBulkJob) {
  const { getDb } = await import("../db.js");
  const { tags } = await import("../../drizzle/schema.js");
  const { eq } = await import("drizzle-orm");
  const db = await getDb();
  if (!db) return;

  for (const item of job.items) {
    if (job.cancelled) break;
    item.status = "processing";
    try {
      const result = await generateTagEntitySeo({ name: item.name, slug: item.slug });
      await db
        .update(tags)
        .set({
          seoTitle: result.seoTitle.substring(0, 256),
          seoDescription: result.seoDescription.substring(0, 2000),
        })
        .where(eq(tags.id, item.id));
      item.seoTitle = result.seoTitle;
      item.seoDescription = result.seoDescription;
      item.status = "done";
    } catch (err) {
      item.status = "failed";
      item.error = err instanceof Error ? err.message : "Unknown error";
    }
  }
  job.finishedAt = Date.now();
  if (activeTagSeoJob?.id === job.id) {
    // keep job for polling until admin dismisses
  }
}

export function startTagSeoBulkJob(items: Omit<TagSeoBulkItem, "status">[]): TagSeoBulkJob | null {
  if (activeTagSeoJob && !getTagSeoJobSummary(activeTagSeoJob).finished) {
    return null;
  }
  const job: TagSeoBulkJob = {
    id: `bulk-tag-seo-${Date.now()}`,
    items: items.map((i) => ({ ...i, status: "pending" as const })),
    cancelled: false,
    startedAt: Date.now(),
  };
  activeTagSeoJob = job;
  void runTagSeoBulkJob(job);
  return job;
}

export async function auditTagSeoGaps() {
  const { getDb } = await import("../db.js");
  const { tags } = await import("../../drizzle/schema.js");
  const { or, isNull, count, sql } = await import("drizzle-orm");
  const db = await getDb();
  if (!db) return { total: 0, missingTitle: 0, missingDescription: 0, missingAny: 0 };

  const [totalRow] = await db.select({ count: count() }).from(tags);
  const missingCond = or(isNull(tags.seoTitle), isNull(tags.seoDescription), sql`${tags.seoTitle} = ''`, sql`${tags.seoDescription} = ''`);
  const [missingRow] = await db.select({ count: count() }).from(tags).where(missingCond);
  const [missingTitleRow] = await db
    .select({ count: count() })
    .from(tags)
    .where(or(isNull(tags.seoTitle), sql`${tags.seoTitle} = ''`));
  const [missingDescRow] = await db
    .select({ count: count() })
    .from(tags)
    .where(or(isNull(tags.seoDescription), sql`${tags.seoDescription} = ''`));

  return {
    total: totalRow?.count ?? 0,
    missingAny: missingRow?.count ?? 0,
    missingTitle: missingTitleRow?.count ?? 0,
    missingDescription: missingDescRow?.count ?? 0,
  };
}

export async function listTagsMissingSeo(limit = 500) {
  const { getDb } = await import("../db.js");
  const { tags } = await import("../../drizzle/schema.js");
  const { or, isNull, sql } = await import("drizzle-orm");
  const db = await getDb();
  if (!db) return [];

  return db
    .select({ id: tags.id, name: tags.name, slug: tags.slug })
    .from(tags)
    .where(or(isNull(tags.seoTitle), isNull(tags.seoDescription), sql`${tags.seoTitle} = ''`, sql`${tags.seoDescription} = ''`))
    .limit(limit);
}
