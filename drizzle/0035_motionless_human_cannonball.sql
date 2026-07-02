CREATE TABLE `seo_generation_history` (
	`id` int AUTO_INCREMENT NOT NULL,
	`albumId` int NOT NULL,
	`promptVersion` varchar(20) NOT NULL,
	`model` varchar(100) NOT NULL,
	`generatedJson` mediumtext NOT NULL,
	`editedByAdmin` boolean NOT NULL DEFAULT false,
	`qualityPassed` boolean NOT NULL DEFAULT false,
	`qualityWarnings` text,
	`approvedAt` timestamp,
	`approvedBy` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `seo_generation_history_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `idx_seo_history_albumId` ON `seo_generation_history` (`albumId`);--> statement-breakpoint
CREATE INDEX `idx_seo_history_approvedAt` ON `seo_generation_history` (`approvedAt`);