-- Phase 7: AI SEO audit metadata on import jobs
ALTER TABLE zip_import_jobs ADD COLUMN aiSeoMetadata TEXT NULL;
ALTER TABLE zip_import_jobs ADD COLUMN aiSeoMetrics TEXT NULL;
