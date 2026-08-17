/** Backfill SEO for UAT job #18 (album 810014) */
import { eq } from "drizzle-orm";
import { getDb } from "../server/db";
import { zipImportJobs, albums } from "../drizzle/schema";
import { enrichAlbumSeoForJob } from "../server/import/seo-import";

const db = await getDb();
if (!db) throw new Error("no db");

const jobId = 18;
const [job] = await db
  .select({ albumId: zipImportJobs.albumId, sourceArchiveOriginalName: zipImportJobs.sourceArchiveOriginalName })
  .from(zipImportJobs)
  .where(eq(zipImportJobs.id, jobId))
  .limit(1);

if (!job?.albumId) throw new Error("job 18 no album");

const result = await enrichAlbumSeoForJob(jobId, job.albumId, {
  originalFileName: job.sourceArchiveOriginalName || "album.zip",
  skipCache: true,
});

const [album] = await db
  .select({ title: albums.title, metaTitle: albums.metaTitle, focusKeyword: albums.focusKeyword, zipKey: albums.zipKey })
  .from(albums)
  .where(eq(albums.id, job.albumId))
  .limit(1);

console.log(JSON.stringify({ result: { usedFallback: result.metadata.usedFallback, focusKeyword: result.seo.focusKeyword }, album }, null, 2));
