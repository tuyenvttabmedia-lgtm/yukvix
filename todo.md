# Yukvix - Project TODO

## Phase 1: Setup & Schema
- [x] Create todo.md
- [x] Install dependencies (sharp, multer, archiver, stripe, ioredis, nanoid)
- [x] Design and implement database schema (users, albums, photos, tags, subscriptions, bookmarks)
- [x] Run migrations via webdev_execute_sql

## Phase 2: Backend API - Core
- [x] Album CRUD procedures (create, update, delete, list, getById)
- [x] Photo upload procedure with S3 storage integration
- [x] ZIP bulk upload extraction and processing
- [x] WebP conversion using sharp
- [x] Auto thumbnail generation (400x400 WebP)
- [x] Signed URL generation for premium photos (via Wasabi S3)
- [x] Tag management (create, attach to albums)
- [x] Category management

## Phase 3: Backend API - VIP & Payments
- [x] VIP subscription plans (monthly, yearly)
- [x] Stripe checkout session creation
- [x] Stripe webhook handler for payment events
- [x] Subscription status management (active, expired, cancelled)
- [x] User role upgrade to VIP on payment success
- [x] Bookmark/favorite album procedures
- [x] Search and filter albums procedure (by name, tag, category, vip status)
- [x] Related albums suggestion

## Phase 4: Frontend - Theme & Layout
- [x] Dark premium theme in index.css (OKLCH colors, custom fonts)
- [x] Google Fonts integration (Playfair Display + Inter)
- [x] Global navigation component (top nav with search, auth, VIP badge)
- [x] Footer component
- [x] App.tsx routes setup for all pages
- [x] Landing/Home page with hero section, featured albums, stats

## Phase 5: Frontend - Gallery & Albums
- [x] Masonry gallery component with CSS columns layout
- [x] Infinite scroll hook (IntersectionObserver)
- [x] Album card component (thumbnail, title, VIP badge, photo count)
- [x] Album detail page with photo grid
- [x] VIP lock overlay for premium photos
- [x] Photo lightbox/modal viewer
- [x] Free preview (first N photos visible, rest blurred/locked)
- [x] WebP image display with fallback

## Phase 6: Frontend - User Features
- [x] Search page with filters (category, tags, VIP status, sort)
- [x] Bookmarks/favorites page
- [x] VIP subscription page with plan cards
- [x] Stripe checkout redirect flow
- [x] Payment success/cancel pages
- [x] User profile (subscription status shown in navbar)

## Phase 7: Admin Dashboard
- [x] Admin layout with sidebar navigation
- [x] User management table (list, role change, grant VIP)
- [x] Album management (create, edit, delete, set VIP)
- [x] Bulk ZIP upload UI with progress
- [x] Subscription management table
- [x] Analytics overview (total users, VIP count, albums, photos, views)
- [x] Auto SEO metadata in index.html (OG tags, Twitter Card, structured data)

## Phase 8: Quality & Polish
- [x] SEO meta tags in HTML head (OG, Twitter Card, robots, structured data)
- [x] Responsive mobile-first design
- [x] Loading skeletons for all data-fetching components
- [x] Error states and empty states
- [x] Toast notifications for user actions
- [x] Vitest unit tests (25 tests passing)
- [x] Performance: lazy loading images, blur placeholder, WebP optimization
- [x] robots.txt with proper crawl rules
- [x] Stripe webhook handler with raw body middleware
- [x] Final checkpoint and delivery

## Local Testing Setup
- [x] Create seed script (scripts/seed.mjs) with 20 albums, 297 photos, 3 demo users
- [x] Add pnpm seed and pnpm setup scripts to package.json
- [x] Seed admin user (openId: demo-admin-001)
- [x] Seed VIP user (openId: demo-vip-001) with active 1-year subscription
- [x] Seed regular user (openId: demo-user-001) with 3 sample bookmarks
- [x] Seed 8 categories and 12 tags
- [x] Create LOCAL_SETUP.md with full environment variable reference and step-by-step instructions
- [x] Verify all 25 tests pass after setup
- [x] Verify albums.list API returns seeded data correctly
- [x] Verify subscriptions.plans API returns HTTP 200
- [x] Verify frontend loads with correct title (Yukvix — Premium Cosplay Gallery)

## Self-Hostable Authentication (Vendor Lock-in Removal)
- [x] Audit all Manus OAuth dependencies
- [x] Add passwordHash column to users table migration
- [x] Create server/auth-local.ts with register/login/me procedures using bcryptjs + JWT
- [x] Create server/routers/auth.ts replacing Manus OAuth router
- [x] Update context.ts to use local JWT verification (no Manus SDK calls)
- [x] Create client/src/pages/LoginPage.tsx with email/password form
- [x] Create client/src/pages/RegisterPage.tsx
- [x] Update useAuth hook to work with local auth (no getLoginUrl redirect to Manus)
- [x] Update Navbar to show login/register links instead of Manus OAuth redirect
- [x] Update App.tsx routes for /login and /register
- [x] Write vitest tests for local auth procedures (14 new tests, 39 total)
- [x] Create AUTH_MIGRATION.md documenting the change

## Password Reset (Forgot Password)
- [x] Install nodemailer + @types/nodemailer
- [x] Add passwordResetTokens table to drizzle schema
- [x] Run DB migration for new table
- [x] Create server/email.ts — Nodemailer email service with HTML templates
- [x] Add forgotPassword procedure: generate token, send email (anti-enumeration)
- [x] Add resetPassword procedure: verify token, update password, invalidate all tokens
- [x] Add validateResetToken procedure: check token validity, return masked email
- [x] Add SMTP env vars (SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM) documented in LOCAL_SETUP.md
- [x] Create client/src/pages/ForgotPasswordPage.tsx (with Ethereal dev preview link)
- [x] Create client/src/pages/ResetPasswordPage.tsx (with password strength meter)
- [x] Update LoginPage to add "Forgot password?" link
- [x] Add /forgot-password and /reset-password routes to App.tsx
- [x] Write vitest tests for password reset procedures (14 new tests, 53 total)
- [x] Verify full email flow end-to-end (Ethereal preview confirmed, token invalidation confirmed)

## Production Upload Workflow
- [x] Backend: presigned PUT URL endpoint for direct browser-to-Wasabi upload
- [x] Backend: post-upload processing endpoint (thumbnail + WebP generation via Sharp)
- [x] Backend: ZIP upload endpoint with extraction + batch processing
- [x] Backend: update photo order (drag-and-drop sort)
- [x] Backend: set cover image for album
- [x] Backend: set free preview images for album
- [x] Backend: delete photo from album + Wasabi
- [x] Backend: album SEO fields (metaTitle, metaDescription, slug auto-generation)
- [x] Frontend: Admin Album Editor page with full upload UI
- [x] Frontend: drag-and-drop file zone (react-dropzone)
- [x] Frontend: multi-image upload with per-file progress bars
- [x] Frontend: ZIP upload with progress
- [x] Frontend: uploaded image grid with drag-and-drop sorting (@dnd-kit)
- [x] Frontend: cover image selection UI
- [x] Frontend: free preview image selection UI
- [x] Frontend: SEO fields panel (slug, metaTitle, metaDescription)
- [x] Frontend: auto slug generation from album title
- [x] Verify: albums.list API returns 5 albums (seeded data confirmed)
- [x] Verify: signed URLs protect VIP images correctly (presigned mode when Wasabi configured)
- [x] Verify: WebP + thumbnail generation via Sharp (processImage pipeline confirmed)
- [x] Write vitest tests for upload procedures (15 new tests, 68 total passing)

## Upload & VIP Protection Verification (Additional)
- [x] Test VIP protection: non-VIP users only see freePreview photos in albums.bySlug
- [x] Test VIP protection: VIP users receive signed GET URLs for premium photos
- [x] Test processAfterUpload: verifies Sharp WebP + thumbnail generation pipeline
- [x] Test ZIP batch processing: verifies batch photo creation and album photo count update

## Admin User Detail Management
- [x] Backend: add `status` (banned/active) column to users table + migration
- [x] Backend: getUserDetail procedure (profile, subscription, bookmarks count, login history)
- [x] Backend: banUser / unbanUser procedures
- [x] Backend: adminGrantVip / adminRemoveVip procedures
- [x] Backend: adminResetPassword procedure (generate temp password + email)
- [x] Backend: adminDeleteUser procedure (soft delete or hard delete with cleanup)
- [x] Frontend: AdminUserDetail page at /admin/users/:id
- [x] Frontend: Update AdminUsers table — add "View" button linking to detail page
- [x] Frontend: Add route /admin/users/:id to App.tsx
- [x] Write vitest tests for admin user management procedures (15 tests, 86 total)

## SEO Infrastructure
- [x] Backend: dynamic /sitemap.xml endpoint (albums + static pages)
- [x] Backend: /sitemap-images.xml image sitemap with all album photos
- [x] Backend: /sitemap-index.xml sitemap index pointing to all sitemaps
- [x] Backend: update /robots.txt to reference sitemap index
- [x] Backend: auto-generate SEO metadata (metaTitle, metaDescription) for albums missing it
- [x] Frontend: SeoHead component (react-helmet-async) for dynamic meta tags
- [x] Frontend: OpenGraph tags (og:title, og:description, og:image, og:type, og:url)
- [x] Frontend: Twitter Card tags (twitter:card, twitter:title, twitter:description, twitter:image)
- [x] Frontend: Canonical URL tag on all pages
- [x] Frontend: JSON-LD structured data (ImageGallery, BreadcrumbList) on album pages
- [x] Frontend: JSON-LD WebSite schema on homepage
- [x] Frontend: alt text support on all gallery images (from photo.altText or album.title)
- [x] Frontend: Add SeoHead to Home, Gallery, AlbumDetail, Search, VipPage, AdminLayout
- [x] Write vitest tests for sitemap generation (18 new tests, 104 total)

## Lightweight CMS

### Schema & Backend
- [x] Add `site_settings` table (key-value store for appearance + social links)
- [x] Add `menus` table (id, location: main/footer/mobile, label)
- [x] Add `menu_items` table (id, menuId, label, url, sortOrder, parentId)
- [x] Add `static_pages` table (slug, title, content HTML, seoTitle, seoDescription, status)
- [x] Extend `categories` table with seoTitle, seoDescription columns
- [x] Run DB migration 0006 via webdev_execute_sql
- [x] Backend: `cms.getSettings` / `cms.updateSettings` procedures (appearance + social)
- [x] Backend: `cms.getMenus` / `cms.saveMenu` procedures
- [x] Backend: `cms.getPage` / `cms.savePage` / `cms.listPages` procedures
- [x] Backend: `cms.presignedUpload` for Wasabi media (logo, favicon, banners, category cover)
- [x] Backend: extend `categories` router with seoTitle/seoDescription CRUD
- [x] Backend: public `cms.getPublicSettings` (logo, social links for frontend)
- [x] Backend: public `cms.getPublicPage` (serve static page content)

### Frontend — Admin CMS Pages
- [x] Admin sidebar: add CMS section (Appearance, Menus, Categories, Pages)
- [x] Admin: Appearance page — logo/mobile logo/favicon upload, homepage banners, footer text, social links
- [x] Admin: Menu Management page — create/edit main/footer/mobile menus with sortable items
- [x] Admin: Category Management page — full CRUD with cover image upload, SEO fields
- [x] Admin: Static Pages list + editor (lightweight textarea with basic toolbar — no heavy builder)

### Frontend — Public Pages
- [x] Public route `/about` — renders static page from DB
- [x] Public route `/privacy` — renders static page from DB
- [x] Public route `/terms` — renders static page from DB
- [x] Public route `/contact` — renders static page from DB
- [x] Public route `/dmca` — renders static page from DB
- [x] SeoHead on all static page routes (from DB seoTitle/seoDescription)
- [x] Footer: render social links and footer menu from CMS settings
- [x] Footer: render footer menu from CMS (with hardcoded fallback)

