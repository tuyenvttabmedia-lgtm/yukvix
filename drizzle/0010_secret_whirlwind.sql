CREATE TABLE `image_processing_jobs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`albumId` int NOT NULL,
	`originalKey` varchar(512) NOT NULL,
	`fileName` varchar(256) NOT NULL,
	`mimeType` varchar(64) NOT NULL,
	`fileSize` bigint NOT NULL,
	`status` enum('pending','processing','done','failed') NOT NULL DEFAULT 'pending',
	`error` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`processedAt` timestamp,
	CONSTRAINT `image_processing_jobs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `photos` ADD `signedUrl` text;--> statement-breakpoint
ALTER TABLE `photos` ADD `signedUrlExpiresAt` bigint;--> statement-breakpoint
CREATE INDEX `idx_ipj_albumId` ON `image_processing_jobs` (`albumId`);--> statement-breakpoint
CREATE INDEX `idx_ipj_status` ON `image_processing_jobs` (`status`);--> statement-breakpoint
CREATE INDEX `idx_ipj_createdAt` ON `image_processing_jobs` (`createdAt`);