import { createRequire } from "module";
const require = createRequire("/var/www/cosplay-gallery/package.json");
require("dotenv").config({ path: "/var/www/cosplay-gallery/.env" });
const mysql = require("mysql2/promise");
const pool = mysql.createPool(process.env.DATABASE_URL);

const [cols] = await pool.query("SHOW COLUMNS FROM albums");
const seoCols = cols.map((c) => c.Field).filter((f) =>
  /seo|meta|og|robots|index|slug|alt|canonical/i.test(f)
);
console.log("album SEO columns:", seoCols.join(", "));

const [albums] = await pool.query(`
  SELECT COUNT(*) total,
    SUM(seoTitle IS NOT NULL AND seoTitle != '') hasSeoTitle,
    SUM(metaDescription IS NOT NULL AND metaDescription != '') hasMetaDesc,
    SUM(seoDescription IS NOT NULL AND seoDescription != '') hasSeoDesc,
    SUM(og_image IS NOT NULL AND og_image != '') hasOg,
    SUM(altTextTemplate IS NOT NULL AND altTextTemplate != '') hasAltTemplate,
    SUM(canonical_url IS NOT NULL AND canonical_url != '') hasCanonical,
    SUM(robots_index = 0) robotsNoIndex
  FROM albums WHERE status = 'published'
`);
console.log("published albums:", albums[0]);

const [creators] = await pool.query(`
  SELECT COUNT(*) total,
    SUM(seoTitle IS NOT NULL AND seoTitle != '') hasSeoTitle,
    SUM(seoDescription IS NOT NULL AND seoDescription != '') hasSeoDesc
  FROM creators`);
console.log("creators:", creators[0]);

const [tags] = await pool.query(`
  SELECT COUNT(*) total,
    SUM(seoTitle IS NOT NULL AND seoTitle != '') hasSeoTitle,
    SUM(seoDescription IS NOT NULL AND seoDescription != '') hasSeoDesc
  FROM tags`);
console.log("tags:", tags[0]);

const [photos] = await pool.query(`
  SELECT COUNT(*) total,
    SUM(altText IS NOT NULL AND altText != '') hasAlt
  FROM photos`);
console.log("photos altText:", photos[0]);

await pool.end();
