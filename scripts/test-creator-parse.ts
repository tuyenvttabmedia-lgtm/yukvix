import { parseCreatorFromFilename } from "../server/services/creator-detect.ts";

const cases = [
  ["Espacia Korea EHC Vol.085 Saika (河北彩花) Photoset.zip", "Saika"],
  ["Espacia Korea EHC Vol.082 Rahee (행위) Photoset.zip", "Rahee"],
  ["Espacia Korea EHC Vol.086 SOMI (소미) Photoset.zip", "SOMI (소미)"],
  ["Espacia Korea EHC Vol.041 Lee Snow (리 스노우) Photoset.zip", "Lee Snow (리 스노우)"],
];

for (const [f, expected] of cases) {
  const got = parseCreatorFromFilename(f);
  const ok = got === expected ? "OK" : "FAIL";
  console.log(`${ok} ${got} (expected ${expected})`);
}
