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

/** SEO / filename fluff after the real model name, e.g. "Korean Model Gallery". */
const TRAILING_GALLERY_SUFFIX =
  /\s+(?:(?:korean|japanese|chinese|european|japan|korea|china|euro)\s+)?(?:model\s+)?(?:photo\s+)?(?:gallery|photoset|photobook|collection|album)\s*$/i;

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
  "coser",
  "my",
]);

const REST_NOISE_WORDS = new Set([
  ...NOISE_TOKENS,
  "model",
  "japanese",
  "chinese",
  "european",
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

const CJK_OR_KANA_OR_HANGUL = /[\u4e00-\u9fff\u3040-\u30ff\uac00-\ud7af]/;

function isNoiseToken(token: string): boolean {
  const trimmed = token.trim();
  if (!trimmed) return true;
  if (BAD_HANGUL_IN_PAREN.has(trimmed)) return true;
  if (CJK_OR_KANA_OR_HANGUL.test(trimmed)) return false;
  const t = trimmed.toLowerCase().replace(/[^a-z0-9.]/g, "");
  if (!t || t.length < 2) return true;
  if (NOISE_TOKENS.has(t)) return true;
  if (/^vol\.?\d+$/i.test(token)) return true;
  if (/^no\.?\d+$/i.test(token)) return true;
  if (KNOWN_COLLECTIONS.has(token)) return true;
  return false;
}

function stripCreatorNoise(segment: string): string {
  let s = segment.trim();
  for (let i = 0; i < 4; i++) {
    const next = s.replace(TRAILING_GALLERY_SUFFIX, "").replace(NOISE_SUFFIXES, "").trim();
    if (next === s) break;
    s = next;
  }
  return s;
}

function restIsNoise(rest: string): boolean {
  const tokens = rest.split(/[\s\-_]+/).filter(Boolean);
  if (tokens.length === 0) return true;
  return tokens.every((token) => {
    const t = token.toLowerCase().replace(/[^a-z0-9.]/g, "");
    return !t || REST_NOISE_WORDS.has(t) || isNoiseToken(token);
  });
}

/** True when a hint looks like a person, not leftover album-title text. */
export function looksLikeCreatorName(name: string | null | undefined): boolean {
  const n = name?.trim() ?? "";
  if (n.length < 2 || n.length > 48) return false;
  if (KNOWN_COLLECTIONS.has(n) || /^coser$/i.test(n)) return false;
  if (/\b(gallery|photoset|photobook|collection)\b/i.test(n)) return false;
  if (/\bvol\.?\s*\d+\b/i.test(n)) return false;
  if (isNoiseToken(n)) return false;
  return true;
}

/**
 * High-confidence person name: CJK/Hangul/Kana, "Dami (퀸다미)", or 2+ Latin words.
 * Single English tokens like "rose" are album titles, not cosplayers.
 */
export function isConfidentCreatorName(name: string | null | undefined): boolean {
  if (!looksLikeCreatorName(name)) return false;
  const n = name!.trim();
  if (CJK_OR_KANA_OR_HANGUL.test(n)) return true;
  if (/\([^)]*[\uac00-\ud7af]+[^)]*\)/.test(n)) return true;
  const latinWords = n.split(/\s+/).filter((w) => /[a-z]/i.test(w) && !isNoiseToken(w));
  return latinWords.length >= 2;
}

export function creatorNamesOverlap(a: string, b: string): boolean {
  const left = a.trim();
  const right = b.trim();
  if (!left || !right) return false;
  if (normalizeName(left) === normalizeName(right)) return true;
  const hangulA = left.match(/\(([^)]+)\)/)?.[1]?.trim();
  const hangulB = right.match(/\(([^)]+)\)/)?.[1]?.trim();
  if (hangulA && hangulB && hangulA === hangulB) return true;
  const stageA = left.replace(/\s*\([^)]+\)\s*/g, "").trim();
  const stageB = right.replace(/\s*\([^)]+\)\s*/g, "").trim();
  return stageA.length >= 2 && stageA.toLowerCase() === stageB.toLowerCase();
}

function splitNameCandidates(name: string): string[] {
  const out = [name];
  const paren = name.match(/^(.+?)\s*\(([^)]+)\)\s*$/);
  if (paren) {
    const stage = paren[1].trim();
    const inner = paren[2].trim();
    if (stage) out.push(stage);
    if (inner) out.push(inner);
  }
  return out;
}

/** Normalize Espacia / Vol segments — strip bad parenthetical scripts. */
function normalizeCreatorSegment(segment: string, isKoreaSeries: boolean): string | null {
  const trimmed = stripCreatorNoise(segment);
  if (!trimmed || isNoiseToken(trimmed)) return null;

  const paren = trimmed.match(/^(.+?)\s*\(([^)]+)\)(?:\s+(.+))?$/);
  if (!paren) return trimmed;

  const stage = paren[1].trim();
  const inner = paren[2].trim();
  const rest = paren[3]?.trim() ?? "";
  if (!stage || isNoiseToken(stage)) return null;
  if (rest && !restIsNoise(stripCreatorNoise(rest))) return trimmed;

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