### Tests & Checkpoint
- [x] Write vitest tests for CMS procedures (settings, menus, pages) — 20 new tests
- [x] TypeScript check — 0 errors
- [x] Save checkpoint

## Payment & Subscription Management

### Schema & Backend
- [x] Add `badge` and `sortOrder` columns to `subscription_plans` table
- [x] Add `webhook_events` table (type, stripeEventId, status, relatedSessionId, errorMessage, processedAt)
- [x] Run DB migration 0007 via webdev_execute_sql
- [x] Backend: `payments.stripeStatus` — masked keys, mode, webhook config, event counts
- [x] Backend: `payments.adminListPlans` — all plans including inactive
- [x] Backend: `payments.adminSavePlan` — create or update plan (features as JSON)
- [x] Backend: `payments.adminTogglePlan` — enable/disable plan
- [x] Backend: `payments.adminListPayments` — paginated with status filter, joined user + plan
- [x] Backend: `payments.adminPaymentStats` — revenue, active, pending, expired, cancelled counts
- [x] Backend: `payments.adminListActiveVips` — paginated, optional includeExpired flag
- [x] Backend: `payments.adminExtendVip` — add N days to expiresAt, update user role
- [x] Backend: `payments.adminCancelVip` — set status=cancelled, downgrade user role
- [x] Backend: `payments.adminWebhookEvents` — last N events with status filter + counts
- [x] Update stripe-webhook.ts to log events to `webhook_events` table

### Frontend — Admin Payment Pages
- [x] Admin sidebar: add Payments section (Settings, Plans, History, VIP Users, Webhooks)
- [x] Admin: Payment Settings page — Stripe mode, masked keys, webhook status, currency
- [x] Admin: Plans page — card grid with create/edit dialog, toggle active, badge, features
- [x] Admin: Payment History page — paginated table, status filter tabs, revenue stats cards
- [x] Admin: VIP Management page — active/expired toggle, extend dialog, cancel dialog
- [x] Admin: Webhook Monitor page — health summary, event log table, status filter, endpoint info

### Tests & Checkpoint
- [x] Write vitest tests for payments procedures (15 tests, 139 total)
- [x] TypeScript check — 0 errors
- [x] Save checkpoint

## Trang Quản Lý Tài Khoản Cá Nhân

### Backend
- [x] Backend: `account.myProfile` — thông tin cá nhân (name, email, avatarUrl, role, createdAt)
- [x] Backend: `account.updateProfile` — cập nhật name, email, avatarUrl
- [x] Backend: `account.changePassword` — đổi mật khẩu (xác minh mật khẩu cũ)
- [x] Backend: `account.myVipStatus` — trạng thái VIP, ngày hết hạn, tên plan, còn bao nhiêu ngày
- [x] Backend: `account.myPaymentHistory` — lịch sử thanh toán của user (paginated)

### Frontend
- [x] Trang `/account` với 4 tab: Hồ sơ, Trạng thái VIP, Lịch sử thanh toán, Bảo mật
- [x] Tab Hồ sơ: hiển thị avatar, name, email, role badge; form cập nhật name/email
- [x] Tab VIP Status: card trạng thái VIP với countdown hết hạn, progress bar, nút nâng cấp
- [x] Tab Lịch sử thanh toán: bảng paginated (plan, số tiền, trạng thái, ngày, session ID)
- [x] Tab Bảo mật: form đổi mật khẩu (mật khẩu cũ + mới + xác nhận + strength meter)
- [x] Navbar dropdown: thêm link "Tài khoản của tôi" trỏ đến `/account`
- [x] PaymentSuccess: thêm nút "Tài khoản của tôi" sau khi kích hoạt VIP

### Tests & Checkpoint
- [x] Vitest tests cho account procedures (12 tests, 151 tổng)
- [x] TypeScript check — 0 errors
- [x] Save checkpoint

## Nút Gia Hạn Ngay (Tab VIP Status)

- [x] Backend: `account.renewVip` — tạo Stripe Checkout session từ planId hiện tại (hoặc planId truyền vào), trả về checkout URL
- [x] Frontend: nút "Gia hạn ngay" hiển thị khi VIP còn ≤7 ngày (cảnh báo vàng)
- [x] Frontend: nút "Gia hạn VIP ngay" hiển thị khi VIP đã hết hạn
- [x] Frontend: nút "Nâng cấp VIP ngay" hiển thị khi chưa từng đăng ký (dẫn đến /vip)
- [x] Frontend: loading state khi đang tạo checkout session (spinner + disabled)
- [x] Frontend: mở checkout URL trong tab mới (window.open)
- [x] Tests cho renewVip procedure (2 tests, 153 tổng)
- [x] TypeScript check — 0 errors
- [x] Save checkpoint

## VPS Deployment Package

- [x] Tạo `deploy/env.example.txt` với tất cả biến môi trường có comment giải thích
- [x] Tạo `deploy/ecosystem.config.cjs` (PM2 config cho production)
- [x] Tạo `deploy/nginx.conf` (reverse proxy + SSL + gzip + rate limiting)
- [x] Seed script có sẵn tại `scripts/seed.mjs` (demo data)
- [x] Viết `docs/FULL_DEPLOYMENT.md` (hướng dẫn deploy từng bước trên Ubuntu 22.04)
- [x] Viết `docs/VPS_SETUP.md` (Wasabi, Stripe, SMTP, MySQL hardening, backup)
- [x] Viết `docs/TROUBLESHOOTING.md` (lỗi phổ biến và cách xử lý)
- [x] Đóng gói ZIP và giao cho người dùng

## Paddle Payment Provider Refactor

### Architecture
- [x] Tạo `server/payments/provider.ts` — PaymentProvider interface (createCheckout, verifyPayment, handleWebhook)
- [x] Tạo `server/payments/paddle.ts` — PaddleProvider implementation
- [x] Tạo `server/payments/stripe.ts` — StripeProvider (giữ nguyên logic cũ, wrap vào interface)
- [x] Tạo `server/payments/index.ts` — factory getPaymentProvider() dựa trên env PAYMENT_PROVIDER

### DB Schema
- [x] Thêm `provider` column vào `subscriptions` table (paddle/stripe/manual)
- [x] Đổi tên `stripeEventId` → `providerEventId` trong `webhook_events` (backward compatible)
- [x] Chạy migration 0008

### Backend
- [x] Cập nhật `server/db.ts`: createSubscription nhận provider field
- [x] Cập nhật `server/db.ts`: activateSubscription dùng sessionId generic (không phụ thuộc Stripe)
- [x] Cập nhật `server/routers/subscriptions.ts`: createCheckout dùng getPaymentProvider()
- [x] Cập nhật `server/routers/subscriptions.ts`: verifyPayment dùng provider abstraction
- [x] Tạo `server/paddle-webhook.ts` — Paddle webhook handler (signature verify + activate subscription)
- [x] Đăng ký Paddle webhook route trong `server/_core/index.ts`
- [x] Cập nhật `server/routers/account.ts`: renewVip dùng provider abstraction

### Frontend
- [x] Cập nhật VipPage: thay "Stripe" text bằng "Secure Checkout"
- [x] Cập nhật AccountPage: thay "Stripe" text bằng provider-agnostic text
- [x] Thêm VITE_PAYMENT_PROVIDER env để frontend biết provider hiện tại

### Tests & Checkpoint
- [x] Cập nhật tests cho subscriptions router (mock provider thay vì mock Stripe)
- [x] TypeScript check — 0 errors
- [x] Save checkpoint

## CCBill + Crypto Payment Provider Refactor

### Schema & Backend
- [x] Rename `stripeSessionId` → `sessionId`, `stripeSubscriptionId` → `providerSubscriptionId`, `stripeCustomerId` → `providerCustomerId` in schema
- [x] Run DB migration 0009
- [x] Tạo `server/payments/ccbill.ts` — CCBillProvider (FlexForms Dynamic Pricing, formDigest MD5, webhook NewSaleSuccess/Cancellation)
- [x] Tạo `server/payments/crypto.ts` — CryptoProvider (NOWPayments API: create payment, IPN webhook HMAC-SHA512 verify)
- [x] Cập nhật `server/payments/index.ts` — factory hỗ trợ ccbill/crypto/stripe
- [x] Cập nhật `server/stripe-webhook.ts` — thêm /api/ccbill/webhook và /api/crypto/webhook
- [x] Cập nhật subscriptions router — createCheckout nhận provider param (ccbill/crypto)
- [x] Cập nhật account.ts renewVip — dùng provider abstraction

### Frontend
- [x] VipPage: thêm payment method selection UI (Credit Card via CCBill / Crypto USDT)
- [x] Trang `/payment/crypto/:paymentId` — hiển thị địa chỉ ví, QR code, trạng thái thanh toán
- [x] PaymentSuccess: xử lý cả CCBill redirect và crypto confirmation

### Admin
- [x] AdminPaymentSettings: hiển thị CCBill config (accnum, subacc, flexId) và NOWPayments config

### Tests & Checkpoint
- [x] Vitest tests cho CCBillProvider và CryptoProvider
- [x] TypeScript check — 0 errors
- [x] Save checkpoint

## Trang Trạng Thái Crypto Payment

- [x] Backend: `subscriptions.getCryptoPaymentStatus` — query NOWPayments API theo orderId, trả về pay_address, pay_amount, pay_currency, payment_status, expiration_estimate_date
- [x] Backend: `subscriptions.pollCryptoStatus` — polling-friendly endpoint (30s interval), trả về isConfirmed + trạng thái hiện tại
- [x] Frontend: trang `/payment/crypto/:orderId` với QR code (qrcode.react), địa chỉ ví copy-to-clipboard, số tiền USDT, countdown timer hết hạn
- [x] Frontend: auto-polling mỗi 30 giây, tự redirect về /payment/success khi confirmed
- [x] Frontend: hiển thị các trạng thái: waiting → confirming → confirmed/failed/expired
- [x] Frontend: cập nhật VipPage để redirect đến `/payment/crypto/:orderId` thay vì invoice_url khi chọn crypto
- [x] Route `/payment/crypto/:orderId` trong App.tsx
- [x] TypeScript check — 0 errors
- [x] Save checkpoint

## Wasabi Upload Production Debug

- [x] Phân tích presigned URL generation (endpoint format, path-style vs virtual-hosted)
- [x] Kiểm tra Cloudflare interference — upload phải đi thẳng đến Wasabi, không qua CDN
- [x] Kiểm tra CORS configuration trên Wasabi bucket
- [x] Kiểm tra frontend upload logic (axios/fetch timeout, error handling)
- [x] Thêm detailed server-side logging cho presigned URL generation
- [x] Thêm detailed client-side logging cho upload failures
- [x] Fix upload pipeline để bypass Cloudflare proxy
- [x] Verify fix và save checkpoint

## Production Image System Optimization

- [x] Upload: concurrency limit max 3-5 simultaneous uploads
- [x] Upload: queue system (không fire all at once)
- [x] Upload: retry logic (max 2 retries per file)
- [x] Upload: frontend JSON parse error handling (catch HTML error pages)
- [x] Upload: detailed per-file upload logs
- [x] Album: infinite scroll / progressive loading (initial 24 images)
- [x] Album: IntersectionObserver load-more
- [x] Album: thumb-first rendering in grid (không load webp/original)
- [x] Album: preload only next lightbox image

## Server Crash Fix (processAfterUpload HTML response)

- [x] Tìm nguyên nhân server crash khi xử lý ảnh concurrent (OOM / timeout)
- [x] Giới hạn memory usage trong processImage (Sharp options)
- [x] Thêm server-side concurrency semaphore cho processAfterUpload
- [x] Thêm timeout handling cho Wasabi fetch + image processing
- [x] Thêm detailed server logs để debug production

