/** UAT Round 4 — slug + seoKeywords smoke test */
import { slugifyTitle, buildSeoKeywords, finalizeSeoOutput, type SeoOutput } from "../server/services/seo-generator";

const titles = [
  "Espacia Korea EHC Vol.032 YUNHA (윤하) Photoset",
  "Espacia Korea EHC Vol.043 K.D.L Photoset",
];

console.log("=== slugifyTitle ===");
for (const t of titles) {
  console.log(`${t}\n  => ${slugifyTitle(t)}\n`);
}

const sample: SeoOutput = finalizeSeoOutput({
  albumTitle: "Espacia Korea EHC Vol.043 K.D.L Photoset",
  seoTitle: "K.D.L Espacia Korea Vol.043 - Yukvix",
  metaDescription: "Explore K.D.L photos from Espacia Korea EHC Vol.043 on Yukvix.",
  focusKeyword: "K.D.L",
  relatedKeywords: ["Korean model", "Espacia Korea", "K.D.L photos", "Vol 043", "Korea gallery"],
  tags: ["Korea", "photo", "K.D.L", "premium", "gallery"],
  category: "Korea",
  creator: "K.D.L",
  collectionName: "Espacia Korea EHC",
  slug: "ignored-by-ai",
  shortDescription: "Premium Korean photoshoot.",
  altTextTemplate: "K.D.L Espacia photo #number",
});

console.log("=== seoKeywords ===");
console.log(sample.seoKeywords);
console.log("slug:", sample.slug);

const bad = slugifyTitle("Espacia Korea EHC Vol.032 YUNHA (윤하) Photoset");
if (bad.includes("espaciakoreaehc") || !bad.includes("-")) {
  console.error("FAIL slug missing hyphens:", bad);
  process.exit(1);
}
console.log("\nUAT Round 4 tests: PASS");
