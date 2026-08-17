#!/usr/bin/env python3
"""Safe admin DS shell wrap: strip Playfair, add AdminPageShell + AdminPageHeader."""
import re
import sys
from pathlib import Path

ROOT = Path("/var/www/cosplay-gallery")
ADMIN = ROOT / "client/src/pages/admin"

SKIP = {
    "AdminTags.tsx",
    "AdminUserDetail.tsx",
    "AdminUsers.tsx",
    "AdminDesignPreview.tsx",
}

# rel, shell mode, lucide icon, title, subtitle (optional)
PAGES = [
    ("AdminUsers.tsx", "default", "Users", "Quáº£n lÃ½ ngÆ°á»i dÃ¹ng", "TÃ i khoáº£n vÃ  phÃ¢n quyá»n"),
    ("AdminCreators.tsx", "default", "Users", "Quáº£n lÃ½ cosplayer", "Danh sÃ¡ch cosplayer vÃ  SEO"),
    ("AdminAlbums.tsx", "wide", "ImageIcon", "Quáº£n lÃ½ album", None),
    ("cms/AdminCategories.tsx", "default", "FolderOpen", "Danh má»¥c", "Quáº£n lÃ½ danh má»¥c album"),
    ("AdminOverview.tsx", "wide", "BarChart3", "Tá»•ng quan", "Thá»‘ng kÃª há»‡ thá»‘ng"),
    ("AdminAnalytics.tsx", "wide", "BarChart3", "PhÃ¢n tÃ­ch", "Thá»‘ng kÃª lÆ°á»£t xem"),
    ("AdminZipImport.tsx", "full", "FileArchive", "ZIP Import", "Import album tá»« file ZIP/RAR"),
    ("AdminSmtp.tsx", "narrow", "Mail", "Cáº¥u hÃ¬nh SMTP", "Gá»­i email xÃ¡c thá»±c vÃ  thÃ´ng bÃ¡o"),
    ("AdminAiSettings.tsx", "narrow", "Sparkles", "Cáº¥u hÃ¬nh AI", None),
    ("AdminStorageSettings.tsx", "narrow", "HardDrive", "LÆ°u trá»¯", None),
    ("AdminSeoSettings.tsx", "narrow", "Search", "Cáº¥u hÃ¬nh SEO", None),
    ("payments/AdminPaymentSettings.tsx", "narrow", "CreditCard", "Thanh toÃ¡n", None),
    ("AdminSubscriptions.tsx", "wide", "Crown", "Lá»‹ch sá»­ Ä‘Äƒng kÃ½", None),
    ("AdminContactSubmissions.tsx", "default", "Mail", "LiÃªn há»‡", None),
    ("AdminDmcaSubmissions.tsx", "default", "Shield", "DMCA", None),
    ("AdminEmailLogs.tsx", "default", "Mail", "Nháº­t kÃ½ email", None),
    ("AdminImportHistory.tsx", "default", "History", "Lá»‹ch sá»­ import", None),
    ("AdminImportSources.tsx", "narrow", "Link", "Nguá»“n import", None),
    ("AdminImport.tsx", "full", "Upload", "Import crawler", None),
    ("AdminSeoBulk.tsx", "full", "Sparkles", "SEO hÃ ng loáº¡t", None),
    ("AdminMediaLibrary.tsx", "wide", "ImageIcon", "ThÆ° viá»‡n media", None),
    ("AdminAlbumEditor.tsx", "full", "ImageIcon", "Chá»‰nh sá»­a album", None),
    ("AdminAlbumSeoReview.tsx", "full", "Search", "SEO album", None),
    ("AdminImportLogs.tsx", "default", "FileText", "Nháº­t kÃ½ import", None),
    ("cms/AdminAppearance.tsx", "narrow", "Palette", "Giao diá»‡n", None),
    ("cms/AdminMenus.tsx", "narrow", "Menu", "Menu", None),
    ("cms/AdminPages.tsx", "full", "FileText", "Trang CMS", None),
    ("payments/AdminPlans.tsx", "default", "CreditCard", "GÃ³i dá»‹ch vá»¥", None),
    ("payments/AdminVipManagement.tsx", "default", "Crown", "Quáº£n lÃ½ VIP", None),
    ("payments/AdminPaymentHistory.tsx", "wide", "Receipt", "Lá»‹ch sá»­ thanh toÃ¡n", None),
    ("payments/AdminWebhookMonitor.tsx", "wide", "Activity", "Webhook", None),
]

