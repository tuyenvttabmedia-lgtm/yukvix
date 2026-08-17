#!/usr/bin/env python3
"""Recover admin pages: git checkout + safe shell wrap + import cleanup."""
import subprocess
import sys
from pathlib import Path

ROOT = Path("/var/www/cosplay-gallery")

KEEP = {
    "AdminLayout.tsx",
    "AdminDesignPreview.tsx",
    "ImportOperationsPanel.tsx",
    "SchedulerCenterPanel.tsx",
}


def run(cmd: list[str]) -> None:
    print("+", " ".join(cmd))
    subprocess.run(cmd, cwd=ROOT, check=True)


def main() -> None:
    admin = ROOT / "client/src/pages/admin"
    for path in sorted(admin.rglob("*.tsx")):
        if path.name in KEEP:
            continue
        rel = path.relative_to(ROOT)
        run(["git", "checkout", "--", str(rel)])

    run(["python3", "scripts/patch-admin-ds-infra.py"])
    run(["python3", "scripts/patch-admin-ds-wrap.py"])

    fix = Path("/tmp/fix-corrupted-admin-imports.py")
    if fix.exists():
        run(["python3", str(fix)])

    print("recovery done")


if __name__ == "__main__":
    main()
