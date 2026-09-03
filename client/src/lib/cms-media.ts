/** Same-origin proxy for CMS assets stored in a private Wasabi bucket. */
export const CMS_MEDIA_PREFIX = "/api/cms-media/";
export const CMS_MAX_UPLOAD_BYTES = 2 * 1024 * 1024;

export function cmsDisplayUrl(url: string | null | undefined): string {
  if (!url) return "";
  if (url.startsWith(CMS_MEDIA_PREFIX)) return url;
  try {
    const path = url.startsWith("http://") || url.startsWith("https://")
      ? new URL(url).pathname
      : url;
    const idx = path.indexOf("/cms/");
    if (idx >= 0) {
      const key = decodeURIComponent(path.slice(idx + 1).split("?")[0]);
      if (/^cms\/[A-Za-z0-9._\-/]+$/.test(key) && !key.includes("..")) {
        return `${CMS_MEDIA_PREFIX}${key}`;
      }
    }
  } catch {
    /* keep original */
  }
  return url;
}

export function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || "");
      const comma = result.indexOf(",");
      resolve(comma >= 0 ? result.slice(comma + 1) : result);
    };
    reader.onerror = () => reject(new Error("Không đọc được file"));
    reader.readAsDataURL(file);
  });
}
