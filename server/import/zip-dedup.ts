/**
 * ZIP Import duplicate detection (Phase 3 + Phase 4 metadata)
 */

import crypto from "crypto";
import fs from "fs/promises";
import { createReadStream } from "fs";
import { and, eq, inArray, ne, sql } from "drizzle-orm";
import { getDb } from "../db";
import { albums, zipImportJobs } from "../../drizzle/schema";
import { copyObject, deleteFromStorage } from "../storage-wasabi";
import { clearJobWorkerLock } from "../services/import-job-lock";
import { md5File, isImageAlreadyImported } from "./dedup.js";
import { loadDuplicatePolicy, shouldSkipForMatch } from "./duplicate-policy";
import {
  ARCHIVE_HASH_ALGORITHM,
  DUPLICATE_ENGINE_VERSION,
  IMAGE_HASH_ALGORITHM,
} from "./duplicate-engine";
import type {
  DuplicateInfo,
  DuplicateMatch,
  DuplicateType,
  ImportJobStats,
  ImportJobStatsByType,
} from "./duplicate-types";

export interface DuplicateDetectionInput {
  jobId: number;
  albumId: number;
  albumTitle: string;
  albumSlug: string;
  sourceArchiveKey: string;
  sourceArchiveOriginalName: string;
  sourceArchiveSize: number;
  sha256: string;
  duplicateOverride: boolean;
  imagePaths?: string[];
}

export interface DuplicateDetectionResult {
  shouldSkip: boolean;
  duplicateInfo: DuplicateInfo | null;
}

function emptyStatsByType(): ImportJobStatsByType {
  return {
    SKIPPED_SHA256: 0,
    SKIPPED_FILENAME: 0,
    SKIPPED_SIZE: 0,
    SKIPPED_CREATOR: 0,
    SKIPPED_TITLE: 0,
    SKIPPED_IMAGE_HASH: 0,
  };
}

function normalizeFilename(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

function stringSimilarity(a: string, b: string): number {
  if (!a || !b) return 0;
  const setA = new Set(a.toLowerCase().split(/\s+/));
  const setB = new Set(b.toLowerCase().split(/\s+/));
  const intersection = new Set([...setA].filter((x) => setB.has(x)));
  const union = new Set([...setA, ...setB]);
  return union.size === 0 ? 0 : intersection.size / union.size;
}

export async function computeFileSha256(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash(ARCHIVE_HASH_ALGORITHM);
    const stream = createReadStream(filePath);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("end", () => resolve(hash.digest("hex")));
    stream.on("error", reject);
  });
}

async function checkSha256(jobId: number, sha256: string): Promise<DuplicateMatch | null> {
  const db = await getDb();
  if (!db || !sha256) return null;

  const rows = await db
    .select({ id: zipImportJobs.id, albumId: zipImportJobs.albumId })
    .from(zipImportJobs)
    .where(
      and(
        eq(zipImportJobs.sourceArchiveSha256, sha256),
        ne(zipImportJobs.id, jobId),
        inArray(zipImportJobs.status, ["completed", "skipped", "processing", "scheduled"])
      )
    )
    .limit(1);

  if (!rows[0]) return null;

  let matchedTitle: string | undefined;
  let matchedSlug: string | undefined;
  if (rows[0].albumId) {
    const album = await db
      .select({ title: albums.title, slug: albums.slug })
      .from(albums)
      .where(eq(albums.id, rows[0].albumId))
      .limit(1);
    matchedTitle = album[0]?.title;
    matchedSlug = album[0]?.slug;
  }

  return {
    duplicateType: "SKIPPED_SHA256",
    confidence: 1.0,
    matchedJobId: rows[0].id,
    matchedAlbumId: rows[0].albumId,
    matchedTitle,
    matchedSlug,
    details: { hashAlgorithm: ARCHIVE_HASH_ALGORITHM, digest: sha256 },
  };
}

async function checkFilename(
  jobId: number,
  originalName: string,
  windowDays: number
): Promise<DuplicateMatch | null> {
  const db = await getDb();
  if (!db) return null;

  const normalized = normalizeFilename(originalName);
  const cutoff = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000);

  const rows = await db
    .select({ id: zipImportJobs.id, albumId: zipImportJobs.albumId, name: zipImportJobs.sourceArchiveOriginalName })
    .from(zipImportJobs)
    .where(
      and(
        ne(zipImportJobs.id, jobId),
        inArray(zipImportJobs.status, ["completed", "skipped"]),
        sql`${zipImportJobs.createdAt} >= ${cutoff}`
      )
    )
    .limit(200);

  const match = rows.find((r) => r.name && normalizeFilename(r.name) === normalized);
  if (!match) return null;

  return {
    duplicateType: "SKIPPED_FILENAME",
    confidence: 0.9,
    matchedJobId: match.id,
    matchedAlbumId: match.albumId,
    details: { originalName: normalized },
  };
}

