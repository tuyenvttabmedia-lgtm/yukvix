/** Duplicate detection engine metadata — persisted in duplicateInfo for audit. */
export const DUPLICATE_ENGINE_VERSION = "2.1.0";

/** Archive hash algorithm used by the duplicate engine (not hardcoded in JSON payloads). */
export const ARCHIVE_HASH_ALGORITHM = "sha256";

/** Per-image hash algorithm label stored in match details when applicable. */
export const IMAGE_HASH_ALGORITHM = "md5";
