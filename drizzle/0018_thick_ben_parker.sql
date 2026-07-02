CREATE TABLE `creators` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(128) NOT NULL,
	`slug` varchar(128) NOT NULL,
	`bio` text,
	`avatarKey` text,
	`avatarUrl` text,
	`bannerKey` text,
	`bannerUrl` text,
	`socialLinks` text,
	`seoTitle` varchar(256),
	`seoDescription` text,
	`albumCount` int NOT NULL DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `creators_id` PRIMARY KEY(`id`),
	CONSTRAINT `creators_slug_unique` UNIQUE(`slug`)
);
--> statement-breakpoint
CREATE TABLE `downloads` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`albumId` int NOT NULL,
	`zipSize` bigint,
	`downloadedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `downloads_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `albums` ADD `creatorId` int;--> statement-breakpoint
ALTER TABLE `albums` ADD `zipKey` text;--> statement-breakpoint
ALTER TABLE `albums` ADD `zipUrl` text;--> statement-breakpoint
ALTER TABLE `albums` ADD `zipSize` bigint;--> statement-breakpoint
ALTER TABLE `albums` ADD `zipGeneratedAt` timestamp;--> statement-breakpoint
ALTER TABLE `tags` ADD `seoTitle` varchar(256);--> statement-breakpoint
ALTER TABLE `tags` ADD `seoDescription` text;--> statement-breakpoint
CREATE INDEX `idx_creators_slug` ON `creators` (`slug`);--> statement-breakpoint
CREATE INDEX `idx_creators_createdAt` ON `creators` (`createdAt`);--> statement-breakpoint
CREATE INDEX `idx_downloads_userId` ON `downloads` (`userId`);--> statement-breakpoint
CREATE INDEX `idx_downloads_albumId` ON `downloads` (`albumId`);--> statement-breakpoint
CREATE INDEX `idx_downloads_downloadedAt` ON `downloads` (`downloadedAt`);