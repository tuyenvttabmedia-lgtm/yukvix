-- Phase 4: pipeline step tracking for import jobs
ALTER TABLE `zip_import_jobs` ADD `pipelineStep` varchar(32);--> statement-breakpoint
