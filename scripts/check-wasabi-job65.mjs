import dotenv from "dotenv";
import mysql from "mysql2/promise";
import { HeadObjectCommand, S3Client } from "@aws-sdk/client-s3";

dotenv.config({ path: "/var/www/cosplay-gallery/.env" });

const c = await mysql.createConnection(process.env.DATABASE_URL);
const [rows] = await c.query(
  "SELECT id, sourceArchiveKey FROM zip_import_jobs WHERE id IN (65,66,67,68,69)"
);
await c.end();

const client = new S3Client({
  region: process.env.WASABI_REGION || "ap-southeast-1",
  endpoint: process.env.WASABI_ENDPOINT,
  credentials: {
    accessKeyId: process.env.WASABI_ACCESS_KEY,
    secretAccessKey: process.env.WASABI_SECRET_KEY,
  },
});
const bucket = process.env.WASABI_BUCKET;

for (const row of rows) {
  try {
    const r = await client.send(
      new HeadObjectCommand({ Bucket: bucket, Key: row.sourceArchiveKey })
    );
    console.log(`job ${row.id}: EXISTS size=${r.ContentLength}`);
  } catch (e) {
    console.log(`job ${row.id}: MISSING (${e.name || e.message})`);
  }
}
