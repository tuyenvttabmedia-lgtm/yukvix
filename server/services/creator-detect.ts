/**
 * Creator detection — regex hints → DB match → AI + Google verify → create.
 * AI always validates before creating a new creator (regex alone is not trusted).
 */

import { eq, sql } from "drizzle-orm";
import { getDb } from "../db";
import { creators } from "../../drizzle/schema";
import { callAi } from "./ai-provider";
import {
  buildCreatorSearchQuery,
  formatSearchSnippetsForPrompt,
  searchCreatorOnWeb,
} from "./creator-web-search";
import {
  findOrCreateCreator,
  KNOWN_COLLECTIONS,
  normalizeName,
  type FindOrCreateCreatorResult,
} from "./creator-service";

type CreatorCategory = "Japan" | "China" | "Korea" | "Euro" | "Cosplay" | "Gravure";

const NOISE_SUFFIXES = /\s+(?:Photoset|Photobook|Photo\s*Set|Set|Collection)$/i;

const NOISE_TOKENS = new Set([
  "photoset",
  "photobook",
  "photo",
  "set",
  "collection",
  "vol",
  "volume",
  "no",
  "espacia",
  "korea",
  "ehc",
  "korean",
  "japan",
  "china",
  "cosplay",
  "gravure",
  "album",
  "gallery",
  "photos",
  "zip",
]);

/** Hangul in parentheses that are clearly not person names. */
const BAD_HANGUL_IN_PAREN = new Set([
  "행위",
  "사진",
  "포토",
  "모델",
  "세트",
  "볼륨",
  "갤러리",
  "코리아",
  "한국",
  "포토셋",
  "화보",
]);

export type CreatorDetectSource = "regex" | "db" | "ai" | "none";

export interface ResolvedCreator {
  name: string | null;
  creatorId: number | null;
  source: CreatorDetectSource;
  isNew?: boolean;
}

function stripArchiveExt(filename: string): string {
  return filename.replace(/\.(zip|rar|7z)$/i, "").trim();
}

function isNoiseToken(token: string): boolean {
  const t = token.toLowerCase().replace(/[^a-z0-9.]/g, "");
  if (!t || t.length < 2) return true;
  if (NOISE_TOKENS.has(t)) return true;
  if (/^vol\.?\d+$/i.test(token)) return true;
  if (/^no\.?\d+$/i.test(token)) return true;
  if (KNOWN_COLLECTIONS.has(token)) return true;
  return false;
}

/** Normalize Espacia / Vol segments — strip bad parenthetical scripts. */
function normalizeCreatorSegment(segment: string, isKoreaSeries: boolean): string | null {
  const trimmed = segment.trim();
  if (!trimmed || isNoiseToken(trimmed)) return null;

  const paren = trimmed.match(/^(.+?)\s*\(([^)]+)\)\s*$/);
  if (!paren) return trimmed;

  const stage = paren[1].trim();
  const inner = paren[2].trim();
  if (!stage || isNoiseToken(stage)) return null;

  if (isKoreaSeries) {
    const hasHangul = /[\uac00-\ud7af]/.test(inner);
    const hasHan = /[\u4e00-\u9fff]/.test(inner);

    // e.g. Saika (河北彩花) — Han-only parens on Korea set → stage name only
    if (hasHan && !hasHangul) return stage;

    // e.g. Rahee (행위) — dictionary word, not a name
    if (hasHangul && BAD_HANGUL_IN_PAREN.has(inner)) return stage;

    if (hasHangul && inner.length <= 8) return `${stage} (${inner})`;
    return stage;
  }

  if (inner && !isNoiseToken(inner)) return `${stage} (${inner})`;
  return stage;
}

