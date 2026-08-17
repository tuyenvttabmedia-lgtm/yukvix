#!/usr/bin/env python3
"""POST UAT — Scheduler hardening, logging, timezone UX, Scheduler Center."""
import re
import subprocess
from pathlib import Path

ROOT = Path("/var/www/cosplay-gallery")

# ── 1. Fix .env quoted duplicate lines (systemd ignores them) ─────────────────
env_path = ROOT / ".env"
env_text = env_path.read_text(encoding="utf-8", errors="replace")
lines = [ln for ln in env_text.splitlines() if not ln.strip().startswith('"')]
env_path.write_text("\n".join(lines) + "\n", encoding="utf-8")
print("Fixed .env quoted lines")

# ── 2. Register scheduler router ────────────────────────────────────────────
routers = ROOT / "server/routers.ts"
rt = routers.read_text().replace("\r\n", "\n")
if "schedulerRouter" not in rt:
    rt = rt.replace(
        'import { zipImportRouter } from "./routers/zip-import";',
        'import { zipImportRouter } from "./routers/zip-import";\nimport { schedulerRouter } from "./routers/scheduler";',
    )
    rt = rt.replace(
        "  zipImport: zipImportRouter,\n});",
        "  zipImport: zipImportRouter,\n  scheduler: schedulerRouter,\n});",
    )
    routers.write_text(rt)
    print("Patched routers.ts")

# ── 3. zip-import.ts — localHour timezone API ─────────────────────────────────
zi = ROOT / "server/routers/zip-import.ts"
zt = zi.read_text().replace("\r\n", "\n")

if "buildStoredScheduleConfig" not in zt:
    zt = zt.replace(
        'import { TRPCError } from "@trpc/server";',
        'import { TRPCError } from "@trpc/server";\nimport { buildStoredScheduleConfig, normalizeScheduleConfig } from "../services/schedule-config";',
    )

old_get = """  getImportScheduleConfig: adminProcedure.query(async () => {
    const db = await getDb();
    if (!db) return { enabled: false, cronHour: 3, batchSize: 10 };
    const row = await db
      .select({ value: adminSettings.value })
      .from(adminSettings)
      .where(eq(adminSettings.key, "import_schedule_config"))
      .limit(1);
    if (!row[0]?.value) return { enabled: false, cronHour: 3, batchSize: 10 };
    const cfg = JSON.parse(row[0].value);
    return {
      enabled: cfg.enabled ?? false,
      cronHour: cfg.cronHour ?? 3,
      batchSize: cfg.batchSize ?? 10,
    };
  }),"""

new_get = """  getImportScheduleConfig: adminProcedure.query(async () => {
    const db = await getDb();
    if (!db) {
      const view = await normalizeScheduleConfig({ enabled: false }, { localHour: 17, batchSize: 10 });
      return { enabled: view.enabled, localHour: view.localHour, cronHourUtc: view.cronHourUtc, timezone: view.timezone, batchSize: view.batchSize ?? 10 };
    }
    const row = await db
      .select({ value: adminSettings.value })
      .from(adminSettings)
      .where(eq(adminSettings.key, "import_schedule_config"))
      .limit(1);
    if (!row[0]?.value) {
      const view = await normalizeScheduleConfig({ enabled: false }, { localHour: 17, batchSize: 10 });
      return { enabled: view.enabled, localHour: view.localHour, cronHourUtc: view.cronHourUtc, timezone: view.timezone, batchSize: view.batchSize ?? 10 };
    }
    const cfg = JSON.parse(row[0].value);
    const view = await normalizeScheduleConfig(
      { enabled: cfg.enabled ?? false, cronHour: cfg.cronHour, localHour: cfg.localHour, batchSize: cfg.batchSize, timezone: cfg.timezone },
      { localHour: 17, batchSize: 10 }
    );
    return {
      enabled: view.enabled,
      localHour: view.localHour,
      cronHourUtc: view.cronHourUtc,
      cronHour: view.cronHourUtc,
      timezone: view.timezone,
      batchSize: view.batchSize ?? 10,
    };
  }),"""

if old_get in zt:
    zt = zt.replace(old_get, new_get)
    print("Patched getImportScheduleConfig")
