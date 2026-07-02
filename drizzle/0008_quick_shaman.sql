ALTER TABLE `webhook_events` RENAME COLUMN `stripeEventId` TO `providerEventId`;--> statement-breakpoint
ALTER TABLE `webhook_events` DROP INDEX `webhook_events_stripeEventId_unique`;--> statement-breakpoint
ALTER TABLE `subscriptions` ADD `provider` varchar(32) DEFAULT 'stripe' NOT NULL;--> statement-breakpoint
ALTER TABLE `webhook_events` ADD `provider` varchar(32) DEFAULT 'stripe' NOT NULL;--> statement-breakpoint
ALTER TABLE `webhook_events` ADD CONSTRAINT `webhook_events_providerEventId_unique` UNIQUE(`providerEventId`);