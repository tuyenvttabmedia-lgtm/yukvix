ALTER TABLE `import_sources` ADD `publishMode` enum('draft','published') DEFAULT 'draft' NOT NULL;--> statement-breakpoint
ALTER TABLE `import_sources` ADD `autoSchedule` boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `import_sources` ADD `scheduleIntervalHours` int DEFAULT 6 NOT NULL;--> statement-breakpoint
ALTER TABLE `import_sources` ADD `categoryUrls` text;