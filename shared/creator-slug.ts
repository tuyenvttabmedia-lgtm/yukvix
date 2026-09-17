/**
 * Latin slug for Cosplayer names in Chinese, Korean, and Japanese.
 * Album slugify strips CJK and falls back to "album"; creator slugs must romanize instead.
 *
 * 阿包也是兔娘 → a-bao-ye-shi-tu-niang
 * 퀸다미 → kwin-da-mi
 * さくら → sakura
 */
import { pinyin } from "pinyin-pro";

const HAN = /[\u3400-\u4DBF\u4E00-\u9FFF\uF900-\uFAFF]/;
const HANGUL = /[\u1100-\u11FF\u3130-\u318F\uAC00-\uD7A3]/;
const KANA = /[\u3040-\u309F\u30A0-\u30FF]/;
const LATIN = /[A-Za-z0-9]/;
const CJK_ANY = /[\u1100-\u11FF\u3040-\u30FF\u3130-\u318F\u3400-\u4DBF\u4E00-\u9FFF\uAC00-\uD7A3\uF900-\uFAFF]/;

const HANGUL_CHO = [
  "g", "kk", "n", "d", "tt", "r", "m", "b", "pp", "s", "ss", "", "j", "jj", "ch", "k", "t", "p", "h",
];
const HANGUL_JUNG = [
  "a", "ae", "ya", "yae", "eo", "e", "yeo", "ye", "o", "wa", "wae", "oe", "yo",
  "u", "wo", "we", "wi", "yu", "eu", "ui", "i",
];
const HANGUL_JONG = [
  "", "k", "k", "ks", "n", "nj", "nh", "t", "l", "lg", "lm", "lb", "ls", "lt", "lp", "lh",
  "m", "p", "ps", "t", "t", "ng", "t", "t", "k", "t", "p", "h",
];

const KANA_DIGRAPH: Record<string, string> = {
  きゃ: "kya", きゅ: "kyu", きょ: "kyo",
  しゃ: "sha", しゅ: "shu", しょ: "sho",
  ちゃ: "cha", ちゅ: "chu", ちょ: "cho",
  にゃ: "nya", にゅ: "nyu", にょ: "nyo",
  ひゃ: "hya", ひゅ: "hyu", ひょ: "hyo",
  みゃ: "mya", みゅ: "myu", みょ: "myo",
  りゃ: "rya", りゅ: "ryu", りょ: "ryo",
  ぎゃ: "gya", ぎゅ: "gyu", ぎょ: "gyo",
  じゃ: "ja", じゅ: "ju", じょ: "jo",
  びゃ: "bya", びゅ: "byu", びょ: "byo",
  ぴゃ: "pya", ぴゅ: "pyu", ぴょ: "pyo",
  ゔぁ: "va", ゔぃ: "vi", ゔぇ: "ve", ゔぉ: "vo",
};

const KANA_MONO: Record<string, string> = {
  あ: "a", い: "i", う: "u", え: "e", お: "o",
  か: "ka", き: "ki", く: "ku", け: "ke", こ: "ko",
  さ: "sa", し: "shi", す: "su", せ: "se", そ: "so",
  た: "ta", ち: "chi", つ: "tsu", て: "te", と: "to",
  な: "na", に: "ni", ぬ: "nu", ね: "ne", の: "no",
  は: "ha", ひ: "hi", ふ: "fu", へ: "he", ほ: "ho",
  ま: "ma", み: "mi", む: "mu", め: "me", も: "mo",
  や: "ya", ゆ: "yu", よ: "yo",
  ら: "ra", り: "ri", る: "ru", れ: "re", ろ: "ro",
  わ: "wa", ゐ: "wi", ゑ: "we", を: "wo", ん: "n",
  が: "ga", ぎ: "gi", ぐ: "gu", げ: "ge", ご: "go",
  ざ: "za", じ: "ji", ず: "zu", ぜ: "ze", ぞ: "zo",
  だ: "da", ぢ: "ji", づ: "zu", で: "de", ど: "do",
  ば: "ba", び: "bi", ぶ: "bu", べ: "be", ぼ: "bo",
  ぱ: "pa", ぴ: "pi", ぷ: "pu", ぺ: "pe", ぽ: "po",
  ぁ: "a", ぃ: "i", ぅ: "u", ぇ: "e", ぉ: "o",
  ゃ: "ya", ゅ: "yu", ょ: "yo", ゎ: "wa",
  ゔ: "vu",
};