async function checkSize(jobId: number, size: number): Promise<DuplicateMatch | null> {
  const db = await getDb();
  if (!db || !size) return null;

  const rows = await db
    .select({ id: zipImportJobs.id, albumId: zipImportJobs.albumId })
    .from(zipImportJobs)
    .where(
      and(
        eq(zipImportJobs.sourceArchiveSize, size),
        ne(zipImportJobs.id, jobId),
        inArray(zipImportJobs.status, ["completed", "skipped"])
      )
    )
    .limit(1);

  if (!rows[0]) return null;

  return {
    duplicateType: "SKIPPED_SIZE",
    confidence: 0.75,
    matchedJobId: rows[0].id,
    matchedAlbumId: rows[0].albumId,
    details: { sizeBytes: size },
  };
}

async function checkCreatorAndTitle(
  albumId: number,
  albumTitle: string,
  albumSlug: string
): Promise<DuplicateMatch[]> {
  const db = await getDb();
  if (!db) return [];

  const matches: DuplicateMatch[] = [];
  const current = await db
    .select({ title: albums.title, slug: albums.slug, cosplayer: albums.cosplayer })
    .from(albums)
    .where(eq(albums.id, albumId))
    .limit(1);

  const cur = current[0];
  if (!cur) return matches;

  const published = await db
    .select({ id: albums.id, title: albums.title, slug: albums.slug, cosplayer: albums.cosplayer })
    .from(albums)
    .where(and(eq(albums.status, "published"), ne(albums.id, albumId)))
    .limit(500);

  for (const a of published) {
    if (a.slug === albumSlug || a.slug === cur.slug) {
      matches.push({
        duplicateType: "SKIPPED_TITLE",
        confidence: 1.0,
        matchedJobId: null,
        matchedAlbumId: a.id,
        matchedTitle: a.title,
        matchedSlug: a.slug,
        details: { match: "slug" },
      });
    }

    const titleSim = stringSimilarity(albumTitle || cur.title || "", a.title || "");
    if (titleSim >= 0.85) {
      matches.push({
        duplicateType: "SKIPPED_TITLE",
        confidence: Math.min(1, titleSim),
        matchedJobId: null,
        matchedAlbumId: a.id,
        matchedTitle: a.title,
        matchedSlug: a.slug,
        details: { similarityScore: titleSim },
      });
    }

    if (cur.cosplayer && a.cosplayer && cur.cosplayer.toLowerCase() === a.cosplayer.toLowerCase()) {
      const creatorSim = stringSimilarity(albumTitle || cur.title || "", a.title || "");
      if (creatorSim >= 0.7) {
        matches.push({
          duplicateType: "SKIPPED_CREATOR",
          confidence: Math.min(1, 0.7 + creatorSim * 0.3),
          matchedJobId: null,
          matchedAlbumId: a.id,
          matchedTitle: a.title,
          matchedSlug: a.slug,
          details: { cosplayer: cur.cosplayer, similarityScore: creatorSim },
        });
      }
    }
  }

  return matches;
}

async function checkImageHashes(imagePaths: string[]): Promise<DuplicateMatch | null> {
  if (!imagePaths?.length) return null;

  const sample = imagePaths.slice(0, 10);
  let matchCount = 0;

  for (const p of sample) {
    try {
      const buf = await fs.readFile(p);
      const dup = await isImageAlreadyImported(md5File(buf));
      if (dup.isDuplicate) matchCount++;
    } catch {
      // ignore
    }
  }

  if (matchCount === 0) return null;

  return {
    duplicateType: "SKIPPED_IMAGE_HASH",
    confidence: Math.min(1, matchCount / sample.length),
    matchedJobId: null,
    matchedAlbumId: null,
    details: { hashAlgorithm: IMAGE_HASH_ALGORITHM, matchCount, sampleSize: sample.length },
  };
}

export async function runDuplicateDetection(
  input: DuplicateDetectionInput
): Promise<DuplicateDetectionResult> {
  if (input.duplicateOverride) {
    return { shouldSkip: false, duplicateInfo: null };
  }

  const policy = await loadDuplicatePolicy();
  const matches: DuplicateMatch[] = [];

  const sha = await checkSha256(input.jobId, input.sha256);
  if (sha) matches.push(sha);

  const fn = await checkFilename(
    input.jobId,
    input.sourceArchiveOriginalName,
    policy.rules.SKIPPED_FILENAME?.windowDays ?? 30
  );
  if (fn) matches.push(fn);

  const sz = await checkSize(input.jobId, input.sourceArchiveSize);
  if (sz) matches.push(sz);

  matches.push(...(await checkCreatorAndTitle(input.albumId, input.albumTitle, input.albumSlug)));

  const img = await checkImageHashes(input.imagePaths);
  if (img) matches.push(img);

  if (matches.length === 0) {
    return { shouldSkip: false, duplicateInfo: null };
  }

  let primary: DuplicateMatch | null = null;
  for (const m of matches) {
    if (shouldSkipForMatch(policy, m.duplicateType, m.confidence)) {
      primary = m;
      break;
    }
  }

  if (!primary) {
    return { shouldSkip: false, duplicateInfo: null };
  }

  return {
    shouldSkip: true,
    duplicateInfo: {
      primaryDuplicate: primary,
      matches,
      policy: policy.mode,
      detectedAt: new Date().toISOString(),
      engineVersion: DUPLICATE_ENGINE_VERSION,
      hashAlgorithm: ARCHIVE_HASH_ALGORITHM,
    },
  };
}

