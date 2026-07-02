CREATE TABLE `email_logs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`type` varchar(64) NOT NULL,
	`recipient` varchar(320) NOT NULL,
	`subject` varchar(512) NOT NULL,
	`status` enum('sent','failed') NOT NULL,
	`attempts` int NOT NULL DEFAULT 1,
	`error` text,
	`messageId` varchar(256),
	`metadata` text,
	`sentAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `email_logs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `email_queue` (
	`id` int AUTO_INCREMENT NOT NULL,
	`type` varchar(64) NOT NULL,
	`recipient` varchar(320) NOT NULL,
	`subject` varchar(512) NOT NULL,
	`html` mediumtext NOT NULL,
	`textContent` text,
	`priority` int NOT NULL DEFAULT 5,
	`status` enum('pending','processing','sent','failed') NOT NULL DEFAULT 'pending',
	`attempts` int NOT NULL DEFAULT 0,
	`maxAttempts` int NOT NULL DEFAULT 3,
	`scheduledAt` timestamp NOT NULL DEFAULT (now()),
	`processedAt` timestamp,
	`error` text,
	`metadata` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `email_queue_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `idx_email_logs_recipient` ON `email_logs` (`recipient`);--> statement-breakpoint
CREATE INDEX `idx_email_logs_status` ON `email_logs` (`status`);--> statement-breakpoint
CREATE INDEX `idx_email_logs_type` ON `email_logs` (`type`);--> statement-breakpoint
CREATE INDEX `idx_email_logs_sentAt` ON `email_logs` (`sentAt`);--> statement-breakpoint
CREATE INDEX `idx_email_queue_status` ON `email_queue` (`status`);--> statement-breakpoint
CREATE INDEX `idx_email_queue_priority` ON `email_queue` (`priority`);--> statement-breakpoint
CREATE INDEX `idx_email_queue_scheduledAt` ON `email_queue` (`scheduledAt`);