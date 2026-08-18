/**
 * Express upload handler for photo and ZIP uploads.
 * Registered as /api/upload/* routes.
 */
import type { Express, Request, Response } from "express";
import multer from "multer";
import JSZip from "jszip";
import { sdk } from "./_core/sdk";
import { isAdmin } from "@shared/const";
import {
  createPhoto,
  createUploadJob,
  getAlbumById,
  setFreePreviewPhotos,
  updateAlbum,
  updateAlbumPhotoCount,
  updateUploadJob,
} from "./db";
import { deleteFromStorage, getPresignedPutUrl, getPublicUrl, isImageMimeType, uploadPhoto, uploadToStorage } from "./storage-wasabi";

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 500 * 1024 * 1024 }, // 500MB
});

function requireAdmin(req: Request, res: Response): boolean {
  const user = (req as any).user;
  if (!user || !isAdmin(user.role)) {
    res.status(403).json({ error: "Admin access required" });
    return false;
  }
  return true;
}

async function authMiddleware(req: Request, res: Response, next: Function) {
  try {
    const user = await sdk.authenticateRequest(req);
    (req as any).user = user;
    next();
  } catch {
    res.status(401).json({ error: "Unauthorized" });
  }
}

export function registerUploadRoutes(app: Express) {
  // --- Single photo upload ----------------------------------------------------
  app.post(
    "/api/upload/photo",
    authMiddleware,
    upload.single("file"),
    async (req: Request, res: Response) => {
      if (!requireAdmin(req, res)) return;

      const file = req.file;
      const albumId = parseInt(req.body.albumId);

      if (!file) {
        res.status(400).json({ error: "No file provided" });
        return;
      }

      if (!albumId || isNaN(albumId)) {
        res.status(400).json({ error: "Invalid albumId" });
        return;
      }

      const mimeType = file.mimetype || "image/jpeg";
      if (!isImageMimeType(mimeType)) {
        res.status(400).json({ error: "Invalid image type" });
        return;
      }

      try {
        const album = await getAlbumById(albumId);
        if (!album) {
          res.status(404).json({ error: "Album not found" });
          return;
        }

        const result = await uploadPhoto(albumId, file.buffer, file.originalname, mimeType);

        await createPhoto({
          albumId,
          originalKey: result.originalKey,
          originalUrl: result.originalUrl,
          webpKey: result.webpKey,
          webpUrl: result.webpUrl,
          mediumKey: result.mediumKey,
          mediumUrl: result.mediumUrl,
          thumbKey: result.thumbKey,
          thumbUrl: result.thumbUrl,
          width: result.width,
          height: result.height,
          fileSize: result.fileSize,
          mimeType: "image/webp",
          sortOrder: album.photoCount,
          isFreePreview: false,
        });

        // Update cover if first photo
        if (album.photoCount === 0) {
          await updateAlbum(albumId, { coverKey: result.thumbKey, coverUrl: result.thumbUrl });
        }

        await updateAlbumPhotoCount(albumId);
        await setFreePreviewPhotos(albumId, album.freePreviewCount);

        res.json({ success: true, thumbUrl: result.thumbUrl, webpUrl: result.webpUrl });
      } catch (err: any) {
        console.error("[Upload] Error:", err);
        res.status(500).json({ error: err.message || "Upload failed" });
      }
    }
  );

  // --- ZIP bulk upload --------------------------------------------------------
  app.post(
    "/api/upload/zip",
    authMiddleware,
    upload.single("file"),
    async (req: Request, res: Response) => {
      if (!requireAdmin(req, res)) return;

      const file = req.file;
      const albumId = parseInt(req.body.albumId);

      if (!file) {
        res.status(400).json({ error: "No file provided" });
        return;
      }
      if (!albumId || isNaN(albumId)) {
        res.status(400).json({ error: "Invalid albumId" });
        return;
      }

      const album = await getAlbumById(albumId);
      if (!album) {
        res.status(404).json({ error: "Album not found" });
        return;
      }

      const user = (req as any).user;
      const job = await createUploadJob(albumId, user.id, file.originalname);

      // Respond immediately with job ID
      res.json({ success: true, jobId: job!.id });

      // Process ZIP asynchronously
      processZipUpload(job!.id, albumId, file.buffer, album.freePreviewCount, album.photoCount).catch(
        (err) => console.error("[ZIP Upload] Fatal error:", err)
      );
    }
  );

  // --- Presigned PUT URL for large download ZIP (browser-to-S3 direct upload) ---
  app.post(
    "/api/upload/presign-download-zip",
    authMiddleware,
    async (req: Request, res: Response) => {
      if (!requireAdmin(req, res)) return;
      const { albumId, filename, contentType } = req.body;
      if (!albumId || isNaN(parseInt(albumId))) {
        res.status(400).json({ error: "Invalid albumId" });
        return;
      }
      const album = await getAlbumById(parseInt(albumId));
      if (!album) {
        res.status(404).json({ error: "Album not found" });
        return;
      }
      const ext = (filename || "download.zip").endsWith(".zip") ? ".zip" : ".zip";
      const key = `download-zips/${album.slug}-${Date.now()}${ext}`;
      // Presigned URL valid for 4 hours (enough for large files)
      const presignedUrl = await getPresignedPutUrl(key, contentType || "application/zip", 4 * 3600);
      if (!presignedUrl) {
        res.status(503).json({ error: "Wasabi storage not configured" });
        return;
      }
      // Delete old ZIP key (will clean up after confirm)
      res.json({ presignedUrl, key });
    }
  );

  // --- Confirm download ZIP after direct S3 upload ---------------------------
  app.post(
    "/api/upload/confirm-download-zip",
    authMiddleware,
    async (req: Request, res: Response) => {
      if (!requireAdmin(req, res)) return;
      const { albumId, key, fileSize } = req.body;
      if (!albumId || !key) {
        res.status(400).json({ error: "albumId and key are required" });
        return;
      }
      if (typeof key !== "string" || !key.startsWith("download-zips/")) {
        res.status(400).json({ error: "Invalid ZIP key" });
        return;
      }
      const album = await getAlbumById(parseInt(albumId));
      if (!album) {
        res.status(404).json({ error: "Album not found" });
        return;
      }
      try {
        // Delete old ZIP if exists
        if (album.zipKey && album.zipKey !== key) {
          await deleteFromStorage(album.zipKey).catch(() => {});
        }
        const zipUrl = getPublicUrl(key);
        await updateAlbum(parseInt(albumId), {
          zipKey: key,
          zipUrl,
          zipSize: fileSize ? parseInt(fileSize) : null,
          zipGeneratedAt: new Date(),
        });
        res.json({ success: true, zipUrl, key });
      } catch (err: any) {
        console.error("[Confirm Download ZIP] Error:", err);
        res.status(500).json({ error: err.message || "Failed to confirm ZIP" });
      }
    }
  );

  // --- Download ZIP upload (manual ZIP for album download, max 500MB) --------
  app.post(
    "/api/upload/download-zip",
    authMiddleware,
    upload.single("file"),
    async (req: Request, res: Response) => {
      if (!requireAdmin(req, res)) return;

      const file = req.file;
      const albumId = parseInt(req.body.albumId);

      if (!file) {
        res.status(400).json({ error: "No file provided" });
        return;
      }
      if (!albumId || isNaN(albumId)) {
        res.status(400).json({ error: "Invalid albumId" });
        return;
      }
      if (file.mimetype !== "application/zip" && !file.originalname.endsWith(".zip")) {
        res.status(400).json({ error: "Only ZIP files are allowed" });
        return;
      }

      const album = await getAlbumById(albumId);
      if (!album) {
        res.status(404).json({ error: "Album not found" });
        return;
      }

      try {
        // Delete old ZIP if exists
        if (album.zipKey) {
          await deleteFromStorage(album.zipKey).catch(() => {});
        }

        const zipKey = `download-zips/${album.slug}-${Date.now()}.zip`;
        const result = await uploadToStorage(zipKey, file.buffer, "application/zip");

        await updateAlbum(albumId, {
          zipKey: result.key,
          zipUrl: result.url,
          zipSize: file.buffer.length,
          zipGeneratedAt: new Date(),
        });

        res.json({
          success: true,
          zipUrl: result.url,
          zipKey: result.key,
          zipSize: file.buffer.length,
        });
      } catch (err: any) {
        console.error("[Download ZIP Upload] Error:", err);
        res.status(500).json({ error: err.message || "Upload failed" });
      }
    }
  );
}

