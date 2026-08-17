#!/usr/bin/env python3
"""UAT Round 4 — BUG-005 slugify + BUG-006 seoKeywords."""
import re
from pathlib import Path

ROOT = Path("/var/www/cosplay-gallery")
SEO = ROOT / "server/services/seo-generator.ts"
SI = ROOT / "server/import/seo-import.ts"

# ── seo-generator.ts ─────────────────────────────────────────────────────────
st = SEO.read_text().replace("\r\n", "\n")

if "slugifyTitle" not in st:
    slug_block = '''
// ─── Slug + SEO Keywords (UAT Round 4) ───────────────────────────────────────

/** Standard slugify from final album title — not AI-generated. */
export function slugifyTitle(title: string, maxLen = 80): string {
  let s = title.trim();
  s = s.replace(/\\([^)]*\\)/g, " ");
  s = s.replace(/\\.(zip|rar|7z)$/i, "");
  s = s.toLowerCase();
  s = s.replace(/\\bvol\\.?\\s*(\\d+)/gi, " vol $1 ");
  s = s.replace(/\\bno\\.?\\s*(\\d+)/gi, " no $1 ");
  s = s.replace(/[\\u0080-\\uFFFF]/g, " ");
  s = s.replace(/([a-z0-9])\\.([a-z0-9])/gi, "$1 $2");
  s = s.replace(/\\./g, " ");
  s = s.replace(/[^a-z0-9\\s-]/g, " ");
  s = s.replace(/\\s+/g, "-").replace(/-+/g, "-").replace(/^-+|-+$/g, "");
  s = s.replace(/-(?:photoset|photobook|photo-set|set|collection)$/i, "");
  return s.slice(0, maxLen) || "album";
}

/** Rule-engine SEO keywords: Creator + Series + Volume + Genre. */
export function buildSeoKeywords(
  seo: Pick<
    SeoOutput,
    "albumTitle" | "creator" | "collectionName" | "category" | "focusKeyword" | "relatedKeywords"
  >
): string {
  const keywords: string[] = [];
  if (seo.creator && seo.creator !== "Unknown") keywords.push(seo.creator);
  const collection =
    seo.collectionName ||
    (seo.albumTitle.match(/Espacia\\s+Korea\\s+EHC/i) ? "Espacia Korea EHC" : null) ||
    detectCollectionName(seo.albumTitle);
  if (collection) keywords.push(collection);
  const vol = seo.albumTitle.match(/\\bVol\\.?\\s*(\\d+)/i);
  if (vol) keywords.push(`Vol ${vol[1]}`);
  if (seo.category) {
    keywords.push(seo.category);
    keywords.push(`${seo.category} photos`);
    keywords.push(`${seo.category} gallery`);
  }
  if (seo.focusKeyword) keywords.push(seo.focusKeyword);
  if (seo.relatedKeywords?.length) keywords.push(...seo.relatedKeywords);
  const seen = new Set<string>();
  const unique: string[] = [];
  for (const k of keywords) {
    const t = k.trim();
    if (!t) continue;
    const key = t.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(t);
  }
  return unique.slice(0, 12).join(", ");
}

/** Post-process SEO output: slug from title, keywords from rules. */
export function finalizeSeoOutput(data: SeoOutput): SeoOutput {
  data.slug = slugifyTitle(data.albumTitle);
  if (!data.seoKeywords?.trim()) {
    data.seoKeywords = buildSeoKeywords(data);
  }
  data.publishStatus = data.publishStatus ?? "draft";
  validateSeo(data);
  return data;
}

'''
    st = st.replace(
        "// ─── Slug Generation ──────────────────────────────────────────────────────────",
        slug_block + "// ─── Slug Generation ──────────────────────────────────────────────────────────",
    )

# Replace generateSlug body
st = re.sub(
    r"export function generateSlug\(filename: string\): string \{[\s\S]*?\n\}",
    "export function generateSlug(filename: string): string {\n  return slugifyTitle(filename);\n}",
    st,
    count=1,
)

# Add seoKeywords to interface
if "seoKeywords" not in st.split("export interface SeoOutput")[1].split("}")[0]:
    st = st.replace(
        "  focusKeyword: string;      // creator > collection > filename",
        "  focusKeyword: string;      // creator > collection > filename\n  seoKeywords?: string;      // comma-separated keywords for meta",
    )

