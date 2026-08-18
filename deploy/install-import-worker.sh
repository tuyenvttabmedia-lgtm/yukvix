#!/bin/bash
# Install ZIP import as a separate systemd unit. Run on the VPS after deploy.
set -euo pipefail
install -m 644 /var/www/cosplay-gallery/deploy/cosplay-gallery-import.service /etc/systemd/system/cosplay-gallery-import.service
mkdir -p /etc/systemd/system/cosplay-gallery.service.d
install -m 644 /var/www/cosplay-gallery/deploy/cosplay-gallery-http-worker.conf /etc/systemd/system/cosplay-gallery.service.d/worker.conf
systemctl daemon-reload
systemctl enable --now cosplay-gallery-import
systemctl restart cosplay-gallery
systemctl is-active cosplay-gallery cosplay-gallery-import
curl -fsS -o /dev/null -w "http:%{http_code}\n" http://127.0.0.1:3000/api/health
curl -fsS -o /dev/null -w "import:%{http_code}\n" http://127.0.0.1:3001/api/health
