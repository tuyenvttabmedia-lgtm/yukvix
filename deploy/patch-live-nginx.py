#!/usr/bin/env python3
"""Idempotent patch for /etc/nginx/sites-enabled/cosplay-gallery."""

from pathlib import Path

SITE = Path("/etc/nginx/sites-enabled/cosplay-gallery")

REPLACEMENT = """\
    location /fonts/ {
        proxy_pass         http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header   Host              $host;
        proxy_hide_header  Cache-Control;
        proxy_hide_header  CDN-Cache-Control;
        add_header         Cache-Control "public, max-age=31536000, immutable" always;
        add_header         CDN-Cache-Control "public, max-age=31536000, immutable" always;
        expires            1y;
    }

    location /assets/ {
        proxy_pass         http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header   Host              $host;
        proxy_hide_header  Cache-Control;
        proxy_hide_header  CDN-Cache-Control;
        add_header         Cache-Control "public, max-age=31536000, immutable" always;
        add_header         CDN-Cache-Control "public, max-age=31536000, immutable" always;
        expires            1y;
    }

    location /api/ {
        limit_req zone=api burst=60 nodelay;
        proxy_pass         http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header   Upgrade           $http_upgrade;
        proxy_set_header   Connection        "upgrade";
        proxy_set_header   Host              $host;
        proxy_set_header   X-Real-IP         $remote_addr;
        proxy_set_header   X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto $scheme;
        proxy_read_timeout 60s;
    }
    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 300s;
    }
"""


def already_patched(text: str) -> bool:
    return (
        "proxy_hide_header  Cache-Control" in text
        and "location /api/" in text
        and "limit_req zone=api" not in _catch_all_body(text)
    )


def _catch_all_body(text: str) -> str:
    marker = "    location / {"
    i = text.rfind(marker)
    if i < 0:
        return ""
    j = text.find("    }", i)
    return text[i:j] if j > i else ""


def main() -> None:
    if not SITE.exists():
        print("skip: live nginx site not found")
        return
    original = SITE.read_text()
    text = original.replace(
        "zone=api:10m rate=60r/m",
        "zone=api:10m rate=300r/m",
    )
    if already_patched(text):
        print("nginx already patched")
        return

    start = text.find("    location /fonts/")
    if start < 0:
        start = text.find("    location /assets/")
    if start < 0:
        raise SystemExit("no /fonts/ or /assets/ location")
    catch_all = text.find("    location / {", start)
    if catch_all < 0:
        raise SystemExit("no location / after assets")
    loc_end = text.find("    }", catch_all)
    if loc_end < 0:
        raise SystemExit("could not find end of location /")
    loc_end += len("    }")
    text = text[:start] + REPLACEMENT.rstrip() + text[loc_end:]
    SITE.write_text(text)
    print(f"patched {SITE}")


if __name__ == "__main__":
    main()
