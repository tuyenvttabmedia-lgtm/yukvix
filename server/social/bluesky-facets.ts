/** AT Protocol rich-text facets use UTF-8 byte offsets, not JS string indexes. */

const URL_RE = /https?:\/\/[^\s<>"'`]+/gi;

export type BlueskyLinkFacet = {
  index: { byteStart: number; byteEnd: number };
  features: Array<{ $type: "app.bsky.richtext.facet#link"; uri: string }>;
};

function stripTrailingPunctuation(url: string): string {
  return url.replace(/[),.;:!?]+$/g, "");
}

export function buildBlueskyLinkFacets(text: string): BlueskyLinkFacet[] {
  const facets: BlueskyLinkFacet[] = [];
  const re = new RegExp(URL_RE.source, URL_RE.flags);
  let match: RegExpExecArray | null;
  while ((match = re.exec(text)) !== null) {
    const url = stripTrailingPunctuation(match[0]);
    if (!url) continue;
    try {
      const parsed = new URL(url);
      if (parsed.protocol !== "http:" && parsed.protocol !== "https:") continue;
    } catch {
      continue;
    }
    const byteStart = Buffer.byteLength(text.slice(0, match.index), "utf8");
    const byteEnd = byteStart + Buffer.byteLength(url, "utf8");
    facets.push({
      index: { byteStart, byteEnd },
      features: [{ $type: "app.bsky.richtext.facet#link", uri: url }],
    });
  }
  return facets;
}
