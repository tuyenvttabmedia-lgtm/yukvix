# Yukvix — Troubleshooting Guide

This document covers the most common issues encountered when deploying and running Yukvix on a VPS, along with their root causes and solutions. Issues are grouped by subsystem.

---

## Quick Diagnostics

Before diving into specific issues, run these commands to get an overview of the system state:

```bash
# Check if the Node.js app is running
pm2 status

# View recent application logs
pm2 logs yukvix --lines 50

# Check if Nginx is running and has no config errors
sudo nginx -t && sudo systemctl status nginx

# Check if MySQL is running
sudo systemctl status mysql

# Check which ports are listening
ss -tlnp | grep -E '3000|80|443|3306'

# Check disk space (full disk causes silent failures)
df -h

# Check memory usage
free -h
```

---

## Application Startup Issues

### Error: `Cannot find module '/dist/index.js'`

**Cause:** The application has not been built yet, or the build failed.

**Solution:**
```bash
cd /var/www/yukvix
pnpm build
# Check for build errors in the output
pm2 restart yukvix
```

### Error: `DATABASE_URL is not set` or `Access denied for user`

**Cause:** The `.env` file is missing, not in the correct directory, or contains wrong credentials.

**Solution:**
```bash
# Verify .env exists in the project root
ls -la /var/www/yukvix/.env

# Verify DATABASE_URL format
grep DATABASE_URL /var/www/yukvix/.env
# Expected: mysql://yukvix:PASSWORD@127.0.0.1:3306/yukvix

# Test the connection manually
mysql -u yukvix -p yukvix -e "SELECT 1;"
```

### Error: `Port 3000 is already in use`

**Cause:** Another process is using port 3000, or a previous PM2 instance is still running.

**Solution:**
```bash
# Find what is using port 3000
ss -tlnp | grep 3000
# or
lsof -i :3000

# Kill the conflicting process
kill -9 PID_FROM_ABOVE

# Or delete and restart PM2 process
pm2 delete yukvix
pm2 start deploy/ecosystem.config.cjs --env production
```

### Error: `JWT_SECRET is too short` or authentication fails after restart

**Cause:** `JWT_SECRET` was changed between deployments. Existing session cookies signed with the old secret become invalid.

**Solution:** Keep `JWT_SECRET` stable across deployments. If you must rotate it, all users will need to log in again — this is expected behavior. Generate a new secret with `openssl rand -hex 32`.

---

## Database Issues

### Error: `Table 'yukvix.users' doesn't exist`

**Cause:** Migrations have not been run, or only some migrations were applied.

**Solution:**
```bash
cd /var/www/yukvix
pnpm drizzle-kit migrate

# Verify tables exist
mysql -u yukvix -p yukvix -e "SHOW TABLES;"
```

### Error: `ER_DUP_ENTRY` on seed script

**Cause:** The seed script has already been run and is trying to insert duplicate data.

**Solution:** The seed script is idempotent for most records, but if you need a clean slate:
```bash
# WARNING: This deletes all data
mysql -u yukvix -p yukvix -e "
  SET FOREIGN_KEY_CHECKS=0;
  TRUNCATE TABLE users;
  TRUNCATE TABLE albums;
  TRUNCATE TABLE photos;
  TRUNCATE TABLE categories;
  SET FOREIGN_KEY_CHECKS=1;
"
node scripts/seed.mjs
```

### MySQL connection drops under load

**Cause:** MySQL's `wait_timeout` closes idle connections, but the connection pool does not reconnect automatically.

**Solution:** Add `?connectionLimit=10&waitForConnections=true&connectTimeout=10000` to your `DATABASE_URL`, or add to `/etc/mysql/mysql.conf.d/mysqld.cnf`:
```
wait_timeout = 600
interactive_timeout = 600
```

---

## Nginx Issues

### 502 Bad Gateway

**Cause:** Nginx is running but cannot reach the Node.js app on port 3000.

**Solution:**
```bash
# Check if Node app is running
pm2 status

# If stopped, restart it
pm2 restart yukvix

# Check Node app logs for crash reason
pm2 logs yukvix --lines 30

# Verify Nginx proxy_pass points to correct port
grep proxy_pass /etc/nginx/sites-enabled/yukvix
```

### 413 Request Entity Too Large (upload fails)

**Cause:** Nginx's `client_max_body_size` is too small for the file being uploaded.

**Solution:** In `/etc/nginx/sites-available/yukvix`, ensure:
```nginx
client_max_body_size 50M;
```
Then reload: `sudo nginx -t && sudo systemctl reload nginx`

### SSL certificate renewal fails

**Cause:** Certbot cannot complete the ACME challenge, usually because port 80 is blocked or Nginx is misconfigured.

**Solution:**
```bash
# Test renewal in dry-run mode
sudo certbot renew --dry-run

# If it fails, check Nginx is serving port 80
curl -I http://yourdomain.com/.well-known/acme-challenge/test

# Ensure UFW allows HTTP
sudo ufw allow 80
sudo ufw reload
```

### CORS errors in browser console

**Cause:** The frontend is making requests to a different origin than expected, or Nginx is stripping headers.

**Solution:** Verify the `proxy_set_header Host $host;` line is present in all `location` blocks in the Nginx config. If using a CDN, ensure the CDN passes the `Origin` header through.

---

## Wasabi / Storage Issues

### Uploaded files return 403 Forbidden

**Cause:** The Wasabi bucket policy does not allow public read, or the file was uploaded to a path not covered by the policy.

**Solution:**
1. Check the bucket policy in the Wasabi Console — ensure `arn:aws:s3:::your-bucket/media/*` is covered.
2. Verify the file path in the database matches the policy prefix.
3. Test directly: `curl -I https://s3.REGION.wasabisys.com/your-bucket/media/test.jpg`

