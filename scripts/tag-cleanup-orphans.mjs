/**
 * Delete orphan tags (zero albums linked). Safe cleanup.
 * Usage: node scripts/tag-cleanup-orphans.mjs [--dry-run]
 */
import dotenv from "dotenv";
import mysql from "mysql2/promise";

dotenv.config({ path: "/var/www/cosplay-gallery/.env" });
const dryRun = process.argv.includes("--dry-run");

const c = await mysql.createConnection(process.env.DATABASE_URL);

const [orphans] = await c.query(`
  SELECT t.id, t.name, t.slug FROM tags t
  LEFT JOIN album_tags at ON at.tagId = t.id
  WHERE at.albumId IS NULL
  ORDER BY t.id
`);

console.log(`Found ${orphans.length} orphan tags (no album links)`);
if (orphans.length === 0) {
  await c.end();
  process.exit(0);
}

orphans.forEach((r) => console.log(" ", r.id, r.slug));

if (dryRun) {
  console.log("\nDry run — no deletions.");
  await c.end();
  process.exit(0);
}

const ids = orphans.map((r) => r.id);
const placeholders = ids.map(() => "?").join(",");
const [result] = await c.query(`DELETE FROM tags WHERE id IN (${placeholders})`, ids);
console.log(`\nDeleted ${result.affectedRows} orphan tags.`);

const [remaining] = await c.query("SELECT COUNT(*) as cnt FROM tags");
console.log("Remaining tags:", remaining[0].cnt);

await c.end();
