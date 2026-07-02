# Yukvix — VPS Services Setup Guide

This document covers the configuration of all external services required by Yukvix: Wasabi S3 storage, Stripe payments, SMTP email, and server hardening. Complete these steps before or alongside the main deployment guide.

---

## 1. Wasabi S3 Storage

Yukvix uses [Wasabi](https://wasabi.com) as its primary media storage backend. Wasabi is S3-compatible and significantly cheaper than AWS S3 for storage-heavy workloads.

### 1.1 Create a Wasabi Account and Bucket

1. Sign up at [https://wasabi.com](https://wasabi.com) and verify your account.
2. In the Wasabi Console, navigate to **Buckets → Create Bucket**.
3. Choose a region close to your VPS (e.g., `us-east-1` for US East, `eu-central-1` for Europe, `ap-northeast-1` for Asia Pacific).
4. Set the bucket name — recommended: `yukvix-media` (must be globally unique).
5. Leave **Bucket Versioning** disabled for simplicity.

### 1.2 Configure Bucket Policy (Public Read for Media)

Yukvix serves media files directly from Wasabi. The bucket needs a policy that allows public read access to media files while keeping other objects private.

In the Wasabi Console, go to **Buckets → your-bucket → Policies** and paste the following JSON:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "PublicReadMedia",
      "Effect": "Allow",
      "Principal": "*",
      "Action": "s3:GetObject",
      "Resource": "arn:aws:s3:::yukvix-media/media/*"
    }
  ]
}
```

> Replace `yukvix-media` with your actual bucket name. This policy grants public read only to objects under the `media/` prefix. CMS uploads (logos, banners) are served via signed URLs and do not need to be public.

### 1.3 Configure CORS

Navigate to **Buckets → your-bucket → CORS** and add this configuration:

```xml
<CORSConfiguration>
  <CORSRule>
    <AllowedOrigin>https://yourdomain.com</AllowedOrigin>
    <AllowedMethod>GET</AllowedMethod>
    <AllowedMethod>PUT</AllowedMethod>
    <AllowedMethod>POST</AllowedMethod>
    <AllowedHeader>*</AllowedHeader>
    <MaxAgeSeconds>3600</MaxAgeSeconds>
  </CORSRule>
</CORSConfiguration>
```

For development, you may also add `<AllowedOrigin>http://localhost:3000</AllowedOrigin>`.

### 1.4 Create Access Keys

1. In the Wasabi Console, go to **Access Keys → Create New Access Key**.
2. Copy the **Access Key ID** and **Secret Access Key** immediately — the secret is shown only once.
3. Add them to your `.env` file:

```
WASABI_ACCESS_KEY_ID=your_access_key_id
WASABI_SECRET_ACCESS_KEY=your_secret_access_key
WASABI_BUCKET=yukvix-media
WASABI_REGION=us-east-1
WASABI_ENDPOINT=https://s3.us-east-1.wasabisys.com
```

### 1.5 Wasabi Region Endpoints

| Region | Endpoint |
|--------|----------|
| US East 1 (N. Virginia) | `https://s3.us-east-1.wasabisys.com` |
| US East 2 (N. Virginia) | `https://s3.us-east-2.wasabisys.com` |
| US West 1 (Oregon) | `https://s3.us-west-1.wasabisys.com` |
| EU Central 1 (Amsterdam) | `https://s3.eu-central-1.wasabisys.com` |
| EU West 1 (London) | `https://s3.eu-west-1.wasabisys.com` |
| AP Northeast 1 (Tokyo) | `https://s3.ap-northeast-1.wasabisys.com` |
| AP Northeast 2 (Osaka) | `https://s3.ap-northeast-2.wasabisys.com` |
| AP Southeast 1 (Singapore) | `https://s3.ap-southeast-1.wasabisys.com` |

### 1.6 Optional: CDN with Cloudflare

If you want to serve media through Cloudflare's CDN (faster global delivery, free tier available):

1. Add your domain to Cloudflare.
2. Create a CNAME record: `cdn.yourdomain.com` → `s3.us-east-1.wasabisys.com` (proxied).
3. Set `CDN_BASE_URL=https://cdn.yourdomain.com` in your `.env`.

The app will then prefix all media URLs with your CDN domain instead of the Wasabi endpoint directly.

---

## 2. Stripe Payments

### 2.1 Account Setup

