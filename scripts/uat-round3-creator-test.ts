/** Quick test: creator parse for Espacia filename */
import { parseCreatorFromFilename } from "../server/services/creator-detect";

const cases = [
  "Espacia Korea EHC Vol.043 K.D.L Photoset.zip",
  "Espacia Korea EHC Vol.041 Lee Snow (리 스노우) Photoset.zip",
  "ArtGravia Vol.123 Kim Nari.zip",
];

for (const f of cases) {
  console.log(`${f} => ${parseCreatorFromFilename(f)}`);
}
