import dotenv from "dotenv";
import mysql from "mysql2/promise";

dotenv.config({ path: "/var/www/cosplay-gallery/.env" });

// Dynamic import after dotenv
const { auditTagSeoGaps, listTagsMissingSeo } = await import(
  "/var/www/cosplay-gallery/server/services/tag-seo-bulk.ts"
);

const audit = await auditTagSeoGaps();
console.log("audit:", JSON.stringify(audit));
const missing = await listTagsMissingSeo(3);
console.log("sample missing:", missing);