ROOT_WRAPPER_PATTERNS = [
    r'<AdminLayout>\s*<div className="p-6 max-w-7xl mx-auto[^"]*">',
    r'<AdminLayout>\s*<div className="p-6 max-w-6xl mx-auto[^"]*">',
    r'<AdminLayout>\s*<div className="p-6 max-w-5xl mx-auto[^"]*">',
    r'<AdminLayout>\s*<div className="p-6 max-w-3xl mx-auto[^"]*">',
    r'<AdminLayout>\s*<div className="p-6 max-w-2xl mx-auto[^"]*">',
    r'<AdminLayout>\s*<div className="p-6 max-w-3xl[^"]*">',
    r'<AdminLayout>\s*<div className="p-6 max-w-2xl[^"]*">',
    r'<AdminLayout>\s*<div className="p-6[^"]*space-y-6[^"]*">',
    r'<AdminLayout>\s*<div className="p-6">',
    r'<AdminLayout>\s*<div className="max-w-2xl mx-auto space-y-6[^"]*">',
    r'<AdminLayout>\s*<div className="max-w-2xl mx-auto[^"]*">',
]


def strip_playfair(text: str) -> str:
    return re.sub(
        r"""\s*style=\{\{\s*fontFamily:\s*[^}]*Playfair Display[^}]*\}\}""",
        "",
        text,
        flags=re.DOTALL,
    )


def remove_duplicate_h1(text: str) -> str:
    text = re.sub(r"<h1[\s\S]*?</h1>\s*", "", text, count=3)
    # Legacy header block (icon + title + subtitle) after AdminPageHeader
    text = re.sub(
        r'\{/\* Header \*/\}\s*<div className="flex items-start gap-3 mb-4">[\s\S]*?\n\s*\{/\* Info banner \*/\}',
        "{/* Info banner */}",
        text,
        count=1,
    )
    text = re.sub(
        r'\{/\* Header \*/\}\s*<div className="flex items-center gap-3 mb-6">[\s\S]*?\n\s*\{/\* Filters \*/\}',
        "{/* Filters */}",
        text,
        count=1,
    )
    text = re.sub(
        r'\{/\* Header \*/\}\s*<div className="flex items-center justify-between mb-6">[\s\S]*?</div>\s*',
        "",
        text,
        count=1,
    )
    # Orphan </div> immediately after AdminPageHeader (leftover from header strip)
    text = re.sub(
        r"(<AdminPageHeader[^>]*/>)\s*</div>\s*\n(\s*<Button)",
        r'\1\n        <div className="flex justify-end mb-4">\n\2',
        text,
        count=1,
    )
    text = re.sub(
        r"(<AdminPageHeader[^>]*/>\s*\n\s*<div className=\"flex justify-end mb-4\">\s*\n\s*<Button[\s\S]*?</Button>)\s*\n(\s*\{/\*)",
        r"\1\n        </div>\n\2",
        text,
        count=1,
    )
    text = re.sub(
        r"(<AdminPageHeader[^>]*/>)\s*<Button([\s\S]*?</Button>)\s*\n\s*(\{/\* Plans Grid \*/\})",
        r'\1\n        <div className="flex justify-end mb-4"><Button\2</div>\n\n        \3',
        text,
        count=1,
    )
    text = re.sub(
        r"(<AdminPageHeader[^>]*/>)\s*[\s\S]*?(\{/\* Table \*/\})",
        r"\1\n\n        \2",
        text,
        count=1,
    )
    text = re.sub(
        r'<div className="flex items-center gap-3 mb-6">\s*\{/\* Header \*/\}\s*',
        "",
        text,
        count=1,
    )
    text = re.sub(
        r'\{/\* Header \*/\}\s*<div className="flex items-center justify-between">[\s\S]*?\n\s*\{/\* Status card \*/\}',
        "{/* Status card */}",
        text,
        count=1,
    )
    text = re.sub(
        r'<div className="flex items-center justify-between mb-6">\s*<div>[\s\S]*?</div>\s*(<Button[\s\S]*?</Button>)\s*\n\s*\{/\* Search \*/\}',
        r'<div className="flex justify-end mb-4">\1</div>\n\n        {/* Search */}',
        text,
        count=1,
    )
    text = re.sub(
        r'<div className="flex items-center justify-between mb-6">\s*(<Button[\s\S]*?</Button>)\s*\n\s*\{/\* Filters \*/\}',
        r'<div className="flex justify-end mb-4">\1</div>\n\n        {/* Filters */}',
        text,
        count=1,
    )
    text = re.sub(
        r'<div className="flex items-center gap-3 mb-6">[\s\S]*?\n\s*<Card>',
        "<Card>",
        text,
        count=1,
    )
    return text