/**
 * Coser 阿包也是兔娘 - My rose 玫瑰  → 阿包也是兔娘
 * Coser 村上西瓜-问琴武士的重启人生     → 村上西瓜
 */
function parseCoserPrefixName(base: string): string | null {
  const match = base.match(/^(?:Coser|COS(?:PLAY)?)\s+(.+?)\s*[-–—]\s*.+/i);
  if (!match?.[1]) return null;
  let name = stripCreatorNoise(match[1]);
  name = name.replace(/\s+Vol\.?\s*\d+\s*$/i, "").trim();
  if (!name || /^coser$/i.test(name) || KNOWN_COLLECTIONS.has(name)) return null;
  if (name.length < 2 || name.length > 40) return null;
  if (CJK_OR_KANA_OR_HANGUL.test(name)) return name;
  if (isConfidentCreatorName(name)) return name;
  return null;
}

/** Layer 1 — regex / filename parser (hint only, not final). */
export function parseCreatorFromFilename(filename: string): string | null {
  let base = stripArchiveExt(filename);
  base = base.replace(NOISE_SUFFIXES, "").trim();

  const coserName = parseCoserPrefixName(base);
  if (coserName) return coserName;

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
    if (name && looksLikeCreatorName(name)) return name;
  }

  // Do not guess the last leftover token ("rose", "Coser") — leave unassigned.
  return null;
}

function extractDbCandidates(filename: string): string[] {
  const out: string[] = [];
  const parsed = parseCreatorFromFilename(filename);
  if (parsed) out.push(...splitNameCandidates(parsed));

  const base = stripArchiveExt(filename).replace(NOISE_SUFFIXES, "").trim();
  const vol = base.match(/Vol\.?\s*\d+\s+(.+)$/i);
  if (vol?.[1]?.trim()) {
    const normalized = normalizeCreatorSegment(
      vol[1],
      /Espacia\s+Korea|ArtGravia|DJAWA/i.test(base)
    );
    if (normalized) out.push(...splitNameCandidates(normalized));
  }

  return [...new Set(out.filter((c) => c && looksLikeCreatorName(c)))];
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

async function linkOrCreateByName(
  name: string,
  category: CreatorCategory | undefined,
  source: CreatorDetectSource,
  createIfMissing: boolean | undefined
): Promise<ResolvedCreator> {
  const existing = await findCreatorByExactName(name);
  if (existing) {
    return { name: existing.name, creatorId: existing.id, source };
  }

  if (createIfMissing !== true) {
    const { findExistingCreator } = await import("./creator-service");
    const catalogHit = await findExistingCreator(name);
    if (catalogHit) {
      return { name: catalogHit.creator.name, creatorId: catalogHit.creatorId, source: "db" };
    }
    return {
      name: looksLikeCreatorName(name) ? name : null,
      creatorId: null,
      source: looksLikeCreatorName(name) ? source : "none",
    };
  }

  try {
    const linked: FindOrCreateCreatorResult = await findOrCreateCreator({
      name,
      category,
    });
    return {
      name: linked.creator.name,
      creatorId: linked.creatorId,
      source,
      isNew: linked.isNew,
    };
  } catch {
    return {
      name: looksLikeCreatorName(name) ? name : null,
      creatorId: null,
      source,
    };
  }
}

/** Full resolver — AI+Google verify before create. */
export async function resolveCreatorFromFilename(
  filename: string,
  category?: CreatorCategory,
  options?: { createIfMissing?: boolean; skipAi?: boolean }
): Promise<ResolvedCreator> {
  const regexName = parseCreatorFromFilename(filename);
  const dbHit = await findCreatorInDb(filename);

  if (options?.skipAi) {
    if (dbHit) {
      return { name: dbHit.name, creatorId: dbHit.id, source: "db" };
    }
    if (!regexName || !looksLikeCreatorName(regexName)) {
      return { name: null, creatorId: null, source: "none" };
    }
    return linkOrCreateByName(regexName, category, "regex", options.createIfMissing);
  }

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

  if (dbHit && (normalizeName(dbHit.name) === normalizeName(finalName) || creatorNamesOverlap(dbHit.name, finalName))) {
    return { name: dbHit.name, creatorId: dbHit.id, source: aiName ? "ai" : "db" };
  }

  if (!looksLikeCreatorName(finalName) && dbHit) {
    return { name: dbHit.name, creatorId: dbHit.id, source: "db" };
  }

  if (!looksLikeCreatorName(finalName)) {
    return { name: null, creatorId: null, source: "none" };
  }

  return linkOrCreateByName(
    finalName,
    category,
    aiName ? "ai" : regexName ? "regex" : "none",
    options?.createIfMissing
  );
}
