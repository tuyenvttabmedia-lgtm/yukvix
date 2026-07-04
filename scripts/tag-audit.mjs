import dotenv from "dotenv";
import mysql from "mysql2/promise";
dotenv.config({ path: "/var/www/cosplay-gallery/.env" });
const c = await mysql.createConnection(process.env.DATABASE_URL);

const [totals] = await c.query("SELECT COUNT(*) as total FROM tags");
const [orphan] = await c.query(`
  SELECT COUNT(*) as cnt FROM tags t
  LEFT JOIN album_tags at ON at.tagId = t.id
  WHERE at.albumId IS NULL
`);
const [withAlbums] = await c.query(`
  SELECT COUNT(DISTINCT t.id) as cnt FROM tags t
  INNER JOIN album_tags at ON at.tagId = t.id
`);
const [albumTagLinks] = await c.query("SELECT COUNT(*) as cnt FROM album_tags");
const [avgTagsPerAlbum] = await c.query(`
  SELECT AVG(tc) as avg FROM (
    SELECT COUNT(*) as tc FROM album_tags GROUP BY albumId
  ) x
`);

console.log("=== TAG AUDIT ===");
console.log("Total tags:", totals[0].total);
console.log("Tags WITH at least 1 album:", withAlbums[0].cnt);
console.log("Tags with ZERO albums (orphan):", orphan[0].cnt);
console.log("Total album-tag links:", albumTagLinks[0].cnt);
console.log("Avg tags per album:", Number(avgTagsPerAlbum[0].avg || 0).toFixed(1));

const [orphanSample] = await c.query(`
  SELECT t.id, t.name, t.slug, t.createdAt FROM tags t
  LEFT JOIN album_tags at ON at.tagId = t.id
  WHERE at.albumId IS NULL
  ORDER BY t.createdAt DESC LIMIT 40
`);
console.log("\n=== ORPHAN TAGS (sample 40, newest) ===");
orphanSample.forEach((r) => console.log(r.id, r.slug, r.createdAt));

const [topTags] = await c.query(`
  SELECT t.name, t.slug, COUNT(at.albumId) as albums
  FROM tags t INNER JOIN album_tags at ON at.tagId = t.id
  GROUP BY t.id ORDER BY albums DESC LIMIT 15
`);
console.log("\n=== TOP TAGS BY ALBUM COUNT ===");
topTags.forEach((r) => console.log(r.albums, r.slug));

const [recentTags] = await c.query(`
  SELECT DATE(t.createdAt) as d, COUNT(*) as cnt FROM tags t GROUP BY DATE(t.createdAt) ORDER BY d DESC LIMIT 14
`);
console.log("\n=== TAGS CREATED BY DATE ===");
recentTags.forEach((r) => console.log(r.d, r.cnt));

const [junkPatterns] = await c.query(`
  SELECT t.slug, COUNT(at.albumId) as albums FROM tags t
  LEFT JOIN album_tags at ON at.tagId = t.id
  WHERE at.albumId IS NULL AND (
    LENGTH(t.slug) <= 2 OR t.slug REGEXP '^[0-9]+$' OR t.slug LIKE '%cosplay%' OR t.slug LIKE '%photo%'
  )
  GROUP BY t.id LIMIT 20
`);
console.log("\n=== ORPHAN JUNK PATTERN SAMPLE ===");
junkPatterns.forEach((r) => console.log(r.slug));

const [recent] = await c.query(`
  SELECT t.id, t.slug, t.createdAt,
    (SELECT COUNT(*) FROM album_tags at WHERE at.tagId = t.id) as albums
  FROM tags t WHERE t.createdAt >= '2026-07-03' ORDER BY t.createdAt DESC
`);
console.log("\n=== TAGS CREATED SINCE JUL 3 ===");
recent.forEach((r) => console.log(r.id, r.slug, "albums:", r.albums, r.createdAt));

const [generic] = await c.query(`
  SELECT t.slug, COUNT(at.albumId) as cnt FROM tags t
  JOIN album_tags at ON at.tagId = t.id
  WHERE t.slug IN ('attractive','beautiful','asian-woman','asian-girl','asian-model','asian-beauty','model','photoshoot','boudoir','lingerie','premium-content','cosplay','gravure','bedroom','boudoir-shoot')
  GROUP BY t.id ORDER BY cnt DESC
`);
console.log("\n=== GENERIC AI TAGS (linked but low value) ===");
generic.forEach((r) => console.log(r.cnt, r.slug));

await c.end();
