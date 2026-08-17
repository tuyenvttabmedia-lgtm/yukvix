#!/usr/bin/env python3
"""UAT Round 5 — BUG-007 import cronHour gate + auto-bulk-seo cronHour + notify fix."""
import re
from pathlib import Path

ROOT = Path("/var/www/cosplay-gallery")
PIQ = ROOT / "server/scheduled/process-import-queue.ts"
ABS = ROOT / "server/scheduled/auto-bulk-seo.ts"
SEO = ROOT / "server/services/seo-generator.ts"

# ── process-import-queue.ts: gate on cronHour (UTC) ───────────────────────────
piq = PIQ.read_text().replace("\r\n", "\n")
if "cronHour" not in piq.split("processImportQueueHandler")[1].split("dispatch")[0]:
    old = """  if (!isManualRun && !config.enabled) {
    res.json({ skipped: true, reason: "Import schedule is disabled" });
    return;
  }

  const result = await dispatch({"""
    new = """  if (!isManualRun && !config.enabled) {
    res.json({ skipped: true, reason: "Import schedule is disabled" });
    return;
  }

  const currentHour = new Date().getUTCHours();
  if (!isManualRun && currentHour !== config.cronHour) {
    res.json({
      skipped: true,
      reason: `Not scheduled hour (UTC ${currentHour}, configured ${config.cronHour})`,
      cronHour: config.cronHour,
      currentHour,
    });
    return;
  }

  const result = await dispatch({"""
    if old not in piq:
        raise SystemExit("process-import-queue.ts pattern not found")
    piq = piq.replace(old, new, 1)
    PIQ.write_text(piq)
    print("Patched process-import-queue.ts")

# ── auto-bulk-seo.ts: cronHour gate + non-fatal notify ────────────────────────
abs_text = ABS.read_text().replace("\r\n", "\n")

if "currentHour !== autoSeoConfig.cronHour" not in abs_text:
    old2 = """    if (!autoSeoConfig.enabled && !isManualRun) {
      return res.json({ ok: true, skipped: true, message: "Auto Schedule is disabled. Enable it in Admin → Bulk SEO → Auto Schedule.", timestamp: new Date().toISOString() });
    }

    const results = {"""
    new2 = """    if (!autoSeoConfig.enabled && !isManualRun) {
      return res.json({ ok: true, skipped: true, message: "Auto Schedule is disabled. Enable it in Admin → Bulk SEO → Auto Schedule.", timestamp: new Date().toISOString() });
    }

    const currentHour = new Date().getUTCHours();
    if (!isManualRun && currentHour !== autoSeoConfig.cronHour) {
      return res.json({
        ok: true,
        skipped: true,
        message: `Not scheduled hour (UTC ${currentHour}, configured ${autoSeoConfig.cronHour})`,
        cronHour: autoSeoConfig.cronHour,
        currentHour,
        timestamp: new Date().toISOString(),
      });
    }

    const results = {"""
    if old2 not in abs_text:
        raise SystemExit("auto-bulk-seo.ts enabled check pattern not found")
    abs_text = abs_text.replace(old2, new2, 1)
    print("Patched auto-bulk-seo.ts cronHour gate")

if "notifyOwner failed" not in abs_text:
    old3 = """    if (totalProcessed > 0) {
      await notifyOwner({
        title: "Auto Bulk SEO hoàn thành",
        content: `Đã tự động tạo SEO:\\n- Albums: ${results.albumsProcessed} (${results.albumsFailed} lỗi)\\n- Creators: ${results.creatorsProcessed} (${results.creatorsFailed} lỗi)\\n- Tags cho albums: ${results.tagsProcessed} (${results.tagsFailed} lỗi)`,
      });
    }"""
    new3 = """    if (totalProcessed > 0) {
      try {
        await notifyOwner({
          title: "Auto Bulk SEO hoàn thành",
          content: `Đã tự động tạo SEO:\\n- Albums: ${results.albumsProcessed} (${results.albumsFailed} lỗi)\\n- Creators: ${results.creatorsProcessed} (${results.creatorsFailed} lỗi)\\n- Tags cho albums: ${results.tagsProcessed} (${results.tagsFailed} lỗi)`,
        });
      } catch (notifyErr: any) {
        console.warn("[AutoBulkSEO] notifyOwner failed:", notifyErr?.message || notifyErr);
      }
    }"""
    if old3 not in abs_text:
        raise SystemExit("auto-bulk-seo.ts notifyOwner pattern not found")
    abs_text = abs_text.replace(old3, new3, 1)
    print("Patched auto-bulk-seo.ts notifyOwner")

ABS.write_text(abs_text)

# ── seo-generator.ts: trim keywords to 6-8 quality (optional light tune) ──────
seo = SEO.read_text().replace("\r\n", "\n")
if "MAX_SEO_KEYWORDS" not in seo and "return unique.slice(0, 12)" in seo:
    old_kw = """  if (seo.focusKeyword) keywords.push(seo.focusKeyword);
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
  return unique.slice(0, 12).join(", ");"""
    new_kw = """  if (seo.focusKeyword) keywords.push(seo.focusKeyword);
  if (seo.relatedKeywords?.length) keywords.push(...seo.relatedKeywords);

  const MAX_SEO_KEYWORDS = 8;
  const seen = new Set<string>();
  const unique: string[] = [];

  function isRedundant(candidate: string, existing: string[]): boolean {
    const c = candidate.toLowerCase();
    for (const e of existing) {
      const el = e.toLowerCase();
      if (c === el) return true;
      // Skip near-duplicates: "Espacia Korea" when "Espacia Korea EHC" exists
      if (el.includes(c) || c.includes(el)) {
        if (Math.min(c.length, el.length) >= 6) return true;
      }
    }
    return false;
  }

  for (const k of keywords) {
    const t = k.trim();
    if (!t) continue;
    const key = t.toLowerCase();
    if (seen.has(key)) continue;
    if (isRedundant(t, unique)) continue;
    seen.add(key);
    unique.push(t);
    if (unique.length >= MAX_SEO_KEYWORDS) break;
  }
  return unique.join(", ");"""
    if old_kw not in seo:
        raise SystemExit("buildSeoKeywords dedupe block not found")
    seo = seo.replace(old_kw, new_kw, 1)
    SEO.write_text(seo)
    print("Patched seo-generator.ts keyword cap/dedupe")
else:
    print("seo-generator.ts already tuned or pattern missing — skipped")

print("UAT Round 5 patch complete")