async function processZipUpload(
  jobId: number,
  albumId: number,
  zipBuffer: Buffer,
  freePreviewCount: number,
  currentPhotoCount: number
) {
  try {
    await updateUploadJob(jobId, { status: "processing" });

    const zip = await JSZip.loadAsync(zipBuffer);
    const imageFiles: { name: string; file: JSZip.JSZipObject }[] = [];

    zip.forEach((relativePath, file) => {
      if (file.dir) return;
      const normalized = relativePath.replace(/\\/g, "/");
      if (
        normalized.includes("\0") ||
        normalized.startsWith("/") ||
        /^[a-zA-Z]:/.test(normalized) ||
        normalized.split("/").some((part) => part === "..")
      ) {
        return;
      }
      const ext = relativePath.split(".").pop()?.toLowerCase();
      if (["jpg", "jpeg", "png", "gif", "webp", "avif"].includes(ext || "")) {
        imageFiles.push({ name: relativePath, file });
      }
    });

    const MAX_ZIP_FILES = parseInt(process.env.UPLOAD_ZIP_MAX_FILES || "500", 10);
    const MAX_FILE_BYTES = parseInt(process.env.UPLOAD_ZIP_MAX_FILE_BYTES || String(50 * 1024 * 1024), 10);
    if (imageFiles.length > MAX_ZIP_FILES) {
      throw new Error(`ZIP contains too many images (${imageFiles.length}, max ${MAX_ZIP_FILES})`);
    }

    await updateUploadJob(jobId, { totalFiles: imageFiles.length, status: "processing" });

    let processed = 0;
    let coverSet = currentPhotoCount > 0;

    for (const { name, file } of imageFiles) {
      try {
        const buffer = Buffer.from(await file.async("arraybuffer"));
        if (buffer.length > MAX_FILE_BYTES) {
          console.warn(`[ZIP Upload] Skipping oversized file ${name} (${buffer.length} bytes)`);
          continue;
        }
        const fileName = name.split("/").pop() || name;
        const ext = fileName.split(".").pop()?.toLowerCase() || "jpg";
        const mimeMap: Record<string, string> = {
          jpg: "image/jpeg",
          jpeg: "image/jpeg",
          png: "image/png",
          gif: "image/gif",
          webp: "image/webp",
          avif: "image/avif",
        };
        const mimeType = mimeMap[ext] || "image/jpeg";

        const result = await uploadPhoto(albumId, buffer, fileName, mimeType);

        await createPhoto({
          albumId,
          originalKey: result.originalKey,
          originalUrl: result.originalUrl,
          webpKey: result.webpKey,
          webpUrl: result.webpUrl,
          mediumKey: result.mediumKey,
          mediumUrl: result.mediumUrl,
          thumbKey: result.thumbKey,
          thumbUrl: result.thumbUrl,
          width: result.width,
          height: result.height,
          fileSize: result.fileSize,
          mimeType: "image/webp",
          sortOrder: currentPhotoCount + processed,
          isFreePreview: false,
        });

        if (!coverSet) {
          await updateAlbum(albumId, { coverKey: result.thumbKey, coverUrl: result.thumbUrl });
          coverSet = true;
        }

        processed++;
        await updateUploadJob(jobId, { processedFiles: processed });
      } catch (err: any) {
        console.error(`[ZIP Upload] Failed to process ${name}:`, err.message);
      }
    }

    await updateAlbumPhotoCount(albumId);
    await setFreePreviewPhotos(albumId, freePreviewCount);
    await updateUploadJob(jobId, { status: "completed", processedFiles: processed });
  } catch (err: any) {
    console.error("[ZIP Upload] Error:", err);
    await updateUploadJob(jobId, { status: "failed", errorMessage: err.message });
  }
}
