import { writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const out = join(root, "client/public/og-default.jpg");

const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg width="1200" height="630" viewBox="0 0 1200 630" xmlns="http://www.w3.org/2000/svg">
  <rect width="1200" height="630" fill="#0a0a0f"/>
  <rect x="0" y="0" width="8" height="630" fill="#f97316"/>
  <text x="80" y="280" font-family="Georgia, 'Times New Roman', serif" font-size="96" font-weight="700" fill="#ffffff">Yukvix</text>
  <text x="80" y="360" font-family="Arial, Helvetica, sans-serif" font-size="32" fill="#a3a3a3">Premium Cosplay Gallery</text>
  <text x="80" y="520" font-family="Arial, Helvetica, sans-serif" font-size="22" fill="#737373">yukvix.com</text>
</svg>`;

const jpg = await sharp(Buffer.from(svg)).jpeg({ quality: 88, mozjpeg: true }).toBuffer();
await writeFile(out, jpg);
console.log(`wrote ${out} (${jpg.length} bytes)`);
