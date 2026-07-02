# Authentication Architecture — Self-Hostable Guide

## Overview

Yukvix uses a **self-hostable email/password + JWT authentication system** that runs on any Node.js host with zero dependency on the Manus platform. Manus OAuth is preserved as an **optional parallel path** for users who run the project on the Manus platform.

---

## Architecture Summary

| Component | Self-hostable path | Manus platform path |
|---|---|---|
| User registration | `POST /api/trpc/auth.register` | `/api/oauth/callback` |
| User login | `POST /api/trpc/auth.login` | Manus OAuth portal redirect |
| Session token | HS256 JWT signed with `JWT_SECRET` | HS256 JWT signed with `JWT_SECRET` |
| Session cookie | `app_session_id` (HttpOnly) | `app_session_id` (HttpOnly) |
| Session verification | `jose.jwtVerify()` — **no external calls** | `jose.jwtVerify()` — **no external calls** |
| User sync | User created in DB at registration | User synced from Manus on first login |
| Password storage | bcryptjs hash (12 rounds) | N/A (OAuth) |

**Key insight:** Both paths use the same `JWT_SECRET`-signed cookie. The session verification in `server/_core/sdk.ts → verifySession()` is already self-contained — it only calls the Manus API when a user is not yet in the local database. Local users are always in the database from the moment they register, so the Manus API is never called for local accounts.

---

## Required Environment Variables (Self-Hosting)

These are the **only** env vars required to run Yukvix outside Manus:

```env
# Database (required)
DATABASE_URL=mysql://user:password@host:3306/yukvix

# Session signing (required — must be at least 32 characters)
JWT_SECRET=your-super-secret-jwt-key-at-least-32-chars

# Stripe (required for VIP payments)
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
VITE_STRIPE_PUBLISHABLE_KEY=pk_test_...

# Wasabi S3 (required for photo storage)
WASABI_ACCESS_KEY=your-wasabi-access-key
WASABI_SECRET_KEY=your-wasabi-secret-key
WASABI_BUCKET=your-bucket-name
WASABI_REGION=us-east-1
WASABI_ENDPOINT=https://s3.wasabisys.com

# App identity (optional — used for Manus OAuth parallel path only)
VITE_APP_ID=
OAUTH_SERVER_URL=
VITE_OAUTH_PORTAL_URL=
```

> **Note:** `VITE_APP_ID`, `OAUTH_SERVER_URL`, and `VITE_OAUTH_PORTAL_URL` are **only needed** if you want to enable the "Continue with Manus" OAuth button on the login page. They can be left empty for fully self-hosted deployments.

---

## New Files Added

| File | Purpose |
|---|---|
| `server/auth-local.ts` | Core auth service: `registerLocal()`, `loginLocal()`, `signLocalSession()`, `verifyLocalSession()`, `hashPassword()`, `verifyPassword()`, `setAuthCookie()`, `clearAuthCookie()` |
| `server/routers/auth.ts` | tRPC router: `auth.register`, `auth.login`, `auth.me`, `auth.logout`, `auth.updateProfile`, `auth.changePassword` |
| `client/src/pages/LoginPage.tsx` | Email/password login form with optional Manus OAuth button |
| `client/src/pages/RegisterPage.tsx` | Registration form with password strength indicator |

---

## Modified Files

| File | Change |
|---|---|
| `drizzle/schema.ts` | Added `passwordHash` column to `users` table |
| `server/db.ts` | Added `getUserByEmail()` helper; added `passwordHash` to `upsertUser()` |
| `server/routers.ts` | Replaced inline `auth` router with `authRouter` from `server/routers/auth.ts` |
| `client/src/const.ts` | `getLoginUrl()` now returns `/login`; added `getManusOAuthUrl()` for optional Manus button |
| `client/src/main.tsx` | Unauthorized redirect goes to `/login` instead of Manus portal |
| `client/src/_core/hooks/useAuth.ts` | Default redirect path changed to `/login` |
| `client/src/components/Navbar.tsx` | "Sign In" and "Join Free" buttons navigate to `/login` and `/register` |
| `client/src/App.tsx` | Added `/login` and `/register` routes |

---

## How Sessions Work (Technical Detail)

```
1. User submits email + password to POST /api/trpc/auth.register (or auth.login)
2. server/auth-local.ts verifies credentials and calls signLocalSession()
3. signLocalSession() creates a HS256 JWT with { openId, email, name, appId: "local" }
   signed with JWT_SECRET — no external API calls
4. JWT is set as an HttpOnly cookie named app_session_id
5. On subsequent requests, server/_core/sdk.ts → verifySession() reads the cookie
   and calls jose.jwtVerify() with JWT_SECRET — no external API calls
6. If openId starts with "local_", the user is fetched from the local DB
   (they were inserted at registration, so no Manus API sync is needed)
7. ctx.user is populated and all protected procedures work normally
```

---

## Running Without Manus Platform

```bash
# 1. Clone the repository
git clone <your-repo>
cd cosplay-gallery

# 2. Install dependencies
pnpm install

# 3. Create .env file with the required variables above

# 4. Run database migrations
pnpm drizzle-kit generate
# Then apply the generated SQL to your MySQL database

# 5. Seed demo data (optional)
pnpm seed

# 6. Start the development server
pnpm dev
# → http://localhost:3000

# 7. Create your admin account
# Register at http://localhost:3000/register
# Then run: UPDATE users SET role='admin' WHERE email='your@email.com';
```

---

## Manus OAuth Parallel Path

The Manus OAuth flow (`/api/oauth/callback`) is preserved and continues to work when:
- `VITE_APP_ID` is set
- `OAUTH_SERVER_URL` is set  
- `VITE_OAUTH_PORTAL_URL` is set

When these vars are set, the login page shows a "Continue with Manus" button. Users who log in via Manus OAuth get their accounts synced to the local database automatically on first login.

Both local and Manus OAuth users coexist in the same `users` table. Local users have `loginMethod = 'local'` and a non-null `passwordHash`. Manus OAuth users have `loginMethod = 'manus'` and `passwordHash = null`.

---

## Security Notes

- Passwords are hashed with **bcryptjs** at cost factor 12 (≈250ms per hash, resistant to brute force)
- Sessions use **HS256 JWT** with 1-year expiry, stored in an **HttpOnly, Secure, SameSite=None** cookie
- Login uses **timing-safe comparison** to prevent user enumeration attacks
- The `passwordHash` field is never returned in API responses (excluded from user objects)
- Signed URLs for premium photos use Wasabi S3 presigned URLs (15-minute expiry)

---

## Test Coverage

```
server/auth-local.test.ts — 14 tests
  ✓ signLocalSession + verifyLocalSession (6 tests)
  ✓ hashPassword + verifyPassword (3 tests)
  ✓ auth router — register and login (3 tests)
  ✓ self-hostability: no Manus platform calls (2 tests)

server/auth.logout.test.ts — 1 test
  ✓ auth.logout clears the session cookie

server/yukvix.test.ts — 24 tests
  ✓ albums, subscriptions, users procedures

Total: 39 tests, 0 failures
```
