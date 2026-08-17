# Yukvix — luồng code chuẩn

## Nguồn sự thật

Local → GitHub (`main`) → VPS (`/var/www/cosplay-gallery`)

Baseline ban đầu lấy từ code đang chạy trên VPS (kèm thay đổi chưa commit trên production).

## Local

- Thư mục: `C:\Users\tuyen\Developer\yukvix`
- Dev server: **http://localhost:3010** (port **3000** để dành cho Cardon)
- Không commit `.env` — copy từ VPS rồi chỉnh `PORT=3010`, `NODE_ENV=development`, `SITE_URL=http://localhost:3010`

```bash
pnpm install
pnpm dev
```

## Dev hàng ngày

1. Sửa trên **localhost:3010**
2. `git commit` + `git push origin main`
3. Trên VPS:

```bash
cd /var/www/cosplay-gallery
git fetch origin
git reset --hard origin/main
pnpm install
pnpm build
sudo systemctl restart cosplay-gallery
```

Giữ nguyên `/var/www/cosplay-gallery/.env` trên VPS (`PORT=3000`, `NODE_ENV=production`).

## Không làm

- Không lấy VPS làm nguồn sửa code thường xuyên
- Không commit `.env*`, `secrets/`, `*.key`, `backups/`

## Kiểm tra khớp

Local và VPS: `git rev-parse --short HEAD` phải giống nhau sau khi pull.
