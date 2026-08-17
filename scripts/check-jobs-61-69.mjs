import dotenv from "dotenv";
import mysql from "mysql2/promise";
dotenv.config({ path: "/var/www/cosplay-gallery/.env" });
const c = await mysql.createConnection(process.env.DATABASE_URL);
const [rows] = await c.query(
  "SELECT id, status, sourceArchiveOriginalName, sourceArchiveKey, albumId FROM zip_import_jobs WHERE id >= 61 ORDER BY id"
);
console.table(rows);
const [uploadedOnly] = await c.query(
  "SELECT COUNT(*) as cnt FROM zip_import_jobs WHERE status = 'uploaded'"
);
console.log("Total uploaded (stuck):", uploadedOnly[0].cnt);
await c.end();
