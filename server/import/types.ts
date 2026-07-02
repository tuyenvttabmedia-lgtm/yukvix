/**
 * Import Pipeline — Shared Types
 */

export interface CrawlConfig {
  sourceId?: number;
  sourceUrl: string;
  jobId: number;
  // Selectors
  titleSelector?: string;
  contentSelector?: string;
  imageSelector?: string;
  nextPageSelector?: string;
  tagSelector?: string;
  creatorSelector?: string;
  publishDateSelector?: string;
  // Pagination
  paginationType: "next_page" | "numbered" | "infinite_scroll" | "none";
  // URL pattern for numbered pagination: [url]/[page]/ or [url]/page/[page]/
  pageUrlPattern?: string;
  maxPages: number;
  crawlDelayMs: number;
  // Content area selector: limit image extraction to this container
  contentAreaSelector?: string;
  // Browser settings
  requiresBrowser: boolean;
  userAgent?: string;
  cookieString?: string;
  // Filters
  crawlStartDate?: Date;
  crawlEndDate?: Date;
  keywordFilter?: string;
  creatorFilter?: string;
}

export interface ExtractedPage {
  url: string;
  title?: string;
  creator?: string;
  tags?: string[];
  publishDate?: Date;
  images: ExtractedImage[];
  nextPageUrl?: string;
  pageNumber?: number;
}

export interface ExtractedImage {
  url: string;
  alt?: string;
  width?: number;
  height?: number;
}

export interface CrawlResult {
  pages: ExtractedPage[];
  allImages: ExtractedImage[];
  title?: string;
  creator?: string;
  tags?: string[];
  publishDate?: Date;
  totalPages: number;
  stoppedReason?: "max_pages" | "date_filter" | "no_more_pages" | "error";
}

export interface DownloadedImage {
  originalUrl: string;
  localPath: string;
  filename: string;
  mimeType: string;
  fileSize: number;
  md5: string;
}

export interface ProcessedImage {
  originalUrl: string;
  wasabiOriginalKey: string;
  wasabiThumbKey: string;
  wasabiWebpKey: string;
  originalPublicUrl: string;
  thumbPublicUrl: string;
  webpPublicUrl: string;
  width: number;
  height: number;
  fileSize: number;
  mimeType: string;
  md5: string;
  pHash?: string;
}

export interface GeneratedSeo {
  title: string;
  slug: string;
  description: string;
  tags: string[];
  creator?: string;
  altTexts: string[];
  ogTitle: string;
  ogDescription: string;
}
