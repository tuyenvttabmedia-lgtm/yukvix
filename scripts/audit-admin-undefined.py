#!/usr/bin/env python3
"""Find likely-undefined PascalCase identifiers used as JSX components in admin pages."""
import re
import glob

ROOT = "client/src/pages/admin"
BUILTIN = {
    "AdminLayout", "AdminPageShell", "AdminPageHeader", "EntityPage", "DashboardPage",
    "SettingsPage", "OperationsPage", "DataTable", "EntityGrid", "EntityToolbar",
    "AdminPagination", "AdminStatusBadge", "AdminEmptyState", "AdminLoadingSkeleton",
    "MetricCard", "Button", "Input", "Label", "Textarea", "Badge", "Card", "Dialog",
    "DialogContent", "DialogHeader", "DialogTitle", "DialogFooter", "DialogDescription",
    "Select", "SelectContent", "SelectItem", "SelectTrigger", "SelectValue",
    "Switch", "Table", "TableBody", "TableCell", "TableHead", "TableHeader", "TableRow",
    "Tabs", "TabsContent", "TabsList", "TabsTrigger", "Link", "SeoHead", "CategoryFormPanel",
    "CoverUpload", "EmailLogsTab", "EmailQueueTab", "StatCard", "StatusBadge",
    "CreateAlbumModal", "PlanCard", "ImportOperationsPanel", "SchedulerCenterPanel",
}

for path in sorted(glob.glob(f"{ROOT}/**/*.tsx", recursive=True)):
    if "Panel" in path and "Admin" not in path:
        continue
    text = open(f"/var/www/cosplay-gallery/{path}", encoding="utf-8").read()
    imported = set(re.findall(r"import \{([^}]+)\}", text, re.S))
    names = set()
    for block in imported:
        for part in block.replace("\n", " ").split(","):
            part = part.strip()
            if not part:
                continue
            if " as " in part:
                part = part.split(" as ")[-1].strip()
            names.add(part)
    # default import
    for m in re.finditer(r"^import (\w+)", text, re.M):
        names.add(m.group(1))
    # function components defined in file
    for m in re.finditer(r"^function (\w+)", text, re.M):
        names.add(m.group(1))
    for m in re.finditer(r"^export default function (\w+)", text, re.M):
        names.add(m.group(1))

    used = set(re.findall(r"<\s*([A-Z][A-Za-z0-9_]*)", text))
    used |= set(re.findall(r"icon=\{([A-Z][A-Za-z0-9_]*)\}", text))
    used |= set(re.findall(r"icon:\s*([A-Z][A-Za-z0-9_]*)", text))

    missing = sorted(
        u for u in used
        if u not in names and u not in BUILTIN and u not in ("React", "Fragment")
    )
    if missing:
        print(path.replace("\\", "/"))
        print(" ", ", ".join(missing))
