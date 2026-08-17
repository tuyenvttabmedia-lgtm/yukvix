/** Quick UAT Round 5 checks — run on VPS via pnpm exec tsx */
import { buildSeoKeywords } from "../server/services/seo-generator";

const samples = [
  {
    label: "Espacia K.D.L",
    seo: {
      albumTitle: "Espacia Korea EHC Vol.043 K.D.L",
      creator: "K.D.L",
      collectionName: "Espacia Korea EHC",
      category: "Korea",
      focusKeyword: "K.D.L photos",
      relatedKeywords: ["Korean model", "Espacia Korea", "K.D.L cosplay"],
    },
  },
  {
    label: "Pure Media Yuki",
    seo: {
      albumTitle: "Pure Media Vol.012 Yuki",
      creator: "Yuki",
      collectionName: "Pure Media",
      category: "Cosplay",
      focusKeyword: "Yuki cosplay",
      relatedKeywords: ["Pure Media", "Japanese cosplayer", "Yuki"],
    },
  },
];

for (const { label, seo } of samples) {
  const kw = buildSeoKeywords(seo);
  const arr = kw.split(", ").map((k) => k.trim());
  console.log(`\n${label}: ${arr.length} keywords`);
  console.log(kw);
}
