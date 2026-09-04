import { getPublicSiteUrl } from "../_core/site-url";
import type {
  ComposedContent,
  PolicyInputAlbum,
  SocialPlatform,
} from "./types";

function albumUrl(album: PolicyInputAlbum): string {
  const base = getPublicSiteUrl().replace(/\/$/, "");
  return `${base}/album/${album.slug || album.id}`;
}

function baseLines(album: PolicyInputAlbum): string[] {
  const lines = [album.title?.trim() || "Yukvix album"];
  const meta = [album.cosplayer, album.character, album.series]
    .filter(Boolean)
    .join(" · ");
  if (meta) lines.push(meta);
  lines.push(albumUrl(album));
  return lines;
}

function clip(text: string, max: number): string {
  if (text.length <= max) return text;
  return `${text.slice(0, Math.max(0, max - 1)).trimEnd()}…`;
}

/** Keep the trailing CTA/URL when clipping so Telegram posts do not lose the album link. */
export function clipCaptionPreservingCta(text: string, max: number): string {
  if (max <= 0) return "";
  if (text.length <= max) return text;
  const lines = text.split("\n");
  const cta = lines.at(-1) ?? "";
  const isUrl = /^https?:\/\//i.test(cta);
  if (!isUrl) return clip(text, max);
  if (cta.length >= max) return clip(cta, max);
  const body = lines.slice(0, -1).join("\n");
  const bodyBudget = max - 1 - cta.length;
  if (bodyBudget <= 0) return cta;
  const clippedBody = clip(body, bodyBudget);
  return clippedBody ? `${clippedBody}\n${cta}` : cta;
}

export function composeSocialContent(
  platform: SocialPlatform,
  album: PolicyInputAlbum,
  opts?: { requiresSensitive?: boolean; maxCaptionLength?: number }
): ComposedContent {
  const max = opts?.maxCaptionLength ?? 500;
  const sensitive = Boolean(opts?.requiresSensitive);
  const body = baseLines(album).join("\n");

  switch (platform) {
    case "telegram":
      return {
        caption: clipCaptionPreservingCta(body, max),
        labels: sensitive ? { sensitive: true } : undefined,
        metadata: { platform },
      };
    case "mastodon": {
      const cw = sensitive ? "Mature / 18+\n\n" : "";
      return {
        caption: clipCaptionPreservingCta(`${cw}${body}`, max),
        labels: sensitive
          ? { sensitive: true, contentWarning: "Mature / 18+" }
          : undefined,
        metadata: { platform },
      };
    }
    case "bluesky":
      return {
        caption: clipCaptionPreservingCta(body, max),
        labels: sensitive
          ? { sensitive: true, contentWarning: "adult" }
          : undefined,
        metadata: { platform },
      };
    case "x":
      return {
        caption: clipCaptionPreservingCta(body, Math.min(max, 280)),
        labels: sensitive ? { sensitive: true } : undefined,
        metadata: { platform },
      };
  }
}
