# Yukvix — Full VPS Deployment Guide

This document covers the complete process of deploying Yukvix on a fresh Ubuntu 22.04 LTS VPS, from initial server setup through a live production environment. Follow each section in order.

---

## System Requirements

| Component | Minimum | Recommended |
|-----------|---------|-------------|
| OS | Ubuntu 22.04 LTS | Ubuntu 22.04 LTS |
| CPU | 1 vCPU | 2 vCPU |
| RAM | 1 GB | 2 GB |
| Disk | 20 GB SSD | 40 GB SSD |
| Node.js | 20.x LTS | 22.x LTS |
| MySQL | 8.0 | 8.0 |
| Open ports | 22, 80, 443 | 22, 80, 443 |

---

## Phase 1 — Initial Server Setup

Connect to your VPS as root, then create a dedicated deployment user.

```bash
# Update system packages
apt update && apt upgrade -y

# Install essential tools
apt install -y curl git unzip ufw fail2ban

# Create a non-root user for the app
adduser yukvix
usermod -aG sudo yukvix

# Copy SSH key to new user (run from your local machine)
# ssh-copy-id yukvix@YOUR_VPS_IP

# Switch to the new user for all remaining steps
su - yukvix
```

### Firewall Configuration

```bash
ufw default deny incoming
ufw default allow outgoing
ufw allow ssh
ufw allow 'Nginx Full'
ufw enable
ufw status
```

---

## Phase 2 — Install Node.js and pnpm

```bash
# Install Node.js 22.x via NodeSource
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs

# Verify
node --version   # should print v22.x.x
npm --version

# Install pnpm globally
sudo npm install -g pnpm pm2

# Verify
pnpm --version
pm2 --version
```

---

## Phase 3 — Install and Configure MySQL 8

```bash
# Install MySQL
sudo apt install -y mysql-server

# Secure the installation (set root password, remove test DB)
sudo mysql_secure_installation

# Create database and user
sudo mysql -u root -p <<'SQL'
CREATE DATABASE yukvix CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'yukvix'@'localhost' IDENTIFIED BY 'STRONG_PASSWORD_HERE';
GRANT ALL PRIVILEGES ON yukvix.* TO 'yukvix'@'localhost';
FLUSH PRIVILEGES;
SQL
```

> **Security note:** Replace `STRONG_PASSWORD_HERE` with a randomly generated password (e.g., `openssl rand -base64 24`). Store it securely — you will need it in the `.env` file.

---

## Phase 4 — Deploy Application Code

```bash
# Create application directory
sudo mkdir -p /var/www/yukvix
sudo chown yukvix:yukvix /var/www/yukvix

# Clone or upload source code
# Option A — from Git repository:
git clone https://github.com/YOUR_ORG/yukvix.git /var/www/yukvix

# Option B — upload ZIP and extract:
# scp yukvix.zip yukvix@YOUR_VPS_IP:/var/www/
# cd /var/www && unzip yukvix.zip -d yukvix

cd /var/www/yukvix

# Install dependencies
pnpm install --frozen-lockfile
```

---

## Phase 5 — Configure Environment Variables

```bash
# Copy the template
cp deploy/env.example.txt .env

# Edit with your actual values
nano .env
```

The critical variables to fill in are listed below. All others have sensible defaults.

| Variable | Description | Example |
|----------|-------------|---------|
| `DATABASE_URL` | MySQL connection string | `mysql://yukvix:PASSWORD@127.0.0.1:3306/yukvix` |
| `JWT_SECRET` | 32-char random secret | `openssl rand -hex 32` |
| `WASABI_BUCKET` | Wasabi bucket name | `yukvix-media` |
| `WASABI_ACCESS_KEY_ID` | Wasabi access key | from Wasabi Console |
| `WASABI_SECRET_ACCESS_KEY` | Wasabi secret key | from Wasabi Console |
| `STRIPE_SECRET_KEY` | Stripe secret key | `sk_live_...` |
| `VITE_STRIPE_PUBLISHABLE_KEY` | Stripe publishable key | `pk_live_...` |
| `STRIPE_WEBHOOK_SECRET` | Stripe webhook signing secret | `whsec_...` |
| `SMTP_HOST` | Email SMTP host | `smtp.gmail.com` |
| `SMTP_USER` | SMTP username | `noreply@yourdomain.com` |
| `SMTP_PASS` | SMTP password / app password | from email provider |

---