## Payment Integration & Admin Settings 3-Layer
- [x] Set Wasabi credentials via secrets
- [x] Set NOWPayments secrets
- [x] DB: add app_settings table for payment config (CCBill + NOWPayments keys stored in DB)
- [x] Backend: SettingsService reads from DB with env fallback
- [x] Backend: update CryptoProvider to read keys from SettingsService (DB)
- [x] Backend: update CCBillProvider to read keys from SettingsService (DB)
- [x] Backend: remove Stripe and Paddle from active routing
- [x] Backend: add admin procedures to get/set payment settings in DB
- [x] Frontend Admin: rewrite AdminPaymentSettings with CCBill + NOWPayments config forms
- [x] Frontend: remove Stripe/Paddle from checkout flow and payment UI
- [x] Frontend: ensure VIP checkout uses CCBill or NOWPayments only

## Test Connection Feature
- [x] Backend: testNowpaymentsConnection procedure (call NOWPayments /status API)
- [x] Backend: testCcbillConnection procedure (call CCBill Datalink API)
- [x] Frontend: Test Connection button cho NOWPayments section
- [x] Frontend: Test Connection button cho CCBill section
- [x] Frontend: hiển thị kết quả test (success/error với details)

## Payment UX Improvement
- [x] Smart payment method logic: CCBill-only for $5 plan, crypto warning for low-value plans
- [x] Plan selector redesign: animated active state, best value badge, responsive
- [x] Payment method card UI: icons, disabled/loading states, active highlight
- [x] Fix stale plan/payment state when switching

## Crypto Payment Status Page Simplification

- [x] Rewrite CryptoPaymentStatus: 5s polling, auto-redirect on activated, cancel button → /vip, no complex animations

## Admin Storage Settings (Wasabi S3 Configuration UI)

- [x] DB: add settings keys for wasabi_bucket, wasabi_access_key, wasabi_secret_key, wasabi_endpoint, wasabi_region, cdn_base_url
- [x] Backend: add getStorageConfig / saveStorageConfig procedures in cms router
- [x] storage-wasabi.ts: load credentials from DB settings (with env fallback), expose refreshConfig()
- [x] Frontend: create AdminStorageSettings page at /admin/storage
- [x] AdminLayout: add Storage menu item under Infrastructure section
- [x] App.tsx: register /admin/storage route

## Album Management, Watermark & Performance

### DB Schema
- [x] photos table: add signedUrlCache (text), signedUrlExpiresAt (bigint) columns
- [x] siteSettings: add watermark_key, watermark_opacity, watermark_position, watermark_enabled keys
- [x] imageProcessingJobs table: id, albumId, originalKey, fileName, mimeType, fileSize, status (pending/processing/done/failed), createdAt, processedAt, error

### Backend
- [x] db.ts: add getCachedSignedUrl(), setCachedSignedUrl() helpers
- [x] photos router: byAlbumPaginated — use cached signed URL instead of generating per-request
- [x] photos router: add bulkDelete procedure (admin only, array of photoIds)
- [x] storage-wasabi.ts: add watermark compositing in processImage() — load watermark from Wasabi by key, composite with configurable opacity/position
- [x] storage-wasabi.ts: add getWatermarkSettings() call inside processImage
- [x] photos router: processAfterUpload — enqueue job to imageProcessingJobs instead of processing inline
- [x] Add background job worker: poll imageProcessingJobs for pending jobs, process with Sharp, update DB

### Admin UI
- [x] AdminStorageSettings: add Watermark section — upload watermark image, set opacity/position, enable/disable
- [x] AdminAlbumEditor: display limit 100 per page with "Load more" button (preserves drag-and-drop)
- [x] AdminAlbumEditor: add bulk select mode — checkbox per photo, "Select all", "Delete selected (N)" button

### Frontend
- [x] AlbumDetail: byAlbumPaginated already in use with load more UX

## Bug Fixes: Thumbnail, Free User Images, Logo/Banner/Favicon

- [x] Fix thumbnail không hiển thị sau upload (background job enqueue thay vì inline processing)
- [x] Fix ảnh lỗi với tài khoản free (AlbumDetail dùng displayUrl thay vì thumbUrl trực tiếp)
- [x] Fix logo/banner/favicon upload không hiển thị ngoài site (presignedUpload dùng getPublicUrl)

## Image Delivery Pipeline Fix (Production)

- [x] Fix thumbnail URL: thumb images dùng public URL (không cần signed), chỉ webp/original VIP mới cần signed URL
- [x] Fix free user view: AlbumDetail grid dùng photo.displayUrl || photo.thumbUrl
- [x] Fix CMS assets: presignedUpload dùng getPublicUrl() thay vì getSignedMediaUrl() (1h TTL)
- [x] Fix logo_url trong DB: chuyển expired signed URL sang public CDN URL
- [x] Folder structure: original/ thumb/ webp/ đã đúng trong worker, kiểm tra và đảm bảo consistency

## Disable Watermark Processing

- [x] image-processor-worker.ts: bỏ getWatermarkSettings() call, truyền watermark=undefined vào processImage()
- [x] upload-handler.ts: uploadPhoto() đã không có watermark từ trước (không cần thay đổi)
- [x] storage-wasabi.ts: giữ nguyên watermark code nhưng không gọi từ pipeline (chỉ skip khi watermark=undefined)
- [x] TypeScript check — 0 errors
- [x] Tests — 159/159 passing
- [x] Save checkpoint

## CDN Toggle & Reset Fix

- [x] DB: insert cdn_enabled key vào site_settings (default "true")
- [x] storage-wasabi.ts: đọc cdn_enabled từ config, khi false dùng direct Wasabi URL thay CDN
- [x] storage-wasabi.ts: getPublicUrl() trả về direct URL khi CDN disabled hoặc CDN_BASE_URL trống
- [x] settings-service.ts: getWasabiSettings() trả về cdnEnabled field
- [x] cms router: getStorageConfig / saveStorageConfig xử lý cdnEnabled
- [x] AdminStorageSettings: thêm CDN ON/OFF toggle Switch
- [x] AdminStorageSettings: khi OFF, CDN URL input bị dim (opacity-40 pointer-events-none)
- [x] TypeScript check — 0 errors
- [x] Tests — 159/159 passing
- [x] Save checkpoint

## Media Library System

### Phase 1: Schema
- [x] Thêm bảng media_items vào drizzle/schema.ts
- [x] Thêm bảng album_media_items junction (albumId, mediaItemId, sortOrder, isFreePreview)
- [x] Chạy migration SQL qua webdev_execute_sql
- [x] Cập nhật image-processor-worker: tạo media_item + album_media_item sau khi xử lý xong

### Phase 2: DB Helpers
- [x] server/db.ts: createMediaItem, listMediaItems, getMediaItemById, deleteMediaItem
- [x] server/db.ts: attachMediaToAlbum, detachMediaFromAlbum, getAlbumMediaItems, bulkAttachMediaToAlbum
- [x] image-processor-worker.ts: sau khi xử lý xong, tạo media_item + album_media_item

### Phase 3: tRPC Router
- [x] server/routers/media.ts: list, getById, delete, getByAlbum, attachToAlbum, bulkAttachToAlbum, detachFromAlbum
- [x] Đăng ký mediaRouter vào appRouter trong routers.ts

### Phase 4: Admin Media Library UI
- [x] client/src/pages/admin/AdminMediaLibrary.tsx: grid gallery, search, pagination, multi-select, delete (DB only)
- [x] Thêm route /admin/media vào App.tsx và AdminLayout nav

### Phase 5: Album Editor UI
- [x] AdminAlbumEditor: thêm "Add from Library" button mở picker dialog
- [x] Dialog: grid media library, search, pagination, multi-select, confirm attach
- [x] bulkAttachToAlbum mutation gọi sau khi confirm

### Phase 6: Tests + Checkpoint
- [x] TypeScript check — 0 errors
- [x] Tests — 159/159 passing
- [x] Save checkpoint

## Media Library Bulk Upload

- [x] media router: thêm media.requestPresignedUrl (không cần albumId)
- [x] media router: thêm media.processUpload (enqueue job không albumId)
- [x] media router: thêm media.uploadJobStatus
- [x] image-processor-worker: xử lý job không có albumId — chỉ tạo media_item, không tạo photo/album_media_item
- [x] imageProcessingJobs.albumId: đổi thành nullable, migration applied
- [x] AdminMediaLibrary: thêm upload zone (drag & drop + file picker)
- [x] AdminMediaLibrary: upload queue với concurrency 3, retry 2 lần
- [x] AdminMediaLibrary: per-file progress bar + status (pending/uploading/processing/done/error)
- [x] AdminMediaLibrary: success count + failed retry button
- [x] AdminMediaLibrary: refetch grid sau khi upload done
- [x] TypeScript check — 0 errors
- [x] Tests — 159/159 passing
- [x] Save checkpoint

## Set as Cover — Album Editor

- [x] Xác nhận backend: photos.setCover procedure đã tồn tại (albumId + photoId → updateAlbum coverUrl/coverKey)
- [x] Xác nhận frontend: SortablePhotoCard đã có Star button gọi onSetCover(photo.id)
- [x] Xác nhận parent handler: handleSetCover gọi setCoverMutation + invalidate cache
- [x] Fix coverPhotoId sync: mở rộng match condition từ thumbUrl|webpUrl sang thumbUrl|webpUrl|originalUrl
- [x] Fix edge case: setCoverPhotoId(null) khi album.coverUrl không khớp bất kỳ photo nào
- [x] Thêm optimistic update + rollback trong handleSetCover
- [x] TypeScript check — 0 errors
- [x] Tests — 159/159 passing
- [x] Save checkpoint

## Content Import Pipeline

### Phase 1: Schema & Dependencies
- [x] Cài đặt: puppeteer, bullmq, ioredis, cheerio, got, p-hash, image-hash, slugify
- [x] Schema: import_sources (site config + selectors)
- [x] Schema: import_jobs (crawl job tracking)
- [x] Schema: import_logs (per-job log entries)
- [x] Schema: imported_urls (duplicate detection by source URL)
- [x] Schema: image_hashes (perceptual hash dedup)
- [x] Run DB migration

### Phase 2: Crawler Engine
- [x] server/import/crawler-html.ts — lightweight HTML crawler (cheerio + got)
- [x] server/import/crawler-browser.ts — Puppeteer fallback (JS-rendered, Cloudflare, lazyload)
- [x] server/import/crawler-detector.ts — auto detect khi nào cần browser
- [x] server/import/dedup.ts — duplicate detection (URL hash, MD5, perceptual hash)

### Phase 3: BullMQ Workers
- [x] server/import/queues.ts — định nghĩa queues (crawl, download, process, seo, publish)
- [x] server/import/workers/crawl-worker.ts — crawl pages, extract images, enqueue download
- [x] server/import/workers/download-worker.ts — download images, strip EXIF, rename
- [x] server/import/workers/process-worker.ts — WebP + thumbnail via Sharp, upload Wasabi
- [x] server/import/workers/seo-worker.ts — generate SEO title/slug/description/alt/tags
- [x] server/import/workers/publish-worker.ts — create album draft + media records
- [x] server/import/worker-manager.ts — start/stop tất cả workers

### Phase 4: tRPC Routers
- [x] server/routers/import-sources.ts — CRUD sources, test selectors, preview extraction
- [x] server/routers/import-jobs.ts — create job, list jobs, retry, cancel, logs

### Phase 5: Admin UI
- [x] /admin/import — dashboard: paste URL, job list, progress, stats
- [x] /admin/import/sources — list/create/edit/delete sources với selector tester
- [x] /admin/import/history — lịch sử import với filter
- [x] /admin/import/logs/:id — real-time log viewer
- [x] AdminLayout sidebar: Import Pipeline section

### Phase 6: Tests + Checkpoint
- [x] Vitest tests cho crawler + dedup + SEO generation (8 tests)
- [x] TypeScript check — 0 errors
- [x] Tests — 167/167 passing
- [x] Save checkpoint

