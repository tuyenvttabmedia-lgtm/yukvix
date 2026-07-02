CREATE TABLE `contact_submissions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(128) NOT NULL,
	`email` varchar(256) NOT NULL,
	`subject` varchar(256) NOT NULL,
	`message` text NOT NULL,
	`status` enum('new','read','replied','closed') NOT NULL DEFAULT 'new',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `contact_submissions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `dmca_submissions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(128) NOT NULL,
	`email` varchar(256) NOT NULL,
	`reporterUrl` varchar(512),
	`infringingUrl` text NOT NULL,
	`originalWorkUrl` varchar(512),
	`description` text NOT NULL,
	`declaration` boolean NOT NULL DEFAULT false,
	`status` enum('pending','reviewing','resolved','rejected') NOT NULL DEFAULT 'pending',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `dmca_submissions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `idx_contact_status` ON `contact_submissions` (`status`);--> statement-breakpoint
CREATE INDEX `idx_contact_createdAt` ON `contact_submissions` (`createdAt`);--> statement-breakpoint
CREATE INDEX `idx_dmca_status` ON `dmca_submissions` (`status`);--> statement-breakpoint
CREATE INDEX `idx_dmca_createdAt` ON `dmca_submissions` (`createdAt`);