elif "localHour: view.localHour" not in zt:
    print("WARN: getImportScheduleConfig pattern not found")

old_save = """  saveImportScheduleConfig: adminProcedure
    .input(
      z.object({
        enabled: z.boolean(),
        cronHour: z.number().int().min(0).max(23),
        batchSize: z.number().int().min(1).max(50),
      })
    )
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB not available" });
      const value = JSON.stringify(input);"""

new_save = """  saveImportScheduleConfig: adminProcedure
    .input(
      z.object({
        enabled: z.boolean(),
        localHour: z.number().int().min(0).max(23),
        batchSize: z.number().int().min(1).max(50),
      })
    )
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB not available" });
      const stored = await buildStoredScheduleConfig(input);
      const value = JSON.stringify(stored);"""

if old_save in zt:
    zt = zt.replace(old_save, new_save)
    print("Patched saveImportScheduleConfig")

zi.write_text(zt)

# ── 4. seo.ts — auto SEO localHour ───────────────────────────────────────────
seo = ROOT / "server/routers/seo.ts"
st = seo.read_text().replace("\r\n", "\n")

if "buildStoredScheduleConfig" not in st:
    st = st.replace(
        'import { TRPCError } from "@trpc/server";',
        'import { TRPCError } from "@trpc/server";\nimport { buildStoredScheduleConfig, normalizeScheduleConfig } from "../services/schedule-config";',
        1,
    )

old_seo_get = """  getAutoSeoConfig: protectedProcedure.query(async ({ ctx }) => {
    if (!isAdmin(ctx.user)) throw new TRPCError({ code: "FORBIDDEN" });
    const { getDb } = await import("../db");
    const { adminSettings } = await import("../../drizzle/schema");
    const { eq } = await import("drizzle-orm");
    const db = await getDb();
    if (!db) return null;
    const rows = await db.select().from(adminSettings).where(eq(adminSettings.key, "auto_seo_config")).limit(1);
    if (!rows[0]) return { enabled: false, cronHour: 2, maxAlbums: 20, maxCreators: 10, maxTags: 10 };
    try { return JSON.parse(rows[0].value); } catch { return { enabled: false, cronHour: 2, maxAlbums: 20, maxCreators: 10, maxTags: 10 }; }
  }),"""

new_seo_get = """  getAutoSeoConfig: protectedProcedure.query(async ({ ctx }) => {
    if (!isAdmin(ctx.user)) throw new TRPCError({ code: "FORBIDDEN" });
    const { getDb } = await import("../db");
    const { adminSettings } = await import("../../drizzle/schema");
    const { eq } = await import("drizzle-orm");
    const db = await getDb();
    const defaults = { enabled: false, cronHour: 2, maxAlbums: 20, maxCreators: 10, maxTags: 10, localHour: 9, cronHourUtc: 2, timezone: "Asia/Ho_Chi_Minh" };
    if (!db) return defaults;
    const rows = await db.select().from(adminSettings).where(eq(adminSettings.key, "auto_seo_config")).limit(1);
    if (!rows[0]) return defaults;
    try {
      const raw = JSON.parse(rows[0].value);
      const view = await normalizeScheduleConfig(
        { enabled: raw.enabled ?? false, cronHour: raw.cronHour, localHour: raw.localHour, timezone: raw.timezone, maxAlbums: raw.maxAlbums, maxCreators: raw.maxCreators, maxTags: raw.maxTags },
        { localHour: 9 }
      );
      return { enabled: view.enabled, localHour: view.localHour, cronHour: view.cronHourUtc, cronHourUtc: view.cronHourUtc, timezone: view.timezone, maxAlbums: raw.maxAlbums ?? 20, maxCreators: raw.maxCreators ?? 10, maxTags: raw.maxTags ?? 10 };
    } catch {
      return defaults;
    }
  }),"""

if old_seo_get in st:
    st = st.replace(old_seo_get, new_seo_get)
    print("Patched getAutoSeoConfig")

