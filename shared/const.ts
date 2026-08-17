export const COOKIE_NAME = "app_session_id";
export const ONE_YEAR_MS = 1000 * 60 * 60 * 24 * 365;
/** Local email/password JWT lifetime (Manus OAuth still uses ONE_YEAR_MS). */
export const SESSION_MAX_AGE_MS = 1000 * 60 * 60 * 24 * 30;
export const AXIOS_TIMEOUT_MS = 30_000;
export const UNAUTHED_ERR_MSG = 'Please login (10001)';
export const NOT_ADMIN_ERR_MSG = 'You do not have required permission (10002)';

type RoleLike = string | { role?: string | null } | null | undefined;

function asRole(roleOrUser: RoleLike): string | null | undefined {
  if (roleOrUser && typeof roleOrUser === "object") return roleOrUser.role;
  return roleOrUser;
}

/** Returns true if the role has admin-level access */
export function isAdmin(roleOrUser: RoleLike): boolean {
  const role = asRole(roleOrUser);
  return role === "admin" || role === "super_admin";
}

/** Returns true if the role has VIP-level access (vip, admin, or super_admin) */
export function isVipOrAdmin(roleOrUser: RoleLike): boolean {
  const role = asRole(roleOrUser);
  return role === "vip" || role === "admin" || role === "super_admin";
}
