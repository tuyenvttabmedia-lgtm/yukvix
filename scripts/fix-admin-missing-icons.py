#!/usr/bin/env python3
"""Audit and fix missing lucide-react imports in admin pages."""
from __future__ import annotations

import re
from pathlib import Path

ADMIN = Path("client/src/pages/admin")

SKIP_NAMES = {"Icon", "LucideIcon", "React", "ElementType"}

HEADER_ICON = re.compile(r"AdminPageHeader icon=\{(\w+)\}")
HEADER_OBJ = re.compile(r"header=\{\{[^}]*?icon:\s*(\w+)")
METRIC_ICON = re.compile(r"\bicon:\s*(\w+)\s*,\s*label:")
EMPTY_ICON = re.compile(r"emptyState=\{\{[^}]*?icon:\s*(\w+)")


def collect_icons(text: str) -> set[str]:
    icons: set[str] = set()
    for pat in (HEADER_ICON, HEADER_OBJ, METRIC_ICON, EMPTY_ICON):
        for m in pat.finditer(text):
            name = m.group(1)
            if name not in SKIP_NAMES:
                icons.add(name)
    return icons


def get_imported(text: str) -> set[str]:
    m = re.search(r"import \{([^}]+)\} from \"lucide-react\"", text)
    if not m:
        return set()
    return {x.strip() for x in m.group(1).split(",") if x.strip()}


def fix_file(path: Path) -> list[str]:
    text = path.read_text(encoding="utf-8")
    used = collect_icons(text)
    if not used:
        return []
    imported = get_imported(text)
    missing = sorted(used - imported)
    if not missing:
        return []

    if imported:
        # Remove bogus Icon if it was added for destructuring alias
        new_imported = sorted((imported | set(missing)) - {"Icon"})
        new_block = "import { " + ", ".join(new_imported) + ' } from "lucide-react";'
        text = re.sub(r"import \{[^}]+\} from \"lucide-react\";", new_block, text, count=1)
    else:
        insert = "import { " + ", ".join(missing) + ' } from "lucide-react";\n'
        m = list(re.finditer(r"^import .+;\n", text, re.M))
        pos = m[-1].end() if m else 0
        text = text[:pos] + insert + text[pos:]

    path.write_text(text, encoding="utf-8")
    return missing


def audit() -> None:
    issues: list[tuple[str, set[str]]] = []
    for path in sorted(ADMIN.rglob("*.tsx")):
        text = path.read_text(encoding="utf-8")
        used = collect_icons(text)
        if not used:
            continue
        missing = used - get_imported(text)
        if missing:
            rel = str(path).replace("\\", "/")
            issues.append((rel, missing))
    if not issues:
        print("audit: OK — no missing header icons")
        return
    print("audit: missing imports")
    for rel, missing in issues:
        print(f"  {rel}: {', '.join(sorted(missing))}")


def main() -> None:
    fixed = 0
    for path in sorted(ADMIN.rglob("*.tsx")):
        missing = fix_file(path)
        if missing:
            print(f"fixed {path}: +{', '.join(missing)}")
            fixed += 1
    print(f"done: {fixed} files")
    audit()


if __name__ == "__main__":
    main()