old_seo_save = """  saveAutoSeoConfig: protectedProcedure
    .input(z.object({
      enabled: z.boolean(),
      cronHour: z.number().int().min(0).max(23),
      maxAlbums: z.number().int().min(1).max(100),
      maxCreators: z.number().int().min(1).max(100),
      maxTags: z.number().int().min(1).max(100),
    }))
    .mutation(async ({ ctx, input }) => {
      if (!isAdmin(ctx.user)) throw new TRPCError({ code: "FORBIDDEN" });
      const { getDb } = await import("../db");
      const { adminSettings } = await import("../../drizzle/schema");
      const { eq } = await import("drizzle-orm");
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const value = JSON.stringify(input);"""

new_seo_save = """  saveAutoSeoConfig: protectedProcedure
    .input(z.object({
      enabled: z.boolean(),
      localHour: z.number().int().min(0).max(23),
      maxAlbums: z.number().int().min(1).max(100),
      maxCreators: z.number().int().min(1).max(100),
      maxTags: z.number().int().min(1).max(100),
    }))
    .mutation(async ({ ctx, input }) => {
      if (!isAdmin(ctx.user)) throw new TRPCError({ code: "FORBIDDEN" });
      const { getDb } = await import("../db");
      const { adminSettings } = await import("../../drizzle/schema");
      const { eq } = await import("drizzle-orm");
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const stored = await buildStoredScheduleConfig(input);
      const value = JSON.stringify(stored);"""

if old_seo_save in st:
    st = st.replace(old_seo_save, new_seo_save)
    print("Patched saveAutoSeoConfig")

seo.write_text(st)

# ── 5. auto-bulk-seo.ts — scheduler logging at end of handler ─────────────────
abs_path = ROOT / "server/scheduled/auto-bulk-seo.ts"
abs_text = abs_path.read_text().replace("\r\n", "\n")

if "appendSchedulerRun" not in abs_text:
    abs_text = abs_text.replace(
        'import { notifyOwner } from "../_core/notification";',
        'import { notifyOwner } from "../_core/notification";\nimport { appendSchedulerRun } from "../services/scheduler-log";\nimport { normalizeScheduleConfig } from "../services/schedule-config";',
    )

# Add logging on early exits - inject at start of handler after isManualRun
if "SCHEDULER_NAME = \"auto-seo\"" not in abs_text:
    abs_text = abs_text.replace(
        "export async function autoBulkSeoHandler(req: Request, res: Response) {\n  try {",
        'export async function autoBulkSeoHandler(req: Request, res: Response) {\n  const _runStarted = Date.now();\n  const SCHEDULER_NAME = "auto-seo";\n  try {',
    )

# Patch hour gate to use normalizeScheduleConfig
if "autoSeoConfig.cronHour" in abs_text and "normalizeScheduleConfig" in abs_text:
    old_gate = """    const currentHour = new Date().getUTCHours();
    if (!isManualRun && currentHour !== autoSeoConfig.cronHour) {
      return res.json({
        ok: true,
        skipped: true,
        message: `Not scheduled hour (UTC ${currentHour}, configured ${autoSeoConfig.cronHour})`,
        cronHour: autoSeoConfig.cronHour,
        currentHour,
        timestamp: new Date().toISOString(),
      });
    }"""
    new_gate = """    const seoView = await normalizeScheduleConfig(
      { enabled: autoSeoConfig.enabled, cronHour: autoSeoConfig.cronHour, localHour: (autoSeoConfig as any).localHour, timezone: (autoSeoConfig as any).timezone, maxAlbums: autoSeoConfig.maxAlbums, maxCreators: autoSeoConfig.maxCreators, maxTags: autoSeoConfig.maxTags },
      { localHour: 9 }
    );
    autoSeoConfig.cronHour = seoView.cronHourUtc;

    const currentHour = new Date().getUTCHours();
    if (!isManualRun && currentHour !== seoView.cronHourUtc) {
      await appendSchedulerRun({
        schedulerName: SCHEDULER_NAME,
        configuredHourUtc: seoView.cronHourUtc,
        configuredHourLocal: seoView.localHour,
        shouldRun: false,
        reason: `Not scheduled hour (UTC ${currentHour}, local ${seoView.localHour}:00 ${seoView.timezone})`,
        waitingJobs: 0,
        pickedJobs: [],
        durationMs: Date.now() - _runStarted,
        result: "skipped",
        manual: false,
        timezone: seoView.timezone,
      });
      return res.json({
        ok: true,
        skipped: true,
        message: `Not scheduled hour (UTC ${currentHour}, configured local ${seoView.localHour}:00)`,
        cronHour: seoView.cronHourUtc,
        localHour: seoView.localHour,
        currentHour,
        timestamp: new Date().toISOString(),
      });
    }"""
    if old_gate in abs_text:
        abs_text = abs_text.replace(old_gate, new_gate)
        print("Patched auto-bulk-seo hour gate + log")

