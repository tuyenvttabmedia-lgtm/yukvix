#!/usr/bin/env python3
"""Add missing AdminLayout import to admin pages."""
from __future__ import annotations

import glob
import re
from pathlib import Path

ADMIN = Path("client/src/pages/admin")


def layout_import_path(path: Path) -> str:
    rel = path.parent.relative_to(ADMIN)
    if rel.parts:
        depth = len(rel.parts)
        return "../" * depth + "AdminLayout"
    return "./AdminLayout"


def fix_file(path: Path) -> bool:
    text = path.read_text(encoding="utf-8")
    if "<AdminLayout" not in text:
        return False
    if re.search(r'import AdminLayout from ["\']', text):
        return False

    imp = f'import AdminLayout from "{layout_import_path(path)}";\n'
    # After last import block
    m = list(re.finditer(r"^import .+;\n", text, re.M))
    pos = m[-1].end() if m else 0
    path.write_text(text[:pos] + imp + text[pos:], encoding="utf-8")
    print(f"fixed {path}")
    return True


def main() -> None:
    n = 0
    for path in sorted(ADMIN.rglob("*.tsx")):
        if fix_file(path):
            n += 1
    print(f"done: {n} files")


if __name__ == "__main__":
    main()