## Phase 6 — Run Database Migrations

```bash
cd /var/www/yukvix

# Apply all migrations (creates all tables)
pnpm drizzle-kit migrate

# (Optional) Load demo/test data
node scripts/seed.mjs
```

If `drizzle-kit` is not found globally, run it via pnpm:

```bash
pnpm exec drizzle-kit migrate
```

---

## Phase 7 — Build the Application

```bash
cd /var/www/yukvix

# Build frontend (Vite) + backend (esbuild) in one command
pnpm build
```

This produces:
- `dist/index.js` — compiled Node.js server (ESM)
- `dist/assets/` — compiled frontend static files served by the Node server

---

## Phase 8 — Create Log Directory and Start with PM2

```bash
# Create log directory
sudo mkdir -p /var/log/yukvix
sudo chown yukvix:yukvix /var/log/yukvix

# Start the application
cd /var/www/yukvix
pm2 start deploy/ecosystem.config.cjs --env production

# Verify it is running
pm2 status
pm2 logs yukvix --lines 30

# Save PM2 process list so it survives reboots
pm2 save

# Configure PM2 to start on system boot
pm2 startup
# ↑ This prints a command — copy and run it as sudo
```

At this point the app is running on `http://localhost:3000`. The next phase exposes it publicly via Nginx.

---

## Phase 9 — Install and Configure Nginx

```bash
sudo apt install -y nginx

# Copy the provided Nginx config
sudo cp /var/www/yukvix/deploy/nginx.conf /etc/nginx/sites-available/yukvix

# Edit the config: replace "yourdomain.com" with your actual domain
sudo nano /etc/nginx/sites-available/yukvix

# Enable the site
sudo ln -s /etc/nginx/sites-available/yukvix /etc/nginx/sites-enabled/

# Remove the default site
sudo rm -f /etc/nginx/sites-enabled/default

# Test config syntax
sudo nginx -t

# Reload Nginx
sudo systemctl reload nginx
```

---

## Phase 10 — SSL Certificate with Let's Encrypt

```bash
# Install Certbot
sudo apt install -y certbot python3-certbot-nginx

# Obtain certificate (replace with your domain)
sudo certbot --nginx -d yourdomain.com -d www.yourdomain.com

# Certbot automatically edits the Nginx config to add SSL.
# Verify auto-renewal works:
sudo certbot renew --dry-run
```

After this step, your site is accessible at `https://yourdomain.com`.

---

## Phase 11 — Register Stripe Webhook

Log in to the [Stripe Dashboard](https://dashboard.stripe.com), navigate to **Developers → Webhooks**, and add a new endpoint:

- **Endpoint URL:** `https://yourdomain.com/api/stripe/webhook`
- **Events to listen for:** `checkout.session.completed`, `payment_intent.succeeded`, `payment_intent.payment_failed`, `customer.subscription.deleted`

Copy the **Signing secret** (`whsec_...`) and add it to your `.env` file as `STRIPE_WEBHOOK_SECRET`, then restart the app:

```bash
pm2 restart yukvix
```

---

## Phase 12 — Verify Deployment

Run through this checklist after deployment:

| Check | Command / URL |
|-------|--------------|
| App process running | `pm2 status` |
| HTTPS accessible | `curl -I https://yourdomain.com` |
| API health | `curl https://yourdomain.com/api/trpc/auth.me` |
| Sitemap | `curl https://yourdomain.com/sitemap.xml` |
| Robots.txt | `curl https://yourdomain.com/robots.txt` |
| Admin login | `https://yourdomain.com/admin` |
| Stripe test payment | Use card `4242 4242 4242 4242` |

---

## Updating the Application

When deploying a new version:

```bash
cd /var/www/yukvix

# Pull latest code (if using Git)
git pull origin main

# Install any new dependencies
pnpm install --frozen-lockfile

# Run any new migrations
pnpm drizzle-kit migrate

# Rebuild
pnpm build

# Restart app (zero-downtime reload)
pm2 reload yukvix
```

---

## Useful PM2 Commands

```bash
pm2 status                    # Show all processes
pm2 logs yukvix         # Tail live logs
pm2 logs yukvix --lines 100  # Last 100 lines
pm2 restart yukvix      # Hard restart
pm2 reload yukvix       # Zero-downtime reload
pm2 stop yukvix         # Stop
pm2 delete yukvix       # Remove from PM2
pm2 monit                     # Real-time dashboard
```
