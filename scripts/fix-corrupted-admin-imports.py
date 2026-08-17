#!/usr/bin/env python3
"""Remove corrupted duplicate import lines from admin DS migration."""
from pathlib import Path
import re

ADMIN = Path("/var/www/cosplay-gallery/client/src/pages/admin")
PATTERN = re.compile(r'^\s*\w+\s+"@/admin";,\s*\n', re.M)

fixed: list[str] = []
for path in sorted(ADMIN.rglob("*.tsx")):
    text = path.read_text(encoding="utf-8")
    cleaned = PATTERN.sub("", text)
    if cleaned != text:
        path.write_text(cleaned, encoding="utf-8")
        fixed.append(str(path.relative_to(ADMIN)))

print(f"fixed {len(fixed)} files")
for name in fixed:
    print(name)
