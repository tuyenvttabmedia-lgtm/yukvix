function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function setTitle(html: string, title: string): string {
  const tag = `<title>${esc(title)}</title>`;
  if (/<title>[^<]*<\/title>/i.test(html)) return html.replace(/<title>[^<]*<\/title>/i, tag);
  return html.replace(/<head>/i, `<head>\n    ${tag}`);
}

function setMeta(html: string, attr: string, key: string, value: string): string {
  const tag = `<meta ${attr}="${key}" content="${esc(value)}" />`;
  const re = new RegExp(`<meta ${attr}="${key}" content="[^"]*"\\s*/>`, "i");
  if (re.test(html)) return html.replace(re, tag);
  return html.replace(/<head>/i, `<head>\n    ${tag}`);
}

function setLink(html: string, rel: string, href: string): string {
  const tag = `<link rel="${rel}" href="${esc(href)}" />`;
  const re = new RegExp(`<link rel="${rel}" href="[^"]*"\\s*/>`, "i");
  if (re.test(html)) return html.replace(re, tag);
  return html.replace(/<head>/i, `<head>\n    ${tag}`);
}

function applyMeta(
  html: string,
  title: string,
  desc: string | null | undefined,
  ogType: string,
  url: string,
  ogImage?: string | null,
  canonical?: string | null
): string {
  let out = setTitle(html, title);
  if (desc) out = setMeta(out, "name", "description", desc.substring(0, 160));
  out = setMeta(out, "property", "og:title", title);
  if (desc) out = setMeta(out, "property", "og:description", desc.substring(0, 160));
  out = setMeta(out, "property", "og:type", ogType);
  out = setMeta(out, "property", "og:url", url);
  if (ogImage) out = setMeta(out, "property", "og:image", ogImage);
  if (canonical) out = setLink(out, "canonical", canonical);
  return out;
}

export async function injectPageMeta(html: string, urlPath: string, siteUrl: string): Promise<string> {
  const base = siteUrl.replace(/\/$/, "");

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
        return applyMeta(html, title, desc, "article", `${base}/album/${slug}`, og, album.canonicalUrl);
      }
    }
    return html;
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
        return applyMeta(html, title, desc, "profile", `${base}/creator/${slug}`, og);
      }
    }
    return html;
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
        return applyMeta(html, title, desc, "website", `${base}/tag/${slug}`);
      }
    }
  }

  return html;
}
