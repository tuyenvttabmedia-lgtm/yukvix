-- Phase 6: resume audit history + lastError
ALTER TABLE `zip_import_jobs` ADD `resumeHistory` mediumtext;--> statement-breakpoint
ALTER TABLE `zip_import_jobs` ADD `lastError` text;
