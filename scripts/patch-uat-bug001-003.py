#!/usr/bin/env python3
"""UAT Round 1 — BUG-001 CopySource, BUG-002 Cancel, BUG-003 SEO parser."""
from pathlib import Path

ROOT = Path("/var/www/cosplay-gallery")

# ── BUG-001: storage-wasabi copyObject URL-encode ─────────────────────────────
wasabi = ROOT / "server/storage-wasabi.ts"
text = wasabi.read_text()
if "encodeURIComponent" not in text or "function buildCopySource" not in text:
    helper = """
/** URL-encode CopySource for keys with spaces/parentheses/non-ASCII (UAT BUG-001). */
function buildCopySource(bucket: string, key: string): string {
  return encodeURIComponent(`${bucket}/${key}`);
}
"""
    if "function buildCopySource" not in text:
        text = text.replace(
            "export async function copyObject(sourceKey: string, destKey: string): Promise<void> {",
            helper + "\nexport async function copyObject(sourceKey: string, destKey: string): Promise<void> {",
        )
    text = text.replace(
        "CopySource: `${WASABI_BUCKET}/${sourceKey}`,",
        "CopySource: buildCopySource(WASABI_BUCKET, sourceKey),",
    )
    wasabi.write_text(text)
    print("patched storage-wasabi.ts CopySource")

# ── BUG-002: cancel mutation ────────────────────────────────────────────────
router = ROOT / "server/routers/zip-import.ts"
rtext = router.read_text()
old_cancel = """  cancel: adminProcedure
    .input(z.object({ jobId: z.number().int().positive() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB not available" });

      const job = await db
        .select({ status: zipImportJobs.status })
        .from(zipImportJobs)
        .where(eq(zipImportJobs.id, input.jobId))
        .limit(1);

      if (!job[0]) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Job not found" });
      }

      const cancellableStatuses = ["uploaded", "waiting", "scheduled", "processing"];
      if (!cancellableStatuses.includes(job[0].status)) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Cannot cancel job in status: ${job[0].status}`,
        });
      }

      await db
        .update(zipImportJobs)
        .set({ cancelRequested: true, updatedAt: new Date() })
        .where(eq(zipImportJobs.id, input.jobId));

      return { success: true };
    }),"""

new_cancel = """  cancel: adminProcedure
    .input(z.object({ jobId: z.number().int().positive() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB not available" });

      const job = await db
        .select({ status: zipImportJobs.status, importLogs: zipImportJobs.importLogs })
        .from(zipImportJobs)
        .where(eq(zipImportJobs.id, input.jobId))
        .limit(1);

      if (!job[0]) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Job not found" });
      }

      const { status } = job[0];

      if (status === "processing" || status === "waiting_disk_space") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Không thể hủy job đang xử lý. Vui lòng đợi hoàn thành hoặc thất bại.",
        });
      }

      const cancellable = ["uploaded", "waiting", "scheduled"];
      if (!cancellable.includes(status)) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Cannot cancel job in status: ${status}`,
        });
      }

      const logs: string[] = job[0].importLogs ? JSON.parse(job[0].importLogs) : [];
      logs.push(`[${new Date().toISOString()}] [Cancel] Job cancelled by admin`);

      await db
        .update(zipImportJobs)
        .set({
          status: "cancelled",
          cancelRequested: true,
          completedAt: new Date(),
          importLogs: JSON.stringify(logs),
          updatedAt: new Date(),
        })
        .where(eq(zipImportJobs.id, input.jobId));

      return { success: true, status: "cancelled" as const };
    }),"""

if old_cancel in rtext:
    rtext = rtext.replace(old_cancel, new_cancel)
    router.write_text(rtext)
    print("patched zip-import.ts cancel")
else:
    print("cancel patch skipped (already applied or format changed)")

# ── BUG-002: Admin UI cancel feedback ───────────────────────────────────────
admin = ROOT / "client/src/pages/admin/AdminZipImport.tsx"
atext = admin.read_text()
if "onError:" not in atext.split("cancelMutation")[1].split("useMutation")[1][:200]:
    atext = atext.replace(
        "const cancelMutation = trpc.zipImport.cancel.useMutation({\n    onSuccess: () => refetch(),\n  });",
        "const cancelMutation = trpc.zipImport.cancel.useMutation({\n    onSuccess: () => refetch(),\n    onError: (e) => toast.error(e.message),\n  });",
    )
    atext = atext.replace(
        '["uploaded", "waiting", "scheduled", "processing"].includes(job.status)',
        '["uploaded", "waiting", "scheduled"].includes(job.status)',
        1,
    )
    admin.write_text(atext)
    print("patched AdminZipImport.tsx cancel UI")

# ── BUG-003: preserve AI albumTitle in parser ───────────────────────────────
seo_gen = ROOT / "server/services/seo-generator.ts"
stext = seo_gen.read_text()
stext = stext.replace(
    "  data.albumTitle = cleaned;\n  data.publishStatus = \"draft\";",
    "  if (!data.albumTitle || data.albumTitle.length < 3) data.albumTitle = cleaned;\n  data.publishStatus = \"draft\";",
)
seo_gen.write_text(stext)
print("patched seo-generator.ts parseAndValidateSeoResponse")

print("UAT patches done")
