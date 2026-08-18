import { trpc } from "@/lib/trpc";
import AlbumCard from "@/components/AlbumCard";
import SeoHead from "@/components/SeoHead";
import { useEffect, useRef, useState } from "react";
import { Crown, Loader2, Search as SearchIcon, X } from "lucide-react";
import { useLocation } from "wouter";
import { useTranslation } from "react-i18next";

const LIMIT = 20;

export default function Search() {
  const { t } = useTranslation();
  const [location] = useLocation();
  const params = new URLSearchParams(location.split("?")[1] || "");

  const [query, setQuery] = useState(params.get("q") || "");
  const [inputValue, setInputValue] = useState(params.get("q") || "");
  const [sortBy, setSortBy] = useState<"newest" | "oldest" | "popular">("newest");
  const [filterVip, setFilterVip] = useState<boolean | undefined>(
    params.get("vip") === "true" ? true : undefined
  );
  const [categorySlug, setCategorySlug] = useState(params.get("category") || "");
  const [categoryId, setCategoryId] = useState<number | undefined>(undefined);
  const [page, setPage] = useState(1);
  const [allAlbums, setAllAlbums] = useState<any[]>([]);
  const [hasMore, setHasMore] = useState(true);
  const loaderRef = useRef<HTMLDivElement>(null);

  const { data: categories } = trpc.albums.categories.useQuery();

  // Resolve category slug to ID
  useEffect(() => {
    if (categories && categorySlug) {
      const cat = categories.find((c) => c.slug === categorySlug);
      setCategoryId(cat?.id);
    } else {
      setCategoryId(undefined);
    }
  }, [categories, categorySlug]);

  // Only fetch when user has typed a query OR applied a filter (category / VIP)
  const hasActiveSearch = !!(query.trim() || filterVip !== undefined || categoryId);

  const { data, isFetching } = trpc.albums.list.useQuery(
    { page, limit: LIMIT, sortBy, isVip: filterVip, categoryId, search: query.trim() || undefined },
    { enabled: hasActiveSearch, placeholderData: (prev: any) => prev }
  );

  useEffect(() => {
    if (data) {
      if (page === 1) {
        setAllAlbums(data.items);
      } else {
        setAllAlbums((prev) => {
          const ids = new Set(prev.map((a) => a.id));
          return [...prev, ...data.items.filter((a) => !ids.has(a.id))];
        });
      }
      setHasMore(data.items.length === LIMIT);
    }
  }, [data, page]);

  useEffect(() => {
    setPage(1);
    setAllAlbums([]);
    setHasMore(true);
  }, [query, sortBy, filterVip, categoryId]);

  useEffect(() => {
    if (!loaderRef.current) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore && !isFetching) {
          setPage((p) => p + 1);
        }
      },
      { threshold: 0.1, rootMargin: "200px" }
    );
    observer.observe(loaderRef.current);
    return () => observer.disconnect();
  }, [hasMore, isFetching]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setQuery(inputValue);
  };

  const hasQueryOrVip = !!(query.trim() || filterVip !== undefined);
  const isCategoryLanding = !!categorySlug && !hasQueryOrVip;
  const origin = typeof window !== "undefined" ? window.location.origin : "https://yukvix.com";
  const canonical = isCategoryLanding
    ? `${origin}/search?category=${encodeURIComponent(categorySlug)}`
    : `${origin}/search`;

  const selectedCategory = categories?.find((c) => c.slug === categorySlug);
  const seoTitle = isCategoryLanding && selectedCategory
    ? `${selectedCategory.name} Cosplay Gallery`
    : "Search Cosplay Albums";
  const seoDescription = isCategoryLanding && selectedCategory
    ? `Browse ${selectedCategory.name} cosplay albums and photo sets on Yukvix.`
    : "Search and filter thousands of cosplay albums by character, series, cosplayer name, and more.";

  return (
    <div className="min-h-screen py-8">
      <SeoHead
        title={seoTitle}
        description={seoDescription}
        keywords="search cosplay, find cosplay photos, cosplay by character, cosplay by series"
        canonical={canonical}
        noIndex={hasQueryOrVip}
      />
      <div className="container">
        <h1
          className="text-2xl md:text-3xl font-bold text-foreground mb-6"
          style={{ fontFamily: "'Playfair Display', serif" }}
        >
          {t("search.title")}
        </h1>

        {/* Search bar */}
        <form onSubmit={handleSearch} className="mb-6">
          <div className="relative max-w-xl">
            <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              type="text"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              placeholder={t("search.placeholder")}
              className="w-full h-11 pl-10 pr-10 rounded-xl bg-secondary border border-border text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all"
            />
            {inputValue && (
              <button
                type="button"
                onClick={() => { setInputValue(""); setQuery(""); }}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        </form>

        {/* Filters */}
        <div className="flex flex-wrap gap-3 mb-6">
          {/* Sort */}
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as any)}
            className="h-9 px-3 rounded-lg bg-secondary border border-border text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
          >
            <option value="newest">{t("gallery.sort.newest")}</option>
            <option value="popular">{t("gallery.sort.popular")}</option>
            <option value="oldest">{t("gallery.sort.oldest")}</option>
          </select>

          {/* VIP filter */}
          <button
            onClick={() => setFilterVip(filterVip === true ? undefined : true)}
            className={`flex items-center gap-1.5 h-9 px-3 rounded-lg border text-sm transition-all ${
              filterVip === true
                ? "bg-primary/20 border-primary/50 text-primary"
                : "bg-secondary border-border text-muted-foreground hover:text-foreground"
            }`}
          >
            <Crown className="w-3.5 h-3.5" />
            {t("gallery.vipOnly")}
          </button>

          {/* Category filters */}
          {categories?.map((cat) => (
            <button
              key={cat.id}
              onClick={() => setCategorySlug(categorySlug === cat.slug ? "" : cat.slug)}
              className={`h-9 px-3 rounded-lg border text-sm transition-all ${
                categorySlug === cat.slug
                  ? "bg-primary/20 border-primary/50 text-primary"
                  : "bg-secondary border-border text-muted-foreground hover:text-foreground"
              }`}
            >
              {cat.name}
            </button>
          ))}
        </div>

        {/* Results count */}
        {data && hasActiveSearch && (
          <p className="text-sm text-muted-foreground mb-6">
            {t("search.resultsFound", { count: data.total.toLocaleString() })}
            {query && <span> {t("search.forQuery")} "<strong className="text-foreground">{query}</strong>"</span>}
          </p>
        )}

        {/* Results grid */}
        {!hasActiveSearch ? (
          // Prompt state: user hasn't typed anything yet
          <div className="text-center py-24">
            <SearchIcon className="w-16 h-16 text-muted-foreground/20 mx-auto mb-4" />
            <p className="text-lg font-medium text-foreground mb-2">{t("search.prompt") || "Nhập từ khóa để tìm kiếm"}</p>
            <p className="text-sm text-muted-foreground">{t("search.promptHint") || "Tìm theo tên album, cosplayer, nhân vật, series..."}</p>
          </div>
        ) : allAlbums.length > 0 ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
            {allAlbums.map((album) => (
              <AlbumCard key={album.id} album={album} />
            ))}
          </div>
        ) : !isFetching ? (
          <div className="text-center py-24">
            <SearchIcon className="w-12 h-12 text-muted-foreground/30 mx-auto mb-4" />
            <p className="text-muted-foreground">{t("search.noResults")}</p>
            {query && (
              <button
                onClick={() => { setInputValue(""); setQuery(""); }}
                className="text-sm text-primary mt-2 hover:underline"
              >
                {t("search.clearSearch")}
              </button>
            )}
          </div>
        ) : null}

        {/* Skeleton */}
        {isFetching && page === 1 && allAlbums.length === 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
            {Array.from({ length: 20 }).map((_, i) => (
              <div key={i} className="rounded-xl overflow-hidden">
                <div className="aspect-[3/4] skeleton rounded-xl" />
              </div>
            ))}
          </div>
        )}

        {/* Infinite scroll loader */}
        <div ref={loaderRef} className="flex justify-center py-8">
          {isFetching && page > 1 && <Loader2 className="w-6 h-6 text-primary animate-spin" />}
          {!hasMore && allAlbums.length > 0 && (
            <p className="text-sm text-muted-foreground">{t("gallery.allLoaded")}</p>
          )}
        </div>
      </div>
    </div>
  );
}
