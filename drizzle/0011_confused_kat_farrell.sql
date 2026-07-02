CREATE TABLE `album_media_items` (
	`id` int AUTO_INCREMENT NOT NULL,
	`albumId` int NOT NULL,
	`mediaItemId` int NOT NULL,
	`sortOrder` int NOT NULL DEFAULT 0,
	`isFreePreview` boolean NOT NULL DEFAULT false,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `album_media_items_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `media_items` (
	`id` int AUTO_INCREMENT NOT NULL,
	`originalKey` text NOT NULL,
	`thumbKey` text,
	`webpKey` text,
	`originalUrl` text,
	`thumbUrl` text,
	`webpUrl` text,
	`filename` varchar(256) NOT NULL,
	`width` int,
	`height` int,
	`fileSize` bigint,
	`mimeType` varchar(64),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `media_items_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `idx_ami_albumId` ON `album_media_items` (`albumId`);--> statement-breakpoint
CREATE INDEX `idx_ami_mediaItemId` ON `album_media_items` (`mediaItemId`);--> statement-breakpoint
CREATE INDEX `idx_ami_sortOrder` ON `album_media_items` (`sortOrder`);--> statement-breakpoint
CREATE INDEX `idx_media_items_createdAt` ON `media_items` (`createdAt`);--> statement-breakpoint
CREATE INDEX `idx_media_items_filename` ON `media_items` (`filename`);