import { readdirSync, readFileSync, statSync } from "fs";
import { join } from "path";

const root = "/var/www/cosplay-gallery/client/src/pages/admin";

function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else if (name.endsWith(".tsx")) out.push(p);
  }
  return out;
}

for (const f of walk(root)) {
  const text = readFileSync(f, "utf8");
  const rel = f.replace(root + "/", "");
  const maxW = [...text.matchAll(/max-w-([a-z0-9]+)/g)].map((m) => m[0]);
  const mxAuto = text.includes("mx-auto");
  const p6 = text.includes('className="p-6') || text.includes("className={`p-6");
  const playfair = text.includes("Playfair Display");
  const table = text.includes("<table");
  const grid = text.includes("grid-cols-");
  console.log(
    `${rel}\tmax-w: ${[...new Set(maxW)].join(",") || "none"}\tmx-auto: ${mxAuto}\tp-6: ${p6}\tplayfair: ${playfair}\ttable: ${table}\tgrid: ${grid}`
  );
}
