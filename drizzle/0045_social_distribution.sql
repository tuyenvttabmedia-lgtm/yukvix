-- Social Distribution Core: accounts, posts, attempts + default config.
-- No ALTER on albums/photos.

CREATE TABLE IF NOT EXISTS `social_accounts` (
  `id` int AUTO_INCREMENT NOT NULL,
  `platform` enum('telegram','mastodon','bluesky','x') NOT NULL,
  `displayName` varchar(128) NOT NULL,
  `isEnabled` boolean NOT NULL DEFAULT false,
  `autoShare` boolean NOT NULL DEFAULT false,
  `requireApproval` boolean NOT NULL DEFAULT false,
  `encryptedCredentials` text NOT NULL,
  `configJson` text,
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  `updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_social_accounts_platform` (`platform`),
  KEY `idx_social_accounts_isEnabled` (`isEnabled`)
);

CREATE TABLE IF NOT EXISTS `social_posts` (
  `id` int AUTO_INCREMENT NOT NULL,
  `albumId` int NOT NULL,
  `accountId` int NOT NULL,
  `platform` enum('telegram','mastodon','bluesky','x') NOT NULL,
  `trigger` enum('auto','manual') NOT NULL,
  `status` enum('skipped','awaiting_approval','pending','processing','sent','failed','cancelled') NOT NULL,
  `idempotencyKey` varchar(191) NOT NULL,
  `scheduledAt` timestamp NOT NULL,
  `contentRating` varchar(32) NOT NULL,
  `caption` text,
  `mediaJson` mediumtext NOT NULL,
  `policyJson` mediumtext NOT NULL,
  `externalPostId` varchar(256),
  `externalUrl` varchar(512),
  `attempts` int NOT NULL DEFAULT 0,
  `maxAttempts` int NOT NULL DEFAULT 5,
  `lastError` text,
  `createdBy` int,
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  `processedAt` timestamp,
  PRIMARY KEY (`id`),
  UNIQUE KEY `social_posts_idempotencyKey_unique` (`idempotencyKey`),
  KEY `idx_social_posts_status_scheduledAt` (`status`,`scheduledAt`),
  KEY `idx_social_posts_albumId` (`albumId`),
  KEY `idx_social_posts_accountId` (`accountId`),
  KEY `idx_social_posts_platform` (`platform`)
);

CREATE TABLE IF NOT EXISTS `social_post_attempts` (
  `id` int AUTO_INCREMENT NOT NULL,
  `postId` int NOT NULL,
  `attempt` int NOT NULL,
  `ok` boolean NOT NULL DEFAULT false,
  `httpStatus` int,
  `error` text,
  `responseJson` text,
  `dryRun` boolean NOT NULL DEFAULT false,
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  PRIMARY KEY (`id`),
  KEY `idx_social_post_attempts_postId` (`postId`),
  KEY `idx_social_post_attempts_createdAt` (`createdAt`)
);

INSERT IGNORE INTO `admin_settings` (`key`, `value`)
VALUES (
  'social_distribution_config',
  '{"enabled":true,"contentRating":"mature","defaultDelayMinutes":15,"platforms":{"telegram":{"enabled":true,"defaultAutoShare":false,"maxImages":10,"delayMinutes":5},"mastodon":{"enabled":true,"defaultAutoShare":false,"maxImages":4,"delayMinutes":15},"bluesky":{"enabled":true,"defaultAutoShare":false,"maxImages":4,"delayMinutes":20},"x":{"enabled":false,"defaultAutoShare":false,"maxImages":4,"delayMinutes":30,"requireApproval":true}}}'
);
