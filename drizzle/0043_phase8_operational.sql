-- Phase 8: Operational Layer tables
CREATE TABLE IF NOT EXISTS admin_notifications (
  id INT AUTO_INCREMENT PRIMARY KEY,
  level ENUM('info','success','warning','error') NOT NULL DEFAULT 'info',
  type VARCHAR(64) NOT NULL,
  jobId INT NULL,
  title VARCHAR(255) NOT NULL,
  message TEXT NULL,
  readAt TIMESTAMP NULL,
  createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_admin_notifications_read (readAt),
  INDEX idx_admin_notifications_created (createdAt),
  INDEX idx_admin_notifications_job (jobId)
);

CREATE TABLE IF NOT EXISTS zip_import_job_events (
  id INT AUTO_INCREMENT PRIMARY KEY,
  jobId INT NOT NULL,
  event VARCHAR(64) NOT NULL,
  step VARCHAR(32) NULL,
  payload TEXT NULL,
  createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_zip_import_job_events_job (jobId),
  INDEX idx_zip_import_job_events_created (createdAt)
);

CREATE TABLE IF NOT EXISTS zip_import_metrics_snapshots (
  id INT AUTO_INCREMENT PRIMARY KEY,
  snapshotAt TIMESTAMP NOT NULL,
  payload MEDIUMTEXT NOT NULL,
  INDEX idx_zip_import_metrics_snapshot_at (snapshotAt)
);
