ALTER TABLE `subscriptions` MODIFY COLUMN `provider` varchar(32) NOT NULL DEFAULT 'ccbill';--> statement-breakpoint
ALTER TABLE `subscriptions` ADD `paymentMethod` varchar(32) DEFAULT 'card' NOT NULL;--> statement-breakpoint
ALTER TABLE `subscriptions` ADD `cryptoOrderId` varchar(256);