### Signed URLs expire too quickly

**Cause:** The default presigned URL expiry is 1 hour. If users share links, they may expire before the recipient opens them.

**Solution:** In `server/storage-wasabi.ts`, increase the `expiresIn` parameter in `getSignedUrl` calls. For public media, consider making the objects publicly readable instead of using signed URLs.

### Upload fails with `AccessDenied`

**Cause:** The Wasabi access key does not have `PutObject` permission on the bucket.

**Solution:** In the Wasabi Console, go to **Policies** and create a policy that grants `s3:PutObject`, `s3:GetObject`, and `s3:DeleteObject` on `arn:aws:s3:::your-bucket/*`, then attach it to your access key.

### Images not processing (sharp errors)

**Cause:** The `sharp` package requires native binaries that may not be compatible with the build environment.

**Solution:**
```bash
cd /var/www/yukvix
# Rebuild sharp for the current platform
pnpm rebuild sharp
pm2 restart yukvix
```

---

## Stripe / Payment Issues

### Webhook returns 400 `No signatures found matching the expected signature`

**Cause:** The `STRIPE_WEBHOOK_SECRET` in `.env` does not match the signing secret for this endpoint in the Stripe Dashboard, or the request body was parsed before signature verification.

**Solution:**
1. In Stripe Dashboard → Developers → Webhooks → your endpoint, copy the **Signing secret** again.
2. Update `STRIPE_WEBHOOK_SECRET` in `.env` and restart: `pm2 restart yukvix`.
3. Ensure the webhook route `/api/stripe/webhook` uses `express.raw()` middleware, not `express.json()`.

### Checkout session created but VIP not activated

**Cause:** The webhook event `checkout.session.completed` was not delivered or was rejected by the server.

**Solution:**
1. In Stripe Dashboard → Developers → Webhooks → your endpoint → **Recent deliveries**, check if the event was sent and what the response was.
2. Check application logs: `pm2 logs yukvix | grep -i stripe`
3. Manually retry the event from the Stripe Dashboard.

### `No such price` error when creating checkout

**Cause:** The Stripe Price ID stored in the `subscription_plans` table does not exist in your Stripe account (e.g., you switched from test to live mode without recreating prices).

**Solution:** In the Admin → Payments → Plans page, update each plan's `stripePriceId` with the correct Price ID from your Stripe Dashboard → Products.

---

## Email Issues

### Emails not being sent (no error in logs)

**Cause:** SMTP credentials are wrong, or the SMTP server is blocking the connection.

**Solution:**
```bash
# Test SMTP connection manually
node -e "
const nodemailer = require('nodemailer');
const t = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT),
  auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
});
t.verify().then(() => console.log('SMTP OK')).catch(console.error);
" 
```

### Gmail: `Username and Password not accepted`

**Cause:** Gmail requires an **App Password** when 2-Step Verification is enabled. Regular account passwords do not work.

**Solution:** Generate an App Password at [https://myaccount.google.com/apppasswords](https://myaccount.google.com/apppasswords) and use it as `SMTP_PASS`.

---

## SEO / Sitemap Issues

### Sitemap returns 500 or empty XML

**Cause:** The database query for published albums failed, usually due to a connection issue.

**Solution:**
```bash
# Check if the sitemap endpoint responds
curl -v https://yourdomain.com/sitemap.xml

# Check application logs for DB errors
pm2 logs yukvix | grep -i "sitemap\|SEO"
```

### Google Search Console shows `Couldn't fetch` for sitemap

**Cause:** The sitemap URL is not accessible from Google's servers, usually a DNS or firewall issue.

**Solution:**
1. Verify the sitemap is publicly accessible: `curl https://yourdomain.com/sitemap.xml`
2. Check that port 443 is open: `sudo ufw status`
3. Ensure the SSL certificate is valid: `curl -I https://yourdomain.com`

---

## Performance Issues

### High memory usage / PM2 restarts frequently

**Cause:** Memory leak or insufficient RAM for the workload.

**Solution:**
```bash
# Monitor memory over time
pm2 monit

# If memory grows unbounded, check for:
# 1. Large file uploads being held in memory
# 2. Unclosed database connections
# 3. Infinite loops in scheduled jobs

# Temporary fix: lower restart threshold
# In ecosystem.config.cjs: max_memory_restart: "300M"
```

### Slow database queries

**Cause:** Missing indexes or large table scans.

**Solution:**
```sql
-- Find slow queries (enable slow query log first)
SELECT * FROM mysql.slow_log ORDER BY start_time DESC LIMIT 10;

-- Check indexes on frequently queried columns
SHOW INDEX FROM albums;
SHOW INDEX FROM photos;

-- Add index if missing (example)
ALTER TABLE albums ADD INDEX idx_status_created (status, createdAt);
```

---

## Log File Locations

| Log | Path |
|-----|------|
| Application stdout | `/var/log/yukvix/out.log` |
| Application stderr | `/var/log/yukvix/error.log` |
| Nginx access log | `/var/log/nginx/yukvix.access.log` |
| Nginx error log | `/var/log/nginx/yukvix.error.log` |
| MySQL error log | `/var/log/mysql/error.log` |
| MySQL slow query log | `/var/log/mysql/slow.log` |
| System journal | `journalctl -u nginx -u mysql -f` |

---

## Getting Help

If an issue is not covered here, collect the following information before seeking help:

1. The exact error message from `pm2 logs yukvix --lines 100`
2. The output of `pm2 status` and `sudo systemctl status nginx mysql`
3. The Node.js version (`node --version`) and OS version (`lsb_release -a`)
4. Any recent changes made to the code, `.env`, or server configuration
