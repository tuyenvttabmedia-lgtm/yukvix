CREATE INDEX `idx_albums_status_createdAt` ON `albums` (`status`,`createdAt`);--> statement-breakpoint
CREATE INDEX `idx_albums_status_isVip_createdAt` ON `albums` (`status`,`isVip`,`createdAt`);--> statement-breakpoint
CREATE INDEX `idx_albums_status_categoryId_createdAt` ON `albums` (`status`,`categoryId`,`createdAt`);--> statement-breakpoint
CREATE INDEX `idx_albums_status_viewCount` ON `albums` (`status`,`viewCount`);--> statement-breakpoint
CREATE INDEX `idx_albums_creatorId_status` ON `albums` (`creatorId`,`status`);