/**
 * Allocate album slugs that are unique across albums, static pages, and queued ZIP jobs.
 */
import { eq, inArray } from "drizzle-orm";
import { getDb } from "../db";
import { albums, staticPages, zipImportJobs } from "../../drizzle/schema";
import { isWeakAlbumSlug, nextUniqueAlbumSlug, slugifyAlbumTitle } from "../../shared/album-slug";
import { parsePendingAlbumData, serializePendingAlbumData } from "./pending-album";
import { loadJobPipelineState } from "./pipeline-checkpoint";

const QUEUE_STATUSES = ["uploaded", "waiting", "scheduled", "processing", "waiting_disk_space"] as const;

export async function loadTakenAlbumSlugs(excludeJobId?: number): Promise<Set<string>> {
  const taken = new Set<string>();
  const db = await getDb();
  if (!db) return taken;

  const albumRows = await db.select({ slug: albums.slug }).from(albums);
  for (const row of albumRows) {
    if (row.slug) taken.add(row.slug);
  }

  try {
    const pageRows = await db.select({ slug: staticPages.slug }).from(staticPages);
    for (const row of pageRows) {
      if (row.slug) taken.add(row.slug);
    }
  } catch {
    // static_pages may be unavailable in some test envs
  }

  const pendingRows = await db
    .select({
      id: zipImportJobs.id,
      pendingAlbumData: zipImportJobs.pendingAlbumData,
    })
    .from(zipImportJobs)
    .where(inArray(zipImportJobs.status, [...QUEUE_STATUSES]));

  for (const row of pendingRows) {
    if (excludeJobId && row.id === excludeJobId) continue;
    const pending = parsePendingAlbumData(row.pendingAlbumData);
    if (pending?.slug) taken.add(pending.slug);
  }

  return taken;
}

export async function allocateUniqueAlbumSlug(opts: {
  title: string;
  jobId: number;
  filename?: string;
  taken?: Set<string>;
}): Promise<string> {
  const taken = opts.taken ?? (await loadTakenAlbumSlugs(opts.jobId));
  const source = opts.filename || opts.title;
  const slug = nextUniqueAlbumSlug(slugifyAlbumTitle(source), opts.jobId, taken);
  taken.add(slug);
  return slug;
}

export function checkpointHasUploadedMedia(checkpoint: {
  uploadedKeys?: string[];
  completedSteps?: string[];
} | null | undefined): boolean {
  if (!checkpoint) return false;
  if ((checkpoint.uploadedKeys?.length ?? 0) > 0) return true;
  return (checkpoint.completedSteps ?? []).includes("processing_images");
}

export function uploadedKeysCollideWithTakenSlug(
  uploadedKeys: string[] | undefined,
  takenAlbumSlugs: Set<string>,
  pendingSlug: string
): boolean {
  if (!uploadedKeys?.length) return false;
  for (const key of uploadedKeys) {
    const match = key.match(/^albums\/([^/]+)\//);
    if (!match) continue;
    const prefixSlug = match[1];
    if (takenAlbumSlugs.has(prefixSlug) && (prefixSlug === pendingSlug || isWeakAlbumSlug(prefixSlug))) {
      return true;
    }
  }
  return false;
}

export async function ensureUniquePendingSlug(jobId: number): Promise<{
  ok: boolean;
  slug?: string;
  title?: string;
  repaired: boolean;
  error?: string;
}> {
  const db = await getDb();
  if (!db) return { ok: false, repaired: false, error: "DB not available" };

  const rows = await db
    .select({
      id: zipImportJobs.id,
      pendingAlbumData: zipImportJobs.pendingAlbumData,
      sourceArchiveOriginalName: zipImportJobs.sourceArchiveOriginalName,
    })
    .from(zipImportJobs)
    .where(eq(zipImportJobs.id, jobId))
    .limit(1);

  const job = rows[0];
  const pending = parsePendingAlbumData(job?.pendingAlbumData);
  if (!job || !pending?.slug) {
    return { ok: false, repaired: false, error: "Job has no pending album data" };
  }

  const { checkpoint } = await loadJobPipelineState(jobId);
  const taken = await loadTakenAlbumSlugs(jobId);
  const collide =
    checkpointHasUploadedMedia(checkpoint) &&
    uploadedKeysCollideWithTakenSlug(checkpoint.uploadedKeys, taken, pending.slug);

  if (collide) {
    return {
      ok: false,
      repaired: false,
      slug: pending.slug,
      title: pending.title,
      error:
        "Job already uploaded images under a slug that belongs to another album. Do not resume; re-queue a new job instead.",
    };
  }

  const needsRepair = isWeakAlbumSlug(pending.slug) || taken.has(pending.slug);
  if (!needsRepair) {
    return { ok: true, repaired: false, slug: pending.slug, title: pending.title };
  }

  if (checkpointHasUploadedMedia(checkpoint)) {
    return {
      ok: false,
      repaired: false,
      slug: pending.slug,
      title: pending.title,
      error:
        "Cannot retarget slug after images were uploaded. Leave this job failed and import a new copy.",
    };
  }

  const slug = await allocateUniqueAlbumSlug({
    title: pending.title || job.sourceArchiveOriginalName || pending.slug,
    filename: job.sourceArchiveOriginalName || pending.originalFileName,
    jobId,
    taken,
  });
  pending.slug = slug;
  await db
    .update(zipImportJobs)
    .set({
      pendingAlbumData: serializePendingAlbumData(pending),
      updatedAt: new Date(),
    })
    .where(eq(zipImportJobs.id, jobId));

  return { ok: true, repaired: true, slug, title: pending.title };
}

export async function repairQueuedAlbumSlugs(): Promise<{
  scanned: number;
  repaired: number;
  blocked: number;
}> {
  const db = await getDb();
  if (!db) return { scanned: 0, repaired: 0, blocked: 0 };

  const rows = await db
    .select({ id: zipImportJobs.id })
    .from(zipImportJobs)
    .where(inArray(zipImportJobs.status, ["waiting", "uploaded"]));

  let repaired = 0;
  let blocked = 0;
  for (const row of rows) {
    const result = await ensureUniquePendingSlug(row.id);
    if (result.repaired) repaired += 1;
    if (!result.ok) {
      blocked += 1;
      await db
        .update(zipImportJobs)
        .set({
          status: "failed",
          lastError: (result.error || "Unsafe pending slug").slice(0, 4000),
          workerId: null,
          lockedAt: null,
          heartbeatAt: null,
          updatedAt: new Date(),
        })
        .where(eq(zipImportJobs.id, row.id));
    }
  }

  const failedRows = await db
    .select({
      id: zipImportJobs.id,
      lastError: zipImportJobs.lastError,
    })
    .from(zipImportJobs)
    .where(eq(zipImportJobs.status, "failed"));

  for (const row of failedRows) {
    const result = await ensureUniquePendingSlug(row.id);
    if (!result.ok && result.error && !row.lastError) {
      blocked += 1;
      await db
        .update(zipImportJobs)
        .set({ lastError: result.error.slice(0, 4000), updatedAt: new Date() })
        .where(eq(zipImportJobs.id, row.id));
    }
  }

  return { scanned: rows.length + failedRows.length, repaired, blocked };
}
