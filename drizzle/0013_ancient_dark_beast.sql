CREATE TABLE `image_hashes` (
	`id` int AUTO_INCREMENT NOT NULL,
	`mediaItemId` int NOT NULL,
	`pHash` varchar(64),
	`dHash` varchar(64),
	`md5` varchar(32),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `image_hashes_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `import_jobs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`sourceId` int,
	`sourceUrl` text NOT NULL,
	`status` enum('queued','crawling','downloading','processing','seo','done','failed','cancelled') NOT NULL DEFAULT 'queued',
	`totalPages` int NOT NULL DEFAULT 0,
	`crawledPages` int NOT NULL DEFAULT 0,
	`totalImages` int NOT NULL DEFAULT 0,
	`downloadedImages` int NOT NULL DEFAULT 0,
	`processedImages` int NOT NULL DEFAULT 0,
	`albumId` int,
	`errorMessage` text,
	`extractedTitle` varchar(512),
	`extractedCreator` varchar(256),
	`extractedTags` text,
	`isDuplicate` boolean NOT NULL DEFAULT false,
	`duplicateOfJobId` int,
	`scheduledPublishAt` timestamp,
	`startedAt` timestamp,
	`completedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `import_jobs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `import_logs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`jobId` int NOT NULL,
	`level` enum('info','warn','error','debug') NOT NULL DEFAULT 'info',
	`message` text NOT NULL,
	`data` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `import_logs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `import_sources` (
	`id` int AUTO_INCREMENT NOT NULL,
	`siteName` varchar(128) NOT NULL,
	`baseUrl` varchar(512) NOT NULL,
	`titleSelector` varchar(256),
	`contentSelector` varchar(256),
	`imageSelector` varchar(256),
	`nextPageSelector` varchar(256),
	`tagSelector` varchar(256),
	`creatorSelector` varchar(256),
	`publishDateSelector` varchar(256),
	`paginationType` enum('next_page','numbered','infinite_scroll','none') NOT NULL DEFAULT 'next_page',
	`requiresBrowser` boolean NOT NULL DEFAULT false,
	`userAgent` varchar(512),
	`cookieString` text,
	`crawlDelayMs` int NOT NULL DEFAULT 1500,
	`maxPages` int NOT NULL DEFAULT 50,
	`crawlStartDate` timestamp,
	`crawlEndDate` timestamp,
	`keywordFilter` varchar(256),
	`creatorFilter` varchar(256),
	`enabled` boolean NOT NULL DEFAULT true,
	`lastCrawledAt` timestamp,
	`lastCrawledUrl` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `import_sources_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `imported_urls` (
	`id` int AUTO_INCREMENT NOT NULL,
	`urlHash` varchar(64) NOT NULL,
	`sourceUrl` text NOT NULL,
	`jobId` int NOT NULL,
	`albumId` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `imported_urls_id` PRIMARY KEY(`id`),
	CONSTRAINT `imported_urls_urlHash_unique` UNIQUE(`urlHash`)
);
--> statement-breakpoint
CREATE INDEX `idx_image_hashes_pHash` ON `image_hashes` (`pHash`);--> statement-breakpoint
CREATE INDEX `idx_image_hashes_md5` ON `image_hashes` (`md5`);--> statement-breakpoint
CREATE INDEX `idx_image_hashes_mediaItemId` ON `image_hashes` (`mediaItemId`);--> statement-breakpoint
CREATE INDEX `idx_import_jobs_status` ON `import_jobs` (`status`);--> statement-breakpoint
CREATE INDEX `idx_import_jobs_sourceId` ON `import_jobs` (`sourceId`);--> statement-breakpoint
CREATE INDEX `idx_import_jobs_createdAt` ON `import_jobs` (`createdAt`);--> statement-breakpoint
CREATE INDEX `idx_import_jobs_albumId` ON `import_jobs` (`albumId`);--> statement-breakpoint
CREATE INDEX `idx_import_logs_jobId` ON `import_logs` (`jobId`);--> statement-breakpoint
CREATE INDEX `idx_import_logs_level` ON `import_logs` (`level`);--> statement-breakpoint
CREATE INDEX `idx_import_logs_createdAt` ON `import_logs` (`createdAt`);--> statement-breakpoint
CREATE INDEX `idx_import_sources_enabled` ON `import_sources` (`enabled`);--> statement-breakpoint
CREATE INDEX `idx_imported_urls_urlHash` ON `imported_urls` (`urlHash`);--> statement-breakpoint
CREATE INDEX `idx_imported_urls_jobId` ON `imported_urls` (`jobId`);