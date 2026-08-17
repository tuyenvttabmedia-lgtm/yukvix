-- Phase 5: import profile snapshot, pending album, checkpoint, step metrics
ALTER TABLE `zip_import_jobs` ADD `importProfile` text;--> statement-breakpoint
ALTER TABLE `zip_import_jobs` ADD `pendingAlbumData` text;--> statement-breakpoint
ALTER TABLE `zip_import_jobs` ADD `checkpoint` mediumtext;--> statement-breakpoint
ALTER TABLE `zip_import_jobs` ADD `stepMetrics` text;
