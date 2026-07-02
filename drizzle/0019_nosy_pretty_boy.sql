CREATE TABLE `email_verification_tokens` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`token` varchar(128) NOT NULL,
	`expiresAt` timestamp NOT NULL,
	`usedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `email_verification_tokens_id` PRIMARY KEY(`id`),
	CONSTRAINT `email_verification_tokens_token_unique` UNIQUE(`token`)
);
--> statement-breakpoint
CREATE TABLE `smtp_settings` (
	`id` int AUTO_INCREMENT NOT NULL,
	`host` varchar(256) NOT NULL,
	`port` int NOT NULL DEFAULT 587,
	`secure` boolean NOT NULL DEFAULT false,
	`user` varchar(256) NOT NULL,
	`password` varchar(512) NOT NULL,
	`fromName` varchar(128) NOT NULL,
	`fromEmail` varchar(320) NOT NULL,
	`enabled` boolean NOT NULL DEFAULT true,
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `smtp_settings_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `users` ADD `emailVerified` boolean DEFAULT false NOT NULL;--> statement-breakpoint
CREATE INDEX `idx_evt_token` ON `email_verification_tokens` (`token`);--> statement-breakpoint
CREATE INDEX `idx_evt_userId` ON `email_verification_tokens` (`userId`);--> statement-breakpoint
CREATE INDEX `idx_evt_expiresAt` ON `email_verification_tokens` (`expiresAt`);