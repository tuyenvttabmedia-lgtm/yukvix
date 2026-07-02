CREATE TABLE `menu_items` (
	`id` int AUTO_INCREMENT NOT NULL,
	`menuId` int NOT NULL,
	`label` varchar(128) NOT NULL,
	`url` varchar(512) NOT NULL,
	`target` enum('_self','_blank') NOT NULL DEFAULT '_self',
	`sortOrder` int NOT NULL DEFAULT 0,
	`parentId` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `menu_items_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `menus` (
	`id` int AUTO_INCREMENT NOT NULL,
	`location` enum('main','footer','mobile') NOT NULL,
	`label` varchar(128) NOT NULL,
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `menus_id` PRIMARY KEY(`id`),
	CONSTRAINT `menus_location_unique` UNIQUE(`location`)
);
--> statement-breakpoint
CREATE TABLE `site_settings` (
	`id` int AUTO_INCREMENT NOT NULL,
	`key` varchar(128) NOT NULL,
	`value` text,
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `site_settings_id` PRIMARY KEY(`id`),
	CONSTRAINT `site_settings_key_unique` UNIQUE(`key`)
);
--> statement-breakpoint
CREATE TABLE `static_pages` (
	`id` int AUTO_INCREMENT NOT NULL,
	`slug` varchar(128) NOT NULL,
	`title` varchar(256) NOT NULL,
	`content` text,
	`seoTitle` varchar(256),
	`seoDescription` text,
	`status` enum('draft','published') NOT NULL DEFAULT 'draft',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `static_pages_id` PRIMARY KEY(`id`),
	CONSTRAINT `static_pages_slug_unique` UNIQUE(`slug`)
);
--> statement-breakpoint
ALTER TABLE `categories` ADD `coverKey` text;--> statement-breakpoint
ALTER TABLE `categories` ADD `seoTitle` varchar(256);--> statement-breakpoint
ALTER TABLE `categories` ADD `seoDescription` text;--> statement-breakpoint
ALTER TABLE `categories` ADD `sortOrder` int DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `categories` ADD `updatedAt` timestamp DEFAULT (now()) NOT NULL ON UPDATE CURRENT_TIMESTAMP;--> statement-breakpoint
CREATE INDEX `idx_menu_items_menuId` ON `menu_items` (`menuId`);--> statement-breakpoint
CREATE INDEX `idx_menu_items_sortOrder` ON `menu_items` (`sortOrder`);