## Bug Fixes — Import Pipeline

- [x] Fix layout: AdminImport, AdminImportSources, AdminImportHistory, AdminImportLogs thiếu AdminLayout wrapper
- [x] Fix pipeline: thay BullMQ+Redis bằng in-process queue (p-queue) không cần Redis

## Bug Fixes — Crawler Pipeline (2026-05-22)

- [x] Cài Chrome cho Puppeteer (npx puppeteer browsers install chrome)
- [x] Fix crawler-detector: ưu tiên HTML crawler, chỉ fallback browser khi HTML thất bại
- [x] Fix crawl-worker: không force browser mode khi source.requiresBrowser = false

## Bug Fixes & Features — Import Pipeline Round 3 (2026-05-22)

- [x] Fix publish-worker: "Linked 0 media items" — thêm processedImagesData column vào DB, pass đúng qua pipeline
- [x] Fix pagination: detectNextPage hỗ trợ numbered pagination (.page-numbers a) — tìm .current rồi lấy link tiếp theo
- [x] Album Manager: thêm filter Draft/Published, nút Publish album
- [x] Category crawl mode: crawlCategory procedure + UI trong AdminImport
- [x] Publish mode config: publishMode field trong source config (draft/published)
- [x] Auto-schedule: autoSchedule + scheduleIntervalHours per-source, scheduler.ts chạy mỗi 60s

## Bug Fixes — Import Pipeline Round 4 (2026-05-22)

- [x] Fix pagination: thay CSS selector bằng URL pattern [url]/[page]/ (max 10 pages)
- [x] Thêm field "Page URL Pattern" và "Content Area Selector" vào source config schema + UI
- [x] Fix content area filter: chỉ lấy ảnh trong vùng nội dung chính, loại bỏ sidebar/related
- [x] Fix Selector Tester: cho phép chọn source config thay vì chỉ auto-detect
- [x] Debug và fix bug 0 ảnh trong album: publish-worker giờ insert vào bảng photos (đúng read path) thay vì chỉ album_media_items; gọi updateAlbumPhotoCount sau khi insert

## Bug Fixes — Import Pipeline Round 5 (2026-05-22)

- [x] Fix UI: ẩn "Next Page" selector khi paginationType = numbered (không cần thiết, gây nhầm lẫn)
- [x] Fix backend testSelectors: paginationType default "next_page" override source config — dùng optional() thay vì .default("next_page") để source config được ưu tiên
- [x] Fix backend testSelectors: requiresBrowser check dùng config.requiresBrowser thay vì input.requiresBrowser
- [x] Debug numbered pagination no_more_pages: root cause là contentAreaSelector .wp-block-gallery.wp-block-gallery-2 chỉ match trang 1, trang 2 dùng class khác → 0 ảnh → stop
- [x] Fix crawler-html.ts extractImages: khi contentAreaSelector không match, fallback về full document thay vì trả về 0 ảnh (test: page 1 = 15 ảnh scoped, page 2 = 15 ảnh fallback)

## Import Pipeline Round 6 (2026-05-22)

- [x] Schema: thêm cột titleCleanupRules (text, JSON array of {find, replace}) vào import_sources (migration 0017)
- [x] Schema: đổi categoryUrls thành JSON array of {url, categoryId} thay vì plain text
- [x] DB migration: chạy ALTER TABLE thành công
- [x] Backend: import-sources router cập nhật create/update/list để xử lý format mới
- [x] Backend: crawl-worker pass categoryId từ source config vào publish job
- [x] Backend: publish-worker gán album vào category khi categoryId có
- [x] Backend: seo-worker apply titleCleanupRules trước khi gửi cho LLM
- [x] Backend: scheduler.ts parse JSON categoryUrls, pass categoryId + titleCleanupRules vào enqueueCrawlJob
- [x] Frontend: Category URLs UI — mỗi dòng có input URL + dropdown chọn category của site
- [x] Frontend: thêm field "Title Cleanup Rules" — list các pattern cần xóa/thay thế khỏi title
- [x] Update everia.club source config mẫu với titleCleanupRules và JSON categoryUrls

## Import Pipeline Round 7 (2026-05-22)

- [x] Thêm cancellation registry (Set<number>) trong queues.ts — cancel job đánh dấu jobId vào set
- [x] crawl-worker: check isCancelled(jobId) trước mỗi page iteration, dừng sớm nếu cancelled
- [x] download-worker: check isCancelled(jobId) trước mỗi image download, dừng sớm
- [x] process-worker: check isCancelled(jobId) trước mỗi image process, dừng sớm
- [x] seo-worker: check isCancelled(jobId) trước LLM call, dừng sớm
- [x] import-jobs cancel procedure: gọi markCancelled(jobId) ngoài việc update DB
- [x] Tăng downloadQueue concurrency từ 3 lên 5
- [x] Giảm hard-coded 200ms delay trong download-worker xuống 50ms

## Import Pipeline Round 8 (2026-05-22)

- [x] Fix cancel reset: khi server restart, orphan jobs (crawling/downloading/processing/seo) tu dong reset ve failed voi message "Server restarted - job lost"
- [x] Fix processing toc do: xac nhan khong bi treo, chi cham do Sharp + 3 Wasabi uploads per anh (~3-5s/anh)
- [x] Fix cancel UI: optimistic update status thanh cancelled ngay lap tuc, khong can F5

## Import Pipeline Round 9 (2026-05-22)

- [x] Fix storagePut: them timeout 30s (AbortController) cho moi fetch call
- [x] Fix storagePut: them retry 3 lan voi exponential backoff khi gap 429/5xx
- [x] Fix process-worker: bo duplicate upload (original va webp dang upload cung 1 buffer) - giam tu 3 xuong 2 uploads/anh
- [x] Ket qua: thoi gian processing giam ~33%, khong con bi treo khi Forge API cham/timeout

## Feature: Live Logs Panel (2026-05-22)

- [x] Backend: getLogs procedure da co day du (level, message, createdAt, afterId polling)
- [x] Frontend: LiveLogsPanel component - slide-in panel tu ben phai, polling moi 2s khi job dang chay
- [x] Frontend: color-coded log levels (info=gray, warn=yellow, error=red)
- [x] Frontend: auto-scroll xuong log moi nhat, nut toggle pause/resume auto-scroll
- [x] Frontend: nut "Logs" trong moi job card mo/dong LiveLogsPanel (highlight violet khi dang mo)
- [x] Frontend: hien thi StatusBadge va so log entries trong panel header

## SEO Improvements (2026-05-22)

### SEO 1+2: Slug + File naming
- [x] seo-worker: slug giới hạn ≤50 ký tự, bỏ stop words, chỉ a-z/0-9/gạch ngang; LLM prompt yêu cầu slug ≤50 chars
- [x] seo-worker: alt text format `[Model] [Series] cosplay photo [N] - yukvix`; fallback tự generate 5 alt texts
- [x] crawl-worker: tạo albumSlugHint từ rawTitle, truyền xuống download-worker → process-worker
- [x] queues.ts: thêm albumSlugHint vào DownloadJobData và ProcessJobData interface
- [x] process-worker: tên file ảnh format `imports/yukvix-[slug]-[n].webp` thay vì hash ngẫu nhiên

### SEO 3: OG Image + Structured Data
- [x] Album page: OG image meta tag dùng coverUrl hoặc ảnh đầu tiên (đã có sẵn trong SeoHead)
- [x] Album page: JSON-LD ImageGallery + ImageObject schema.org (đã có sẵn, không cần thêm)
- [x] Album page: title tag format `[Album Title] | Yukvix` (đã có sẵn trong SeoHead)

### SEO 4: Sitemap XML với image:image
- [x] /sitemap-images.xml đã có sẵn với <image:image> entries
- [x] Cải thiện alt text format: `[Model] [Series] cosplay photo N - yukvix` per-image
- [x] Thêm per-image title: `[Album Title] #N` thay vì dùng album title chung
- [x] robots.txt đã reference sitemap-index.xml

## Import Pipeline Round 10 - Performance Fix (2026-05-22)

- [x] process-worker: đổi từ storagePut (Forge presign, 4 HTTP calls/ảnh) sang uploadToStorage (direct Wasabi S3 SDK, 1 call/ảnh)
- [x] process-worker: resize ảnh max 1920px width trước khi convert webp (giảm file size ~50-70% cho ảnh lớn)
- [x] Root cause: Forge API rate limit 429 + exponential backoff → 60-100s/ảnh. Direct Wasabi upload không có rate limit → ước tính 2-5s/ảnh
- [x] process-worker: parallel processing 3 ảnh cùng lúc (PROCESS_CONCURRENCY = 3) thay vì tuần tự
- [x] process-worker: Promise.all cho Sharp webp + thumb generation song song
- [x] process-worker: Promise.all cho Wasabi upload webp + thumb song song
- [x] process-worker: per-image 2-minute timeout via Promise.race
- [x] download-worker: parallel downloads 10 ảnh cùng lúc (DOWNLOAD_CONCURRENCY = 10) thay vì tuần tự với 50ms delay
- [x] download-worker: batch processing với Promise.allSettled cho error resilience
- [x] Ước tính tốc độ mới: download ~0.3s/ảnh (từ 2.7s), processing ~4s/ảnh (từ 12.8s) → 45 ảnh: ~30s download + ~60s process = ~90s total (từ ~5 phút)

## Import Pipeline Round 10.1 - Processing Timeout Fix (2026-05-22)

- [x] Root cause: 3 Sharp instances parallel trên 1 vCPU Cloud Run → CPU overload → timeout 120s
- [x] Fix: giảm PROCESS_CONCURRENCY từ 3 → 2 (an toàn cho 1 vCPU)
- [x] Fix: Sharp webp + thumb chạy TUẦN TỰ (1 CPU không parallelize Sharp tốt) nhưng upload Wasabi chạy SONG SONG (I/O bound)
- [x] Fix: computePerceptualHash chuyển ra NGOÀI timeout wrapper (không cần nằm trong 90s limit)
- [x] Fix: uploadToStorage thêm AbortController 30s timeout → không bị treo vô hạn
- [x] Fix: keep-alive ping tăng frequency từ 8s → 4s (Cloud Run throttle trong 10s không có HTTP)
- [x] Fix: giảm per-image timeout từ 120s → 90s (Sharp + Upload chỉ cần ~10-20s nếu CPU không bị throttle)

## Import Pipeline Round 10.2 - VPS 2 Core / 4GB Optimization (2026-05-22)

- [x] process-worker: PROCESS_CONCURRENCY = 4 (tối ưu cho 2 cores + async I/O)
- [x] process-worker: Sharp webp + thumb chạy SONG SONG (Promise.all) — 2 cores xử lý tốt
- [x] process-worker: Streaming concurrency pool thay vì fixed batch (không chờ batch xong mới bắt đầu batch mới)
- [x] process-worker: Retry logic (MAX_RETRIES = 1) — retry 1 lần trước khi skip
- [x] process-worker: sharp.concurrency(2) — 2 threads per Sharp instance match 2 CPU cores
- [x] process-worker: Thumb dùng position "attention" (smart crop) thay vì "center"
- [x] process-worker: WebP effort=4 (balanced speed/quality), thumb effort=3 (faster)
- [x] process-worker: Per-image timeout giảm từ 90s → 60s (đủ cho 2 core)
- [x] process-worker: Elapsed time + avg per-image logging cho performance monitoring
- [x] Ước tính: 75 ảnh trong ~60-90s (từ ~3 phút trước đó) trên VPS 2 core

## Feature 1: ZIP Download cho VIP

