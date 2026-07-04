/**
 * Server-side JSON-LD injection (SEO Foundation Phase B).
 */

function escJson(s: string): string {
  return s.replace(/</g, "\\u003c");
}

export function injectJsonLd(html: string, schemas: Record<string, unknown> | Record<string, unknown>[]): string {
  const payload = Array.isArray(schemas) ? schemas : [schemas];
  const tag = `<script type="application/ld+json">${escJson(JSON.stringify(payload.length === 1 ? payload[0] : payload))}</script>`;
  if (/<script type="application\/ld\+json">/i.test(html)) {
    return html.replace(/<script type="application\/ld\+json">[\s\S]*?<\/script>/i, tag);
  }
  return html.replace(/<\/head>/i, `  ${tag}\n  </head>`);
}

export function buildWebSiteSchema(baseUrl: string) {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: "Yukvix",
    url: baseUrl,
    description:
      "Discover thousands of stunning cosplay photos from talented cosplayers worldwide. Join VIP for exclusive high-resolution galleries.",
    potentialAction: {
      "@type": "SearchAction",
      target: {
        "@type": "EntryPoint",
        urlTemplate: `${baseUrl}/search?q={search_term_string}`,
      },
      "query-input": "required name=search_term_string",
    },
  };
}

export function buildOrganizationSchema(baseUrl: string) {
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: "Yukvix",
    url: baseUrl,
    logo: `${baseUrl}/favicon.ico`,
  };
}

export function buildImageGallerySchema(opts: {
  name: string;
  description?: string;
  url: string;
  images: Array<{ url: string; caption?: string; width?: number; height?: number }>;
  author?: string;
  datePublished?: string;
  dateModified?: string;
}) {
  return {
    "@context": "https://schema.org",
    "@type": "ImageGallery",
    name: opts.name,
    description: opts.description,
    url: opts.url,
    author: opts.author ? { "@type": "Person", name: opts.author } : undefined,
    datePublished: opts.datePublished,
    dateModified: opts.dateModified,
    image: opts.images.map((img) => ({
      "@type": "ImageObject",
      url: img.url,
      caption: img.caption,
      width: img.width,
      height: img.height,
    })),
  };
}

export function buildBreadcrumbSchema(items: Array<{ name: string; url: string }>) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, idx) => ({
      "@type": "ListItem",
      position: idx + 1,
      name: item.name,
      item: item.url,
    })),
  };
}

export function buildPersonSchema(opts: {
  name: string;
  url?: string;
  image?: string;
  description?: string;
}) {
  return {
    "@context": "https://schema.org",
    "@type": "Person",
    name: opts.name,
    url: opts.url,
    image: opts.image,
    description: opts.description,
    jobTitle: "Cosplayer",
  };
}

export function buildCollectionPageSchema(opts: {
  name: string;
  description?: string;
  url: string;
}) {
  return {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: opts.name,
    description: opts.description,
    url: opts.url,
  };
}
