import { createRequire } from "module";
const require = createRequire("/var/www/cosplay-gallery/package.json");
require("dotenv").config({ path: "/var/www/cosplay-gallery/.env" });
const mysql = require("mysql2/promise");

const jobId = parseInt(process.argv[2] || "23", 10);
const pool = mysql.createPool(process.env.DATABASE_URL);
const [rows] = await pool.query(
  "SELECT id, status, albumId, pipelineStep, workerId, duplicateInfo, importLogs, updatedAt FROM zip_import_jobs WHERE id = ?",
  [jobId]
);
const job = rows[0];
if (job?.importLogs) {
  try {
    const logs = JSON.parse(job.importLogs);
    job.importLogs = logs.slice(-15);
  } catch {}
}
console.log(JSON.stringify(job, null, 2));
await pool.end();
