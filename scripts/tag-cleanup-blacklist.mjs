/**
 * Remove generic AI junk tags (blacklist): unlink albums then delete tags.
 * Usage: node scripts/tag-cleanup-blacklist.mjs [--dry-run]
 */
import dotenv from "dotenv";
import mysql from "mysql2/promise";

dotenv.config({ path: "/var/www/cosplay-gallery/.env" });
const dryRun = process.argv.includes("--dry-run");

/** Generic tags with low discovery value — agreed cleanup list */
export const GENERIC_TAG_SLUGS = [
  "asian-model",
  "asian-woman",
  "asian-girl",
  "asian-beauty",
  "attractive",
  "beautiful",
  "model",
  "photoshoot",
  "boudoir",
  "boudoir-shoot",
  "lingerie",
  "bedroom",
  "gravure",
  "premium-content",
  "cosplay",
];

const c = await mysql.createConnection(process.env.DATABASE_URL);

const placeholders = GENERIC_TAG_SLUGS.map(() => "?").join(",");
const [found] = await c.query(
  `SELECT t.id, t.slug, t.name,
    (SELECT COUNT(*) FROM album_tags at WHERE at.tagId = t.id) as albumCount
   FROM tags t WHERE t.slug IN (${placeholders})`,
  GENERIC_TAG_SLUGS
);

console.log(`=== BLACKLIST TAG CLEANUP ${dryRun ? "(DRY RUN)" : ""} ===`);
console.log(`Requested slugs: ${GENERIC_TAG_SLUGS.length}`);
console.log(`Found in DB: ${found.length}`);

if (found.length === 0) {
  console.log("Nothing to clean.");
  await c.end();
  process.exit(0);
}

let totalLinks = 0;
found.forEach((r) => {
  console.log(`  ${r.slug}: ${r.albumCount} album links`);
  totalLinks += Number(r.albumCount);
});
console.log(`Total album_tag links to remove: ${totalLinks}`);

const missing = GENERIC_TAG_SLUGS.filter((s) => !found.some((f) => f.slug === s));
if (missing.length) console.log("Not in DB (skip):", missing.join(", "));

if (dryRun) {
  console.log("\nDry run — no changes.");
  await c.end();
  process.exit(0);
}

const ids = found.map((r) => r.id);
const idPh = ids.map(() => "?").join(",");

await c.beginTransaction();
try {
  const [linkResult] = await c.query(`DELETE FROM album_tags WHERE tagId IN (${idPh})`, ids);
  const [tagResult] = await c.query(`DELETE FROM tags WHERE id IN (${idPh})`, ids);
  await c.commit();
  console.log(`\nRemoved ${linkResult.affectedRows} album_tag links.`);
  console.log(`Deleted ${tagResult.affectedRows} tags.`);

  const [remaining] = await c.query("SELECT COUNT(*) as cnt FROM tags");
  const [links] = await c.query("SELECT COUNT(*) as cnt FROM album_tags");
  const [avg] = await c.query(`
    SELECT AVG(tc) as avg FROM (SELECT COUNT(*) as tc FROM album_tags GROUP BY albumId) x
  `);
  console.log(`Remaining tags: ${remaining[0].cnt}`);
  console.log(`Remaining album_tag links: ${links[0].cnt}`);
  console.log(`Avg tags/album: ${Number(avg[0].avg || 0).toFixed(1)}`);
} catch (err) {
  await c.rollback();
  throw err;
}

await c.end();
