/**
 * Import Pipeline Queue System
 * Uses p-queue (in-process) — no Redis required.
 * Jobs are processed sequentially in the same Node.js process.
 */
import PQueue from "p-queue";

// --- Queue Names --------------------------------------------------------------

export const QUEUE_NAMES = {
  CRAWL: "import:crawl",
  DOWNLOAD: "import:download",
  PROCESS: "import:process",
  SEO: "import:seo",
  PUBLISH: "import:publish",
} as const;

// --- Job Data Types -----------------------------------------------------------

export interface CrawlJobData {
  jobId: number;
  sourceUrl: string;
  sourceId?: number;
  categoryId?: number; // local site category to assign the album to
  titleCleanupRules?: Array<{ find: string; replace: string }>; // patterns to strip from raw title
  config: {
    titleSelector?: string;
    contentSelector?: string;
    imageSelector?: string;
    nextPageSelector?: string;
    tagSelector?: string;
    creatorSelector?: string;
    publishDateSelector?: string;
    paginationType: "next_page" | "numbered" | "infinite_scroll" | "none";
    pageUrlPattern?: string;
    contentAreaSelector?: string;
    maxPages: number;
    crawlDelayMs: number;
    requiresBrowser: boolean;
    userAgent?: string;
    cookieString?: string;
    crawlStartDate?: string;
    crawlEndDate?: string;
    keywordFilter?: string;
    creatorFilter?: string;
  };
}

export interface DownloadJobData {
  jobId: number;
  images: Array<{ url: string; alt?: string }>;
  referer: string;
  userAgent?: string;
  /** Preliminary slug hint derived from raw title — passed through to process-worker */
  albumSlugHint?: string;
}

export interface ProcessJobData {
  jobId: number;
  /** Preliminary slug hint derived from raw title — used for SEO file naming (yukvix-[slug]-[n].webp) */
  albumSlugHint?: string;
  downloadedFiles: Array<{
    localPath: string;
    originalUrl: string;
    filename: string;
    mimeType: string;
    fileSize: number;
    md5: string;
  }>;
}

export interface SeoJobData {
  jobId: number;
  rawTitle?: string;
  rawCreator?: string;
  rawTags?: string[];
  imageCount: number;
  categoryId?: number;
  defaultVip?: boolean; // inherited from source config
  freePreviewCount?: number | null; // inherited from source config; null = use Album Defaults
  titleCleanupRules?: Array<{ find: string; replace: string }>;
  processedImages: Array<{
    originalUrl: string;
    wasabiThumbKey: string;
    thumbPublicUrl: string;
  }>;
}

export interface PublishJobData {
  jobId: number;
  title: string;
  slug: string;
  description: string;
  creator?: string;
  tags: string[];
  categoryId?: number; // local site category to assign the album to
  defaultVip?: boolean; // if true, album will be created as VIP
  freePreviewCount?: number | null; // number of free preview photos; null = use Album Defaults
  altTexts: string[];
  processedImages: Array<{
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
  }>;
  scheduledPublishAt?: string;
}

// --- Cancellation Registry ---------------------------------------------------
// When a job is cancelled, its jobId is added here so workers can check and stop early.
const cancelledJobs = new Set<number>();

export function markCancelled(jobId: number): void {
  cancelledJobs.add(jobId);
  // Auto-clean after 10 minutes to prevent memory leak
  setTimeout(() => cancelledJobs.delete(jobId), 10 * 60 * 1000);
}

export function isCancelled(jobId: number): boolean {
  return cancelledJobs.has(jobId);
}

// --- In-Process Queues --------------------------------------------------------

// Crawl: concurrency 2 (can crawl 2 URLs simultaneously)
export const crawlQueue = new PQueue({ concurrency: 2 });
// Download: concurrency 5 (download images in parallel — increased from 3)
export const downloadQueue = new PQueue({ concurrency: 5 });
// Process: concurrency 1 (Sharp is CPU-intensive)
export const processQueue = new PQueue({ concurrency: 1 });
// SEO: concurrency 2 (LLM calls)
export const seoQueue = new PQueue({ concurrency: 2 });
// Publish: concurrency 1 (DB writes)
export const publishQueue = new PQueue({ concurrency: 1 });

// --- Enqueue helpers ----------------------------------------------------------

export async function enqueueCrawlJob(data: CrawlJobData): Promise<void> {
  // Lazy import to avoid loading puppeteer at startup
  const { processCrawlJob } = await import("./workers/crawl-worker.js");
  crawlQueue.add(() => processCrawlJob(data));
}

export async function enqueueDownloadJob(data: DownloadJobData): Promise<void> {
  const { processDownloadJob } = await import("./workers/download-worker.js");
  downloadQueue.add(() => processDownloadJob(data));
}

export async function enqueueProcessJob(data: ProcessJobData): Promise<void> {
  const { processProcessJob } = await import("./workers/process-worker.js");
  processQueue.add(() => processProcessJob(data));
}

export async function enqueueSeoJob(data: SeoJobData): Promise<void> {
  const { processSeoJob } = await import("./workers/seo-worker.js");
  seoQueue.add(() => processSeoJob(data));
}

export async function enqueuePublishJob(data: PublishJobData): Promise<void> {
  const { processPublishJob } = await import("./workers/publish-worker.js");
  publishQueue.add(() => processPublishJob(data));
}

// --- Queue stats --------------------------------------------------------------

export function getQueueStats() {
  return {
    crawl: { pending: crawlQueue.size, running: crawlQueue.pending },
    download: { pending: downloadQueue.size, running: downloadQueue.pending },
    process: { pending: processQueue.size, running: processQueue.pending },
    seo: { pending: seoQueue.size, running: seoQueue.pending },
    publish: { pending: publishQueue.size, running: publishQueue.pending },
  };
}
