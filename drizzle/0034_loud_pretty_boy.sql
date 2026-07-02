CREATE TABLE `admin_settings` (
	`id` int AUTO_INCREMENT NOT NULL,
	`key` varchar(100) NOT NULL,
	`value` mediumtext NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `admin_settings_id` PRIMARY KEY(`id`),
	CONSTRAINT `admin_settings_key_unique` UNIQUE(`key`)
);
--> statement-breakpoint
CREATE TABLE `seo_cache` (
	`id` int AUTO_INCREMENT NOT NULL,
	`filenameHash` varchar(32) NOT NULL,
	`filename` varchar(255) NOT NULL,
	`promptVersion` varchar(20) NOT NULL,
	`model` varchar(100) NOT NULL,
	`seoJson` mediumtext NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`expiresAt` timestamp,
	CONSTRAINT `seo_cache_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `seo_settings` (
	`id` int NOT NULL DEFAULT 1,
	`gtm_container_id` varchar(50),
	`gsc_verification_meta` varchar(500),
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `seo_settings_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `zip_import_jobs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`albumId` int,
	`sourceArchiveKey` varchar(500),
	`sourceArchiveSize` bigint,
	`sourceArchiveOriginalName` varchar(500),
	`status` enum('uploaded','waiting','scheduled','processing','waiting_disk_space','completed','failed','cancelled','expired') NOT NULL DEFAULT 'uploaded',
	`progress` int NOT NULL DEFAULT 0,
	`totalImages` int NOT NULL DEFAULT 0,
	`processedImages` int NOT NULL DEFAULT 0,
	`failedImages` int NOT NULL DEFAULT 0,
	`cancelRequested` boolean NOT NULL DEFAULT false,
	`importLogs` mediumtext,
	`failedImageList` mediumtext,
	`archivePasswordIndex` int NOT NULL DEFAULT 0,
	`vipZipStatus` enum('pending','generating','ready','failed') NOT NULL DEFAULT 'pending',
	`vipZipKey` varchar(500),
	`vipZipSize` bigint,
	`vipZipGeneratedAt` timestamp,
	`scheduledAt` timestamp,
	`startedAt` timestamp,
	`completedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `zip_import_jobs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `albums` MODIFY COLUMN `seoTitle` varchar(60);--> statement-breakpoint
ALTER TABLE `albums` MODIFY COLUMN `seoDescription` varchar(160);--> statement-breakpoint
ALTER TABLE `creators` MODIFY COLUMN `seoTitle` varchar(60);--> statement-breakpoint
ALTER TABLE `creators` MODIFY COLUMN `seoDescription` varchar(160);--> statement-breakpoint
ALTER TABLE `albums` ADD `focus_keyword` varchar(100);--> statement-breakpoint
ALTER TABLE `albums` ADD `canonical_url` varchar(500);--> statement-breakpoint
ALTER TABLE `albums` ADD `og_image` varchar(500);--> statement-breakpoint
ALTER TABLE `albums` ADD `robots_index` boolean DEFAULT true;--> statement-breakpoint
ALTER TABLE `albums` ADD `seo_language` varchar(10) DEFAULT 'en';--> statement-breakpoint
ALTER TABLE `albums` ADD `collectionName` varchar(100);--> statement-breakpoint
ALTER TABLE `albums` ADD `publishStatus` enum('draft','processing','ready_for_review','published') DEFAULT 'draft' NOT NULL;--> statement-breakpoint
ALTER TABLE `albums` ADD `seoQualityScore` int DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `albums` ADD `aiGenerated` boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `albums` ADD `originalFileName` varchar(500);--> statement-breakpoint
ALTER TABLE `albums` ADD `shortDescription` text;--> statement-breakpoint
ALTER TABLE `albums` ADD `altTextTemplate` varchar(500);--> statement-breakpoint
ALTER TABLE `albums` ADD `relatedKeywords` text;--> statement-breakpoint
ALTER TABLE `creators` ADD `seoKeywords` text;--> statement-breakpoint
ALTER TABLE `creators` ADD `focus_keyword` varchar(200);--> statement-breakpoint
ALTER TABLE `creators` ADD `canonical_url` varchar(500);--> statement-breakpoint
ALTER TABLE `creators` ADD `og_image` varchar(500);--> statement-breakpoint
ALTER TABLE `creators` ADD `robots_index` boolean DEFAULT true;--> statement-breakpoint
ALTER TABLE `creators` ADD `seo_language` varchar(10) DEFAULT 'en';--> statement-breakpoint
ALTER TABLE `creators` ADD `avatar_alt` varchar(100);--> statement-breakpoint
ALTER TABLE `creators` ADD `banner_alt` varchar(100);--> statement-breakpoint
ALTER TABLE `creators` ADD `country` varchar(50);--> statement-breakpoint
ALTER TABLE `creators` ADD `aliases` text;--> statement-breakpoint
ALTER TABLE `creators` ADD `normalizedName` varchar(255);--> statement-breakpoint
ALTER TABLE `creators` ADD `publishStatus` enum('draft','ready_for_review','published') DEFAULT 'draft' NOT NULL;--> statement-breakpoint
ALTER TABLE `creators` ADD `aiGenerated` boolean DEFAULT false NOT NULL;--> statement-breakpoint
CREATE INDEX `idx_admin_settings_key` ON `admin_settings` (`key`);--> statement-breakpoint
CREATE INDEX `idx_seo_cache_hash_version_model` ON `seo_cache` (`filenameHash`,`promptVersion`,`model`);--> statement-breakpoint
CREATE INDEX `idx_seo_cache_expiresAt` ON `seo_cache` (`expiresAt`);--> statement-breakpoint
CREATE INDEX `idx_zip_import_jobs_status` ON `zip_import_jobs` (`status`);--> statement-breakpoint
CREATE INDEX `idx_zip_import_jobs_albumId` ON `zip_import_jobs` (`albumId`);--> statement-breakpoint
CREATE INDEX `idx_zip_import_jobs_createdAt` ON `zip_import_jobs` (`createdAt`);--> statement-breakpoint
CREATE INDEX `idx_albums_publishStatus` ON `albums` (`publishStatus`);--> statement-breakpoint
CREATE INDEX `idx_creators_normalizedName` ON `creators` (`normalizedName`);--> statement-breakpoint
CREATE INDEX `idx_creators_publishStatus` ON `creators` (`publishStatus`);