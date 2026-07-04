ALTER TABLE `zip_import_jobs` ADD `workerId` varchar(64);--> statement-breakpoint
ALTER TABLE `zip_import_jobs` ADD `lockedAt` timestamp;--> statement-breakpoint
ALTER TABLE `zip_import_jobs` ADD `heartbeatAt` timestamp;
