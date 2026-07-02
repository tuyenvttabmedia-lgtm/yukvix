export { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";

/**
 * Returns the login URL.
 *
 * Self-hostable mode (default): returns "/login" — the local email/password login page.
 * This works on any host with no external platform dependency.
 *
 * Manus OAuth mode (optional): if VITE_OAUTH_PORTAL_URL and VITE_APP_ID are set,
 * the LoginPage also shows a "Continue with Manus" button that redirects to the
 * Manus OAuth portal. Both modes can coexist.
 */
export const getLoginUrl = (): string => {
  // Always use local login page — self-hostable, no vendor lock-in
  return "/login";
};

/**
 * Returns the Manus OAuth URL if platform env vars are configured.
 * Used by LoginPage as an optional "Continue with Manus" button.
 * Returns null if Manus OAuth is not configured.
 */
export const getManusOAuthUrl = (): string | null => {
  const oauthPortalUrl = import.meta.env.VITE_OAUTH_PORTAL_URL;
  const appId = import.meta.env.VITE_APP_ID;

  if (!oauthPortalUrl || !appId) return null;

  try {
    const redirectUri = `${window.location.origin}/api/oauth/callback`;
    const state = btoa(redirectUri);
    const url = new URL(`${oauthPortalUrl}/app-auth`);
    url.searchParams.set("appId", appId);
    url.searchParams.set("redirectUri", redirectUri);
    url.searchParams.set("state", state);
    url.searchParams.set("type", "signIn");
    return url.toString();
  } catch {
    return null;
  }
};
