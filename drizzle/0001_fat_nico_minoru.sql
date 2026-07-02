CREATE TABLE `album_tags` (
	`albumId` int NOT NULL,
	`tagId` int NOT NULL
);
--> statement-breakpoint
CREATE TABLE `albums` (
	`id` int AUTO_INCREMENT NOT NULL,
	`title` varchar(256) NOT NULL,
	`slug` varchar(256) NOT NULL,
	`description` text,
	`coverKey` text,
	`coverUrl` text,
	`categoryId` int,
	`isVip` boolean NOT NULL DEFAULT false,
	`freePreviewCount` int NOT NULL DEFAULT 3,
	`photoCount` int NOT NULL DEFAULT 0,
	`viewCount` int NOT NULL DEFAULT 0,
	`status` enum('draft','published','archived') NOT NULL DEFAULT 'draft',
	`seoTitle` varchar(256),
	`seoDescription` text,
	`seoKeywords` text,
	`cosplayer` varchar(128),
	`character` varchar(128),
	`series` varchar(128),
	`createdBy` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `albums_id` PRIMARY KEY(`id`),
	CONSTRAINT `albums_slug_unique` UNIQUE(`slug`)
);
--> statement-breakpoint
CREATE TABLE `bookmarks` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`albumId` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `bookmarks_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `categories` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(128) NOT NULL,
	`slug` varchar(128) NOT NULL,
	`description` text,
	`coverUrl` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `categories_id` PRIMARY KEY(`id`),
	CONSTRAINT `categories_name_unique` UNIQUE(`name`),
	CONSTRAINT `categories_slug_unique` UNIQUE(`slug`)
);
--> statement-breakpoint
CREATE TABLE `photos` (
	`id` int AUTO_INCREMENT NOT NULL,
	`albumId` int NOT NULL,
	`originalKey` text NOT NULL,
	`originalUrl` text,
	`webpKey` text,
	`webpUrl` text,
	`thumbKey` text,
	`thumbUrl` text,
	`width` int,
	`height` int,
	`fileSize` bigint,
	`mimeType` varchar(64),
	`sortOrder` int NOT NULL DEFAULT 0,
	`isFreePreview` boolean NOT NULL DEFAULT false,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `photos_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `subscription_plans` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(64) NOT NULL,
	`slug` varchar(64) NOT NULL,
	`description` text,
	`price` decimal(10,2) NOT NULL,
	`currency` varchar(8) NOT NULL DEFAULT 'usd',
	`intervalDays` int NOT NULL,
	`stripePriceId` varchar(128),
	`isActive` boolean NOT NULL DEFAULT true,
	`features` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `subscription_plans_id` PRIMARY KEY(`id`),
	CONSTRAINT `subscription_plans_slug_unique` UNIQUE(`slug`)
);
--> statement-breakpoint
CREATE TABLE `subscriptions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`planId` int NOT NULL,
	`status` enum('active','expired','cancelled','pending') NOT NULL DEFAULT 'pending',
	`stripeSessionId` varchar(256),
	`stripeSubscriptionId` varchar(256),
	`stripeCustomerId` varchar(256),
	`startedAt` timestamp,
	`expiresAt` timestamp,
	`cancelledAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `subscriptions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `tags` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(64) NOT NULL,
	`slug` varchar(64) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `tags_id` PRIMARY KEY(`id`),
	CONSTRAINT `tags_name_unique` UNIQUE(`name`),
	CONSTRAINT `tags_slug_unique` UNIQUE(`slug`)
);
--> statement-breakpoint
CREATE TABLE `upload_jobs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`albumId` int NOT NULL,
	`userId` int NOT NULL,
	`fileName` varchar(256),
	`status` enum('pending','processing','completed','failed') NOT NULL DEFAULT 'pending',
	`totalFiles` int DEFAULT 0,
	`processedFiles` int DEFAULT 0,
	`errorMessage` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `upload_jobs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `users` MODIFY COLUMN `role` enum('user','vip','admin') NOT NULL DEFAULT 'user';--> statement-breakpoint
ALTER TABLE `users` ADD `avatarUrl` text;--> statement-breakpoint
CREATE INDEX `idx_album_tags_albumId` ON `album_tags` (`albumId`);--> statement-breakpoint
CREATE INDEX `idx_album_tags_tagId` ON `album_tags` (`tagId`);--> statement-breakpoint
CREATE INDEX `idx_albums_status` ON `albums` (`status`);--> statement-breakpoint
CREATE INDEX `idx_albums_isVip` ON `albums` (`isVip`);--> statement-breakpoint
CREATE INDEX `idx_albums_categoryId` ON `albums` (`categoryId`);--> statement-breakpoint
CREATE INDEX `idx_albums_createdAt` ON `albums` (`createdAt`);--> statement-breakpoint
CREATE INDEX `idx_bookmarks_userId` ON `bookmarks` (`userId`);--> statement-breakpoint
CREATE INDEX `idx_bookmarks_albumId` ON `bookmarks` (`albumId`);--> statement-breakpoint
CREATE INDEX `idx_photos_albumId` ON `photos` (`albumId`);--> statement-breakpoint
CREATE INDEX `idx_photos_sortOrder` ON `photos` (`sortOrder`);--> statement-breakpoint
CREATE INDEX `idx_photos_isFreePreview` ON `photos` (`isFreePreview`);--> statement-breakpoint
CREATE INDEX `idx_subscriptions_userId` ON `subscriptions` (`userId`);--> statement-breakpoint
CREATE INDEX `idx_subscriptions_status` ON `subscriptions` (`status`);--> statement-breakpoint
CREATE INDEX `idx_subscriptions_expiresAt` ON `subscriptions` (`expiresAt`);--> statement-breakpoint
CREATE INDEX `idx_upload_jobs_albumId` ON `upload_jobs` (`albumId`);