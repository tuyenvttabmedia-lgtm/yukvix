#!/usr/bin/env python3
"""Quick JSX sanity checks on admin pages."""
import re
import glob

ROOT = "client/src/pages/admin"
paths = sorted(set(glob.glob(f"{ROOT}/**/*.tsx", recursive=True) + glob.glob(f"{ROOT}/*.tsx")))

for path in paths:
    if "AdminLayout" in path or "Panel" in path or "DesignPreview" in path:
        continue
    text = open(path, encoding="utf-8").read()
    issues = []
    for tag in ("AdminPageShell", "AdminLayout", "EntityPage", "DashboardPage", "SettingsPage", "OperationsPage"):
        opens = len(re.findall(rf"<{tag}\b", text))
        closes = text.count(f"</{tag}>")
        if opens != closes:
            issues.append(f"{tag} open={opens} close={closes}")
    # common undefined icon names from wrap script
    for m in re.finditer(r"AdminPageHeader icon=\{(\w+)\}", text):
        name = m.group(1)
        if not re.search(rf"\b{name}\b", text[: m.start()]):
            issues.append(f"icon {name} maybe undefined before use")
    if issues:
        print(path.replace("\\", "/"))
        for i in issues:
            print(f"  {i}")
