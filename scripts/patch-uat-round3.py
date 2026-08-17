#!/usr/bin/env python3
"""UAT Round 3 — creator detect, avatar/banner, dashboard refresh."""
import re
from pathlib import Path

ROOT = Path("/var/www/cosplay-gallery")

# ── seo-generator: use parseCreatorFromFilename + fix fallback .pop() ───────
seo = ROOT / "server/services/seo-generator.ts"
st = seo.read_text()

if 'from "./creator-detect"' not in st:
    st = st.replace(
        'import { getDb } from "../db";',
        'import { parseCreatorFromFilename } from "./creator-detect";\nimport { getDb } from "../db";',
    )

st = re.sub(
    r"export function detectCreatorFromFilename\(filename: string\): string \| null \{[\s\S]*?\n\}",
    'export function detectCreatorFromFilename(filename: string): string | null {\n  return parseCreatorFromFilename(filename);\n}',
    st,
    count=1,
)

st = st.replace(
    """  const creator =
    input.creator ||
    detectCreatorFromFilename(filename) ||
    filename.split(/[\\s\\-_]+/).pop() ||
    "Unknown";""",
    """  const creator =
    input.creator ||
    detectCreatorFromFilename(filename) ||
    "Unknown";""",
)

seo.write_text(st)
print("patched seo-generator")

# ── creator-service: banner helper + noise collections ──────────────────────
cs = ROOT / "server/services/creator-service.ts"
ct = cs.read_text()

if '"Photoset"' not in ct:
    ct = ct.replace(
        '"MissKON", "MrCong", "Yukvix",',
        '"MissKON", "MrCong", "Yukvix", "Photoset", "Photobook", "Espacia", "EHC",',
    )

if "updateCreatorBannerIfEmpty" not in ct:
    banner_fn = '''
/**
 * Set creator banner from first album hero image if banner empty (UAT ENHANCEMENT-002).
 */
export async function updateCreatorBannerIfEmpty(
  creatorId: number,
  mediumKey: string,
  mediumUrl?: string
): Promise<void> {
  const db = await getDb();
  if (!db) return;

  const existing = await db
    .select({ bannerKey: creators.bannerKey })
    .from(creators)
    .where(eq(creators.id, creatorId))
    .limit(1);

  if (existing.length > 0 && !existing[0].bannerKey) {
    await db
      .update(creators)
      .set({
        bannerKey: mediumKey,
        bannerUrl: mediumUrl || null,
        updatedAt: new Date(),
      })
      .where(eq(creators.id, creatorId));
    console.log(`[Creator] Updated banner for creator ${creatorId}: ${mediumKey}`);
  }
}

'''
    ct = ct.replace(
        "export async function incrementCreatorAlbumCount",
        banner_fn + "export async function incrementCreatorAlbumCount",
    )
    cs.write_text(ct)
    print("patched creator-service")

# ── seo-import: do not overwrite linked creator ─────────────────────────────
si = ROOT / "server/import/seo-import.ts"
sit = si.read_text()
if "existingCreatorId" not in sit:
    sit = sit.replace(
        "export async function applySeoToAlbum(albumId: number, seo: SeoOutput): Promise<void> {",
        "export async function applySeoToAlbum(albumId: number, seo: SeoOutput): Promise<void> {",
    )
    old_set = """  await db
    .update(albums)
    .set({
      title: seo.albumTitle,
      slug: seo.slug,
      description: seo.shortDescription,
      creator: seo.creator || undefined,"""
    new_set = """  const [existingAlbum] = await db
    .select({ creatorId: albums.creatorId })
    .from(albums)
    .where(eq(albums.id, albumId))
    .limit(1);

  await db
    .update(albums)
    .set({
      title: seo.albumTitle,
      slug: seo.slug,
      description: seo.shortDescription,
      ...(!existingAlbum?.creatorId ? { creator: seo.creator || undefined } : {}),"""
    if old_set in sit:
        sit = sit.replace(old_set, new_set)
        si.write_text(sit)
        print("patched seo-import creator guard")

# ── zip-import: batchAutoImport + createAlbumAndImport ─────────────────────
router = ROOT / "server/routers/zip-import.ts"
rt = router.read_text()

