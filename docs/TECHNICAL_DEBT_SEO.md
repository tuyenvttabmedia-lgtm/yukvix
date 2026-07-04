# Technical Debt — SEO

**Last updated:** 2026-07-04  
**Context:** Post Sprint 1 UAT + SEO Foundation

---

## Resolved (Sprint 1 P0)

| Item | Resolution |
|------|------------|
| www + apex duplicate | nginx 301 |
| Soft 404 | Server HTTP 404 |
| `/browse` dead URL | 301 → `/gallery` |
| Auth/admin indexable HTML | Server `noindex,nofollow` |

---

## Resolved (SEO Foundation)

| Item | Resolution |
|------|------------|
| Missing server canonical (non-album pages) | Phase A |
| Missing server Twitter/OG on entity pages | Phase A |
| Gallery title = homepage title in first HTML | Phase A |
| Missing server JSON-LD on albums | Phase B |
| Missing homepage WebSite/Organization JSON-LD | Phase B |
| `/favicon.ico` 404 | Phase D |
| No tag entity SEO bulk tool | Phase C (manual) |

---

## Open — Content Debt

| Item | Count | Priority | Tool / Action |
|------|-------|----------|---------------|
| Tags missing SEO title | 496 / 496 | P1 | Admin → Tags → Generate missing SEO |
| Tags missing meta description (intro) | 496 / 496 | P1 | Same bulk tool |
| Photos missing altText | ~10,119 / 10,189 | P2 | Existing alt bulk (not Foundation scope) |
| Albums missing og_image DB field | 156 / 0 with og | P3 | Cover URL used as fallback — OK |

---

## Open — Technical Debt

| Item | Impact | Notes |
|------|--------|-------|
| `og-default.jpg` may 404 | OG fallback image | Add asset to `client/public/` |
| Category pages not in sitemap | Discoverability | `/search?category=` indexable but not submitted |
| Search with category → client noindex | May conflict with category SEO | Client `hasSearchQuery` includes categorySlug; server matches — category pages noindex until client change (Sprint 2+) |
| Dual meta injection (server + React Helmet) | Duplicate tags in DOM after hydrate | Low risk; crawlers read first HTML |
| Cloudflare cache on robots.txt | Stale Allow rules | Purge or wait TTL |
| JSON-LD duplicated after React hydrate | Validator may see 2 sets | Monitor; server-first satisfies UAT |
| CMS favicon_url empty | Falls back to SVG | Set in Admin → Appearance |

---

## Open — GSC Monitoring (Owner)

Fill from Google Search Console after 2–4 weeks:

| Metric | Baseline (pre-Foundation) | Target |
|--------|---------------------------|--------|
| Indexed pages | Owner to fill | ↑ |
| Discovered – not indexed | Owner to fill | ↓ |
| Duplicate | Owner to fill | ↓ |
| Soft 404 | Owner to fill | ↓ |
| Excluded by noindex | Owner to fill | stable |

See also `SEO_BASELINE_2026-07.md`.

---

## Explicitly Out of Scope

- Full SSR / Next.js migration
- Automatic tag SEO cron
- ZIP Import / Queue / Scheduler / Worker changes
- Sprint 2 optimizations (internal linking widgets, sitemap category URLs)
