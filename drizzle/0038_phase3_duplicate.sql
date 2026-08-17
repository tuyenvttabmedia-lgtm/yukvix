ALTER TABLE `zip_import_jobs` MODIFY COLUMN `status` enum('uploaded','waiting','scheduled','processing','waiting_disk_space','completed','failed','cancelled','expired','skipped') NOT NULL DEFAULT 'uploaded';--> statement-breakpoint
ALTER TABLE `zip_import_jobs` ADD `sourceArchiveSha256` char(64);--> statement-breakpoint
ALTER TABLE `zip_import_jobs` ADD `duplicateInfo` text;--> statement-breakpoint
ALTER TABLE `zip_import_jobs` ADD `duplicateOverride` boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `zip_import_jobs` ADD `duplicateOverrideAudit` text;
