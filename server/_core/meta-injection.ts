function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function injectTag(html: string, tag: string): string {
  if (html.includes(tag)) return html;
  return html.replace(/<head>/i, `<head>\n    ${tag}`);
}

export async function injectPageMeta(html: string, urlPath: string, siteUrl: string): Promise<string> {
  const base = siteUrl.replace(/\/$/, "");
  let out = html;

  const albumMatch = urlPath.match(/^\/album\/([^/?#]+)/);
  if (albumMatch) {
    const slug = decodeURIComponent(albumMatch[1]);
    const { getDb } = await import("../db.js");
    const { albums } = await import("../../drizzle/schema.js");
    const { eq } = await import("drizzle-orm");
    const db = await getDb();
    if (db) {
      const rows = await db.select().from(albums).where(eq(albums.slug, slug)).limit(1);
      const album = rows[0];
      if (album) {
        const title = album.seoTitle || album.title || "Album";
        const desc = album.seoDescription || album.description || "";
        const og = album.ogImage || album.coverUrl || "";
        out = injectTag(out, `<title>${esc(title)}</title>`);
        if (desc) out = injectTag(out, `<meta name="description" content="${esc(desc)}" />`);
        out = injectTag(out, `<meta property="og:title" content="${esc(title)}" />`);
        if (desc) out = injectTag(out, `<meta property="og:description" content="${esc(desc)}" />`);
        out = injectTag(out, `<meta property="og:type" content="article" />`);
        out = injectTag(out, `<meta property="og:url" content="${esc(`${base}/album/${slug}`)}" />`);
        if (og) out = injectTag(out, `<meta property="og:image" content="${esc(og)}" />`);
        if (album.canonicalUrl) out = injectTag(out, `<link rel="canonical" href="${esc(album.canonicalUrl)}" />`);
      }
    }
    return out;
  }

  const creatorMatch = urlPath.match(/^\/creator\/([^/?#]+)/);
  if (creatorMatch) {
    const slug = decodeURIComponent(creatorMatch[1]);
    const { getDb } = await import("../db.js");
    const { creators } = await import("../../drizzle/schema.js");
    const { eq } = await import("drizzle-orm");
    const db = await getDb();
    if (db) {
      const rows = await db.select().from(creators).where(eq(creators.slug, slug)).limit(1);
      const creator = rows[0];
      if (creator) {
        const title = creator.seoTitle || creator.name || "Creator";
        const desc = creator.seoDescription || creator.bio || "";
        const og = creator.ogImage || creator.avatarUrl || "";
        out = injectTag(out, `<title>${esc(title)}</title>`);
        if (desc) out = injectTag(out, `<meta name="description" content="${esc(desc.substring(0, 160))}" />`);
        out = injectTag(out, `<meta property="og:title" content="${esc(title)}" />`);
        if (desc) out = injectTag(out, `<meta property="og:description" content="${esc(desc.substring(0, 160))}" />`);
        out = injectTag(out, `<meta property="og:type" content="profile" />`);
        out = injectTag(out, `<meta property="og:url" content="${esc(`${base}/creator/${slug}`)}" />`);
        if (og) out = injectTag(out, `<meta property="og:image" content="${esc(og)}" />`);
      }
    }
    return out;
  }

  const tagMatch = urlPath.match(/^\/tag\/([^/?#]+)/);
  if (tagMatch) {
    const slug = decodeURIComponent(tagMatch[1]);
    const { getDb } = await import("../db.js");
    const { tags } = await import("../../drizzle/schema.js");
    const { eq } = await import("drizzle-orm");
    const db = await getDb();
    if (db) {
      const rows = await db.select().from(tags).where(eq(tags.slug, slug)).limit(1);
      const tag = rows[0];
      if (tag) {
        const title = tag.seoTitle || tag.name || "Tag";
        const desc = tag.seoDescription || tag.description || "";
        out = injectTag(out, `<title>${esc(title)}</title>`);
        if (desc) out = injectTag(out, `<meta name="description" content="${esc(desc.substring(0, 160))}" />`);
        out = injectTag(out, `<meta property="og:title" content="${esc(title)}" />`);
        out = injectTag(out, `<meta property="og:url" content="${esc(`${base}/tag/${slug}`)}" />`);
      }
    }
  }

  return out;
}