export async function applyDuplicateSkip(
  jobId: number,
  duplicateInfo: DuplicateInfo,
  sourceArchiveKey: string,
  originalFileName: string
): Promise<string> {
  const safeName = originalFileName.replace(/[^a-zA-Z0-9._-]/g, "_") || "archive.zip";
  const skippedKey = `imports/skipped/${jobId}/${safeName}`;

  if (sourceArchiveKey.startsWith("imports/staging/")) {
    await copyObject(sourceArchiveKey, skippedKey);
    await deleteFromStorage(sourceArchiveKey);
  }

  const db = await getDb();
  if (!db) throw new Error("DB not available");

  const current = await db
    .select({ importLogs: zipImportJobs.importLogs, duplicateInfo: zipImportJobs.duplicateInfo })
    .from(zipImportJobs)
    .where(eq(zipImportJobs.id, jobId))
    .limit(1);

  if (current[0]?.duplicateInfo) {
    throw new Error("duplicateInfo is immutable — cannot overwrite after detection");
  }

  const logs: string[] = current[0]?.importLogs ? JSON.parse(current[0].importLogs) : [];
  logs.push(
    `[${new Date().toISOString()}] [Duplicate] ${duplicateInfo.primaryDuplicate.duplicateType} confidence=${duplicateInfo.primaryDuplicate.confidence.toFixed(2)} engine=${duplicateInfo.engineVersion}`
  );

  await db
    .update(zipImportJobs)
    .set({
      status: "skipped",
      duplicateInfo: JSON.stringify(duplicateInfo),
      sourceArchiveKey: skippedKey,
      pipelineStep: "duplicate_check",
      importLogs: JSON.stringify(logs),
      updatedAt: new Date(),
    })
    .where(eq(zipImportJobs.id, jobId));

  await clearJobWorkerLock(jobId);
  return skippedKey;
}

export async function restoreSkippedToStaging(
  jobId: number,
  sourceArchiveKey: string,
  originalFileName: string
): Promise<string> {
  const safeName = originalFileName.replace(/[^a-zA-Z0-9._-]/g, "_") || "archive.zip";
  const stagingKey = `imports/staging/${jobId}/${safeName}`;
  if (sourceArchiveKey.startsWith("imports/skipped/")) {
    await copyObject(sourceArchiveKey, stagingKey);
  }
  return stagingKey;
}

function incrementByType(counts: ImportJobStatsByType, type: DuplicateType): void {
  counts[type] += 1;
}

export async function getImportJobStats(): Promise<ImportJobStats> {
  const db = await getDb();
  const byDuplicateType = emptyStatsByType();
  if (!db) {
    return { imported: 0, skipped: 0, override: 0, failed: 0, byDuplicateType };
  }

  const [importedRow] = await db
    .select({ count: sql<number>`COUNT(*)` })
    .from(zipImportJobs)
    .where(eq(zipImportJobs.status, "completed"));

  const [skippedRow] = await db
    .select({ count: sql<number>`COUNT(*)` })
    .from(zipImportJobs)
    .where(eq(zipImportJobs.status, "skipped" as "completed"));

  const [failedRow] = await db
    .select({ count: sql<number>`COUNT(*)` })
    .from(zipImportJobs)
    .where(eq(zipImportJobs.status, "failed"));

  const [overrideRow] = await db
    .select({ count: sql<number>`COUNT(*)` })
    .from(zipImportJobs)
    .where(sql`${zipImportJobs.duplicateOverrideAudit} IS NOT NULL`);

  const skippedJobs = await db
    .select({ duplicateInfo: zipImportJobs.duplicateInfo })
    .from(zipImportJobs)
    .where(eq(zipImportJobs.status, "skipped" as "completed"));

  for (const row of skippedJobs) {
    if (!row.duplicateInfo) continue;
    try {
      const info = JSON.parse(row.duplicateInfo) as DuplicateInfo;
      if (info.primaryDuplicate?.duplicateType) {
        incrementByType(byDuplicateType, info.primaryDuplicate.duplicateType);
      }
    } catch {
      // ignore malformed JSON
    }
  }

  return {
    imported: Number(importedRow?.count ?? 0),
    skipped: Number(skippedRow?.count ?? 0),
    override: Number(overrideRow?.count ?? 0),
    failed: Number(failedRow?.count ?? 0),
    byDuplicateType,
  };
}

export async function getPendingImportAnywayJobIds(): Promise<number[]> {
  const db = await getDb();
  if (!db) return [];

  const rows = await db
    .select({ id: zipImportJobs.id })
    .from(zipImportJobs)
    .where(
      and(
        sql`${zipImportJobs.duplicateOverrideAudit} IS NOT NULL`,
        inArray(zipImportJobs.status, ["waiting", "processing", "scheduled", "failed"])
      )
    );

  return rows.map((r) => r.id);
}
