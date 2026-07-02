export const COOKIE_NAME = "app_session_id";
export const ONE_YEAR_MS = 1000 * 60 * 60 * 24 * 365;
export const AXIOS_TIMEOUT_MS = 30_000;
export const UNAUTHED_ERR_MSG = 'Please login (10001)';
export const NOT_ADMIN_ERR_MSG = 'You do not have required permission (10002)';

/** Returns true if the role has admin-level access */
export function isAdmin(role: string | null | undefined): boolean {
  return role === 'admin';
}

/** Returns true if the role has VIP-level access (vip or admin) */
export function isVipOrAdmin(role: string | null | undefined): boolean {
  return role === 'vip' || role === 'admin';
}
