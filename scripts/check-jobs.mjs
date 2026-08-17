import { createRequire } from "module";
const require = createRequire("/var/www/cosplay-gallery/package.json");
require("dotenv").config({ path: "/var/www/cosplay-gallery/.env" });
const mysql = require("mysql2/promise");

const url = process.env.DATABASE_URL;
const pool = mysql.createPool(url);
const [rows] = await pool.query(
  "SELECT id, status, pipelineStep, workerId, duplicateInfo IS NOT NULL AS hasDup, updatedAt FROM zip_import_jobs ORDER BY id DESC LIMIT 15"
);
console.log(JSON.stringify(rows, null, 2));
await pool.end();
