#!/usr/bin/env python3
"""Patch AdminLayout, index.css, App.tsx for Design System V1."""
from pathlib import Path

ROOT = Path("/var/www/cosplay-gallery/client/src")

# AdminLayout — data-admin on main
layout = ROOT / "pages/admin/AdminLayout.tsx"
lt = layout.read_text(encoding="utf-8")
if "data-admin" not in lt:
    lt = lt.replace(
        '<main className="flex-1 overflow-auto pb-16 md:pb-0">',
        '<main data-admin className="flex-1 overflow-auto pb-16 md:pb-0">',
    )
    layout.write_text(lt, encoding="utf-8")
    print("patched AdminLayout")

# index.css — import admin tokens
css = ROOT / "index.css"
ct = css.read_text(encoding="utf-8")
imp = '@import "./admin/tokens/admin.css";'
if imp not in ct:
    ct = ct.replace('@import "tw-animate-css";', '@import "tw-animate-css";\n' + imp)
    css.write_text(ct, encoding="utf-8")
    print("patched index.css")

# App.tsx — design preview route
app = ROOT / "App.tsx"
at = app.read_text(encoding="utf-8")
lazy = "const AdminDesignPreview = lazy(() => import(\"./pages/admin/AdminDesignPreview\"));"
route = '        <Route path="/admin/_design-preview" component={AdminDesignPreview} />'
if "AdminDesignPreview" not in at:
    at = at.replace(
        "const AdminAiSettings = lazy(() => import(\"./pages/admin/AdminAiSettings\"));",
        "const AdminAiSettings = lazy(() => import(\"./pages/admin/AdminAiSettings\"));\n" + lazy,
    )
    at = at.replace(
        '        <Route path="/admin" component={AdminOverview} />',
        route + "\n        " + '        <Route path="/admin" component={AdminOverview} />',
    )
    app.write_text(at, encoding="utf-8")
    print("patched App.tsx")

print("done")
