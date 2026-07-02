import { Helmet } from "react-helmet-async";

interface SeoHeadProps {
  /** Page title — will be appended with " | Yukvix" unless isHome=true */
  title?: string;
  /** Meta description (max 160 chars recommended) */
  description?: string;
  /** Comma-separated keywords */
  keywords?: string;
  /** Canonical URL (full URL including https://) */
  canonical?: string;
  /** OG image URL (absolute) */
  ogImage?: string;
  /** OG type: website | article | profile */
  ogType?: "website" | "article" | "profile";
  /** Twitter card type */
  twitterCard?: "summary" | "summary_large_image";
  /** JSON-LD structured data object */
  jsonLd?: Record<string, unknown> | Record<string, unknown>[];
  /** If true, use title as-is without appending site name */
  isHome?: boolean;
  /** noindex: true to prevent indexing (e.g. admin pages) */
  noIndex?: boolean;
  /** HTML lang attribute override (e.g. "ja", "ko", "zh-CN") */
  lang?: string;
}

const SITE_NAME = "Yukvix";
const DEFAULT_DESCRIPTION =
  "Discover thousands of stunning cosplay photos from talented cosplayers worldwide. Join VIP for exclusive high-resolution galleries.";
const DEFAULT_OG_IMAGE = "/og-default.jpg";

export default function SeoHead({
  title,
  description = DEFAULT_DESCRIPTION,
  keywords,
  canonical,
  ogImage = DEFAULT_OG_IMAGE,
  ogType = "website",
  twitterCard = "summary_large_image",
  jsonLd,
  isHome = false,
  noIndex = false,
  lang,
}: SeoHeadProps) {
  const fullTitle = isHome
    ? `${SITE_NAME} — Premium Cosplay Gallery`
    : title
    ? `${title} | ${SITE_NAME}`
    : SITE_NAME;

  const metaDesc = description.length > 160 ? description.slice(0, 157) + "..." : description;

  // Serialize JSON-LD: support single object or array
  const jsonLdString = jsonLd
    ? JSON.stringify(Array.isArray(jsonLd) ? jsonLd : jsonLd)
    : null;

  return (
    <Helmet>
      {lang && <html lang={lang} />}
      <title>{fullTitle}</title>
      <meta name="description" content={metaDesc} />
      {keywords && <meta name="keywords" content={keywords} />}
      {noIndex ? (
        <meta name="robots" content="noindex, nofollow" />
      ) : (
        <meta name="robots" content="index, follow" />
      )}

      {/* Canonical */}
      {canonical && <link rel="canonical" href={canonical} />}

      {/* Open Graph */}
      <meta property="og:site_name" content={SITE_NAME} />
      <meta property="og:type" content={ogType} />
      <meta property="og:title" content={fullTitle} />
      <meta property="og:description" content={metaDesc} />
      {ogImage && <meta property="og:image" content={ogImage} />}
      {ogImage && <meta property="og:image:alt" content={fullTitle} />}
      {canonical && <meta property="og:url" content={canonical} />}

      {/* Twitter Card */}
      <meta name="twitter:card" content={twitterCard} />
      <meta name="twitter:title" content={fullTitle} />
      <meta name="twitter:description" content={metaDesc} />
      {ogImage && <meta name="twitter:image" content={ogImage} />}
      {ogImage && <meta name="twitter:image:alt" content={fullTitle} />}

      {/* JSON-LD Structured Data */}
      {jsonLdString && (
        <script type="application/ld+json">{jsonLdString}</script>
      )}
    </Helmet>
  );
}

// -- JSON-LD builder helpers ----------------------------------------------------

export function buildWebSiteSchema(baseUrl: string) {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: SITE_NAME,
    url: baseUrl,
    description: DEFAULT_DESCRIPTION,
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
    author: opts.author
      ? { "@type": "Person", name: opts.author }
      : undefined,
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

export function buildBreadcrumbSchema(
  items: Array<{ name: string; url: string }>
) {
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
