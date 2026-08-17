import { createRequire } from "module";
const require = createRequire("/var/www/cosplay-gallery/package.json");
require("dotenv").config({ path: "/var/www/cosplay-gallery/.env" });
const mysql = require("mysql2/promise");

const pool = mysql.createPool(process.env.DATABASE_URL);
const [rows] = await pool.query(
  "SELECT id, status, albumId, duplicateInfo, checkpoint FROM zip_import_jobs WHERE status IN ('failed','skipped','waiting') ORDER BY id DESC"
);
for (const r of rows) {
  let cp = null;
  try { cp = JSON.parse(r.checkpoint || "{}"); } catch {}
  console.log({
    id: r.id,
    status: r.status,
    albumId: r.albumId,
    hasDup: !!r.duplicateInfo,
    completedSteps: cp?.completedSteps,
    failedStep: cp?.failedStep,
  });
}
await pool.end();
