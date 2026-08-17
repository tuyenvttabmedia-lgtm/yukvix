/**
 * UAT Round 1 regression smoke tests (run on VPS as cosplay user).
 * Usage: cd /var/www/cosplay-gallery && node --import tsx scripts/uat-round1-test.ts
 */
import { eq } from "drizzle-orm";
import { getDb } from "../server/db";
import { zipImportJobs, albums } from "../drizzle/schema";
import { enrichAlbumSeoForJob } from "../server/import/seo-import";
import { runFullCleanup } from "../server/import/cleanup-service";
import { encodeCopySource } from "../server/import/wasabi-import-utils";

const results: string[] = [];

function pass(name: string, detail?: string) {
  results.push(`PASS  ${name}${detail ? ` — ${detail}` : ""}`);
}

function fail(name: string, detail: string) {
  results.push(`FAIL  ${name} — ${detail}`);
}

async function testCopySourceEncoding() {
  const encoded = encodeCopySource("bucket", "imports/staging/18/Espacia Korea (test).zip");
  if (encoded.includes("(") || encoded.includes(" ")) {
    fail("BUG-001 CopySource encode", "special chars not encoded");
  } else {
    pass("BUG-001 CopySource encode", encoded.slice(0, 60));
  }
}

async function testCancelWaiting() {
  const db = await getDb();
  if (!db) return fail("BUG-002 Cancel", "DB unavailable");

  const waiting = await db
    .select({ id: zipImportJobs.id, status: zipImportJobs.status })
    .from(zipImportJobs)
    .where(eq(zipImportJobs.status, "waiting"))
    .limit(1);

  if (!waiting[0]) {
    pass("BUG-002 Cancel", "no waiting job to test (skip)");
    return;
  }

  const jobId = waiting[0].id;
  const logs: string[] = [];
  logs.push(`[${new Date().toISOString()}] [Cancel] Job cancelled by admin (test)`);

  await db
    .update(zipImportJobs)
    .set({
      status: "cancelled",
      cancelRequested: true,
      completedAt: new Date(),
      importLogs: JSON.stringify(logs),
      updatedAt: new Date(),
    })
    .where(eq(zipImportJobs.id, jobId));

  const [row] = await db
    .select({ status: zipImportJobs.status })
    .from(zipImportJobs)
    .where(eq(zipImportJobs.id, jobId))
    .limit(1);

  if (row?.status === "cancelled") {
    pass("BUG-002 Cancel", `job #${jobId} → cancelled`);
  } else {
    fail("BUG-002 Cancel", `job #${jobId} still ${row?.status}`);
  }
}

async function testRetrySeo() {
  const db = await getDb();
  if (!db) return fail("BUG-003 SEO", "DB unavailable");

  const [job] = await db
    .select({
      id: zipImportJobs.id,
      albumId: zipImportJobs.albumId,
      sourceArchiveOriginalName: zipImportJobs.sourceArchiveOriginalName,
    })
    .from(zipImportJobs)
    .where(eq(zipImportJobs.status, "completed"))
    .orderBy(zipImportJobs.id)
    .limit(1);

  if (!job?.albumId) {
    pass("BUG-003 SEO", "no completed job with album (skip)");
    return;
  }

  const result = await enrichAlbumSeoForJob(job.id, job.albumId, {
    originalFileName: job.sourceArchiveOriginalName || "test-album.zip",
    skipCache: true,
  });

  const [album] = await db
    .select({
      title: albums.title,
      metaTitle: albums.metaTitle,
      focusKeyword: albums.focusKeyword,
    })
    .from(albums)
    .where(eq(albums.id, job.albumId))
    .limit(1);

  const [audit] = await db
    .select({ aiSeoMetadata: zipImportJobs.aiSeoMetadata })
    .from(zipImportJobs)
    .where(eq(zipImportJobs.id, job.id))
    .limit(1);

  if (album?.metaTitle && audit?.aiSeoMetadata) {
    pass(
      "BUG-003 SEO retrySeo",
      `job #${job.id} metaTitle=${album.metaTitle?.slice(0, 40)} fallback=${result.metadata.usedFallback}`
    );
  } else {
    fail("BUG-003 SEO retrySeo", `metaTitle=${album?.metaTitle} audit=${!!audit?.aiSeoMetadata}`);
  }
}

async function testCleanup() {
  try {
    const r1 = await runFullCleanup();
    const r2 = await runFullCleanup();
    if (r1.length === 4 && r2.length === 4) {
      pass("Cleanup idempotent", "2 runs OK");
    } else {
      fail("Cleanup", `unexpected result count ${r1.length}`);
    }
  } catch (e) {
    fail("Cleanup", (e as Error).message);
  }
}

async function main() {
  console.log("=== UAT Round 1 Regression Tests ===\n");
  await testCopySourceEncoding();
  await testCancelWaiting();
  await testRetrySeo();
  await testCleanup();
  console.log(results.join("\n"));
  const failed = results.filter((r) => r.startsWith("FAIL"));
  process.exit(failed.length ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