# parseAndValidateSeoResponse — use finalizeSeoOutput
st = st.replace(
    """  if (!data.albumTitle || data.albumTitle === "string" || data.albumTitle.length < 3) data.albumTitle = cleaned;
  data.publishStatus = "draft";
  validateSeo(data);
  return data;""",
    """  if (!data.albumTitle || data.albumTitle === "string" || data.albumTitle.length < 3) data.albumTitle = cleaned;
  return finalizeSeoOutput(data);""",
)

# generateSeoData AI path — finalize after parse
st = st.replace(
    """    data.albumTitle = cleaned;
    data.publishStatus = "draft"; // AI always creates draft
    validateSeo(data);""",
    """    if (!data.albumTitle || data.albumTitle === "string" || data.albumTitle.length < 3) {
      data.albumTitle = cleaned;
    }
    finalizeSeoOutput(data);""",
)

# fallbackSeo — finalize before return
st = st.replace(
    """  return {
    albumTitle,
    seoTitle,
    metaDescription,
    focusKeyword,
    relatedKeywords,
    tags,
    category,
    creator,
    collectionName: collectionName || undefined,
    slug: generatedSlug,
    shortDescription,
    altTextTemplate,
    publishStatus: "draft",
  };
}""",
    """  const output: SeoOutput = {
    albumTitle,
    seoTitle,
    metaDescription,
    focusKeyword,
    relatedKeywords,
    tags,
    category,
    creator,
    collectionName: collectionName || undefined,
    slug: generatedSlug,
    shortDescription,
    altTextTemplate,
    publishStatus: "draft",
  };
  return finalizeSeoOutput(output);
}""",
)

# Remove generatedSlug variable usage in fallback - still ok since finalize overwrites slug

# Add Espacia to detectCollectionName
if '"Espacia"' not in st:
    st = st.replace(
        '"MissKON", "MrCong",',
        '"MissKON", "MrCong", "Espacia",',
    )

# AI prompt — slug ignored note
st = st.replace(
    '- slug:             lowercase, hyphens only, max 50 chars',
    '- slug:             IGNORED — computed server-side from albumTitle',
)

SEO.write_text(st)
print("patched seo-generator.ts")

# ── seo-import.ts ─────────────────────────────────────────────────────────────
sit = SI.read_text().replace("\r\n", "\n")

if "slugifyTitle" not in sit:
    sit = sit.replace(
        '  type SeoOutput,\n} from "../services/seo-generator";',
        '  type SeoOutput,\n  slugifyTitle,\n  buildSeoKeywords,\n  finalizeSeoOutput,\n} from "../services/seo-generator";',
    )

# runImportSeo — finalize after parse
if "finalizeSeoOutput(result" not in sit and "finalizeSeoOutput(seo" not in sit:
    sit = sit.replace(
        "    seo = parseAndValidateSeoResponse(result.content, cleaned);",
        "    seo = finalizeSeoOutput(parseAndValidateSeoResponse(result.content, cleaned));",
    )
    # parseAndValidateSeoResponse already calls finalizeSeoOutput - double call is ok (idempotent)
    # Actually parseAndValidateSeoResponse now returns finalizeSeoOutput - remove double
    sit = sit.replace(
        "    seo = finalizeSeoOutput(parseAndValidateSeoResponse(result.content, cleaned));",
        "    seo = parseAndValidateSeoResponse(result.content, cleaned);",
    )

# applySeoToAlbum — slug from title, seoKeywords
old_apply = """      title: seo.albumTitle,
      slug: seo.slug,"""
new_apply = """      title: seo.albumTitle,
      slug: slugifyTitle(seo.albumTitle),"""

if old_apply in sit:
    sit = sit.replace(old_apply, new_apply)

if "seoKeywords:" not in sit:
    sit = sit.replace(
        "      focusKeyword: seo.focusKeyword,",
        "      focusKeyword: seo.focusKeyword,\n      seoKeywords: seo.seoKeywords?.trim() || buildSeoKeywords(seo),",
    )

SI.write_text(sit)
print("patched seo-import.ts")
print("UAT Round 4 done")
