#!/usr/bin/env python3
"""Set explicit admin shell modes to full per owner preference."""
import re
from pathlib import Path

ROOT = Path("client/src/pages/admin")
SKIP = {"AdminDesignPreview.tsx", "AdminUserDetail.tsx"}

for path in sorted(ROOT.rglob("*.tsx")):
    if path.name in SKIP:
        continue
    text = path.read_text(encoding="utf-8")
    new = text
    new = re.sub(r'shell="default"', 'shell="full"', new)
    new = re.sub(r'shell="wide"', 'shell="full"', new)
    new = re.sub(r'shell="narrow"', 'shell="full"', new)
    new = re.sub(r'mode="default"', 'mode="full"', new)
    new = re.sub(r'mode="wide"', 'mode="full"', new)
    new = re.sub(r'mode="narrow"', 'mode="full"', new)
    if new != text:
        path.write_text(new, encoding="utf-8")
        print(f"updated {path}")
