#!/usr/bin/env python3
"""Find lucide icons used in admin headers but not imported."""
import re
import glob

ROOT = "client/src/pages/admin"

PATTERNS = [
    re.compile(r"AdminPageHeader icon=\{(\w+)\}"),
    re.compile(r"header=\{\{[^}]*?icon:\s*(\w+)"),
    re.compile(r"emptyState=\{\{[^}]*?icon:\s*(\w+)"),
]

SKIP = {"Icon", "LucideIcon", "React", "ElementType"}


def get_imported(text):
    m = re.search(r"import \{([^}]+)\} from \"lucide-react\"", text, re.S)
    if not m:
        return set()
    return {x.strip() for x in m.group(1).replace("\n", " ").split(",") if x.strip()}


def get_used(text):
    used = set()
    for pat in PATTERNS:
        used.update(pat.findall(text))
    return {u for u in used if u not in SKIP}


issues = []
for path in sorted(glob.glob(f"{ROOT}/**/*.tsx", recursive=True) + glob.glob(f"{ROOT}/*.tsx")):
    text = open(path, encoding="utf-8").read()
    used = get_used(text)
    if not used:
        continue
    missing = sorted(used - get_imported(text))
    if missing:
        issues.append((path, missing))

if not issues:
    print("OK: no missing lucide imports")
else:
    for path, missing in issues:
        print(f"{path}: {', '.join(missing)}")
    print(f"TOTAL: {len(issues)}")
