import dotenv from "dotenv";
import mysql from "mysql2/promise";
dotenv.config({ path: "/var/www/cosplay-gallery/.env" });
const c = await mysql.createConnection(process.env.DATABASE_URL);
const [rows] = await c.query(
  "SELECT status, COUNT(*) as cnt FROM zip_import_jobs WHERE status IN ('uploaded','waiting','scheduled','processing','waiting_disk_space') GROUP BY status"
);
console.log("Active by status:", rows);
const [total] = await c.query(
  "SELECT COUNT(*) as cnt FROM zip_import_jobs WHERE status IN ('uploaded','waiting','scheduled','processing','waiting_disk_space')"
);
console.log("Total active:", total[0].cnt);
console.log("IMPORT_MAX_PENDING_JOBS env:", process.env.IMPORT_MAX_PENDING_JOBS || "(not set, batch default=20, single default=5)");
await c.end();