# Log disabled skip
if "Auto Schedule is disabled" in abs_text and "appendSchedulerRun" in abs_text:
    old_dis = """    if (!autoSeoConfig.enabled && !isManualRun) {
      return res.json({ ok: true, skipped: true, message: "Auto Schedule is disabled. Enable it in Admin → Bulk SEO → Auto Schedule.", timestamp: new Date().toISOString() });
    }"""
    new_dis = """    if (!autoSeoConfig.enabled && !isManualRun) {
      await appendSchedulerRun({
        schedulerName: SCHEDULER_NAME,
        configuredHourUtc: autoSeoConfig.cronHour,
        configuredHourLocal: (autoSeoConfig as any).localHour ?? 9,
        shouldRun: false,
        reason: "Auto Schedule is disabled",
        waitingJobs: 0,
        pickedJobs: [],
        durationMs: Date.now() - _runStarted,
        result: "skipped",
        manual: false,
      });
      return res.json({ ok: true, skipped: true, message: "Auto Schedule is disabled. Enable it in Admin → Bulk SEO → Auto Schedule.", timestamp: new Date().toISOString() });
    }"""
    if old_dis in abs_text:
        abs_text = abs_text.replace(old_dis, new_dis)

# Log success before return
if "totalProcessed > 0 ? `Processed" in abs_text and "appendSchedulerRun({" not in abs_text.split("totalProcessed > 0 ?")[1][:800]:
    old_ret = """    return res.json({
      ok: true,
      timestamp: new Date().toISOString(),
      results,
      message: totalProcessed > 0 ? `Processed ${totalProcessed} items` : "Nothing to process",
    });"""
    new_ret = """    await appendSchedulerRun({
      schedulerName: SCHEDULER_NAME,
      configuredHourUtc: autoSeoConfig.cronHour,
      configuredHourLocal: (autoSeoConfig as any).localHour ?? 9,
      shouldRun: true,
      reason: totalProcessed > 0 ? `Processed ${totalProcessed} items` : "Nothing to process",
      waitingJobs: 0,
      pickedJobs: [],
      durationMs: Date.now() - _runStarted,
      result: totalProcessed > 0 ? `albums=${results.albumsProcessed} creators=${results.creatorsProcessed} tags=${results.tagsProcessed}` : "nothing",
      manual: isManualRun,
    });

    return res.json({
      ok: true,
      timestamp: new Date().toISOString(),
      results,
      message: totalProcessed > 0 ? `Processed ${totalProcessed} items` : "Nothing to process",
    });"""
    if old_ret in abs_text:
        abs_text = abs_text.replace(old_ret, new_ret)
        print("Patched auto-bulk-seo success log")

abs_path.write_text(abs_text)

# ── 6. ImportOperationsPanel — Scheduler Center at top ────────────────────────
iop = ROOT / "client/src/pages/admin/ImportOperationsPanel.tsx"
iot = iop.read_text().replace("\r\n", "\n")
if "SchedulerCenterPanel" not in iot:
    iot = iot.replace(
        'import {\n  Activity,',
        'import SchedulerCenterPanel from "./SchedulerCenterPanel";\nimport {\n  Activity,',
    )
    iot = iot.replace(
        'Operational Layer\n          </h2>\n          <p className="text-sm text-muted-foreground">\n            Import · Worker · Health · Notifications · Cleanup · Readiness',
        'Operational Layer\n          </h2>\n          <p className="text-sm text-muted-foreground">\n            Scheduler · Import · Worker · Health · Notifications · Cleanup · Readiness',
    )
    iot = iot.replace(
        "  return (\n    <div className=\"space-y-6\">\n      <div className=\"flex items-center justify-between\">",
        "  return (\n    <div className=\"space-y-6\">\n      <SchedulerCenterPanel />\n      <div className=\"flex items-center justify-between\">",
    )
    iop.write_text(iot)
    print("Patched ImportOperationsPanel")

