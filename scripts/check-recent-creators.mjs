import dotenv from "dotenv";
import mysql from "mysql2/promise";
dotenv.config({ path: "/var/www/cosplay-gallery/.env" });
const c = await mysql.createConnection(process.env.DATABASE_URL);
const [rows] = await c.query(`
  SELECT a.id, a.title, a.creator, a.originalFileName, cr.name AS creatorPage
  FROM albums a
  LEFT JOIN creators cr ON a.creatorId = cr.id
  WHERE a.aiGenerated = 1
  ORDER BY a.id DESC
  LIMIT 20
`);
console.table(rows);
await c.end();
