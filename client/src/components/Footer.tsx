import { trpc } from "@/lib/trpc";
import { Crown, Sparkles } from "lucide-react";
import { Link } from "wouter";
import { useTranslation } from "react-i18next";

// Social icon mapping (simple text-based fallback)
const SOCIAL_ICONS: Record<string, string> = {
  twitter: "𝕏",
  x: "𝕏",
  instagram: "📷",
  facebook: "f",
  youtube: "▶",
  tiktok: "♪",
  discord: "💬",
  patreon: "P",
};

export default function Footer() {
  const { data: settings } = trpc.cms.getPublicSettings.useQuery();
  const { data: footerMenuData } = trpc.cms.getPublicMenu.useQuery({ location: "footer" });
  const { t } = useTranslation();

  const footerText = settings?.["footer_text"] || `© ${new Date().getFullYear()} Yukvix. All rights reserved.`;
  const siteName = settings?.["site_name"] || "Yukvix";
  const tagline = settings?.["site_tagline"] || "Premium cosplay photography gallery. Discover stunning cosplays from talented artists worldwide.";

  let socialLinks: { id: string; platform: string; url: string }[] = [];
  try { socialLinks = JSON.parse(settings?.["social_links"] || "[]"); } catch { /* ignore */ }

  const footerItems = footerMenuData?.items ?? [];

  // Fallback footer links if CMS menu is empty
  const defaultLinks = [
    { label: t("footer.about"), url: "/about" },
    { label: t("footer.siteInfo"), url: "/info" },
    { label: t("footer.privacyPolicy"), url: "/privacy" },
    { label: t("footer.termsOfService"), url: "/terms" },
    { label: t("footer.contact"), url: "/contact" },
    { label: t("footer.dmca"), url: "/dmca" },
  ];

  const legalLinks = footerItems.length > 0
    ? footerItems.map((i) => ({ label: i.label, url: i.url }))
    : defaultLinks;

  return (
    <footer className="border-t border-border/50 bg-card/50 mt-16">
      <div className="container py-12">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
          {/* Brand */}
          <div className="md:col-span-2">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-7 h-7 rounded-lg bg-primary flex items-center justify-center">
                <Sparkles className="w-3.5 h-3.5 text-primary-foreground" />
              </div>
              <span
                className="text-lg font-bold"
                style={{
                  fontFamily: "'Playfair Display', serif",
                  background: "linear-gradient(135deg, oklch(0.90 0.12 80), oklch(0.72 0.18 50))",
                  WebkitBackgroundClip: "text",
                  WebkitTextFillColor: "transparent",
                  backgroundClip: "text",
                }}
              >
                {siteName}
              </span>
            </div>
            <p className="text-sm text-muted-foreground max-w-xs leading-relaxed">{tagline}</p>
            <div className="flex items-center gap-2 mt-4">
              <Link
                href="/vip"
                className="inline-flex items-center gap-1.5 text-xs font-medium text-primary hover:text-primary/80 transition-colors"
              >
                <Crown className="w-3.5 h-3.5" />
                {t("footer.becomeVip")}
              </Link>
            </div>

            {/* Social links */}
            {socialLinks.length > 0 && (
              <div className="flex items-center gap-3 mt-4">
                {socialLinks.map((s) => (
                  <a
                    key={s.id}
                    href={s.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    title={s.platform}
                    className="w-8 h-8 rounded-full bg-secondary hover:bg-primary/20 flex items-center justify-center text-muted-foreground hover:text-primary transition-colors text-xs font-bold"
                  >
                    {SOCIAL_ICONS[s.platform.toLowerCase()] ?? s.platform.slice(0, 1).toUpperCase()}
                  </a>
                ))}
              </div>
            )}
          </div>

          {/* Explore */}
          <div>
            <h4 className="text-sm font-semibold text-foreground mb-3">{t("footer.explore")}</h4>
            <ul className="space-y-2">
              {[
                { href: "/gallery", label: t("footer.allAlbums") },
                { href: "/creators", label: t("nav.creators") },
                { href: "/tags", label: t("nav.tags") },
                { href: "/gallery?vip=true", label: t("footer.vipExclusive") },
              ].map(({ href, label }) => (
                <li key={href}>
                  <Link href={href} className="text-sm text-muted-foreground hover:text-foreground transition-colors">
                    {label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Legal / CMS footer menu */}
          <div>
            <h4 className="text-sm font-semibold text-foreground mb-3">{t("footer.info")}</h4>
            <ul className="space-y-2">
              {legalLinks.map(({ url, label }) => (
                <li key={url}>
                  <Link href={url} className="text-sm text-muted-foreground hover:text-foreground transition-colors">
                    {label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="mt-10 pt-6 border-t border-border/50 flex flex-col sm:flex-row items-center justify-between gap-4">
          <p className="text-xs text-muted-foreground">{footerText}</p>
          <p className="text-xs text-muted-foreground">{t("footer.tagline")}</p>
        </div>
      </div>
    </footer>
  );
}