/** Layer 1 — regex / filename parser (hint only, not final). */
export function parseCreatorFromFilename(filename: string): string | null {
  let base = stripArchiveExt(filename);
  base = base.replace(NOISE_SUFFIXES, "").trim();

  const isKoreaSeries = /Espacia\s+Korea|ArtGravia|DJAWA|PIA|Pure Media|CreamSoda|SWEETBOX/i.test(
    base
  );

  // Espacia Korea EHC Vol.043 K.D.L
  const espacia = base.match(/Espacia\s+Korea\s+EHC\s+Vol\.?\s*\d+\s+(.+)$/i);
  if (espacia?.[1]?.trim()) {
    const name = normalizeCreatorSegment(espacia[1], true);
    if (name) return name;
  }

  // Chinese sets: XIUREN No.11299 白小蝶
  const chineseMatch = base.match(
    /(?:XIUREN|XiuRen|IMISS|UOM|YouMi|FeiLin|MFStar|Ugirls|TouTiao)[\s\-_.]*(?:No\.?|Vol\.?)?[\d]+[\s\-_.]*(.*)/i
  );
  if (chineseMatch?.[1]?.trim()) {
    const name = normalizeCreatorSegment(chineseMatch[1], false);
    if (name) return name;
  }

  // Korean sets: ArtGravia Vol.123 Kim Nari
  const koreanMatch = base.match(
    /(?:ArtGravia|DJAWA|PIA|Pure Media|CreamSoda|SWEETBOX)[\s\-_.]*(?:Vol\.?|No\.?)?[\d]*[\s\-_.]*(.*)/i
  );
  if (koreanMatch?.[1]?.trim()) {
    const name = normalizeCreatorSegment(koreanMatch[1], true);
    if (name) return name;
  }

  // Generic Vol.XXX Creator Name
  const volMatch = base.match(/Vol\.?\s*\d+\s+(.+)$/i);
  if (volMatch?.[1]?.trim()) {
    const name = normalizeCreatorSegment(volMatch[1], isKoreaSeries);
    if (name) return name;
  }

  const parts = base.split(/[\s\-_]+/).filter((p) => p && !isNoiseToken(p));
  if (parts.length > 0) {
    const last = parts[parts.length - 1];
    if (last.length > 1) return last;
  }

  return null;
}

function extractDbCandidates(filename: string): string[] {
  const out: string[] = [];
  const parsed = parseCreatorFromFilename(filename);
  if (parsed) out.push(parsed);

  const base = stripArchiveExt(filename).replace(NOISE_SUFFIXES, "").trim();
  const vol = base.match(/Vol\.?\s*\d+\s+(.+)$/i);
  if (vol?.[1]?.trim()) {
    const normalized = normalizeCreatorSegment(
      vol[1],
      /Espacia\s+Korea|ArtGravia|DJAWA/i.test(base)
    );
    if (normalized) out.push(normalized);
    out.push(vol[1].trim());
  }

  return [...new Set(out.filter((c) => c && !isNoiseToken(c)))];
}

async function findCreatorByExactName(
  name: string
): Promise<{ id: number; name: string } | null> {
  const db = await getDb();
  if (!db) return null;

  const exact = await db
    .select({ id: creators.id, name: creators.name })
    .from(creators)
    .where(eq(creators.name, name))
    .limit(1);
  if (exact[0]) return exact[0];

  const normalized = normalizeName(name);
  const norm = await db
    .select({ id: creators.id, name: creators.name })
    .from(creators)
    .where(eq(creators.normalizedName, normalized))
    .limit(1);
  if (norm[0]) return norm[0];

  const alias = await db
    .select({ id: creators.id, name: creators.name })
    .from(creators)
    .where(sql`JSON_CONTAINS(${creators.aliases}, ${JSON.stringify(name)})`)
    .limit(1);
  if (alias[0]) return alias[0];

  return null;
}

/** Layer 2 — match existing creator by name or alias (no create). */
export async function findCreatorInDb(
  filename: string
): Promise<{ id: number; name: string } | null> {
  for (const candidate of extractDbCandidates(filename)) {
    if (KNOWN_COLLECTIONS.has(candidate)) continue;
    const hit = await findCreatorByExactName(candidate);
    if (hit) return hit;
  }
  return null;
}

interface VerifyCreatorHints {
  regexHint: string | null;
  dbHint: string | null;
  searchSnippets: ReturnType<typeof formatSearchSnippetsForPrompt> extends string
    ? import("./creator-web-search").WebSearchSnippet[]
    : never;
}