# ── 7. AdminZipImport — VN timezone UX ────────────────────────────────────────
azi = ROOT / "client/src/pages/admin/AdminZipImport.tsx"
at = azi.read_text().replace("\r\n", "\n")

if "trpc.scheduler.getTimezone" not in at:
    at = at.replace(
        "  const [cronHour, setCronHour] = useState(3);",
        "  const [localHour, setLocalHour] = useState(17);\n  const [cronHourUtc, setCronHourUtc] = useState(10);\n  const { data: tzData } = trpc.scheduler.getTimezone.useQuery();\n  const timezone = tzData?.timezone ?? \"Asia/Ho_Chi_Minh\";",
    )
    at = at.replace(
        "setCronHour(data.cronHour ?? 3);",
        "setLocalHour((data as any).localHour ?? (data as any).cronHour ?? 17);\n      setCronHourUtc((data as any).cronHourUtc ?? (data as any).cronHour ?? 10);",
    )
    at = at.replace(
        "setCronHour(scheduleConfig.cronHour);",
        "setLocalHour((scheduleConfig as any).localHour ?? (scheduleConfig as any).cronHour ?? 17);\n    setCronHourUtc((scheduleConfig as any).cronHourUtc ?? (scheduleConfig as any).cronHour ?? 10);",
    )
    at = re.sub(r"  const vnHour = cronHour \+ 7[^\n]+\n", "", at)
    at = at.replace(
        "`Sẽ được xử lý tự động lúc ${cronHour}:00 UTC (${vnHour}:00 VN)`",
        "`Sẽ được xử lý tự động lúc ${String(localHour).padStart(2,\"0\")}:00 Việt Nam (${String(cronHourUtc).padStart(2,\"0\")}:00 UTC)`",
    )
    at = at.replace(
        "`Bật — chạy hàng ngày lúc ${cronHour}:00 UTC (${vnHour}:00 giờ VN), tối đa ${batchSize} album/lần`",
        "`Bật — chạy hàng ngày lúc ${String(localHour).padStart(2,\"0\")}:00 Việt Nam (${String(cronHourUtc).padStart(2,\"0\")}:00 UTC), tối đa ${batchSize} album/lần`",
    )
    at = at.replace(
        "Giờ chạy (UTC 0–23)",
        "Giờ chạy (Việt Nam 0–23)",
    )
    at = at.replace("value={cronHour}", "value={localHour}")
    at = at.replace("setCronHour(", "setLocalHour(")
    at = at.replace("{vnHour}:00 giờ Việt Nam", "{String(localHour).padStart(2,\"0\")}:00 Việt Nam ({String(cronHourUtc).padStart(2,\"0\")}:00 UTC)")
    at = at.replace(
        "saveConfigMutation.mutate({ enabled: scheduleEnabled, cronHour, batchSize })",
        "saveConfigMutation.mutate({ enabled: scheduleEnabled, localHour, batchSize })",
    )
    at = at.replace(
        '• Crontab VPS đã được cài sẵn: <code className="font-mono">0 3 * * *</code> (3:00 UTC = 10:00 giờ VN).',
        '• Linux cron gọi endpoint mỗi giờ (<code className="font-mono">0 * * * *</code>); backend chỉ dispatch đúng giờ đã cấu hình.',
    )
    at = at.replace(
        '<p className="text-yellow-400/80">Để thay đổi giờ crontab trên VPS, SSH vào server và chạy <code className="font-mono">crontab -e</code>.</p>',
        '<p className="text-muted-foreground">Timezone: <code className="font-mono">{timezone}</code> (System Settings)</p>',
    )
    azi.write_text(at)
    print("Patched AdminZipImport schedule UX")

