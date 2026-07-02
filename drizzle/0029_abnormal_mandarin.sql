CREATE TABLE `admin_permissions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`permission` enum('manage_users','manage_albums','manage_payments','manage_cms','manage_import','manage_settings','view_analytics') NOT NULL,
	`grantedBy` int NOT NULL,
	`grantedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `admin_permissions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `users` MODIFY COLUMN `role` enum('user','vip','admin','super_admin') NOT NULL DEFAULT 'user';--> statement-breakpoint
CREATE INDEX `idx_admin_perm_userId` ON `admin_permissions` (`userId`);--> statement-breakpoint
CREATE INDEX `idx_admin_perm_userId_perm` ON `admin_permissions` (`userId`,`permission`);