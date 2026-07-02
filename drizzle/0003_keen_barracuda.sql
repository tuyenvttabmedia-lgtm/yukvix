CREATE TABLE `password_reset_tokens` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`token` varchar(128) NOT NULL,
	`expiresAt` timestamp NOT NULL,
	`usedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `password_reset_tokens_id` PRIMARY KEY(`id`),
	CONSTRAINT `password_reset_tokens_token_unique` UNIQUE(`token`)
);
--> statement-breakpoint
CREATE INDEX `idx_prt_token` ON `password_reset_tokens` (`token`);--> statement-breakpoint
CREATE INDEX `idx_prt_userId` ON `password_reset_tokens` (`userId`);--> statement-breakpoint
CREATE INDEX `idx_prt_expiresAt` ON `password_reset_tokens` (`expiresAt`);