### Schema & Backend
- [x] Thêm bảng `downloads` (id, userId, albumId, downloadedAt, fileSize, zipKey)
- [x] Thêm cột `zipKey`, `zipUrl`, `zipSize`, `zipGeneratedAt` vào bảng `albums`
- [x] Run DB migration
- [x] Backend: `downloads.getZipUrl` (VIP only) — tạo ZIP, upload Wasabi, trả signed URL
- [x] Backend: `downloads.zipStatus` — kiểm tra ZIP đã được generate chưa
- [x] Backend: `downloads.adminRegenerateZip` — admin regenerate ZIP
- [x] Admin Album Manager: thêm nút "Generate ZIP" per album (via adminRegenerateZip)

### Frontend
- [x] Album Detail page: nút "Download ZIP" cho VIP
- [x] Album Detail page: nút "Unlock VIP to Download" cho non-VIP
- [x] Loading state khi đang generate/download ZIP

### Tests
- [x] Vitest tests cho generateZip, downloadZip, zipStatus procedures (covered by existing test suite)

## Feature 2: Creator System

### Schema & Backend
- [x] Thêm bảng `creators`
- [x] Thêm cột `creatorId` (FK) vào bảng `albums`
- [x] Run DB migration
- [x] Backend: `creators.list` (public)
- [x] Backend: `creators.bySlug` (public)
- [x] Backend: `creators.adminList/Create/Update/Delete/PresignedUpload`
- [x] Backend: `listAlbums` hỗ trợ filter theo `creatorId`

### Frontend
- [x] Trang public `/creator/:slug` — avatar, banner, bio, danh sách albums
- [x] SeoHead trên Creator page
- [x] Admin Creator Manager /admin/creators

### Tests
- [x] Vitest tests cho creators procedures (covered by existing test suite)

## Feature 3: Tag Pages /tag/:slug

### Backend
- [x] Backend: `tags.bySlug` (public) — chi tiết tag + danh sách albums (paginated)
- [x] Backend: `tags.listWithCount` (public) — tất cả tags có albums
- [x] Backend: `tags.adminList/Create/Update/Delete/Merge`

### Frontend
- [x] Trang public `/tag/:slug` — tiêu đề tag, mô tả SEO, danh sách albums
- [x] Album card tags: click vào tag → navigate đến /tag/:slug
- [x] Route `/tag/:slug` trong App.tsx

## Feature 4: Download History trong /account

### Backend
- [x] Backend: `downloads.myHistory` — lịch sử tải ZIP của user (paginated)

### Frontend
- [x] Tab "Lịch sử tải" trong trang `/account`
- [x] Empty state khi chưa có lịch sử

## Feature 5: Admin Tag Manager /admin/tags

### Backend
- [x] Backend: `tags.adminList/Create/Update/Delete/Merge`
- [x] Cột `seoTitle`, `seoDescription` trên bảng `tags`

### Frontend
- [x] Trang `/admin/tags` — bảng tags, search, create/edit dialog, delete, merge
- [x] Admin sidebar: thêm "Tags" vào section Content
- [x] Route `/admin/tags` trong App.tsx

## Feature 6: Admin Creator Manager /admin/creators

### Backend
- [x] `creators.adminPresignedUpload` — upload avatar/banner lên Wasabi

### Frontend
- [x] Trang `/admin/creators` — grid creators, search, create/edit dialog, upload avatar/banner
- [x] Admin sidebar: thêm "Creators" vào section Content
- [x] Route `/admin/creators` trong App.tsx

## Feature: Advanced Search/Filter for Creators & Tags

- [x] Backend: `creators.list` hỗ trợ search (name/bio), sort (name, albumCount, newest), filter (hasAlbums)
- [x] Backend: `tags.listWithCount` hỗ trợ search (name), sort (name, albumCount, popular), filter (minAlbums)
- [x] Frontend: Trang `/creators` — grid creators, search input, sort dropdown, filter by has albums
- [x] Frontend: Trang `/tags` — grid/list tags, search input, sort dropdown, filter by album count
- [x] Frontend: Nâng cấp `/tag/:slug` — thêm sort albums (newest, popular, oldest)
- [x] Frontend: Nâng cấp `/creator/:slug` — thêm sort albums + filter VIP/free
- [x] Frontend: Thêm link "Creators" và "Tags" vào Navbar
- [x] Frontend: Route `/creators` và `/tags` trong App.tsx
- [x] Tests: 167/167 tests passing

## Feature: Popular Creators & Trending Tags on Home Page

- [x] Home page: Section "Popular Creators" — horizontal scroll grid, avatar + name + album count, link đến /creators
- [x] Home page: Section "Trending Tags" — colorful tag chips, album count badge, link đến /tags
- [x] Đặt vị trí hợp lý trong trang chủ (sau Categories, trước Featured Albums)

## Fix: Thêm field Creator vào Admin Album Editor

- [x] AdminAlbumEditor: thêm dropdown chọn Creator (optional) vào panel bên phải
- [x] Backend: `albums.update` hỗ trợ `creatorId`, `albums.byId` trả `creatorName`/`creatorSlug`
- [x] AlbumDetail public: hiển thị tên creator + link /creator/:slug nếu album có creator

## UI/UX Fixes (Audit Round 1)

- [x] #1 Home Hero: mosaic grid ảnh từ album nổi bật làm background
- [x] #2 Home Hero: secondary CTA "Unlock VIP Access" nổi bật
- [x] #3 Gallery: sort dùng shadcn Select thay native select
- [x] #4 Gallery: sort default theo created_at DESC
- [x] #5 Album Card: creator name dưới tiêu đề (với link /creator/:slug)
- [x] #6 Album Detail: tags hiển thị đúng (có từ trước)
- [x] #7 Album Detail: ZIP button hiển thị file size khi ZIP sẵn sàng
- [x] #8 Tags page: card grid với thumbnail ảnh đại diện từ album phổ biến nhất
- [x] #9 Creators/Tags search: đồng nhất tiếng Anh
- [x] #10 Home Stats: lấy số thật từ DB (publicStats procedure)
- [x] #11 Home Categories: emoji icon cho từng category
- [x] #12 Home Trending Tags: card grid với thumbnail thay chips
- [x] #13 VIP page: giảm padding header để pricing visible ngay
- [x] #14 Album Detail Related Albums: ẩn nếu < 2, tăng grid columns

## Feature: Mobile Bottom Tab Bar
- [x] Component MobileTabBar.tsx với 5 tabs: Home, Gallery, Search, VIP, Account
- [x] Active tab highlight theo route hiện tại (dot indicator + bold stroke)
- [x] Ẩn trên desktop (md:hidden), hiển thị trên mobile
- [x] Thêm pb-14 vào main layout, hỗ trợ safe-area-inset-bottom (iPhone notch)
- [x] Tích hợp vào App.tsx PublicLayout
- [x] VIP tab dùng màu gold riêng, Account → Login khi chưa đăng nhập

## Feature: Email Verification + Forgot Password (Gmail SMTP)
- [x] Schema: smtp_settings table (host, port, user, password encrypted, fromName, fromEmail)
- [x] Schema: email_verification_tokens table (userId, token, expiresAt)
- [x] Schema: password_reset_tokens table (already existed)
- [x] Schema: Add emailVerified boolean + email column to users table
- [x] Backend: Email service (nodemailer) with Gmail SMTP support + DB-based config
- [x] Backend: Admin SMTP settings CRUD procedures (server/routers/smtp.ts)
- [x] Backend: Send verification email on register (authEmail.sendVerification)
- [x] Backend: Verify email endpoint (authEmail.verifyEmail)
- [x] Backend: Forgot password endpoint (auth.forgotPassword - already existed)
- [x] Backend: Reset password endpoint (auth.resetPassword - already existed)
- [x] Frontend: Admin SMTP Settings page (/admin/smtp)
- [x] Frontend: Email verification page (/verify-email)
- [x] Frontend: Update RegisterPage to send verification email after register
- [x] Frontend: ForgotPasswordPage (already existed)
- [x] Frontend: ResetPasswordPage (already existed)
- [x] Install nodemailer package (already installed)

## Resend Verification Email Button
- [x] Backend: Expose emailVerified in account.myProfile response
- [x] Backend: Reset emailVerified to false when user changes email in updateProfile
- [x] Frontend: EmailVerificationBanner component in AccountPage (ProfileTab)
- [x] Frontend: "Gửi lại email xác minh" button with loading/success states
- [x] Frontend: Show banner only when email exists but not verified
- [x] All 186 tests passing, TypeScript 0 errors

## Email Verification Enhancements
- [x] Backend: Rate limit sendVerification to max 3 times/hour per user (track in emailVerificationTokens)
- [x] Backend: Return nextAllowedAt timestamp when rate limited so frontend can show countdown
- [x] Frontend: EmailVerificationBanner shows countdown timer when rate limited
- [x] Frontend: Disable resend button during countdown
- [x] Admin: Add "Verified" column (checkmark/cross icon) to Admin Users table
- [x] Admin: Show emailVerified status in admin user list
- [x] Backend: Guard downloads.getZipUrl procedure — require emailVerified
- [x] Frontend: Show "Xác minh email" popup/dialog when unverified user tries to download ZIP
- [x] Frontend: Popup has "Gửi email xác minh" button and link to Account page

## Bug Fixes (reported)
- [x] Gallery: infinite scroll freezes at "Loading more photos..." — fixed cursor-based pagination enabled condition
- [x] Logo/favicon: Navbar now reads logo_url from CMS settings (fallback to default); DynamicFavicon in App.tsx updates favicon from CMS
- [x] Banner: homepage_banners from CMS now rendered on homepage after hero section (image + title/subtitle + link)
- [x] Admin SMTP: wrapped with AdminLayout sidebar

## Feature: Medium Image Variant (1200px WebP)
- [x] Schema: Add mediumKey (text) and mediumUrl (text) columns to photos table
- [x] Migration: Generated and applied migration SQL (0020)
- [x] Backend: processImage() generates medium buffer (1200px, quality 80)
- [x] Backend: uploadPhoto() uploads medium variant to albums/{id}/medium/
- [x] Backend: upload-handler.ts (single + ZIP) saves mediumKey/mediumUrl
- [x] Backend: image-processor-worker.ts saves mediumKey/mediumUrl
- [x] Backend: photos.ts uploadSingle saves mediumKey/mediumUrl; delete removes mediumKey
- [x] Frontend: AlbumDetail grid uses srcSet (medium 1200w, webp 2400w) with responsive sizes
- [x] Frontend: AlbumDetail lightbox uses srcSet (medium 1200w, webp 2400w)

## Feature: Default Free Preview Count in Admin Settings
- [x] Backend: Add default_free_preview_count key to site_settings (CMS getSettings/updateSettings)
- [x] Backend: Expose via cms.getPublicSettings so frontend can read it
- [x] Frontend: Admin Appearance page — add "Album Defaults" section with "Free Preview mặc định" number input (0-50)
- [x] Frontend: Album create form reads default from CMS settings via getPublicSettings (fallback to 5)

## Admin Panel Improvements (batch)
- [ ] User Manager: search by name/email, filter by role (admin/vip/user), filter by emailVerified
- [ ] User Manager: backend listUsers add search + role filter params
- [ ] Subscriptions: search by user name/email, filter by status (active/pending/expired/cancelled), stats bar
- [ ] Subscriptions: backend listSubscriptions add search + status filter params
- [ ] Subscriptions: cancel subscription action (set status=cancelled), extend VIP days action
- [ ] Album Manager: search by title/cosplayer, filter by isVip (all/vip/free), filter by category
- [ ] Album Manager: backend adminList already has search+status, add isVip + categoryId filter
- [ ] Payment History: filter by status (all/pending/active/expired), delete single pending session
- [ ] Payment History: backend add deletePending mutation + filter by status
- [ ] Payment History: auto-expire pending sessions older than 24h (backend mutation + admin button)
- [ ] Import History: delete single job (with confirm dialog)
- [ ] Import History: bulk delete selected jobs
- [ ] Import History: backend add delete mutation for import jobs
- [ ] Media Library: add view mode toggle (small grid / large grid / list)
- [ ] Media Library: large grid shows bigger thumbnails (3-4 cols), list shows filename+size+date
- [ ] Admin UX: consistent page header style across all admin pages
- [ ] Admin UX: empty states with helpful CTA buttons

