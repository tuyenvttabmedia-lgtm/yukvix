#!/usr/bin/env python3
"""Add missing `import { trpc } from '@/lib/trpc'` when file uses trpc."""
from __future__ import annotations

import glob
import re
from pathlib import Path

ROOT = Path("client/src/pages/admin")


def needs_trpc(text: str) -> bool:
    return bool(re.search(r"\btrpc\.", text))


def has_trpc_import(text: str) -> bool:
    return bool(re.search(r'import \{ trpc \} from "@/lib/trpc"', text))


def fix_file(path: Path) -> bool:
    text = path.read_text(encoding="utf-8")
    if not needs_trpc(text) or has_trpc_import(text):
        return False
    insert = 'import { trpc } from "@/lib/trpc";\n'
    m = list(re.finditer(r"^import .+;\n", text, re.M))
    pos = m[-1].end() if m else 0
    path.write_text(text[:pos] + insert + text[pos:], encoding="utf-8")
    print(f"fixed {path}")
    return True


def main() -> None:
    n = 0
    for path in sorted(ROOT.rglob("*.tsx")):
        if fix_file(path):
            n += 1
    print(f"done: {n} files")


if __name__ == "__main__":
    main()
