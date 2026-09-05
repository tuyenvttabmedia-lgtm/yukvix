/**
 * Public static page renderer — enhanced with sidebar TOC, breadcrumb, and print support.
 * Renders Privacy Policy, Terms of Service, and other CMS pages.
 */
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { trpc } from "@/lib/trpc";
import SeoHead from "@/components/SeoHead";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { Loader2, ChevronRight, Printer, ArrowUp } from "lucide-react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface Props {
  slug: string;
}

interface TocItem {
  id: string;
  text: string;
  level: number;
}

function buildToc(html: string): TocItem[] {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, "text/html");
  const headings = doc.querySelectorAll("h2, h3");
  return Array.from(headings).map((h, i) => ({
    id: `section-${i}`,
    text: h.textContent ?? "",
    level: parseInt(h.tagName[1]),
  }));
}

function injectIds(html: string): string {
  let i = 0;
  return html.replace(/<(h[23])([^>]*)>/gi, (_match, tag, attrs) => {
    return `<${tag}${attrs} id="section-${i++}">`;
  });
}

export default function StaticPage({ slug }: Props) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const { data: page, isLoading, error } = trpc.cms.getPublicPage.useQuery({ slug, lang });
  const [activeId, setActiveId] = useState<string>("");
  const [showScrollTop, setShowScrollTop] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);

  const toc = page?.content ? buildToc(page.content) : [];
  const processedContent = page?.content ? injectIds(page.content) : "";

  useEffect(() => {
    const handleScroll = () => {
      setShowScrollTop(window.scrollY > 400);
      // Highlight active TOC item
      if (!contentRef.current) return;
      const headings = contentRef.current.querySelectorAll("h2[id], h3[id]");
      let current = "";
      headings.forEach((h) => {
        const rect = h.getBoundingClientRect();
        if (rect.top <= 120) current = h.id;
      });
      if (current) setActiveId(current);
    };
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, [page]);

  const scrollToSection = (id: string) => {
    const el = document.getElementById(id);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
      // offset for sticky nav
      setTimeout(() => window.scrollBy(0, -80), 300);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-8 h-8 text-primary animate-spin" />
      </div>
    );
  }

  if (error || !page) {
    return (
      <div className="min-h-screen flex flex-col bg-background">
        <Navbar />
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <h1 className="text-6xl font-bold text-foreground mb-4">404</h1>
            <p className="text-muted-foreground mb-6 text-lg">{t("notFound.description", "Trang này không tồn tại.")}</p>
            <Link href="/">
              <Button variant="default">{t("notFound.goHome", "Về trang chủ")}</Button>
            </Link>
          </div>
        </div>
        <Footer />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <SeoHead
        title={page.seoTitle || page.title}
        description={page.seoDescription || undefined}
        canonical={`/${slug}`}
      />
      <Navbar />

      {/* Hero header */}
      <div className="border-b border-border/50 bg-card/30">
        <div className="max-w-6xl mx-auto px-4 py-10">
          {/* Breadcrumb */}
          <nav className="flex items-center gap-1.5 text-sm text-muted-foreground mb-4">
            <Link href="/" className="hover:text-foreground transition-colors">
              {t("common.home", "Trang chủ")}
            </Link>
            <ChevronRight className="w-3.5 h-3.5" />
            <span className="text-foreground">{page.title}</span>
          </nav>
          <div className="flex items-start justify-between gap-4">
            <div>
              <h1 className="text-3xl md:text-4xl font-bold text-foreground">{page.title}</h1>
              <p className="text-muted-foreground mt-2 text-sm">
                {t("staticPage.lastUpdated", "Cập nhật lần cuối")}:{" "}
                {new Date(page.updatedAt).toLocaleDateString(i18n.language, {
                  year: "numeric",
                  month: "long",
                  day: "numeric",
                })}
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="hidden md:flex items-center gap-2 shrink-0"
              onClick={() => window.print()}
            >
              <Printer className="w-4 h-4" />
              {t("staticPage.print", "In trang")}
            </Button>
          </div>
        </div>
      </div>

      <main className="flex-1">
        <div className="max-w-6xl mx-auto px-4 py-10">
          <div className="flex gap-12">
            {/* Sidebar TOC */}
            {toc.length > 0 && (
              <aside className="hidden lg:block w-64 shrink-0">
                <div className="sticky top-24">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
                    {t("staticPage.onThisPage", "Trên trang này")}
                  </p>
                  <nav className="space-y-1">
                    {toc.map((item) => (
                      <button
                        key={item.id}
                        onClick={() => scrollToSection(item.id)}
                        className={cn(
                          "block w-full text-left text-sm py-2 px-3 rounded-md transition-colors leading-snug",
                          item.level === 3 && "pl-6",
                          activeId === item.id
                            ? "bg-primary/10 text-primary font-medium"
                            : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                        )}
                      >
                        {item.text}
                      </button>
                    ))}
                  </nav>
                </div>
              </aside>
            )}

            {/* Main content */}
            <div className="flex-1 min-w-0">
              <div
                ref={contentRef}
                className="cms-prose max-w-none"
                dangerouslySetInnerHTML={{ __html: processedContent }}
              />

              {/* Footer nav */}
              <div className="mt-12 pt-8 border-t border-border/50 flex flex-wrap gap-4 text-sm text-muted-foreground">
                <Link href="/privacy" className="hover:text-primary transition-colors">
                  {t("footer.privacyPolicy", "Chính sách bảo mật")}
                </Link>
                <Link href="/terms" className="hover:text-primary transition-colors">
                  {t("footer.termsOfService", "Điều khoản dịch vụ")}
                </Link>
                <Link href="/contact" className="hover:text-primary transition-colors">
                  {t("footer.contact", "Liên hệ")}
                </Link>
                <Link href="/dmca" className="hover:text-primary transition-colors">
                  {t("footer.dmca", "DMCA")}
                </Link>
              </div>
            </div>
          </div>
        </div>
      </main>

      <Footer />

      {/* Scroll to top */}
      {showScrollTop && (
        <button
          onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
          className="fixed bottom-6 right-6 z-50 w-10 h-10 rounded-full bg-primary text-primary-foreground flex items-center justify-center shadow-lg hover:bg-primary/90 transition-all"
          aria-label={t("staticPage.scrollToTop", "Lên đầu trang")}
        >
          <ArrowUp className="w-4 h-4" />
        </button>
      )}
    </div>
  );
}