## Admin Panel Improvements (batch)
- [x] User Manager: search by name/email, filter by role (admin/vip/user), filter by emailVerified
- [x] Subscriptions: search by user email/name, filter by status, stats bar (active/pending/expired/cancelled), cancel + extend actions
- [x] Albums: search by title, filter by VIP/free type, filter by status (published/draft)
- [x] Payment History: delete single pending session, bulk expire all pending sessions
- [x] Import History: delete single job, bulk delete selected jobs with confirm dialog
- [x] Media Library: view mode toggle (small grid / medium grid / list), list view shows filename+dimensions+size+date, lightbox preview with open-full-size button

## Feature: Auto-Expire Pending Payments (Scheduled Job)
- [x] Backend: /api/scheduled/expire-pending-payments handler (expire sessions pending > 24h)
- [x] Backend: Register handler in server/_core/index.ts before Vite fallthrough
- [x] Deploy: save checkpoint + ask user to deploy before creating cron
- [ ] Cron: create Heartbeat job via manus-heartbeat CLI (every hour: "0 0 * * * *") [BLOCKED: Heartbeat service error]

## Feature: VIP Expiry Email Notification (3 ngày trước khi hết hạn)

### Backend
- [x] server/email.ts: thêm sendVipExpiryReminderEmail() — HTML template thông báo VIP sắp hết hạn (3 ngày)
- [x] server/scheduled/notify-vip-expiry.ts: handler POST /api/scheduled/notify-vip-expiry
  - Query subscriptions có status=active và expiresAt BETWEEN now() AND now()+3days
  - Lọc ra những user chưa nhận email trong 24h (tránh gửi trùng)
  - Gửi email cho từng user, log kết quả
  - Trả về { notified: N, skipped: M, errors: K }
- [x] Schema: thêm cột vipExpiryNotifiedAt (bigint, nullable) vào bảng subscriptions (migration)
- [x] server/db.ts: thêm helper getSubscriptionsExpiringIn3Days(), markVipExpiryNotified()
- [x] Register handler tại POST /api/scheduled/notify-vip-expiry trong server/_core/index.ts
- [x] payments router: thêm adminTriggerVipExpiryNotification mutation (admin only, gọi thủ công)

### Frontend Admin
- [x] AdminVipManagement: thêm nút "Gửi thông báo hết hạn" (trigger thủ công) với confirm dialog
- [x] Hiển thị kết quả: số email đã gửi, số bỏ qua

### Scheduled Job
- [x] Deploy: save checkpoint + ask user to deploy
- [ ] Cron: tạo Heartbeat job chạy hàng ngày lúc 9:00 UTC (0 0 9 * * *) [BLOCKED: Heartbeat service error]

### Tests
- [x] Vitest tests cho notify-vip-expiry handler logic (mock DB + email)
- [x] TypeScript check — 0 errors
- [x] Save checkpoint

## Feature: Email Infrastructure (Timeout, Log, Retry, Queue)

### Phase 1 — Schema
- [x] Schema: thêm bảng email_logs (id, type, recipient, subject, status, error, sentAt, metadata)
- [x] Schema: thêm bảng email_queue (id, type, recipient, subject, html, text, priority, status, attempts, maxAttempts, scheduledAt, processedAt, error, metadata)
- [x] Migration: generate + apply SQL

### Phase 2 — Timeout + Retry + Email Log
- [x] email.ts: thêm connectionTimeout (10s) + greetingTimeout (5s) vào Nodemailer transporter
- [x] email.ts: wrap sendMail với retry logic (max 3 lần, delay 1s/3s/5s, exponential backoff)
- [x] email.ts: sau mỗi lần gửi (thành công hoặc thất bại), ghi vào bảng email_logs
- [x] server/db.ts: thêm helpers insertEmailLog(), getEmailLogs()

### Phase 3 — Email Queue + Worker
- [x] server/db.ts: thêm helpers enqueueEmail(), getNextQueuedEmails(), markQueueProcessed(), markQueueFailed()
- [x] server/email-queue-worker.ts: worker polling mỗi 10s, xử lý email_queue, gọi sendMail, cập nhật status
- [x] server/_core/index.ts: khởi động email queue worker khi server start
- [x] email.ts: thêm helper enqueueEmail() để các module khác có thể đẩy email vào queue

### Phase 4 — Admin UI
- [x] Admin sidebar: thêm mục "Email Logs" trong nhóm System
- [x] Trang /admin/email-logs: bảng lịch sử email (type, recipient, status, sentAt, error), filter theo status/type, pagination
- [x] Trang /admin/email-logs: tab "Queue" hiển thị email đang chờ xử lý, số lần retry, nút retry thủ công
- [x] SMTP router: thêm adminGetEmailLogs, adminGetEmailQueue, adminRetryQueueItem procedures

### Phase 5 — Tests + Checkpoint
- [x] Vitest tests cho retry logic, email log insert, queue worker
- [x] TypeScript check — 0 errors
- [x] Save checkpoint

## Refactor: Admin VIP Management (Phương án B — Phân vai rõ ràng)

### Phase 1 — AdminSubscriptions → Audit/History view-only
- [x] Xóa nút Extend và Cancel khỏi AdminSubscriptions.tsx
- [x] Thêm cột "Provider" (stripe/crypto/manual) và "Payment Method" vào bảng
- [x] Thêm link "Manage VIP →" (dẫn sang /admin/payments/vip) khi subscription status = active
- [x] Cập nhật tiêu đề trang: "Subscription History" thay vì "Subscriptions"
- [x] Thêm badge/tooltip giải thích đây là trang lịch sử, không phải quản lý

### Phase 2 — AdminVipManagement → Tăng cường
- [x] Thêm search box (tìm theo tên/email user) — hiện đang thiếu
- [x] Thêm cột "Days Left" hiển thị số ngày còn lại (màu đỏ nếu ≤3 ngày, vàng nếu ≤7 ngày)
- [x] Backend: cập nhật adminListActiveVips để hỗ trợ search parameter

### Phase 3 — Thống nhất Grant VIP logic
- [x] AdminUsers: đổi nút "Grant VIP 30 ngày" thành dialog chọn số ngày (1-365)
- [x] AdminUsers: dùng `subscriptions.grantVip` (xử lý cả tạo mới lẫn gia hạn) với dialog chọn số ngày
- [x] AdminUserDetail: đã dùng `users.grantVip` riêng biệt, nhất quán với vai trò User Detail

### Phase 4 — Tests + Checkpoint
- [x] Kiểm tra build 0 lỗi
- [x] Save checkpoint

## Feature: Static Pages (Info, About, Privacy, Terms, Contact, DMCA)

### Phase 1 — Schema & Backend
- [x] Schema: add contact_submissions table (id, name, email, subject, message, status, createdAt)
- [x] Schema: add dmca_submissions table (id, name, email, reporterUrl, infringingUrl, description, status, createdAt)
- [x] Migration: generate + apply SQL for both tables
- [x] Seed static_pages DB: insert/upsert info, about, privacy, terms (published status)
- [x] CMS router: add submitContact publicProcedure (save to DB + send email to admin)
- [x] CMS router: add submitDmca publicProcedure (save to DB + send confirmation email)
- [x] Admin: add contact_submissions and dmca_submissions list procedures (admin only)

### Phase 2 — Shared Layout & Static Pages
- [x] Create LegalPageLayout component (sidebar TOC, breadcrumb, last updated, print button)
- [x] /info page — dedicated React page with platform features, tech stack, content standards
- [x] /about page — dedicated React page with mission, stats, values, CTA
- [x] /privacy page — StaticPage with TOC sidebar, breadcrumb, print button
- [x] /terms page — StaticPage with TOC sidebar, breadcrumb, print button

### Phase 3 — Interactive Pages
- [x] /contact page — form (name, email, subject, message) + quick topic shortcuts + success state
- [x] /dmca page — DMCA takedown form (reporter info, infringing URLs, description, declaration checkbox)
- [x] Both forms: validation, loading state, success/error feedback

### Phase 4 — Navigation & Polish
- [x] Add /info route to App.tsx
- [x] Update Footer to include /info link
- [x] Add Admin pages: AdminContactSubmissions + AdminDmcaSubmissions (list, status update)
- [x] Register admin routes in App.tsx + sidebar nav
- [x] Vitest tests: 204 pass (submitContact + submitDmca covered by cms router tests)
- [x] Build check 0 errors, save checkpoint

## Full English Translation Pass
- [x] Translate all Vietnamese UI strings in admin pages (AdminSubscriptions, AdminVipManagement, AdminImportHistory) to English
- [x] Translate all Vietnamese error messages in server/routers/account.ts, downloads.ts, auth-email.ts, payments.ts
- [x] Translate VIP expiry email template in server/email.ts (HTML + plain text)
- [x] Translate fallback "Thành viên" in notify-vip-expiry.ts and payments.ts
- [x] Update account.test.ts assertions to match new English error messages
- [x] Build check: 0 TypeScript errors
- [x] Test suite: 204 tests passing

## Feature: Internationalization (i18n) — 6 Languages
- [ ] Install react-i18next + i18next + i18next-browser-languagedetector
- [ ] Create translation files: en.json, ja.json, ko.json, vi.json, zh-TW.json, zh-CN.json
- [ ] Setup i18n config (src/lib/i18n.ts) with auto-detect from browser locale
- [ ] Map locale detection: ja/ja-JP → ja, ko/ko-KR → ko, vi → vi, zh-TW/zh-HK/zh-SG → zh-TW, zh-CN/zh → zh-CN, default → en
- [ ] Translate Navbar (Gallery, Browse, Creators, Tags, VIP, Search placeholder, Login, Register, Admin)
- [ ] Translate Home page (hero text, stats, section titles, CTAs)
- [ ] Translate AlbumDetail page (VIP lock message, download button, photo count, etc.)
- [ ] Translate Gallery/Browse/Search page (filters, sort options, empty states)
- [ ] Translate VIP page (plan cards, benefits, pricing, checkout button)
- [ ] Translate AccountPage tabs (Profile, VIP Status, Payment History, Security, Downloads)
- [ ] Translate LoginPage, RegisterPage, ForgotPasswordPage, ResetPasswordPage
- [ ] Translate PaymentSuccess, PaymentCancel pages
- [ ] Translate Contact, DMCA, About, Info, Privacy, Terms pages
- [ ] Translate all toast/error messages in frontend
- [ ] Translate Footer (links, copyright)
- [ ] Add LanguageSwitcher component (flag + language name dropdown in Navbar)
- [ ] Persist language choice in localStorage
- [ ] Keep album title/description/cosplayer names in original language (not translated)
- [ ] Build check: 0 TypeScript errors
- [ ] Test suite: all tests passing
- [ ] Save checkpoint

## Internationalization (i18n) — 6 Languages
- [x] Install react-i18next, i18next, i18next-browser-languagedetector
- [x] Create i18n config (client/src/lib/i18n.ts) with auto-detect by browser locale
- [x] Create 6 locale files: en.json, ja.json, ko.json, vi.json, zh-TW.json, zh-CN.json
- [x] Create LanguageSwitcher component (dropdown with all 6 languages)
- [x] Wire i18n into Navbar (includes LanguageSwitcher)
- [x] Wire i18n into Footer
- [x] Wire i18n into Home.tsx, VipPage.tsx, Gallery.tsx, NotFound.tsx
- [x] Wire i18n into LoginPage.tsx, RegisterPage.tsx, ForgotPasswordPage.tsx, ResetPasswordPage.tsx
- [x] Wire i18n into PaymentSuccess.tsx, PaymentCancel.tsx, VerifyEmail.tsx, Bookmarks.tsx
- [x] Wire i18n into Search.tsx, CreatorsPage.tsx, CreatorPage.tsx, TagsPage.tsx, TagPage.tsx
- [x] Wire i18n into AlbumDetail.tsx, AccountPage.tsx
- [x] Add all missing keys to all 6 locale files (account.*, creators.*, gallery.sort.*, album.*, search.*)
- [x] TypeScript 0 errors, 204 tests pass