function katakanaToHiragana(ch: string): string {
  const code = ch.charCodeAt(0);
  if (code >= 0x30a1 && code <= 0x30f6) return String.fromCharCode(code - 0x60);
  return ch;
}

function romanizeHangulSyllable(ch: string): string {
  const code = ch.charCodeAt(0);
  if (code < 0xac00 || code > 0xd7a3) return "";
  const syllable = code - 0xac00;
  const cho = Math.floor(syllable / 588);
  const jung = Math.floor((syllable % 588) / 28);
  const jong = syllable % 28;
  return `${HANGUL_CHO[cho] ?? ""}${HANGUL_JUNG[jung] ?? ""}${HANGUL_JONG[jong] ?? ""}`;
}

function romanizeKanaRun(run: string): string {
  const hira = [...run].map((ch) => (ch === "ー" ? "ー" : katakanaToHiragana(ch))).join("");
  const out: string[] = [];
  for (let i = 0; i < hira.length; i++) {
    const ch = hira[i];
    if (ch === "ー") {
      const prev = out[out.length - 1];
      if (prev) {
        const vowel = prev.match(/[aeiou]$/i)?.[0];
        if (vowel) out[out.length - 1] = prev + vowel;
      }
      continue;
    }
    if (ch === "っ" || ch === "ッ") {
      const next = hira[i + 1];
      const pair = next ? KANA_DIGRAPH[katakanaToHiragana(next) + (hira[i + 2] ?? "")] || KANA_MONO[katakanaToHiragana(next)] : "";
      const cons = pair?.match(/^[bcdfghjklmnpqrstvwxyz]/i)?.[0];
      if (cons) out.push(cons);
      continue;
    }
    const two = hira.slice(i, i + 2);
    if (KANA_DIGRAPH[two]) {
      out.push(KANA_DIGRAPH[two]);
      i++;
      continue;
    }
    const mono = KANA_MONO[ch];
    if (mono) out.push(mono);
  }
  return out.join("");
}

function romanizeHanRun(run: string): string[] {
  const syllables = pinyin(run, { toneType: "none", type: "array", v: true }) as string[];
  return syllables
    .map((s) => s.toLowerCase().replace(/ü/g, "v").replace(/[^a-z]/g, ""))
    .filter(Boolean);
}

function takeRun(name: string, start: number, test: (ch: string) => boolean): number {
  let i = start;
  while (i < name.length && test(name[i])) i++;
  return i;
}

/** True when the name contains Chinese, Korean, or Japanese characters. */
export function nameHasCjk(name: string): boolean {
  return CJK_ANY.test(name);
}

/** Placeholder slugs produced when CJK was stripped (album-1, creator-2). */
export function isPlaceholderCreatorSlug(slug: string): boolean {
  return /^(album|creator)(?:-\d+)?$/i.test(slug.trim()) || !/[a-z]/i.test(slug);
}

export function isUsableLatinSlug(slug: string): boolean {
  return /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/.test(slug.trim()) && !isPlaceholderCreatorSlug(slug);
}

/**
 * Romanize a Cosplayer name into a URL slug.
 * Chinese: hyphenated pinyin. Korean: Revised Romanization per syllable.
 * Japanese kana: Hepburn run. Existing Latin letters are kept.
 */
export function slugifyCreatorName(name: string, maxLen = 80): string {
  const parts: string[] = [];
  let i = 0;
  while (i < name.length) {
    const ch = name[i];
    if (HAN.test(ch)) {
      const end = takeRun(name, i, (c) => HAN.test(c));
      parts.push(...romanizeHanRun(name.slice(i, end)));
      i = end;
      continue;
    }
    if (HANGUL.test(ch)) {
      const end = takeRun(name, i, (c) => HANGUL.test(c));
      for (const syl of name.slice(i, end)) {
        const roman = romanizeHangulSyllable(syl);
        if (roman) parts.push(roman);
      }
      i = end;
      continue;
    }
    if (KANA.test(ch)) {
      const end = takeRun(name, i, (c) => KANA.test(c) || c === "ー");
      const roman = romanizeKanaRun(name.slice(i, end));
      if (roman) parts.push(roman);
      i = end;
      continue;
    }
    if (LATIN.test(ch)) {
      const end = takeRun(name, i, (c) => LATIN.test(c));
      parts.push(name.slice(i, end).toLowerCase());
      i = end;
      continue;
    }
    i++;
  }

  const slug = parts
    .join("-")
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, maxLen)
    .replace(/-+$/g, "");

  return slug || "creator";
}
