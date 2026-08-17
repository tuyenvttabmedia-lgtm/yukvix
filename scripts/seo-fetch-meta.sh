#!/bin/bash
# Fetch head meta from key URLs (run on VPS)
urls=(
  "https://yukvix.com/"
  "https://yukvix.com/gallery"
  "https://yukvix.com/search"
  "https://yukvix.com/search?q=test"
  "https://yukvix.com/login"
  "https://yukvix.com/admin"
  "https://yukvix.com/browse"
  "https://yukvix.com/404-test-slug"
)
ALBUM=$(curl -s https://yukvix.com/sitemap-albums.xml | grep -oP '(?<=<loc>)[^<]+' | head -1)
CREATOR=$(curl -s https://yukvix.com/sitemap-creators.xml | grep -oP '(?<=<loc>)[^<]+' | head -1)
TAG=$(curl -s https://yukvix.com/sitemap-tags.xml | grep -oP '(?<=<loc>)[^<]+' | head -1)
urls+=("$ALBUM" "$CREATOR" "$TAG")

for u in "${urls[@]}"; do
  echo "======== $u ========"
  curl -sI "$u" | head -3
  curl -s "$u" | tr '\n' ' ' | grep -oE '<title>[^<]+</title>|<meta name="description" content="[^"]*"|<meta name="robots" content="[^"]*"|<link rel="canonical" href="[^"]*"|<meta property="og:[^"]+" content="[^"]*"|<meta name="twitter:[^"]+" content="[^"]*"|<script type="application/ld\+json">[^<]+' | head -12
  echo
done
