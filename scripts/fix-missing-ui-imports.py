#!/usr/bin/env python3
"""Add missing @/components/ui imports for JSX components used in admin pages."""
from __future__ import annotations

import glob
import re
from pathlib import Path

ROOT = Path("client/src/pages/admin")

UI_MAP = {
    "Input": "@/components/ui/input",
    "Label": "@/components/ui/label",
    "Button": "@/components/ui/button",
    "Textarea": "@/components/ui/textarea",
    "Badge": "@/components/ui/badge",
    "Switch": "@/components/ui/switch",
    "Separator": "@/components/ui/separator",
    "Progress": "@/components/ui/progress",
    "Card": "@/components/ui/card",
    "CardContent": "@/components/ui/card",
    "CardHeader": "@/components/ui/card",
    "CardTitle": "@/components/ui/card",
    "CardDescription": "@/components/ui/card",
}


def used_components(text: str) -> set[str]:
    return set(re.findall(r"<\s*(" + "|".join(UI_MAP) + r")\b", text))


def imported_from(path_key: str, text: str) -> set[str]:
    names: set[str] = set()
    pat = rf'import \{{([^}}]+)\}} from "{re.escape(path_key)}"'
    m = re.search(pat, text, re.S)
    if not m:
        return names
    for part in m.group(1).replace("\n", " ").split(","):
        part = part.strip()
        if part:
            names.add(part.split(" as ")[0].strip())
    return names


def fix_file(path: Path) -> list[str]:
    text = path.read_text(encoding="utf-8")
    used = used_components(text)
    if not used:
        return []

    by_module: dict[str, set[str]] = {}
    for comp in used:
        mod = UI_MAP[comp]
        by_module.setdefault(mod, set()).add(comp)

    fixed: list[str] = []
    for mod, comps in by_module.items():
        existing = imported_from(mod, text)
        missing = comps - existing
        if not missing:
            continue
        merged = sorted(existing | missing)
        block = "import { " + ", ".join(merged) + f' }} from "{mod}";'
        if existing:
            text = re.sub(rf'import \{{[^}}]+\}} from "{re.escape(mod)}";', block, text, count=1, flags=re.S)
        else:
            m = list(re.finditer(r"^import .+;\n", text, re.M))
            pos = m[-1].end() if m else 0
            text = text[:pos] + block + "\n" + text[pos:]
        fixed.extend(sorted(missing))

    if fixed:
        path.write_text(text, encoding="utf-8")
    return fixed


def main() -> None:
    total = 0
    for path in sorted(ROOT.rglob("*.tsx")):
        missing = fix_file(path)
        if missing:
            print(f"fixed {path}: +{', '.join(missing)}")
            total += 1
    print(f"done: {total} files")


if __name__ == "__main__":
    main()
