import { TRPCError } from "@trpc/server";
import { createRequire } from "module";
const require = createRequire(import.meta.url);
const { ZipArchive } = require("archiver") as { ZipArchive: new (opts?: object) => import("stream").Transform & { append(source: Buffer, opts: { name: string }): void; finalize(): Promise<void>; on(event: string, cb: (...args: any[]) => void): any; pipe(dest: any): any } };
import { PassThrough } from "stream";
import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import {
  getAlbumById,
  getAlbumMediaItems,
  getDownloadHistory,
  getUserById,
  logDownload,
  updateAlbum,
} from "../db";
import { getSignedMediaUrl, uploadToStorage } from "../storage-wasabi";
import { isAdmin, isVipOrAdmin } from '@shared/const';

function isVipUser(role: string) {
  return isVipOrAdmin(role);
}

/**
 * Stream-download a URL and return a Buffer.
 * Uses AbortController for 30s timeout per file.
 */
async function fetchBuffer(url: string): Promise<Buffer> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30_000);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
    const arrayBuf = await res.arrayBuffer();
    return Buffer.from(arrayBuf);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Build a ZIP from all media items of an album and upload to Wasabi.
 * Returns { zipKey, zipUrl, zipSize }.
 */
async function buildAndUploadZip(albumId: number, albumSlug: string): Promise<{ zipKey: string; zipUrl: string; zipSize: number }> {
  const mediaItems = await getAlbumMediaItems(albumId);
  if (mediaItems.length === 0) throw new TRPCError({ code: "NOT_FOUND", message: "No images in album" });

  // Collect signed/public URLs for each item
  const urls: { filename: string; url: string }[] = [];
  for (let i = 0; i < mediaItems.length; i++) {
    const item = mediaItems[i];
    // Prefer webp for VIP albums, fall back to original
    let url = item.webpUrl || item.originalUrl || "";
    if (item.webpKey) {
      try {
        url = await getSignedMediaUrl(item.webpKey, 3600);
      } catch {
        url = item.webpUrl || item.originalUrl || "";
      }
    }
    if (!url) continue;
    const ext = item.webpKey ? "webp" : (item.filename.split(".").pop() || "jpg");
    const filename = `${String(i + 1).padStart(3, "0")}-${item.filename.replace(/\.[^.]+$/, "")}.${ext}`;
    urls.push({ filename, url });
  }

  if (urls.length === 0) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "No downloadable images" });

  // Build ZIP in memory using archiver + PassThrough stream
  const chunks: Buffer[] = [];
  await new Promise<void>((resolve, reject) => {
    const passThrough = new PassThrough();
    passThrough.on("data", (chunk: Buffer) => chunks.push(chunk));
    passThrough.on("end", resolve);
    passThrough.on("error", reject);

    const archive = new ZipArchive({ zlib: { level: 6 } });
    archive.on("error", reject);
    archive.pipe(passThrough);

    // Add files sequentially to avoid memory spike
    (async () => {
      for (const { filename, url } of urls) {
        try {
          const buf = await fetchBuffer(url);
          archive.append(buf, { name: filename });
        } catch (err) {
          console.warn(`[ZIP] Skipping ${filename}: ${(err as Error).message}`);
        }
      }
      await archive.finalize();
    })().catch(reject);
  });

  const zipBuffer = Buffer.concat(chunks);
  const zipKey = `zips/${albumSlug}-${Date.now()}.zip`;
  const result = await uploadToStorage(zipKey, zipBuffer, "application/zip");

  return { zipKey: result.key, zipUrl: result.url, zipSize: zipBuffer.length };
}

export const downloadsRouter = router({
  // --- VIP: Generate or get cached ZIP download URL ---------------------------
  getZipUrl: protectedProcedure
    .input(z.object({ albumId: z.number() }))
    .mutation(async ({ input, ctx }) => {
      if (!isVipUser(ctx.user.role)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "VIP membership required to download" });
      }

      // Require email verification before allowing download
      const user = await getUserById(ctx.user.id);
      if (user && user.email && !user.emailVerified) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: JSON.stringify({
            type: "EMAIL_NOT_VERIFIED",
            message: "You need to verify your email before downloading.",
          }),
        });
      }

      const album = await getAlbumById(input.albumId);
      if (!album || album.status !== "published") {
        throw new TRPCError({ code: "NOT_FOUND", message: "Album not found" });
      }

      // If album already has a ZIP URL (manually uploaded or previously generated), use it directly
      if (album.zipUrl && album.zipKey) {
        // Generate a short-lived presigned GET URL (15 min) so the link cannot be shared
        const presignedUrl = await getSignedMediaUrl(album.zipKey, 15 * 60);
        await logDownload(ctx.user.id, album.id, album.zipSize ?? undefined);
        return { zipUrl: presignedUrl, zipSize: album.zipSize, cached: true };
      }

      // album.zipUrl set but no zipKey (legacy /manus-storage/ URL) — serve as-is
      if (album.zipUrl) {
        await logDownload(ctx.user.id, album.id, album.zipSize ?? undefined);
        return { zipUrl: album.zipUrl, zipSize: album.zipSize, cached: true };
      }

      // Generate new ZIP
      const { zipKey, zipUrl, zipSize } = await buildAndUploadZip(album.id, album.slug);

      // Cache ZIP metadata on album
      await updateAlbum(album.id, {
        zipKey,
        zipUrl,
        zipSize,
        zipGeneratedAt: new Date(),
      });

      // Log download — also generate presigned URL for the new ZIP
      await logDownload(ctx.user.id, album.id, zipSize);
      const presignedUrl = await getSignedMediaUrl(zipKey, 15 * 60);

      return { zipUrl: presignedUrl, zipSize, cached: false };
    }),

  // --- VIP: Get ZIP status (has cached ZIP?) ----------------------------------
  zipStatus: protectedProcedure
    .input(z.object({ albumId: z.number() }))
    .query(async ({ input, ctx }) => {
      if (!isVipUser(ctx.user.role)) return { hasZip: false, zipSize: null };
      const album = await getAlbumById(input.albumId);
      if (!album) return { hasZip: false, zipSize: null };
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      const hasZip = !!(album.zipUrl && album.zipGeneratedAt && album.zipGeneratedAt > sevenDaysAgo);
      return { hasZip, zipSize: album.zipSize ?? null };
    }),

  // --- User: Download history -------------------------------------------------
  myHistory: protectedProcedure
    .input(z.object({ page: z.number().min(1).default(1), limit: z.number().min(1).max(50).default(20) }).optional())
    .query(async ({ input, ctx }) => {
      const { page = 1, limit = 20 } = input ?? {};
      return getDownloadHistory(ctx.user.id, page, limit);
    }),

  // --- Admin: Regenerate ZIP for album ---------------------------------------
  adminRegenerateZip: protectedProcedure
    .input(z.object({ albumId: z.number() }))
    .mutation(async ({ input, ctx }) => {
      if (!isAdmin(ctx.user.role)) throw new TRPCError({ code: "FORBIDDEN" });
      const album = await getAlbumById(input.albumId);
      if (!album) throw new TRPCError({ code: "NOT_FOUND" });

      const { zipKey, zipUrl, zipSize } = await buildAndUploadZip(album.id, album.slug);
      await updateAlbum(album.id, { zipKey, zipUrl, zipSize, zipGeneratedAt: new Date() });
      return { zipUrl, zipSize };
    }),
});
