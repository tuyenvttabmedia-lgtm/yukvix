import { useAuth } from "@/_core/hooks/useAuth";
import { useTranslation } from "react-i18next";
import { trpc } from "@/lib/trpc";
import AlbumCard from "@/components/AlbumCard";
import SeoHead, { buildWebSiteSchema } from "@/components/SeoHead";
import { ArrowRight, Crown, ImageIcon, Sparkles, Star, Users, Zap } from "lucide-react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { useState, useEffect, useRef } from "react";

// ─── Hero Fade Background ────────────────────────────────────────────────────
function HeroFadeBackground({ images }: { images: string[] }) {
  const [current, setCurrent] = useState(0);
  const [prev, setPrev] = useState<number | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (images.length <= 1) return;
    timerRef.current = setInterval(() => {
      setCurrent((c) => {
        setPrev(c);
        return (c + 1) % images.length;
      });
    }, 7000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [images.length]);

  if (images.length === 0) return null;

  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden">
      {/* Previous image fading out */}
      {prev !== null && (
        <img
          key={`prev-${prev}`}
          src={images[prev]}
          alt=""
          className="absolute inset-0 w-full h-full object-cover"
          style={{
            opacity: 0,
            transition: "opacity 1.8s cubic-bezier(0.23,1,0.32,1)",
          }}
          aria-hidden
        />
      )}
      {/* Current image fading in */}
      <img
        key={`curr-${current}`}
        src={images[current]}
        alt=""
        className="absolute inset-0 w-full h-full object-cover"
        style={{
          opacity: 1,
          transition: "opacity 1.8s cubic-bezier(0.23,1,0.32,1)",
          animation: "hero-bg-fadein 1.8s cubic-bezier(0.23,1,0.32,1) forwards",
        }}
        aria-hidden
      />
      {/* Multi-layer overlay: dark vignette + bottom gradient for text */}
      <div
        className="absolute inset-0"
        style={{
          background: [
            "linear-gradient(to bottom, oklch(0.08 0.005 260 / 0.72) 0%, oklch(0.08 0.005 260 / 0.55) 40%, oklch(0.08 0.005 260 / 0.80) 100%)",
          ].join(", "),
        }}
      />
      <style>{`
        @keyframes hero-bg-fadein {
          from { opacity: 0; }
          to   { opacity: 1; }
        }
        @media (prefers-reduced-motion: reduce) {
          .hero-fade-bg img { transition: none !important; animation: none !important; }
        }
      `}</style>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

export default function Home() {
  const { user, isAuthenticated } = useAuth();
  const { t } = useTranslation();
  const isVip = user?.role === "vip" || user?.role === "admin" || user?.role === "super_admin";

  const { data: featuredAlbums } = trpc.albums.list.useQuery({
    page: 1,
    limit: 10,
    sortBy: "popular",
  });

  const { data: newAlbums } = trpc.albums.list.useQuery({
    page: 1,
    limit: 10,
    sortBy: "newest",
  });

  const { data: categories } = trpc.albums.categories.useQuery();

  const { data: popularCreators } = trpc.creators.list.useQuery({
    page: 1,
    limit: 12,
    sortBy: "albumCount",
    hasAlbums: true,
  });

  const { data: trendingTags } = trpc.tags.listWithCount.useQuery({
    sortBy: "popular",
    minAlbums: 1,
    page: 1,
    limit: 16,
  });
  const trendingTagItems = trendingTags?.items ?? [];

  // Real site stats for hero
  const { data: siteStats } = trpc.albums.publicStats.useQuery();

  // Fetch plans to show dynamic price in VIP banner (cheapest monthly plan)
  const { data: plans } = trpc.subscriptions.plans.useQuery();
  const cheapestMonthlyPlan = plans
    ? (plans as any[])
        .filter((p) => p.isActive && p.intervalDays <= 31)
        .sort((a, b) => Number(a.price) - Number(b.price))[0]
    : null;
  const vipFromPrice = cheapestMonthlyPlan
    ? `$${Number(cheapestMonthlyPlan.price).toFixed(2)}/mo`
    : null;

  // Collect VIP album covers for hero fade background
  const heroImages = (
    featuredAlbums?.items
      .filter((a: any) => a.isVip && a.coverUrl)
      .map((a: any) => a.coverUrl as string)
      .slice(0, 8) ?? []
  );

  const baseUrl = typeof window !== "undefined" ? window.location.origin : "https://yukvix.com";

  return (
    <div className="min-h-screen">
      <SeoHead
        isHome
        canonical={baseUrl + "/"}
        ogType="website"
        jsonLd={buildWebSiteSchema(baseUrl)}
      />
      {/* --- Hero --------------------------------------------------------------- */}
      <section className="relative overflow-hidden py-20 md:py-32 lg:py-40">
        {/* Fade background: VIP album covers */}
        <HeroFadeBackground images={heroImages} />
        {/* Radial amber glow on top of background */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background:
              "radial-gradient(ellipse 70% 50% at 50% 0%, oklch(0.72 0.18 50 / 0.18), transparent)",
          }}
        />

        <div className="container relative">
          <div className="max-w-3xl mx-auto text-center">
            <div className="inline-flex items-center gap-2 bg-primary/10 border border-primary/20 rounded-full px-4 py-1.5 text-sm text-primary mb-6">
              <Sparkles className="w-3.5 h-3.5" />
              {t("home.badge")}
            </div>

            <h1
              className="text-4xl md:text-6xl lg:text-7xl font-bold text-foreground mb-6"
              style={{ fontFamily: "'Playfair Display', serif", letterSpacing: "-0.03em" }}
            >
              {t("home.heroTitle1")}{" "}
              <span
                style={{
                  background: "linear-gradient(135deg, oklch(0.90 0.12 80), oklch(0.72 0.18 50))",
                  WebkitBackgroundClip: "text",
                  WebkitTextFillColor: "transparent",
                  backgroundClip: "text",
                }}
              >
                {t("home.heroTitle2")}
              </span>{" "}
              {t("home.heroTitle3")}
            </h1>

            <p className="text-lg text-muted-foreground mb-8 max-w-xl mx-auto leading-relaxed">
              {t("home.heroSubtitle")}
            </p>

            <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
              <Link href="/gallery">
                <Button size="lg" className="bg-primary text-primary-foreground hover:bg-primary/90 gap-2">
                  {t("home.exploreGallery")}
                  <ArrowRight className="w-4 h-4" />
                </Button>
              </Link>
              {!isVip && (
                <Link href="/vip">
                  <Button
                    size="lg"
                    className="gap-2 font-semibold"
                    style={{
                      background: "linear-gradient(135deg, oklch(0.72 0.18 50), oklch(0.60 0.22 30))",
                      color: "white",
                      boxShadow: "0 0 20px oklch(0.72 0.18 50 / 0.4)",
                    }}
                  >
                    <Crown className="w-4 h-4" />
                    {t("home.unlockVip")}
                  </Button>
                </Link>
              )}
            </div>

            {/* Stats - real numbers from DB; hide tiny member counts */}
            <div className="flex items-center justify-center gap-8 mt-12 pt-8 border-t border-border/50 min-h-[4.75rem]">
              {siteStats ? (
                [
                  {
                    icon: <ImageIcon className="w-4 h-4" />,
                    label: t("home.stats.photos"),
                    value:
                      siteStats.totalPhotos >= 1000
                        ? `${(siteStats.totalPhotos / 1000).toFixed(0)}K+`
                        : `${siteStats.totalPhotos}+`,
                  },
                  { icon: <Star className="w-4 h-4" />, label: t("home.stats.albums"), value: `${siteStats.totalAlbums}+` },
                  ...((siteStats.totalUsers ?? 0) >= 100
                    ? [
                        {
                          icon: <Users className="w-4 h-4" />,
                          label: t("home.stats.members"),
                          value:
                            siteStats.totalUsers >= 1000
                              ? `${(siteStats.totalUsers / 1000).toFixed(1)}K+`
                              : `${siteStats.totalUsers}+`,
                        },
                      ]
                    : []),
                ].map(({ icon, label, value }) => (
                  <div key={label} className="text-center">
                    <div className="flex items-center justify-center gap-1.5 text-primary mb-1">
                      {icon}
                      <span className="text-xl font-bold text-foreground">{value}</span>
                    </div>
                    <span className="text-xs text-muted-foreground">{label}</span>
                  </div>
                ))
              ) : (
                <>
                  <div className="h-10 w-20 skeleton rounded" />
                  <div className="h-10 w-20 skeleton rounded" />
                </>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* --- Latest Uploads -------------------------------------------- */}
      <section className="scroll-mt-24 py-12 border-t border-border/50">
        <div className="container">
          <div className="flex items-center justify-between mb-8">
            <div>
              <h2
                className="text-2xl md:text-3xl font-bold text-foreground"
                style={{ fontFamily: "'Playfair Display', serif" }}
              >
                {t("home.latestUploads")}
              </h2>
              <p className="text-sm text-muted-foreground mt-1">{t("home.latestUploadsSubtitle")}</p>
            </div>
            <Link href="/gallery" className="text-sm text-primary hover:text-primary/80 flex items-center gap-1">
              {t("home.viewAll")} <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>

          {newAlbums ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
              {newAlbums.items.map((album) => (
                <AlbumCard key={album.id} album={album} />
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
              {Array.from({ length: 10 }).map((_, i) => (
                <div key={i} className="rounded-xl overflow-hidden">
                  <div className="aspect-[3/4] skeleton rounded-xl" />
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* --- Featured Albums -------------------------------------------- */}
      <section className="scroll-mt-24 py-12">
        <div className="container">
          <div className="flex items-center justify-between mb-8">
            <div>
              <h2
                className="text-2xl md:text-3xl font-bold text-foreground"
                style={{ fontFamily: "'Playfair Display', serif" }}
              >
                {t("home.mostPopular")}
              </h2>
              <p className="text-sm text-muted-foreground mt-1">{t("home.mostPopularSubtitle")}</p>
            </div>
            <Link href="/gallery?sort=popular" className="text-sm text-primary hover:text-primary/80 flex items-center gap-1">
              {t("home.viewAll")} <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>

          {featuredAlbums ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
              {featuredAlbums.items.map((album) => (
                <AlbumCard key={album.id} album={album} />
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
              {Array.from({ length: 10 }).map((_, i) => (
                <div key={i} className="rounded-xl overflow-hidden">
                  <div className="aspect-[3/4] skeleton rounded-xl" />
                  <div className="p-3 space-y-2">
                    <div className="h-3 skeleton rounded w-3/4" />
                    <div className="h-2 skeleton rounded w-1/2" />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* --- Categories -------------------------------------------------------- */}
      {categories && categories.length > 0 && (
        <section className="scroll-mt-24 py-12 border-t border-border/50">
          <div className="container">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2
                  className="text-2xl md:text-3xl font-bold text-foreground"
                  style={{ fontFamily: "'Playfair Display', serif" }}
                >
                  {t("home.browseByCategory")}
                </h2>
                <p className="text-sm text-muted-foreground mt-1">{t("home.browseByCategorySubtitle")}</p>
              </div>
              <Link href="/gallery" className="text-sm text-primary hover:text-primary/80 flex items-center gap-1">
                {t("home.viewAll")} <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </div>
            <div className="flex flex-wrap gap-2">
              {categories.map((cat) => (
                <Link
                  key={cat.id}
                  href={`/gallery?category=${cat.slug}`}
                  className="px-4 py-2 rounded-full bg-secondary border border-border/50 text-sm text-foreground hover:border-primary/50 hover:text-primary transition-all duration-200"
                >
                  {cat.name}
                </Link>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* --- Popular Creators ------------------------------------------ */}
      {popularCreators && popularCreators.items.length > 0 && (
        <section className="scroll-mt-24 py-12 border-t border-border/50">
          <div className="container">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2
                  className="text-2xl md:text-3xl font-bold text-foreground"
                  style={{ fontFamily: "'Playfair Display', serif" }}
                >
                  {t("home.popularCreators")}
                </h2>
                <p className="text-sm text-muted-foreground mt-1">{t("home.popularCreatorsSubtitle")}</p>
              </div>
              <Link href="/creators" className="text-sm text-primary hover:text-primary/80 flex items-center gap-1">
                {t("home.viewAll")} <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </div>

            {/* Horizontal scroll on mobile, grid on desktop */}
            <div className="flex gap-4 overflow-x-auto pb-2 scrollbar-none sm:grid sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 xl:grid-cols-10 sm:overflow-visible">
              {popularCreators.items.map((creator: any) => (
                <Link key={creator.id} href={`/creator/${creator.slug}`} className="shrink-0 w-20 sm:w-auto">
                  <div className="group cursor-pointer text-center">
                    {/* Avatar */}
                    <div className="relative w-16 h-16 sm:w-full sm:aspect-square rounded-full sm:rounded-2xl overflow-hidden bg-secondary/50 mx-auto mb-2 ring-2 ring-transparent group-hover:ring-primary/40 transition-all duration-200">
                      {creator.avatarUrl ? (
                        <img
                          src={creator.avatarUrl}
                          alt={creator.name}
                          className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                          loading="lazy"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <span
                            className="text-xl font-bold text-muted-foreground/40"
                            style={{ fontFamily: "'Playfair Display', serif" }}
                          >
                            {creator.name.charAt(0).toUpperCase()}
                          </span>
                        </div>
                      )}
                    </div>
                    <p className="font-medium text-foreground text-xs truncate group-hover:text-primary transition-colors">
                      {creator.name}
                    </p>
                    {creator.albumCount > 0 && (
                      <p className="text-xs text-muted-foreground/60">
                        {creator.albumCount} {t("home.albums")}
                      </p>
                    )}
                  </div>
                </Link>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* --- Trending Tags --------------------------------------------- */}
      {trendingTagItems.length > 0 && (
        <section className="scroll-mt-24 py-12 border-t border-border/50">
          <div className="container">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2
                  className="text-2xl md:text-3xl font-bold text-foreground"
                  style={{ fontFamily: "'Playfair Display', serif" }}
                >
                  {t("home.trendingTags")}
                </h2>
                <p className="text-sm text-muted-foreground mt-1">{t("home.trendingTagsSubtitle")}</p>
              </div>
              <Link href="/tags" className="text-sm text-primary hover:text-primary/80 flex items-center gap-1">
                {t("home.viewAll")} <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </div>

            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-3">
              {trendingTagItems.map((tag: any, idx: number) => {
                const accentColors = [
                  "from-violet-500/40", "from-blue-500/40", "from-emerald-500/40",
                  "from-amber-500/40", "from-rose-500/40", "from-cyan-500/40",
                  "from-fuchsia-500/40", "from-orange-500/40",
                ];
                const accent = accentColors[idx % accentColors.length];
                return (
                  <Link key={tag.id} href={`/tag/${tag.slug}`}>
                    <div className="group relative overflow-hidden rounded-xl border border-border/40 hover:border-primary/40 transition-all duration-200 cursor-pointer aspect-[3/2] bg-secondary">
                      {tag.coverUrl ? (
                        <img
                          src={tag.coverUrl}
                          alt={tag.name}
                          className="absolute inset-0 w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                          loading="lazy"
                        />
                      ) : null}
                      <div className={`absolute inset-0 bg-gradient-to-t ${accent} to-black/75`} />
                      <div className="absolute bottom-0 left-0 right-0 p-2">
                        <p className="font-semibold text-white text-xs line-clamp-1">{tag.name}</p>
                        {tag.albumCount > 0 && (
                          <p className="text-[10px] text-white/50">
                            {tag.albumCount} {t("home.albums")}
                          </p>
                        )}
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          </div>
        </section>
      )}

      {/* --- VIP Banner -------------------------------------------------------- */}
      {!isVip && (
        <section className="scroll-mt-24 py-12">
          <div className="container">
            <div
              className="relative overflow-hidden rounded-2xl p-8 md:p-12"
              style={{
                background:
                  "linear-gradient(135deg, oklch(0.14 0.015 50) 0%, oklch(0.12 0.008 260) 50%, oklch(0.14 0.015 50) 100%)",
                border: "1px solid oklch(0.72 0.18 50 / 0.3)",
              }}
            >
              <div
                className="absolute inset-0 pointer-events-none"
                style={{
                  background:
                    "radial-gradient(ellipse 60% 80% at 100% 50%, oklch(0.72 0.18 50 / 0.08), transparent)",
                }}
              />
              <div className="relative flex flex-col md:flex-row items-center justify-between gap-6">
                <div>
                  <div className="flex items-center gap-2 mb-3">
                    <Crown className="w-5 h-5 text-primary" />
                    <span className="text-sm font-semibold text-primary uppercase tracking-wider">{t("home.vipBanner.label")}</span>
                  </div>
                  <h2
                    className="text-2xl md:text-3xl font-bold text-foreground mb-2"
                    style={{ fontFamily: "'Playfair Display', serif" }}
                  >
                    {t("home.vipBanner.title")}
                  </h2>
                  <p className="text-muted-foreground max-w-md">
                    {t("home.vipBanner.subtitle")}
                  </p>
                  <div className="flex flex-wrap gap-3 mt-4">
                    {[t("home.vipBanner.feature1"), t("home.vipBanner.feature2"), t("home.vipBanner.feature3"), t("home.vipBanner.feature4")].map((f) => (
                      <span
                        key={f}
                        className="flex items-center gap-1.5 text-xs text-foreground/80"
                      >
                        <Zap className="w-3 h-3 text-primary" />
                        {f}
                      </span>
                    ))}
                  </div>
                </div>
                <div className="shrink-0">
                  <Link href="/vip">
                    <Button
                      size="lg"
                      className="bg-primary text-primary-foreground hover:bg-primary/90 gap-2 shadow-lg"
                      style={{ boxShadow: "0 0 30px oklch(0.72 0.18 50 / 0.3)" }}
                    >
                      <Crown className="w-4 h-4" />
                      {vipFromPrice
                        ? t("home.vipBanner.ctaWithPrice", { price: vipFromPrice })
                        : t("home.vipBanner.cta")}
                    </Button>
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
