CREATE TABLE `webhook_events` (
	`id` int AUTO_INCREMENT NOT NULL,
	`stripeEventId` varchar(128) NOT NULL,
	`type` varchar(64) NOT NULL,
	`status` enum('success','failed','skipped') NOT NULL DEFAULT 'success',
	`relatedUserId` int,
	`relatedSessionId` varchar(256),
	`errorMessage` text,
	`processedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `webhook_events_id` PRIMARY KEY(`id`),
	CONSTRAINT `webhook_events_stripeEventId_unique` UNIQUE(`stripeEventId`)
);
--> statement-breakpoint
ALTER TABLE `subscription_plans` ADD `badge` varchar(32);--> statement-breakpoint
ALTER TABLE `subscription_plans` ADD `sortOrder` int DEFAULT 0 NOT NULL;--> statement-breakpoint
CREATE INDEX `idx_webhook_events_type` ON `webhook_events` (`type`);--> statement-breakpoint
CREATE INDEX `idx_webhook_events_status` ON `webhook_events` (`status`);--> statement-breakpoint
CREATE INDEX `idx_webhook_events_processedAt` ON `webhook_events` (`processedAt`);