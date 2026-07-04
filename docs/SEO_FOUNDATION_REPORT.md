# SEO Foundation Report

**Date:** 2026-07-04  
**Scope:** Complete missing SEO foundation (post Sprint 1 P0)  
**Status:** ✅ Deployed production — no Sprint 2, no business logic changes

---

## Executive Summary

| Phase | Description | Status |
|-------|-------------|--------|
| A | Server-side meta injection (Home, Gallery, Creator, Tag, Category, Static) | ✅ |
| B | Server-side JSON-LD | ✅ |
| C | Tag SEO bulk AI tool (manual only) | ✅ |
| D | Favicon 404 fix | ✅ |
| E | Crawl graph audit | ✅ (see `CRAWL_GRAPH.md`) |

Sprint 1 P0 behavior preserved: soft 404, www→apex, `/browse` redirect, auth/admin noindex.

---

## Phase A — Server-side SEO Injection

### Files

| File | Change |
|------|--------|
| `server/_core/seo-meta.ts` | **NEW** — `applyFullMeta()` with title, description, robots, canonical, OG, Twitter |
| `server/_core/meta-injection.ts` | Extended `resolveSpaHtml()` for all public page types |
| `server/_core/vite.ts` | Pass full `originalUrl` (query string for category) |

### Page coverage

| Page | Title | Description | Canonical | Robots | OG | Twitter |
|------|-------|-------------|-----------|--------|-----|---------|
| Homepage `/` | ✅ | ✅ | ✅ apex | index | ✅ | ✅ |
| Gallery `/gallery` | ✅ distinct | ✅ distinct | ✅ | index* | ✅ | ✅ |
| Album | ✅ (existing) | ✅ | ✅ | per DB | ✅ | ✅ |
| Creator | ✅ | ✅ | ✅ | per DB | ✅ | ✅ |
| Tag | ✅ | ✅ template | ✅ | index | ✅ | ✅ |
| Category `/search?category=` | ✅ from DB | ✅ | ✅ | matches client |
| Static `/about`, `/contact`, etc. | ✅ | ✅ | ✅ | index | ✅ | ✅ |
| CMS `/privacy`, `/terms` | ✅ | ✅ | ✅ | index | ✅ | ✅ |

\*Gallery with filter query params → `noindex` (matches client `hasFilterParams`).

### Verification (origin curl)

```bash
curl -s http://127.0.0.1:3000/ | grep canonical
# href="https://yukvix.com/"

curl -s http://127.0.0.1:3000/gallery | grep 'og:title'
# Cosplay Gallery | Yukvix

curl -s http://127.0.0.1:3000/creator/ise | grep canonical
# href="https://yukvix.com/creator/ise"
```

---

## Phase B — Server-side JSON-LD

### Files

| File | Change |
|------|--------|
| `server/_core/json-ld.ts` | **NEW** — schema builders + `injectJsonLd()` |
| `server/_core/meta-injection.ts` | Inject JSON-LD per page type |

### Schema by page

| Page | Schema types |
|------|--------------|
| Homepage | WebSite, Organization |
| Gallery | BreadcrumbList |
| Album | ImageGallery, BreadcrumbList (+ photos from DB) |
| Creator | Person, BreadcrumbList |
| Tag | CollectionPage, BreadcrumbList |
| Category search | CollectionPage |
| Static / CMS | BreadcrumbList |

### Verification

```bash
curl -s http://127.0.0.1:3000/ | grep 'application/ld+json'
# WebSite + Organization

curl -s http://127.0.0.1:3000/album/coser-nnian-vol001-premium-cosplay-set | grep ImageGallery
# ImageGallery present in first HTML
```

Client-side JSON-LD (React SeoHead) still runs — no removal. Server injects first; no regression to AI SEO or album pipeline.

---

## Phase C — Tag SEO Bulk Tool

### Audit (2026-07-04)

| Metric | Count |
|--------|-------|
| Total tags | 496 |
| Missing SEO title | 496 |
| Missing SEO description (intro) | 496 |

Tags table has no separate `intro` column — `seoDescription` serves as meta + page intro (matches `TagPage.tsx`).

### Files

| File | Change |
|------|--------|
| `server/services/tag-seo-bulk.ts` | **NEW** — audit, bulk AI job, manual trigger only |
| `server/routers/seo.ts` | `getTagSeoAudit`, `startTagSeoBulk`, `getTagSeoBulkStatus`, `cancelTagSeoBulk` |
| `client/src/pages/admin/AdminTags.tsx` | Bulk AI panel (Generate missing / Regenerate all) |

**Not auto-run.** Admin must click button in `/admin/tags`.

Existing bulk `type: "tags"` in AdminSeoBulk remains **album tag assignment** — unchanged.

---

## Phase D — Favicon

### Problem

`/favicon.ico` returned HTTP 404.

### Fix

| File | Change |
|------|--------|
| `client/public/favicon.svg` | **NEW** default favicon |
| `server/seo-routes.ts` | `/favicon.ico` → CMS URL redirect or `/favicon.svg`; `/favicon.svg` static serve |

### Verification

```bash
curl -sI http://127.0.0.1:3000/favicon.ico   # HTTP 302 → /favicon.svg
curl -sI http://127.0.0.1:3000/favicon.svg   # HTTP 200
```

---

## Phase E — Crawl Graph

See **`CRAWL_GRAPH.md`** for full audit (dead ends, orphans, weak links).

---

## Regression Checklist

| Area | Result |
|------|--------|
| Invalid album/creator/tag → 404 | ✅ |
| `/login`, `/admin` → noindex server-side | ✅ |
| Valid album 200 + meta | ✅ |
| Sitemaps / robots | ✅ untouched |
| ZIP Import / Queue / Scheduler / Worker | ✅ not modified |
| AdminSeoBulk album/creator bulk | ✅ not modified |

---

## Commits (VPS git)

Separate commits per phase — see `git log --oneline` on VPS.

---

## Next Steps (Owner)

1. Run **Tag SEO Bulk** from Admin → Tags when ready (496 tags — run in batches/off-peak).
2. Monitor GSC 2–4 weeks before Sprint 2 approval.
3. Optional: add `og-default.jpg` to `client/public` (referenced but may 404).
