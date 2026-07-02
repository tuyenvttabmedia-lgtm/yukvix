CREATE TABLE `zip_jobs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`albumId` int NOT NULL,
	`userId` int NOT NULL,
	`status` enum('queued','processing','done','failed') NOT NULL DEFAULT 'queued',
	`progress` int NOT NULL DEFAULT 0,
	`totalFiles` int NOT NULL DEFAULT 0,
	`processedFiles` int NOT NULL DEFAULT 0,
	`zipUrl` text,
	`zipKey` text,
	`zipSize` int,
	`errorMessage` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `zip_jobs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `idx_zip_jobs_albumId` ON `zip_jobs` (`albumId`);--> statement-breakpoint
CREATE INDEX `idx_zip_jobs_userId` ON `zip_jobs` (`userId`);--> statement-breakpoint
CREATE INDEX `idx_zip_jobs_status` ON `zip_jobs` (`status`);