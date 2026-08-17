# Phase 2 Test Report — Queue + Lock + Heartbeat

**Date:** 2026-07-02  
**Deploy commit:** (VPS git — Phase 2 commit)  
**Tester:** Cursor Agent  
**ZIP_IMPORT_V2:** `false` (default, unchanged)

---

## Build Result

- [x] `pnpm run build` success (VPS)
- [x] `systemctl restart cosplay-gallery` OK
- [x] `/api/health` → `200`, database ok
- [x] No build/type errors in Phase 2 files

## Phase 2 Scope Delivered

| Task | Status |
|------|--------|
| `ImportScheduler.dispatch()` single entry | ✅ `server/services/import-scheduler.ts` |
| MySQL `GET_LOCK('yukvix_zip_scheduler')` | ✅ |
| `FOR UPDATE SKIP LOCKED` job pick | ✅ |
| Merge `import-cron` + `process-import-queue` | ✅ Both call `dispatch()` |
| Migration `workerId`, `lockedAt`, `heartbeatAt` | ✅ DB verified |
| Heartbeat update every 30s in worker | ✅ `import-job-lock.ts` |
| Dead worker scan (2 min default) | ✅ `recoverDeadWorkers()` + 60s interval |
| `ZIP_IMPORT_V2` flag skeleton | ✅ `isZipImportV2Enabled()` default false |
| AutoBulkSEO `album_tags.albumId` fix | ✅ |
| Startup stale heartbeat scan | ✅ `recoverDeadWorkersOnStartup()` |

## Test Result (Mandatory §7 — Phase 2 applicable)

| # | Scenario | Result | Notes |
|---|----------|--------|-------|
| ① | Single ZIP | DEFER | No new upload this session; V1 path unchanged |
| ② | Multi ZIP | DEFER | Requires admin upload session |
| ③ | ZIP trùng | N/A | Phase 3 |
| ④ | ZIP corrupt | N/A | Phase 4 |
| ⑤ | ZIP password | N/A | Phase 4 |
| ⑥ | ZIP >700MB | N/A | Phase 4 |
| ⑦ | VPS restart | PARTIAL | Startup hook runs; full resume Phase 6 |
| ⑧ | Wasabi timeout | DEFER | Existing retry behavior unchanged |
| ⑨ | Gemini timeout | N/A | Phase 7 |
| ⑩ | Cron + Manual concurrent | CODE | Single `dispatch()` + GET_LOCK prevents double pick |

**Owner action:** Run ①②⑩ on next import batch to confirm end-to-end.

## Regression Check

- [x] Existing completed jobs unchanged (8 completed, counts verified)
- [x] Business config defaults unchanged (`IMPORT_SCHEDULED_ONLY`, batch size via admin)
- [x] No BullMQ / Redis queue / new infra added
- [x] DB is source of truth for lock/heartbeat (no RAM state)
- [ ] Admin upload smoke test — **pending Owner**

## Performance

| Metric | Before | After |
|--------|--------|-------|
| Scheduler race risk | B01 present | Mitigated via GET_LOCK + SKIP LOCKED |
| Stuck recovery | 2h on `updatedAt` | 2min heartbeat (active jobs) |

## Bug Found

| ID | Description | Severity |
|----|-------------|----------|
| — | None in Phase 2 deploy | — |

## Bug Fixed

| ID | Fix summary |
|----|-------------|
| B01 | Unified scheduler + global lock |
| B09 | `album_tags.albumId` in auto-bulk-seo |

## Rollback Result

- [x] Procedure documented: `ZIP_IMPORT_V2=false` + git revert Phase 2 commit + `deploy.sh`
- [x] New columns nullable — old code path safe if revert before using heartbeat fields
- [ ] Rollback drill on VPS — **recommend before Phase 3 if Owner prefers**

## Known Limitations (Phase 2)

1. Dead worker recovery re-queues to `waiting` — **image-level resume in Phase 6**
2. `ZIP_IMPORT_V2=false` — full V1 pipeline behavior preserved
3. `.env` quotes on IMPORT_* vars ignored by systemd (pre-existing) — not introduced by Phase 2

## Sign-off

- [x] Phase 2 acceptance criteria met (code + build + migration)
- [ ] Owner reviewed
- **Approved to proceed to Phase 3:** PENDING Owner

---

*Next: Owner smoke test ① + ⑩, then approve Phase 3 (Duplicate + SKIPPED).*
