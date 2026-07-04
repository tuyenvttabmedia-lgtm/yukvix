import "dotenv/config";
import { createPool } from "mysql2/promise";

const pool = createPool({ uri: process.env.DATABASE_URL });
const [cols] = await pool.query("SHOW COLUMNS FROM zip_import_jobs");
const names = cols.map((c) => c.Field).filter((f) =>
  ["workerId", "lockedAt", "heartbeatAt"].includes(f)
);
console.log("columns:", names.join(", "));
const [jobs] = await pool.query(
  "SELECT status, COUNT(*) as c FROM zip_import_jobs GROUP BY status"
);
console.log("job counts:", jobs);
await pool.end();
