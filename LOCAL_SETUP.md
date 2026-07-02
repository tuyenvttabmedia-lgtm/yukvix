# Yukvix — Local Development Setup Guide

> **Stack:** React 19 + Vite · Express 4 · tRPC 11 · Drizzle ORM · MySQL · Wasabi S3 · Stripe

---

## Table of Contents

1. [Prerequisites](#1-prerequisites)
2. [Environment Variables](#2-environment-variables)
3. [Database Setup](#3-database-setup)
4. [Install Dependencies](#4-install-dependencies)
5. [Run the Development Server](#5-run-the-development-server)
6. [Seed Demo Data](#6-seed-demo-data)
7. [Demo Accounts & Credentials](#7-demo-accounts--credentials)
8. [Testing the Admin Dashboard](#8-testing-the-admin-dashboard)
9. [Testing Wasabi S3 Integration](#9-testing-wasabi-s3-integration)
10. [Testing Stripe Payments](#10-testing-stripe-payments)
11. [API Endpoints Reference](#11-api-endpoints-reference)
12. [Troubleshooting](#12-troubleshooting)

---

## 1. Prerequisites

| Tool | Version | Install |
|------|---------|---------|
| Node.js | ≥ 22 | https://nodejs.org |
| pnpm | ≥ 10 | `npm i -g pnpm` |
| MySQL | ≥ 8.0 | https://dev.mysql.com/downloads/ |
| Git | any | https://git-scm.com |

**Optional (for full feature testing):**

- Wasabi S3 account — https://wasabi.com (30-day free trial)
- Stripe account — https://stripe.com (test mode, no real charges)

---

## 2. Environment Variables

Create a `.env` file in the project root with the following variables:

```bash
# ─── Database ──────────────────────────────────────────────────────────────────
# Local MySQL
DATABASE_URL=mysql://root:password@localhost:3306/yukvix

# ─── Auth / Session ────────────────────────────────────────────────────────────
# Generate: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
JWT_SECRET=your_random_64_char_hex_string

# ─── Manus OAuth (required for login) ──────────────────────────────────────────
# Get from your Manus project settings at https://manus.im
VITE_APP_ID=your_manus_app_id
OAUTH_SERVER_URL=https://api.manus.im
VITE_OAUTH_PORTAL_URL=https://manus.im
OWNER_OPEN_ID=your_manus_open_id        # ← Your Manus openId → grants admin access
OWNER_NAME=Your Name

# ─── Manus Built-in APIs ───────────────────────────────────────────────────────
BUILT_IN_FORGE_API_URL=https://api.manus.im
BUILT_IN_FORGE_API_KEY=your_forge_api_key
VITE_FRONTEND_FORGE_API_KEY=your_frontend_forge_api_key
VITE_FRONTEND_FORGE_API_URL=https://api.manus.im

# ─── Wasabi S3 Storage ─────────────────────────────────────────────────────────
# Without these, the app falls back to Manus built-in storage (works for testing)
WASABI_ACCESS_KEY_ID=your_wasabi_access_key_id
WASABI_SECRET_ACCESS_KEY=your_wasabi_secret_access_key
WASABI_BUCKET=your-bucket-name
WASABI_REGION=us-east-1
WASABI_ENDPOINT=https://s3.us-east-1.wasabisys.com

# ─── Cloudflare CDN (optional) ─────────────────────────────────────────────────
# Leave empty to serve directly from Wasabi
CDN_BASE_URL=

# ─── Stripe Payments ───────────────────────────────────────────────────────────
# Claim your Stripe sandbox: https://dashboard.stripe.com/claim_sandbox/...
# Test card: 4242 4242 4242 4242 | Any future date | Any CVC
STRIPE_SECRET_KEY=sk_test_your_stripe_secret_key
STRIPE_WEBHOOK_SECRET=whsec_your_stripe_webhook_secret
VITE_STRIPE_PUBLISHABLE_KEY=pk_test_your_stripe_publishable_key

# ─── App Identity ──────────────────────────────────────────────────────────────
VITE_APP_TITLE=Yukvix
VITE_APP_LOGO=

# ─── Email / SMTP (for password reset emails) ──────────────────────────────────
# Leave blank in development — Nodemailer auto-creates an Ethereal test account.
# The reset link and Ethereal preview URL are returned in the API response.
# For production, use your SMTP provider (Gmail, SendGrid, Mailgun, etc.)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your@gmail.com
SMTP_PASS=your_app_password
SMTP_FROM=Yukvix <noreply@yukvix.com>

# ─── Node Environment ──────────────────────────────────────────────────────────
NODE_ENV=development
```

### Variable Reference Table

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | **Yes** | MySQL connection string |
| `JWT_SECRET` | **Yes** | 64-char random hex for session cookies |
| `VITE_APP_ID` | **Yes** | Manus OAuth app ID |
| `OAUTH_SERVER_URL` | **Yes** | Manus OAuth backend URL |
| `VITE_OAUTH_PORTAL_URL` | **Yes** | Manus login portal URL |
| `OWNER_OPEN_ID` | **Yes** | Your Manus openId → auto-grants admin role |
| `OWNER_NAME` | **Yes** | Your display name |
| `BUILT_IN_FORGE_API_URL` | **Yes** | Manus built-in API base URL |
| `BUILT_IN_FORGE_API_KEY` | **Yes** | Server-side Manus API key |
| `VITE_FRONTEND_FORGE_API_KEY` | **Yes** | Client-side Manus API key |
| `WASABI_ACCESS_KEY_ID` | Optional | Wasabi S3 access key (falls back to Manus storage) |
| `WASABI_SECRET_ACCESS_KEY` | Optional | Wasabi S3 secret key |
| `WASABI_BUCKET` | Optional | Wasabi bucket name |
| `WASABI_REGION` | Optional | Wasabi region (default: `us-east-1`) |
| `WASABI_ENDPOINT` | Optional | Wasabi endpoint URL |
| `CDN_BASE_URL` | Optional | Cloudflare CDN domain (leave empty if not using CDN) |
| `STRIPE_SECRET_KEY` | Optional | Stripe secret key (`sk_test_...`) |
| `STRIPE_WEBHOOK_SECRET` | Optional | Stripe webhook signing secret |
| `VITE_STRIPE_PUBLISHABLE_KEY` | Optional | Stripe publishable key (`pk_test_...`) |
| `SMTP_HOST` | Optional | SMTP server hostname (e.g. `smtp.gmail.com`) |
| `SMTP_PORT` | Optional | SMTP port (587 for TLS, 465 for SSL, default: 587) |
| `SMTP_USER` | Optional | SMTP username / email address |
| `SMTP_PASS` | Optional | SMTP password or app-specific password |
| `SMTP_FROM` | Optional | From address (e.g. `Yukvix <noreply@yukvix.com>`) |

> **Development note:** If SMTP vars are not set, the email service automatically creates a free [Ethereal](https://ethereal.email) test account. The password reset API response includes `_devPreviewUrl` (view the email in browser) and `_devResetUrl` (direct reset link) for easy local testing — no real email is sent.

---

## 3. Database Setup

### Option A — Local MySQL

```bash
# Create database
mysql -u root -p -e "CREATE DATABASE yukvix CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"

# Verify
mysql -u root -p -e "SHOW DATABASES;" | grep yukvix
```

### Option B — Docker MySQL (quick start)

```bash
docker run -d \
  --name yukvix-mysql \
  -e MYSQL_ROOT_PASSWORD=password \
  -e MYSQL_DATABASE=yukvix \
  -p 3306:3306 \
  mysql:8.0

# Wait ~10 seconds for MySQL to start, then verify:
docker exec yukvix-mysql mysql -uroot -ppassword -e "SHOW DATABASES;"
```

### Apply Migrations

```bash
# Run all pending migrations
pnpm drizzle-kit migrate

# Or apply the SQL files manually:
mysql -u root -p yukvix < drizzle/0000_exotic_human_torch.sql
mysql -u root -p yukvix < drizzle/0001_fat_nico_minoru.sql
```

---

## 4. Install Dependencies

```bash
# Clone or navigate to the project directory
cd cosplay-gallery

# Install all dependencies (including Sharp for image processing)
pnpm install

# Approve Sharp native build (required once)
pnpm approve-builds
# → Press 'a' to select all, then 'y' to confirm
```

---

## 5. Run the Development Server

```bash
# Start the full-stack dev server (frontend + backend on port 3000)
pnpm dev
```

The server starts at **http://localhost:3000**

- Frontend: `http://localhost:3000`
- API (tRPC): `http://localhost:3000/api/trpc`
- Upload API: `http://localhost:3000/api/upload`
- Stripe Webhook: `http://localhost:3000/api/stripe/webhook`

> **Hot reload:** Both frontend (Vite HMR) and backend (tsx watch) reload automatically on file changes.

---

## 6. Seed Demo Data

After the server is running and the database is set up, run the seed script:

```bash
node scripts/seed.mjs
```

This creates:

| Data | Count | Details |
|------|-------|---------|
| Users | 3 | 1 admin, 1 VIP, 1 regular |
| Categories | 8 | Anime, Game, Marvel & DC, Fantasy, Sci-Fi, Horror, Original, Group |
| Tags | 12 | SAO, Naruto, One Piece, Genshin, LoL, Demon Slayer, AoT, JJK, MHA, Chainsaw Man, Spy×Family, Elden Ring |
| Albums | 20 | 10 free + 10 VIP, all published |
| Photos | ~297 | 8–25 per album with thumbnails |
| Subscriptions | 1 | Active VIP subscription for VIP user (1 year) |
| Bookmarks | 3 | Sample bookmarks for regular user |

> **Re-seeding:** Running the script again is safe — it uses `ON DUPLICATE KEY UPDATE` to avoid duplicates.

---

## 7. Demo Accounts & Credentials

> **Important:** Yukvix uses **Manus OAuth** for authentication. There is no username/password login system. The demo accounts below exist in the database but can only be activated through OAuth.

### How to Get Admin Access (Recommended)

1. Log in to the site using your Manus account
2. Set `OWNER_OPEN_ID` in your `.env` to your Manus openId
3. Your account will automatically receive the `admin` role on next login

### Demo Users in Database

| Role | openId | Email | Notes |
|------|--------|-------|-------|
| `admin` | `demo-admin-001` | admin@yukvix.test | Pre-seeded admin |
| `vip` | `demo-vip-001` | vip@yukvix.test | Active VIP subscription (1 year) |
| `user` | `demo-user-001` | user@yukvix.test | Regular user with 3 bookmarks |

### Promote Your Account to Admin (SQL)

```sql
-- Replace 'your-manus-open-id' with your actual Manus openId
UPDATE users SET role = 'admin' WHERE openId = 'your-manus-open-id';

-- Verify
SELECT id, openId, name, role FROM users;
```

### Promote Your Account to VIP (SQL)

```sql
UPDATE users SET role = 'vip' WHERE openId = 'your-manus-open-id';
```

### Grant VIP via Admin Dashboard

1. Log in as admin → go to `/admin/users`
2. Find the user → click "Grant VIP" button

---

## 8. Testing the Admin Dashboard

### Access

Navigate to **http://localhost:3000/admin**

> Requires `role = 'admin'` in the database. See [Section 7](#7-demo-accounts--credentials) to promote your account.

### Admin Features to Test

| Feature | URL | What to Test |
|---------|-----|--------------|
| Overview / Analytics | `/admin` | Stats cards, top albums, recent users |
| Album Management | `/admin/albums` | Create album, edit, delete, view photo count |
| ZIP Upload | `/admin/albums` → Upload ZIP | Upload a ZIP file with images |
| User Management | `/admin/users` | View users, change roles, grant VIP |
| Subscriptions | `/admin/subscriptions` | View active/expired subscriptions |

### Create a Test Album via Admin

1. Go to `/admin/albums`
2. Click **"New Album"**
3. Fill in: Title, Category, Cosplayer, Character, Series
4. Toggle **"VIP Only"** to test VIP locking
5. Set **"Free Preview Count"** (e.g., 3)
6. Set status to **"Published"**
7. Click **"Create Album"**
8. Then upload photos via the ZIP upload button

### Test ZIP Upload

1. Create a ZIP file containing 5–10 JPEG/PNG images
2. Go to `/admin/albums` → find your album → click **"Upload ZIP"**
3. Select your ZIP file
4. The system will:
   - Extract all images from the ZIP
   - Convert each to WebP format (via Sharp)
   - Generate 400×400 thumbnails
   - Upload to Wasabi S3 (or Manus storage fallback)
   - Mark first N photos as free preview
5. Refresh the album to see photos

---

## 9. Testing Wasabi S3 Integration

### Without Wasabi (Fallback Mode)

If `WASABI_ACCESS_KEY_ID` is not set, the app automatically falls back to **Manus built-in storage**. All upload features work normally — images are stored on Manus infrastructure instead of Wasabi.

### With Wasabi

1. Create a Wasabi account at https://wasabi.com
2. Create a bucket (e.g., `yukvix-dev`)
3. Create an IAM user with the following policy:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": ["s3:GetObject", "s3:PutObject", "s3:DeleteObject", "s3:ListBucket"],
      "Resource": [
        "arn:aws:s3:::yukvix-dev",
        "arn:aws:s3:::yukvix-dev/*"
      ]
    }
  ]
}
```

4. Add credentials to `.env`:

```bash
WASABI_ACCESS_KEY_ID=your_access_key
WASABI_SECRET_ACCESS_KEY=your_secret_key
WASABI_BUCKET=yukvix-dev
WASABI_REGION=us-east-1
WASABI_ENDPOINT=https://s3.us-east-1.wasabisys.com
```

5. Restart the dev server: `pnpm dev`
6. Upload a photo via admin → verify the URL contains `wasabisys.com`

### Bucket CORS Configuration

Add this CORS policy to your Wasabi bucket (Settings → CORS):

```xml
<?xml version="1.0" encoding="UTF-8"?>
<CORSConfiguration>
  <CORSRule>
    <AllowedOrigin>http://localhost:3000</AllowedOrigin>
    <AllowedOrigin>https://your-production-domain.com</AllowedOrigin>
    <AllowedMethod>GET</AllowedMethod>
    <AllowedMethod>PUT</AllowedMethod>
    <AllowedMethod>POST</AllowedMethod>
    <AllowedHeader>*</AllowedHeader>
    <MaxAgeSeconds>3600</MaxAgeSeconds>
  </CORSRule>
</CORSConfiguration>
```

### Signed URLs for VIP Content

VIP album photos are served via **signed URLs** that expire in 1 hour. To test:

1. Create a VIP album and upload photos
2. Log in as a VIP user
3. Open an album → inspect the photo URLs in browser DevTools
4. URLs should contain `X-Amz-Signature` (Wasabi) or be proxied (Manus fallback)
5. Copy a signed URL and open in incognito → it should still work (URL is signed, not auth-gated)
6. Wait 1 hour → the URL should expire (403 Forbidden)

---

## 10. Testing Stripe Payments

### Setup

1. **Claim your Stripe sandbox** (if not done):
   ```
   https://dashboard.stripe.com/claim_sandbox/YWNjdF8xVFc0UmNJb3V0Qk1STEN5LDE3NzkyNTAxOTQv100mdJaFH2F
   ```
   > Must be claimed before **2026-07-12** or the sandbox expires.

2. Get your test keys from [Stripe Dashboard → Developers → API Keys](https://dashboard.stripe.com/test/apikeys):
   - `sk_test_...` → `STRIPE_SECRET_KEY`
   - `pk_test_...` → `VITE_STRIPE_PUBLISHABLE_KEY`

3. Add to `.env` and restart: `pnpm dev`

### Test a VIP Purchase

1. Go to **http://localhost:3000/vip**
2. Click **"Get VIP Monthly"** or **"Get VIP Yearly"**
3. A new tab opens with Stripe Checkout
4. Use test card: **`4242 4242 4242 4242`**
   - Expiry: any future date (e.g., `12/34`)
   - CVC: any 3 digits (e.g., `123`)
   - Name/Address: anything
5. Complete payment → redirected to `/payment/success`
6. Your account role should update to `vip`

### Test Webhook Locally (Optional)

Use [Stripe CLI](https://stripe.com/docs/stripe-cli) to forward webhooks:

```bash
# Install Stripe CLI
brew install stripe/stripe-cli/stripe

# Login
stripe login

# Forward webhooks to local server
stripe listen --forward-to localhost:3000/api/stripe/webhook

# In another terminal, trigger a test event
stripe trigger checkout.session.completed
```

### Stripe Test Cards

| Card Number | Scenario |
|-------------|----------|
| `4242 4242 4242 4242` | Successful payment |
| `4000 0000 0000 0002` | Card declined |
| `4000 0025 0000 3155` | Requires 3D Secure |
| `4000 0000 0000 9995` | Insufficient funds |

---

## 11. API Endpoints Reference

### tRPC Procedures (via `/api/trpc`)

| Procedure | Auth | Description |
|-----------|------|-------------|
| `auth.me` | Public | Get current user |
| `auth.logout` | Public | Clear session cookie |
| `albums.list` | Public | Paginated album list with filters |
| `albums.bySlug` | Public | Album detail + photos (VIP gated) |
| `albums.categories` | Public | All categories |
| `albums.tags` | Public | All tags |
| `albums.related` | Public | Related albums by tag/category |
| `albums.create` | Admin | Create new album |
| `albums.update` | Admin | Update album metadata |
| `albums.delete` | Admin | Delete album + photos |
| `albums.adminList` | Admin | Admin album list (all statuses) |
| `albums.generateSeo` | Admin | Auto-generate SEO metadata |
| `subscriptions.plans` | Public | List active subscription plans |
| `subscriptions.mySubscription` | VIP | Current user's subscription |
| `subscriptions.createCheckout` | User | Create Stripe checkout session |
| `subscriptions.verifyPayment` | User | Verify payment after redirect |
| `subscriptions.grantVip` | Admin | Manually grant VIP to user |
| `subscriptions.adminList` | Admin | All subscriptions |
| `users.adminList` | Admin | All users |
| `users.setRole` | Admin | Change user role |
| `users.toggleBookmark` | User | Add/remove bookmark |
| `users.myBookmarks` | User | Current user's bookmarks |
| `analytics.overview` | Admin | Site-wide analytics stats |

### REST Upload Endpoints

| Endpoint | Method | Auth | Description |
|----------|--------|------|-------------|
| `/api/upload/photo` | POST | Admin | Upload single photo to album |
| `/api/upload/zip` | POST | Admin | Upload ZIP file, extract & process all images |
| `/api/stripe/webhook` | POST | Stripe | Stripe webhook receiver |

### Upload Request Format

**Single Photo** (`/api/upload/photo`):
```bash
curl -X POST http://localhost:3000/api/upload/photo \
  -H "Cookie: session=your_session_cookie" \
  -F "file=@photo.jpg" \
  -F "albumId=1"
```

**ZIP Upload** (`/api/upload/zip`):
```bash
curl -X POST http://localhost:3000/api/upload/zip \
  -H "Cookie: session=your_session_cookie" \
  -F "file=@photos.zip" \
  -F "albumId=1"
```

---

## 12. Troubleshooting

### Server won't start

```bash
# Check if port 3000 is in use
lsof -i :3000
# Kill existing process
kill -9 $(lsof -t -i:3000)

# Restart
pnpm dev
```

### Database connection error

```bash
# Test MySQL connection
mysql -u root -p -e "SELECT 1"

# Check DATABASE_URL format
# Correct: mysql://user:pass@host:3306/dbname
# Wrong:   mysql://user:pass@host/dbname  (missing port)

# Run migrations again
pnpm drizzle-kit migrate
```

### Sharp / image processing errors

```bash
# Rebuild Sharp for your platform
pnpm rebuild sharp

# Or reinstall
pnpm remove sharp && pnpm add sharp
pnpm approve-builds
```

### "Admin Access Required" on admin pages

```sql
-- Promote your account in MySQL
UPDATE users SET role = 'admin' WHERE openId = 'your-manus-open-id';
```

Or set `OWNER_OPEN_ID=your-manus-open-id` in `.env` — the system auto-promotes on login.

### Stripe checkout not working

1. Verify `STRIPE_SECRET_KEY` starts with `sk_test_`
2. Verify `VITE_STRIPE_PUBLISHABLE_KEY` starts with `pk_test_`
3. Check server logs for Stripe errors: `tail -f .manus-logs/devserver.log`
4. Ensure you've claimed the Stripe sandbox

### Images not loading (Wasabi)

1. Check bucket CORS policy allows your origin
2. Verify bucket is **not** set to "Block all public access" for public images
3. For VIP signed URLs, check the `WASABI_ENDPOINT` matches your bucket region
4. Test without Wasabi first (remove `WASABI_ACCESS_KEY_ID`) to confirm fallback works

### TypeScript errors

```bash
# Check for type errors
pnpm check

# Run tests
pnpm test
```

---

## Quick Start Checklist

```
[ ] Node.js 22+ and pnpm installed
[ ] MySQL running and database created
[ ] .env file created with DATABASE_URL and JWT_SECRET
[ ] Manus OAuth credentials added (VITE_APP_ID, OWNER_OPEN_ID, etc.)
[ ] pnpm install completed
[ ] pnpm drizzle-kit migrate completed
[ ] pnpm dev running on http://localhost:3000
[ ] node scripts/seed.mjs completed (20 albums, 297 photos seeded)
[ ] Logged in via Manus OAuth
[ ] Role promoted to admin via SQL or OWNER_OPEN_ID
[ ] Admin dashboard accessible at /admin
[ ] (Optional) Wasabi credentials added for S3 storage
[ ] (Optional) Stripe test keys added for payment testing
```

---

*Generated for Yukvix v1.0 — May 2026*