# ── 8. AdminSeoBulk — VN timezone UX ─────────────────────────────────────────
seo_ui = ROOT / "client/src/pages/admin/AdminSeoBulk.tsx"
if seo_ui.exists():
    sut = seo_ui.read_text().replace("\r\n", "\n")
    if "trpc.scheduler.getTimezone" not in sut:
        sut = sut.replace(
            "  const [cronHour, setCronHour] = useState(2);",
            "  const [localHour, setLocalHour] = useState(9);\n  const [cronHourUtc, setCronHourUtc] = useState(2);\n  const { data: tzData } = trpc.scheduler.getTimezone.useQuery();\n  const timezone = tzData?.timezone ?? \"Asia/Ho_Chi_Minh\";",
        )
        sut = sut.replace("setCronHour(data.cronHour ?? 2);", "setLocalHour((data as any).localHour ?? 9);\n      setCronHourUtc((data as any).cronHourUtc ?? (data as any).cronHour ?? 2);")
        sut = sut.replace("setCronHour((autoSeoConfig as any).cronHour ?? 2);", "setLocalHour((autoSeoConfig as any).localHour ?? 9);\n      setCronHourUtc((autoSeoConfig as any).cronHourUtc ?? (autoSeoConfig as any).cronHour ?? 2);")
        sut = re.sub(r"\$\{cronHour \+ 7[^\}]+\}", "${String(localHour).padStart(2,\"0\")}", sut)
        sut = sut.replace(
            "`Bật — chạy hàng ngày lúc ${cronHour}:00 UTC (${cronHour + 7 > 23 ? cronHour + 7 - 24 : cronHour + 7}:00 giờ VN)`",
            "`Bật — chạy hàng ngày lúc ${String(localHour).padStart(2,\"0\")}:00 Việt Nam (${String(cronHourUtc).padStart(2,\"0\")}:00 UTC)`",
        )
        sut = sut.replace("value={cronHour}", "value={localHour}")
        sut = sut.replace("setCronHour(", "setLocalHour(")
        sut = sut.replace(
            "{cronHour + 7 > 23 ? cronHour + 7 - 24 : cronHour + 7}:00 giờ Việt Nam",
            "{String(localHour).padStart(2,\"0\")}:00 Việt Nam ({String(cronHourUtc).padStart(2,\"0\")}:00 UTC)",
        )
        sut = sut.replace(
            "saveAutoSeoConfigMutation.mutate({ enabled: scheduleEnabled, cronHour, maxAlbums, maxCreators, maxTags })",
            "saveAutoSeoConfigMutation.mutate({ enabled: scheduleEnabled, localHour, maxAlbums, maxCreators, maxTags })",
        )
        sut = sut.replace("Giờ chạy (UTC 0–23)", "Giờ chạy (Việt Nam 0–23)")
        seo_ui.write_text(sut)
        print("Patched AdminSeoBulk schedule UX")

# ── 9. Ensure site_settings timezone default ──────────────────────────────────
sql = """INSERT INTO site_settings (`key`, `value`, `updatedAt`) VALUES ('system.timezone', 'Asia/Ho_Chi_Minh', NOW()) ON DUPLICATE KEY UPDATE `key`=`key`;"""
subprocess.run(
    ["mysql", "-u", "cosplay", "-pCosplayDB2026", "cosplay_gallery", "-e", sql],
    check=False,
)

# ── 10. Migrate import_schedule_config: cronHour 10 UTC → localHour 17 ────────
migrate_py = '''
import json, subprocess
r = subprocess.run(["mysql","-u","cosplay","-pCosplayDB2026","cosplay_gallery","-N","-e","SELECT value FROM admin_settings WHERE `key`='import_schedule_config' LIMIT 1"], capture_output=True, text=True)
if r.stdout.strip():
    cfg = json.loads(r.stdout.strip())
    if "localHour" not in cfg and "cronHour" in cfg:
        cfg["localHour"] = (cfg["cronHour"] + 7) % 24  # legacy UTC→VN approx
        cfg["timezone"] = "Asia/Ho_Chi_Minh"
        val = json.dumps(cfg).replace("'", "\\\\'")
        subprocess.run(["mysql","-u","cosplay","-pCosplayDB2026","cosplay_gallery","-e", f"UPDATE admin_settings SET value='{val}' WHERE `key`='import_schedule_config'"], check=False)
        print("Migrated import_schedule_config localHour")
'''
exec(migrate_py)

print("POST UAT scheduler patch complete")