def add_admin_import(text: str) -> str:
    if re.search(r"AdminPageShell.*from \"@/admin\"", text):
        return text
    if 'from "@/admin"' in text:
        return re.sub(
            r"(import \{[^}]+)\} from \"@/admin\";",
            r"\1, AdminPageShell, AdminPageHeader } from \"@/admin\";",
            text,
            count=1,
        )
    m = re.search(r"^(import .+;\n)", text, re.M)
    insert = 'import { AdminPageShell, AdminPageHeader } from "@/admin";\n'
    if m:
        return text[: m.end()] + insert + text[m.end() :]
    return insert + text


def _close_shell_segment(segment: str) -> str:
    opens = len(re.findall(r"<AdminPageShell\b", segment))
    closes = segment.count("</AdminPageShell>")
    if opens <= closes:
        return segment

    converted, n = re.subn(
        r"(\n\s*)</div>(\s*\n\s*)</AdminLayout>(\s*\n\s*\);)",
        r"\1</AdminPageShell>\2</AdminLayout>\3",
        segment,
        count=1,
    )
    if n:
        return converted

    idx = segment.rfind("</AdminLayout>")
    if idx == -1:
        return segment

    pad = "    "
    return segment[:idx] + f"{pad}</AdminPageShell>\n{pad}" + segment[idx:]


def close_shell(text: str) -> str:
    m = re.search(r"export default function \w+\(\)", text)
    if not m:
        return _close_shell_segment(text)

    rest = text[m.end() :]
    end_m = re.search(r"\nfunction \w|\nexport function|\nconst \w+ = function", rest)
    func_body = rest[: end_m.start()] if end_m else rest

    returns = list(re.finditer(r"\n  return \(", func_body))
    if not returns:
        return _close_shell_segment(text)

    split_at = m.end() + returns[-1].start()
    return text[:split_at] + _close_shell_segment(text[split_at:])


def wrap_page(text: str, mode: str, icon: str, title: str, subtitle: str | None) -> str:
    if "<AdminPageShell" in text:
        return text

    sub_prop = f'\n          subtitle="{subtitle}"' if subtitle else ""
    shell_open = (
        f'<AdminLayout>\n'
        f'      <AdminPageShell mode="{mode}">\n'
        f'        <AdminPageHeader icon={{{icon}}} title="{title}"{sub_prop} />'
    )

    matched = False
    for pat in ROOT_WRAPPER_PATTERNS:
        matches = list(re.finditer(pat, text))
        if not matches:
            continue
        m = matches[-1]
        text = text[: m.start()] + shell_open + text[m.end() :]
        matched = True
        break

    if not matched:
        return text

    # Drop orphaned p-6 wrapper </div> (6-space indent) before modal blocks
    for _ in range(2):
        text2 = re.sub(
            r"\n      </div>\s*\n(\s*\n      \{/\*[^*]*Modal[^*]*\*/\})",
            r"\n\1",
            text,
            count=1,
        )
        if text2 == text:
            break
        text = text2

    text = remove_duplicate_h1(text)
    text = re.sub(r"</AdminPageShell>\s*</AdminLayout>", "</AdminPageShell>\n    </AdminLayout>", text)
    return close_shell(text)


def process(rel: str, mode: str, icon: str, title: str, subtitle: str | None) -> None:
    if Path(rel).name in SKIP:
        print(f"skip {rel} (manual)")
        return
    path = ADMIN / rel
    if not path.exists():
        print(f"skip {rel} (missing)")
        return
    text = strip_playfair(path.read_text(encoding="utf-8"))
    text = wrap_page(text, mode, icon, title, subtitle)
    text = add_admin_import(text)
    path.write_text(text, encoding="utf-8")
    print(f"ok {rel}")


def strip_all_playfair() -> None:
    for path in sorted(ADMIN.rglob("*.tsx")):
        text = path.read_text(encoding="utf-8")
        cleaned = strip_playfair(text)
        if cleaned != text:
            path.write_text(cleaned, encoding="utf-8")
            print(f"playfair {path.relative_to(ADMIN)}")


def main() -> None:
    if len(sys.argv) > 1 and sys.argv[1] == "--strip-only":
        strip_all_playfair()
        print("done")
        return

    targets = [a for a in sys.argv[1:] if a != "--strip-only"] if len(sys.argv) > 1 else [p[0] for p in PAGES]
    lookup = {p[0]: p for p in PAGES}
    strip_all_playfair()
    for rel in targets:
        if rel not in lookup:
            print(f"unknown {rel}")
            continue
        _, mode, icon, title, subtitle = lookup[rel]
        process(rel, mode, icon, title, subtitle)
    print("done")


if __name__ == "__main__":
    main()