1. Create a Stripe account at [https://stripe.com](https://stripe.com).
2. Complete KYC verification to enable live payments.
3. For initial testing, use the **Test mode** keys (no KYC required).

### 2.2 Retrieve API Keys

In the Stripe Dashboard, navigate to **Developers → API keys**:

| Key | Environment variable | Where to find |
|-----|---------------------|---------------|
| Secret key | `STRIPE_SECRET_KEY` | Developers → API keys → Secret key |
| Publishable key | `VITE_STRIPE_PUBLISHABLE_KEY` | Developers → API keys → Publishable key |

Use `sk_test_...` / `pk_test_...` for testing and `sk_live_...` / `pk_live_...` for production.

### 2.3 Register Webhook Endpoint

1. Go to **Developers → Webhooks → Add endpoint**.
2. Set the endpoint URL: `https://yourdomain.com/api/stripe/webhook`
3. Select the following events:

| Event | Purpose |
|-------|---------|
| `checkout.session.completed` | Activate VIP subscription after payment |
| `payment_intent.succeeded` | Log successful payment |
| `payment_intent.payment_failed` | Log failed payment |
| `customer.subscription.deleted` | Handle subscription cancellation |

4. Click **Add endpoint** and copy the **Signing secret** (`whsec_...`).
5. Add it to `.env` as `STRIPE_WEBHOOK_SECRET`.

### 2.4 Test Payments

Use these Stripe test card numbers to verify the checkout flow without real money:

| Scenario | Card Number | Expiry | CVC |
|----------|-------------|--------|-----|
| Successful payment | `4242 4242 4242 4242` | Any future date | Any 3 digits |
| Payment declined | `4000 0000 0000 0002` | Any future date | Any 3 digits |
| Requires 3D Secure | `4000 0025 0000 3155` | Any future date | Any 3 digits |

After a test payment, verify in the Stripe Dashboard under **Payments** that the charge appears, and check the **Webhooks** tab to confirm the `checkout.session.completed` event was delivered successfully.

### 2.5 Claim Your Stripe Sandbox

If you used the Manus-provisioned Stripe sandbox, claim it before it expires:

```
https://dashboard.stripe.com/claim_sandbox/YWNjdF8xVFc0UmNJb3V0Qk1STEN5LDE3NzkyNTAxOTQv100mdJaFH2F
```

This links the sandbox to your Stripe account and prevents it from being reclaimed.

---

## 3. SMTP Email Configuration

Yukvix sends transactional emails (registration confirmation, password reset, VIP welcome) via Nodemailer. Any SMTP provider works.

### 3.1 Gmail (Quick Setup)

1. Enable **2-Step Verification** on your Google account.
2. Go to **Google Account → Security → App passwords**.
3. Generate an app password for "Mail" on "Other device".
4. Use these settings:

```
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your_gmail@gmail.com
SMTP_PASS=your_16_char_app_password
```

### 3.2 Recommended: Dedicated Transactional Email

For production, use a dedicated transactional email service to avoid Gmail's sending limits and improve deliverability:

| Provider | Free Tier | Notes |
|----------|-----------|-------|
| [Brevo (Sendinblue)](https://brevo.com) | 300 emails/day | Good free tier |
| [Mailgun](https://mailgun.com) | 100 emails/day | Developer-friendly |
| [Postmark](https://postmarkapp.com) | 100 emails/month | High deliverability |
| [SendGrid](https://sendgrid.com) | 100 emails/day | Widely used |

All of these provide SMTP credentials that work directly with the `SMTP_*` variables.

---

## 4. MySQL Database Hardening

After creating the database in Phase 3 of the deployment guide, apply these additional security settings:

```bash
# Bind MySQL to localhost only (prevents external connections)
sudo nano /etc/mysql/mysql.conf.d/mysqld.cnf
# Set: bind-address = 127.0.0.1

# Restart MySQL
sudo systemctl restart mysql

# Verify no external port is exposed
ss -tlnp | grep 3306
# Should show: 127.0.0.1:3306 (not 0.0.0.0:3306)
```

Enable the slow query log to identify performance issues:

```sql
SET GLOBAL slow_query_log = 'ON';
SET GLOBAL long_query_time = 2;
SET GLOBAL slow_query_log_file = '/var/log/mysql/slow.log';
```

---

## 5. Server Hardening

### 5.1 SSH Hardening

```bash
sudo nano /etc/ssh/sshd_config
```

Set or verify these values:

```
PermitRootLogin no
PasswordAuthentication no
PubkeyAuthentication yes
Port 22
MaxAuthTries 3
```

```bash
sudo systemctl restart sshd
```

### 5.2 Fail2Ban for Brute Force Protection

```bash
# Fail2Ban is already installed from Phase 1
# Create a local jail config
sudo nano /etc/fail2ban/jail.local
```

Add:

```ini
[DEFAULT]
bantime  = 1h
findtime = 10m
maxretry = 5

[sshd]
enabled = true

[nginx-http-auth]
enabled = true
```

```bash
sudo systemctl enable fail2ban
sudo systemctl start fail2ban
sudo fail2ban-client status
```

### 5.3 Automatic Security Updates

```bash
sudo apt install -y unattended-upgrades
sudo dpkg-reconfigure --priority=low unattended-upgrades
```

---

## 6. Backup Strategy

### Database Backup

```bash
# Create a daily backup script
sudo nano /etc/cron.daily/yukvix-backup
```

```bash
#!/bin/bash
BACKUP_DIR="/var/backups/yukvix"
DATE=$(date +%Y%m%d_%H%M%S)
mkdir -p "$BACKUP_DIR"

# Dump database
mysqldump -u yukvix -p'STRONG_PASSWORD_HERE' yukvix \
  | gzip > "$BACKUP_DIR/db_$DATE.sql.gz"

# Keep only last 7 days
find "$BACKUP_DIR" -name "db_*.sql.gz" -mtime +7 -delete

echo "Backup completed: db_$DATE.sql.gz"
```

```bash
sudo chmod +x /etc/cron.daily/yukvix-backup
```

### Media Backup

Since media is stored in Wasabi, it is already durable (11 nines durability). For an extra safety layer, enable Wasabi's **Object Lock** or set up cross-region replication from the Wasabi Console.

---

## 7. Performance Tuning

### Node.js Memory

If your VPS has limited RAM (1 GB), set a memory limit in `ecosystem.config.cjs`:

```js
max_memory_restart: "400M",
```

### MySQL Buffer Pool

For a 2 GB RAM VPS, set the InnoDB buffer pool to ~512 MB:

```bash
sudo nano /etc/mysql/mysql.conf.d/mysqld.cnf
```

Add:
```
innodb_buffer_pool_size = 512M
```

### Nginx Worker Processes

Set `worker_processes` to match your CPU count:

```bash
# Check CPU count
nproc
# Edit nginx.conf
sudo nano /etc/nginx/nginx.conf
# Set: worker_processes auto;
```