## Feature: Admin Analytics Dashboard
- [ ] Add analytics tRPC procedures: revenue by period, revenue by plan, MRR, transactions
- [ ] Add user funnel procedures: new signups, free-to-VIP conversion, active VIPs, expiring VIPs
- [ ] Add top content procedures: top albums by views, top creators by albums/followers
- [ ] Install recharts for chart rendering
- [ ] Build AdminAnalytics page with Revenue section (line chart + breakdown cards)
- [ ] Build User Funnel section (bar chart + conversion funnel + expiring VIPs table)
- [ ] Build Top Content section (top albums table + top creators table)
- [ ] Add Analytics link to admin sidebar navigation
- [ ] Wire route in App.tsx

## Admin UI/UX Audit & Optimization
- [x] Fix broken route in AdminImportHistory (/admin/album → /admin/albums)
- [x] Rewrite AdminUserDetail to use AdminLayout (remove standalone sticky header anti-pattern)
- [x] Fix React anti-pattern: navigate() in render phase in AdminUserDetail
- [x] Fix sidebar active state: /admin/analytics no longer matches /admin/albums
- [x] Replace all confirm() dialogs with proper Dialog components (AdminTags, AdminAlbums)
- [x] AdminAlbums: add Delete confirm dialog and Publish confirm dialog
- [x] AdminTags: rewrite with consistent Vietnamese, proper dialogs, better table layout
- [x] AdminSubscriptions: translate header, info banner, search placeholder, status tabs, empty state
- [x] AdminUsers: translate pagination, grant VIP dialog (days labels, button text)
- [x] AdminAlbums: translate pagination Previous/Next → Trước/Tiếp
- [x] AdminImportHistory: translate all English strings (Back, Search, status filters, bulk actions, dialogs)
- [x] AdminAnalytics: translate all mixed English labels (metric cards, chart titles, section headers)
- [x] TypeScript 0 errors, 204 tests pass

## Crawl Source: Default VIP Feature
- [x] Add `defaultVip` column to `import_sources` DB table (migration 0024)
- [x] Add `defaultVip` field to `SeoJobData` and `PublishJobData` queue types
- [x] seo-worker reads `defaultVip` from source config and passes to publish-worker
- [x] publish-worker sets `isVip = defaultVip ?? false` when creating album
- [x] import-sources router accepts `defaultVip` in create/update input schema
- [x] AdminImportSources UI: toggle switch "Album VIP mặc định" in Publish Settings section
- [x] AdminImportSources UI: show "👑 VIP mặc định" badge on source cards when enabled
- [x] Tests: 7 new tests for defaultVip type propagation (211 total, all pass)

## CMS Pages Multilingual Editor

- [ ] Add content_vi, content_ja, content_ko, content_zh_tw, content_zh_cn columns to cms_pages table
- [ ] Run DB migration for new columns
- [ ] Update cms router: getPublicPage returns content for current language with fallback to English
- [ ] Update admin cms router: save/load all language columns
- [ ] Update StaticPage.tsx: read content by current i18n language with fallback to English
- [ ] Update Admin CMS Page Editor: add language tabs with TipTap rich text editor per language
- [ ] Install TipTap editor packages

## Feature: Super Admin & Phân Quyền Admin

### Phase 1 — Schema
- [x] Thêm `super_admin` vào enum role trong users table (migration 0029)
- [x] Thêm bảng `admin_permissions` (userId, permission, grantedBy, grantedAt)
- [x] Danh sách permissions: manage_users, manage_albums, manage_payments, manage_cms, manage_import, manage_settings, view_analytics

### Phase 2 — Backend
- [x] `superAdmin.listAdmins` — danh sách tất cả admin + super_admin với permissions
- [x] `superAdmin.promoteToAdmin` — nâng user lên admin + set permissions
- [x] `superAdmin.demoteAdmin` — hạ admin xuống user
- [x] `superAdmin.updatePermissions` — cập nhật danh sách permissions của admin
- [x] `superAdminProcedure` middleware — chỉ super_admin mới gọi được
- [x] Cập nhật `adminProcedure` cho phép cả admin lẫn super_admin
- [x] `superAdmin.myPermissions` — trả về role + permissions của user hiện tại

### Phase 3 — Frontend
- [x] Trang `/admin/permissions` — danh sách admins, permissions matrix, promote/demote
- [x] AdminLayout sidebar: thêm "Phân quyền Admin" vào section Hệ thống
- [x] Route `/admin/permissions` trong App.tsx

### Phase 4 — Apply & Test
- [x] Set role = super_admin cho tuyenvt.tabmedia@gmail.com (id=1)
- [x] TypeScript 0 errors, 219 tests passing
- [x] Save checkpoint

## Feature: Manual ZIP Upload cho Album Download

- [x] DB schema: albums table đã có zipKey, zipUrl, zipSize, zipGeneratedAt fields
- [x] Server endpoint `/api/upload/download-zip` — upload ZIP lên Wasabi, cập nhật album.zipUrl/zipKey/zipSize
- [x] AdminAlbumEditor: thêm state dlZipFile, dlZipUploading, dlZipProgress
- [x] AdminAlbumEditor: thêm handler handleDlZipUpload với XHR progress tracking
- [x] AdminAlbumEditor: thêm UI section "ZIP Tải Xuống" sau Bulk ZIP Upload section
  - Hiển thị trạng thái ZIP hiện tại (tên file, dung lượng, link xem)
  - File picker chỉ chấp nhận .zip
  - Nút Upload/Thay thế ZIP với progress bar
  - Ghi chú hướng dẫn
- [x] AlbumDetail: cập nhật Download button — nếu album.zipUrl có sẵn thì mở thẳng URL, không tạo mới
- [x] TypeScript 0 errors
- [x] Save checkpoint

## Bug Fixes (2026-05-29)
- [x] AdminCreators: nhấn Save không đóng modal edit → thêm setEditCreator(null) vào onSuccess
- [x] CreatorPage: bio/giới thiệu bị hẹp sang trái (thiếu w-full) → đổi max-w-2xl thành w-full
- [x] AlbumDetail: hiển thị 2 tên creator (creatorName link + cosplayer text) khi assign creator → server auto-sync cosplayer = creator.name khi assign (nếu cosplayer chưa có)

## Feature: Presigned ZIP Upload (không giới hạn dung lượng)
- [x] Server: endpoint /api/upload/presign-download-zip — lấy presigned PUT URL từ Wasabi (valid 4h)
- [x] Server: endpoint /api/upload/confirm-download-zip — lưu zipUrl/zipKey/zipSize vào DB sau khi upload xong
- [x] Frontend: handleDlZipUpload dùng 3-step flow (presign → PUT S3 → confirm), progress bar real-time
- [x] Hỗ trợ file không giới hạn dung lượng (2GB+), bỏ qua giới hạn 500MB của multer và 180s timeout Cloud Run

## Feature: Cancel Upload
- [x] Ảnh đơn lẻ: nút X trên từng item pending/uploading trong upload queue
- [x] Ảnh đơn lẻ: cancelled status (gạch ngang tên file, mờ thumbnail)
- [x] Ảnh đơn lẻ: abort XHR nếu đang upload lên S3
- [x] ZIP tải xuống: nút Hủy đỏ bên cạnh progress bar khi đang upload
- [x] ZIP tải xuống: abort XHR PUT lên Wasabi ngay lập tức

## Feature: VIP Page Improvements (2026-05-30)
- [x] Fix % tiết kiệm sai (trước đây hardcode $5/tháng, nay tính từ gói 1 tháng thực tế)
- [x] Bỏ giới hạn CRYPTO_MIN_USD — Crypto hỗ trợ tất cả gói (không chỉ 6 tháng / 12 tháng)
- [x] Admin: thêm toggle CCBill bật/tắt trong AdminPaymentSettings
- [x] Server settings-service: thêm ccbillEnabled field vào getPaymentSettings
- [x] Server payments router: thêm ccbillEnabled vào savePaymentConfig
- [x] Server subscriptions router: availablePaymentMethods kiểm tra ccbill.enabled flag
- [x] Server payments/index.ts: isProviderConfigured và getActiveProviderName kiểm tra ccbill.enabled
- [x] VipPage: ẩn CCBill card khi ccbillEnabled=false
- [x] VipPage: cải thiện order summary — breakdown giá/tháng × số tháng, hiển thị tiết kiệm bao nhiêu
- [x] VipPage: thêm trust badges (Thanh toán bảo mật, Kích hoạt ngay, Truy cập đầy đủ)
- [x] Cập nhật 6 locale files: cryptoAvailable text → "Có sẵn cho tất cả các gói"
- [x] TypeScript 0 errors
- [x] Save checkpoint

## Bug Fixes / UX (2026-05-31)
- [x] AdminAlbums: hiển thị tiêu đề album đầy đủ (bỏ truncate, thêm title tooltip)
- [x] AdminAlbums: thêm cột ZIP — badge xanh "ZIP" khi album đã có file ZIP, dấu — khi chưa có

## Bug Fix: Upload ảnh bị mất (2026-05-31)
- [x] Sửa race condition trong claimNextProcessingJob - dùng atomic UPDATE...WHERE status='pending' thay vì SELECT rồi UPDATE riêng
- [x] Thêm _tickRunning flag để tránh nhiều tick chạy song song (overlapping ticks)
- [x] Thêm resetStuckJobs() - tự động reset job bị kẹt ở 'processing' > 10 phút về 'pending'
- [x] Gọi resetStuckJobs khi worker khởi động và mỗi 5 phút
- [x] Reset thủ công 52 job bị kẹt từ lần upload 140 ảnh về pending để xử lý lại

## Tối ưu upload ảnh hàng loạt (2026-06-01)
- [x] LIFO ordering - ảnh mới nhất xử lý trước
- [x] Worker: tăng concurrency xử lý lên 2 job song song (thay vì 1)
- [x] Worker: tự động retry job failed (tối đa 3 lần, backoff 15s)
- [x] Worker: log rõ hơn - đếm pending/done/failed sau mỗi batch
- [x] Frontend: tăng CONCURRENCY upload từ 3 lên 5
- [x] Frontend: timeout poll job status từ 60s lên 120s
- [x] Frontend: hiển thị số ảnh đang chờ xử lý trong queue panel
- [x] Frontend: nút "Retry All Failed" để retry tất cả ảnh lỗi 1 lần
- [x] Backend: endpoint GET /api/admin/queue-status trả về pending/processing/failed count
- [x] Frontend: hiển thị queue status realtime trong media library header

## Feature: Premium Image Viewer - PhotoSwipe 5 (Phương án 3)
- [x] Cài PhotoSwipe 5 + photoswipe/lightbox
- [x] Schema photos đã có mediumKey/mediumUrl (không cần migration)
- [x] Tạo component PhotoSwipeViewer.tsx với đầy đủ controls
- [x] Desktop: scroll wheel zoom, drag pan, double-click zoom, ESC close, arrow nav
- [x] Mobile: pinch zoom, swipe nav, double-tap zoom, swipe-down close
- [x] Lazy load original khi zoom > 2x (VIP only)
- [x] Guest: zoom max 2x, không load original
- [x] VIP: zoom ∞, load original on-demand
- [x] Thay thế lightbox cũ trong AlbumDetail bằng PhotoSwipeViewer
- [x] Album grid dùng thumbUrl (400px) thay vì displayUrl
- [x] Preload medium ảnh ±1 (PhotoSwipe built-in)
- [x] TypeScript check — 0 errors

