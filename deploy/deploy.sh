#!/bin/bash
set -euo pipefail
PROJECT=/var/www/cosplay-gallery
cd "$PROJECT"
echo "[deploy] $(date -Iseconds) starting..."
/usr/local/bin/yukvix-mysql-backup.sh || echo "[deploy] backup skipped/failed"
sudo -u cosplay pnpm run build
sudo systemctl restart cosplay-gallery
sleep 3
HTTP=$(curl -sf -o /dev/null -w "%{http_code}" http://127.0.0.1:3000/api/health || echo "000")
if [ "$HTTP" != "200" ]; then
  echo "[deploy] HEALTH CHECK FAILED http=$HTTP"
  exit 1
fi
echo "[deploy] $(date -Iseconds) success"
