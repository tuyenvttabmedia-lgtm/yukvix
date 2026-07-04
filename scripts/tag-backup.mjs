import dotenv from "dotenv";
import mysql from "mysql2/promise";
import fs from "fs";

dotenv.config({ path: "/var/www/cosplay-gallery/.env" });
const c = await mysql.createConnection(process.env.DATABASE_URL);

const [tags] = await c.query("SELECT * FROM tags");
const [links] = await c.query("SELECT * FROM album_tags");

const backup = {
  exportedAt: new Date().toISOString(),
  tags,
  album_tags: links,
};

const path = `/var/www/cosplay-gallery/backups/tags-backup-${Date.now()}.json`;
fs.mkdirSync("/var/www/cosplay-gallery/backups", { recursive: true });
fs.writeFileSync(path, JSON.stringify(backup, null, 2));
console.log("Backup written:", path);
console.log("Tags:", tags.length, "Links:", links.length);
await c.end();