/** AI + optional Google snippets — always run before creating creators. */
export async function verifyCreatorWithAi(
  filename: string,
  category: CreatorCategory | undefined,
  hints: {
    regexHint: string | null;
    dbHint: string | null;
    searchSnippets: import("./creator-web-search").WebSearchSnippet[];
  }
): Promise<string | null> {
  const cleaned = stripArchiveExt(filename);
  const searchBlock = formatSearchSnippetsForPrompt(hints.searchSnippets);
  const useWebSearch = hints.searchSnippets.length === 0;

  try {
    const result = await callAi({
      messages: [
        {
          role: "system",
          content: `You verify the REAL model/creator name for importing a photo album ZIP.

Rules:
- Return the professional/stage name used for this specific model in this series (NOT the collection label).
- NEVER use: Espacia, EHC, XIUREN, ArtGravia, DJAWA, Photoset, Vol numbers, or generic Korean words (행위, 사진, 포토).
- For Espacia Korea EHC: prefer "StageName (한글)" when Hangul is verified from search; e.g. "SOMI (소미)", "Lee Snow (리 스노우)".
- If filename has wrong Han characters in parentheses on a Korea set (e.g. Saika (河北彩花)), ignore the parens and use the correct name from web search.
- Cross-check the regex guess against Google results; fix obvious mistakes.
- Prefer search-backed names over raw filename parsing when they conflict.
- If DB hint matches search, use that canonical spelling.

Return JSON only:
{"creator":"Name or null","confidence":"high|medium|low","reason":"brief"}`,
        },
        {
          role: "user",
          content: `Filename: ${cleaned}
Category: ${category ?? "unknown"}
Regex guess: ${hints.regexHint ?? "none"}
Existing DB creator: ${hints.dbHint ?? "none"}

Google search results:
${searchBlock}`,
        },
      ],
      temperature: 0.1,
      maxTokens: 320,
      responseFormat: { type: "json_object" },
      useWebSearch,
    });

    let jsonStr = result.content.trim();
    if (jsonStr.startsWith("```")) {
      jsonStr = jsonStr.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");
    }

    const parsed = JSON.parse(jsonStr) as {
      creator?: string | null;
      confidence?: string;
      reason?: string;
    };

    const name = parsed.creator?.trim();
    const confidence = (parsed.confidence ?? "low").toLowerCase();

    if (!name || name.length < 2 || isNoiseToken(name)) return null;
    if (KNOWN_COLLECTIONS.has(name)) return null;
    if (confidence === "low") {
      console.warn(
        `[CreatorDetect] AI low confidence for ${cleaned}: ${parsed.reason ?? "unknown"}`
      );
      return hints.dbHint ?? hints.regexHint;
    }

    console.log(
      `[CreatorDetect] AI verified (${confidence}): ${cleaned} → ${name} (${parsed.reason ?? ""})`
    );
    return name;
  } catch (err) {
    console.warn(`[CreatorDetect] AI verify failed: ${(err as Error).message}`);
    return null;
  }
}

/** @deprecated Use verifyCreatorWithAi — kept for scripts/tests. */
export async function detectCreatorWithAi(filename: string): Promise<string | null> {
  const regexHint = parseCreatorFromFilename(filename);
  const query = buildCreatorSearchQuery(filename);
  const snippets = await searchCreatorOnWeb(query);
  return verifyCreatorWithAi(filename, undefined, { regexHint, dbHint: null, searchSnippets: snippets });
}

/** Full resolver — AI+Google verify before create. */
export async function resolveCreatorFromFilename(
  filename: string,
  category?: CreatorCategory,
  options?: { createIfMissing?: boolean }
): Promise<ResolvedCreator> {
  const regexName = parseCreatorFromFilename(filename);
  const dbHit = await findCreatorInDb(filename);

  const searchQuery = buildCreatorSearchQuery(filename, category);
  const searchSnippets = await searchCreatorOnWeb(searchQuery, { category, num: 5 });

  const aiName = await verifyCreatorWithAi(filename, category, {
    regexHint: regexName,
    dbHint: dbHit?.name ?? null,
    searchSnippets,
  });

  const finalName = aiName ?? dbHit?.name ?? regexName;

  if (!finalName || KNOWN_COLLECTIONS.has(finalName)) {
    return { name: null, creatorId: null, source: "none" };
  }

  const existing = await findCreatorByExactName(finalName);
  if (existing) {
    return {
      name: existing.name,
      creatorId: existing.id,
      source: aiName ? "ai" : dbHit ? "db" : "regex",
    };
  }

  if (dbHit && normalizeName(dbHit.name) === normalizeName(finalName)) {
    return { name: dbHit.name, creatorId: dbHit.id, source: aiName ? "ai" : "db" };
  }

  if (options?.createIfMissing === false) {
    const { findExistingCreator } = await import("./creator-service");
    const catalogHit = await findExistingCreator(finalName);
    if (catalogHit) {
      return { name: catalogHit.creator.name, creatorId: catalogHit.creatorId, source: "db" };
    }
    return { name: null, creatorId: null, source: "none" };
  }

  try {
    const linked: FindOrCreateCreatorResult = await findOrCreateCreator({
      name: finalName,
      category,
    });
    return {
      name: finalName,
      creatorId: linked.creatorId,
      source: aiName ? "ai" : regexName ? "regex" : "none",
      isNew: linked.isNew,
    };
  } catch {
    return {
      name: finalName,
      creatorId: null,
      source: aiName ? "ai" : "none",
    };
  }
}
