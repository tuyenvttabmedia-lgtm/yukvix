-- Invalidate JWTs issued before this timestamp (password change / ban).
ALTER TABLE users
  ADD COLUMN sessionInvalidBefore timestamp NULL;