if "resolveCreatorFromFilename" not in rt:
    rt = rt.replace(
        'import { findOrCreateCreator, KNOWN_COLLECTIONS } from "../services/creator-service";',
        'import { findOrCreateCreator, KNOWN_COLLECTIONS } from "../services/creator-service";\nimport { resolveCreatorFromFilename } from "../services/creator-detect";',
    )

old_batch = """          // Find or create creator
          let creatorId: number | null = null;
          if (seo.creator && !KNOWN_COLLECTIONS.has(seo.creator)) {
            try {
              const creatorResult = await findOrCreateCreator({
                name: seo.creator,
                category: seo.category,
              });
              creatorId = creatorResult.creatorId;
            } catch (err) {
              console.warn(`[BatchImport] Creator lookup failed: ${(err as Error).message}`);
            }
          }"""

new_batch = """          // 3-layer creator detect (regex → DB → AI fallback)
          const resolvedCreator = await resolveCreatorFromFilename(item.filename, seo.category);
          const creatorName = resolvedCreator.name || seo.creator || null;
          let creatorId: number | null = resolvedCreator.creatorId;
          if (!creatorId && creatorName && !KNOWN_COLLECTIONS.has(creatorName)) {
            try {
              const creatorResult = await findOrCreateCreator({
                name: creatorName,
                category: seo.category,
              });
              creatorId = creatorResult.creatorId;
            } catch (err) {
              console.warn(`[BatchImport] Creator lookup failed: ${(err as Error).message}`);
            }
          }"""

if old_batch in rt:
    idx = rt.find(old_batch)
    rt = rt[:idx] + new_batch + rt[idx + len(old_batch):]
    rt = rt.replace("creator: seo.creator,", "creator: creatorName,", 1)
    print("patched batchAutoImport")

old_manual = """      // Find or create creator (skip if collection name)
      let creatorId: number | null = null;
      if (input.creator && !KNOWN_COLLECTIONS.has(input.creator)) {
        try {
          const result = await findOrCreateCreator({
            name: input.creator,
            category: input.category,
          });
          creatorId = result.creatorId;
        } catch (err) {
          console.warn(`[ZipImport] Creator lookup failed: ${(err as Error).message}`);
        }
      }"""

new_manual = """      // 3-layer creator detect when admin did not supply creator
      let creatorName = input.creator || null;
      let creatorId: number | null = null;
      if (!creatorName && input.originalFileName) {
        const resolved = await resolveCreatorFromFilename(input.originalFileName, input.category);
        creatorName = resolved.name;
        creatorId = resolved.creatorId;
      }
      if (!creatorId && creatorName && !KNOWN_COLLECTIONS.has(creatorName)) {
        try {
          const result = await findOrCreateCreator({
            name: creatorName,
            category: input.category,
          });
          creatorId = result.creatorId;
        } catch (err) {
          console.warn(`[ZipImport] Creator lookup failed: ${(err as Error).message}`);
        }
      }"""

if old_manual in rt:
    rt = rt.replace(old_manual, new_manual)
    rt = rt.replace("creator: input.creator,", "creator: creatorName,", 1)
    print("patched createAlbumAndImport")

router.write_text(rt)

# ── BUG-004: AdminZipImport refresh ─────────────────────────────────────────
admin = ROOT / "client/src/pages/admin/AdminZipImport.tsx"
at = admin.read_text()

if "zipImport.invalidate" not in at:
    at = at.replace(
        "function JobsDashboard() {",
        "function JobsDashboard() {\n  const utils = trpc.useUtils();",
    )
    at = at.replace(
        """  const { data: importStats } = trpc.zipImport.getImportJobStats.useQuery(undefined, {
    refetchInterval: 30000,
  });""",
        """  const { data: importStats, refetch: refetchStats } = trpc.zipImport.getImportJobStats.useQuery(undefined, {
    refetchInterval: 30000,
  });""",
    )
    at = at.replace(
        """        <Button variant="outline" size="sm" onClick={() => refetch()}>
          <RefreshCw className="w-4 h-4 mr-2" />
          Làm mới
        </Button>""",
        """        <Button
          variant="outline"
          size="sm"
          onClick={async () => {
            await utils.zipImport.invalidate();
            await Promise.all([refetch(), refetchStats()]);
          }}
        >
          <RefreshCw className="w-4 h-4 mr-2" />
          Làm mới
        </Button>""",
    )
    admin.write_text(at)
    print("patched AdminZipImport refresh")

print("UAT Round 3 patches done")