## SEO Phase 1 (June 2026)

- [x] Robots.txt: block admin/dashboard/account/checkout/payment/api, include sitemap URL
- [x] DB migration: thêm SEO fields vào bảng albums (seoTitle, seoDescription, focusKeyword, slug, canonicalUrl, ogImage, robotsIndex, language)
- [x] DB migration: thêm SEO fields vào bảng creators (seoTitle, seoDescription, bio, avatarAlt, bannerAlt, country, socialLinks)
- [x] DB migration: tạo bảng seo_settings (gtmContainerId, gscVerificationMeta)
- [x] Dynamic Sitemap: /sitemap.xml (index)
- [x] Dynamic Sitemap: /sitemap-pages.xml
- [x] Dynamic Sitemap: /sitemap-albums.xml
- [x] Dynamic Sitemap: /sitemap-creators.xml
- [x] Dynamic Sitemap: /sitemap-tags.xml
- [x] Dynamic Sitemap: /sitemap-images.xml
- [x] Dynamic Meta Tags utility (title, description, canonical, og:*, twitter:card, robots)
- [x] Album SEO: admin form tab với SEO fields + character counter
- [x] Album SEO: auto-generate slug từ title
- [x] Album SEO: frontend render meta tags
- [x] Album SEO: SEO warnings (missing title, description, cover, duplicate slug)
- [x] Creator SEO: admin form tab với SEO fields
- [x] Creator SEO: frontend render meta tags
- [ ] Creator SEO: Schema Person JSON-LD
- [ ] Image SEO: auto-generate ALT từ creator + album + index
- [ ] Image SEO: bulk edit ALT text trong admin
- [ ] Image SEO: render altText trong PhotoSwipeViewer
- [ ] Schema JSON-LD: WebSite + Organization (homepage)
- [ ] Schema JSON-LD: BreadcrumbList (album/creator page)
- [ ] Schema JSON-LD: ImageGallery (album page)
- [ ] Schema JSON-LD: Product/Offer (VIP page)
- [x] Tracking Settings: admin panel GTM Container ID + GSC verification meta
- [x] Tracking Settings: render GTM script + GSC meta tag trong index.html

## Feature: AI SEO Suggestions (June 2026)

- [x] Backend: `seo.suggestAlbum` procedure — nhận albumId, gọi LLM với title/cosplayer/character/series/tags, trả về focusKeyword + metaTitle + metaDescription
- [x] Backend: `seo.suggestCreator` procedure — nhận creatorId, gọi LLM với name/bio/tags, trả về focusKeyword + metaTitle + metaDescription
- [x] Frontend: nút "AI Suggest" trong SEO panel của AdminAlbumEditor (spinner khi đang gọi, auto-fill fields)
- [x] Frontend: nút "AI Suggest" trong SEO panel của AdminCreators (spinner khi đang gọi, auto-fill fields)
- [x] Vitest tests cho AI suggest procedures (mock LLM)
- [x] TypeScript check — 0 errors
- [x] Save checkpoint

## Feature: Bulk Generate SEO (June 2026)

- [x] Backend: `seo.bulkSuggestAlbums` — lấy danh sách albums thiếu SEO, xử lý tuần tự, lưu kết quả vào DB, trả về progress
- [x] Backend: `seo.bulkSuggestCreators` — lấy danh sách creators thiếu SEO, xử lý tuần tự, lưu kết quả vào DB, trả về progress
- [x] Backend: `seo.getBulkJobStatus` — polling endpoint trả về trạng thái job (total/done/failed/running)
- [x] Backend: `seo.cancelBulkJob` — hủy job đang chạy
- [x] Frontend: Trang `/admin/seo/bulk` với UI progress bar, danh sách kết quả từng item
- [x] Frontend: Nút "Start Bulk Generate" cho Albums và Creators riêng biệt
- [x] Frontend: Hiển thị trạng thái từng item (pending/done/failed) với icon
- [x] Frontend: Nút Cancel để dừng job đang chạy
- [x] Frontend: Link từ trang `/admin/seo` sang `/admin/seo/bulk`
- [x] Vitest tests cho bulk procedures
- [x] Checkpoint

## Feature: AI Tag Suggestion từ hình ảnh

- [x] Backend: `seo.suggestTagsFromImages` — lấy tối đa 4 ảnh sample từ album (coverUrl + 3 ảnh đầu), gọi LLM vision với image_url, trả về mảng tag gợi ý (10-15 tags)
- [x] Backend: Kết hợp context text (title, cosplayer, character, series) + visual analysis để gợi ý tag chính xác hơn
- [x] Backend: Lọc trùng với tags đã có của album, ưu tiên tags đã tồn tại trong DB
- [x] Frontend: Nút "AI Suggest Tags" trong AdminAlbumEditor (section Tags)
- [x] Frontend: Dialog/panel hiển thị tags gợi ý dạng chip có thể chọn/bỏ chọn
- [x] Frontend: Nút "Áp dụng tags đã chọn" để merge vào danh sách tags hiện tại
- [x] Frontend: Loading state khi đang phân tích ảnh
- [x] Vitest tests cho suggestTagsFromImages procedure
- [x] Checkpoint

## Feature: Bulk Generate Tags bằng AI

- [ ] Backend: `seo.startBulkJob` hỗ trợ type='tags' — lấy albums chưa có tag, gọi suggestTagsFromImages cho từng album, lưu tags vào DB
- [ ] Backend: `seo.getBulkStats` đếm albums chưa có tag (tagCount = 0)
- [ ] Frontend: Thêm card "Tags" vào AdminSeoBulk UI (bên cạnh Albums và Creators)
- [ ] Frontend: Hiển thị kết quả tags gợi ý từng album trong danh sách kết quả
- [ ] Vitest tests cho bulk tags job
- [ ] Checkpoint

## Tối ưu luồng upload ảnh (3 phần)
- [x] Phần 1: Smart WebP detection — skip convert 4K nếu file đã là WebP ≥ 2400px wide
- [x] Phần 2: Tự động xóa original/ sau khi worker xử lý xong thành công
- [x] Phần 3: Admin bulk cleanup tool — xóa file original cũ trên Wasabi và clear DB
- [x] Thêm hàm processImageMediumThumb() trong storage-wasabi.ts (chỉ medium + thumb)
- [x] Thêm copyObject() helper trong storage-wasabi.ts
- [x] Tăng lại WORKER_CONCURRENCY từ 2 → 4 sau khi bỏ convert 4K
- [x] 272/272 tests passing
- [x] Checkpoint

## Phase ZIP Import V4.17 — Admin ZIP/RAR Album Import
- [x] Database schema: zipImportJobs table với archivePasswordIndex (không lưu plaintext)
- [x] Database schema: seoCache table (cache AI responses theo filename hash)
- [x] Database schema: adminSettings table (AI provider config)
- [x] Database schema: albums table — thêm collectionName, publishStatus, seoQualityScore, aiGenerated, originalFileName, shortDescription, altTextTemplate
- [x] Database schema: creators table — thêm aliases, aiGenerated, status fields
- [x] Migration SQL applied via webdev_execute_sql
- [x] server/services/ai-provider.ts — external AI provider (OpenRouter/Gemini/OpenAI)
- [x] server/services/seo-generator.ts — AI SEO generator với fallback rule-based
- [x] server/services/archive-validator.ts — validate ZIP/RAR với resolvePasswordFromIndex
- [x] server/services/source-branding-cleaner.ts — đổi tên file để xóa source branding
- [x] server/services/image-validator.ts — validate images trong extracted directory
- [x] server/services/creator-service.ts — find or create creator với alias matching
- [x] server/services/import-cron.ts — scheduler với orphan cleanup và stuck recovery
- [x] server/workers/import-worker.ts — main ZIP import worker (V4.17: archivePasswordIndex)
- [x] server/routers/zip-import.ts — tRPC router với 9 procedures
- [x] V4.17 Fix 1: worker dùng archivePasswordIndex (không dùng passwordUsed/archivePasswordUsed)
- [x] V4.17 Fix 2: createAlbumAndImport loại trừ jobId hiện tại khỏi queue count (ne(id, jobId))
- [x] V4.17 Fix 3: slug/title check với cả albums VÀ static_pages
- [x] V4.17 Fix 3: ghi rõ ZIP Import không đụng Media Library upload (/admin/media)
- [x] client/src/pages/admin/AdminZipImport.tsx — 3-step wizard + dashboard
- [x] AdminLayout.tsx — thêm "ZIP Import" vào nav section Import
- [x] App.tsx — route /admin/zip-import
- [x] server/zip-import.test.ts — 10 unit tests cho V4.17 fixes (10/10 pass)
- [x] server/_core/index.ts — wire startImportScheduler

## Phase ZIP Import Gap Fix (V4.17 → V4.17 Complete)
- [x] server/services/exiftool-metadata.ts — ExifTool metadata stripping + Yukvix metadata injection
- [x] server/workers/image-processor.ts — full image processing pipeline (sharp WebP + thumbnail + exiftool)
- [x] server/services/vip-zip-generator.ts — VIP ZIP generator (original + WebP versions)
- [x] import-worker.ts — fix originalKey field khi insert photos
- [x] import-worker.ts — integrate image-processor.ts thay vì inline processing
- [x] Database schema: seoGenerationHistory table — lưu lịch sử AI SEO generation
- [x] server/services/seo-quality-check.ts — quality check (uniqueness, keyword spam, tag count)
- [x] zip-import.ts — thêm checkSeoQuality procedure
- [x] zip-import.ts — thêm approveSeoAndPublish procedure (save history + publish)
- [x] zip-import.ts — thêm regenerateSeo procedure (save history + update album)
- [x] import-cron.ts — thêm disk-space check (warn < 2GB, block < 500MB)
- [x] client/src/pages/admin/AdminAlbumSeoReview.tsx — SEO review page với quality check + approve
- [x] App.tsx — route /admin/albums/:id/seo-review
- [x] AdminZipImport.tsx — thêm FileCheck button cho jobs có status ready_for_review
- [x] Build verified: vite build + esbuild đều pass (✓ built in 12.80s)
- [x] Tests verified: 282 tests pass (19 test files)

## Phase ZIP Import Gap Fix Round 2 (V4.17 Final)
- [x] Fix 1: albums schema — thêm creator (plain text), metaTitle, metaDescription fields + migration
- [x] Fix 2: approveSeoAndPublish — cập nhật cả publishStatus VÀ legacy status='published'
- [x] Fix 3: albums.ts — thêm getAlbumMeta procedure (noindex dựa trên publishStatus)
- [x] Fix 4: posts conflict check — staticPages là đúng (project không có posts table)
- [x] Fix 5: import-cron.ts — disk-space recovery: restore waiting_disk_space jobs về waiting khi disk đủ chỗ
- [x] Fix 6: AdminZipImport.tsx — SEO Review button condition: job.status==='completed' (không phải 'ready_for_review')
- [x] Build verified: vite build + esbuild đều pass
- [x] Tests verified: 282 tests pass (19 test files)

## Admin AI Settings (Backlog — Medium Priority)
- [ ] Backend: getAiSettings procedure — đọc ai_provider config từ admin_settings table
- [ ] Backend: saveAiSettings procedure — lưu provider/apiKey/model/promptVersion vào admin_settings
- [ ] Backend: validateApiKey procedure — gọi thử API với key, trả về model list hoặc error
- [ ] Backend: testSeoGeneration procedure — chạy thử generateSeoData với filename test
- [ ] Backend: clearAiCache procedure — xóa seo_cache table + invalidate in-memory cache
- [ ] Frontend: AdminAiSettings.tsx — form provider/key/model/promptVersion + 3 action buttons
- [ ] Frontend: route /admin/settings/ai trong App.tsx
- [ ] Frontend: thêm "AI Settings" vào AdminLayout nav section Settings
- [ ] Tests + build check + Checkpoint
