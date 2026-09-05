import { trpc } from "@/lib/trpc";
import AlbumCard from "@/components/AlbumCard";
import SeoHead from "@/components/SeoHead";
import { useEffect, useMemo, useRef, useState } from "react";
import { Crown, Loader2, Search as SearchIcon, X } from "lucide-react";
import { useLocation, useSearch } from "wouter";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";

const LIMIT = 25;
const SEARCH_DEBOUNCE_MS = 350;

function parseSearchString(searchStr: string) {
  const raw = searchStr.startsWith("?") ? searchStr.slice(1) : searchStr;
  const params = new URLSearchParams(raw);
  return {
    q: params.get("q") || "",
    vip: params.get("vip") === "true",
    category: params.get("category") || "",
  };
}

function buildSearchPath(q: string, vip: boolean, category: string) {
  const p = new URLSearchParams();
  if (q.trim()) p.set("q", q.trim());
  if (vip) p.set("vip", "true");
  if (category) p.set("category", category);
  const qs = p.toString();
  return qs ? `/search?${qs}` : "/search";
}

export default function Search() {
  const { t } = useTranslation();
  const [, navigate] = useLocation();
  const searchStr = useSearch();
  const { q: urlQ, vip: urlVip, category: urlCategory } = useMemo(
    () => parseSearchString(searchStr),
    [searchStr]
  );

  const query = urlQ;
  const filterVip = urlVip ? true : undefined;
  const categorySlug = urlCategory;

  const [inputValue, setInputValue] = useState(urlQ);
  const [sortBy, setSortBy] = useState<"newest" | "oldest" | "popular">("newest");
  const [categoryId, setCategoryId] = useState<number | undefined>(undefined);
  const [page, setPage] = useState(1);
  const [allAlbums, setAllAlbums] = useState<any[]>([]);
  const lastUrlQ = useRef(urlQ);

  const { data: categories } = trpc.albums.categories.useQuery();

  useEffect(() => {
    if (categories && categorySlug) {
      const cat = categories.find((c) => c.slug === categorySlug);
      setCategoryId(cat?.id);
    } else {
      setCategoryId(undefined);
    }
  }, [categories, categorySlug]);

  useEffect(() => {
    if (urlQ !== lastUrlQ.current) {
      lastUrlQ.current = urlQ;
      setInputValue(urlQ);
      return;
    }
    const timer = setTimeout(() => {
      const href = buildSearchPath(inputValue, urlVip, urlCategory);
      const current = buildSearchPath(urlQ, urlVip, urlCategory);
      if (href !== current) navigate(href, { replace: true });
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [inputValue, urlQ, urlVip, urlCategory, navigate]);

  const hasActiveSearch = !!(query.trim() || filterVip !== undefined || categoryId);

  const { data, isFetching, isPlaceholderData } = trpc.albums.list.useQuery(
    { page, limit: LIMIT, sortBy, isVip: filterVip, categoryId, search: query.trim() || undefined },
    { enabled: hasActiveSearch, placeholderData: (prev: any) => prev }
  );

  useEffect(() => {
    if (!data?.items || isPlaceholderData) return;
    if (page === 1) {
      setAllAlbums(data.items);
    } else {
      setAllAlbums((prev) => {
        const ids = new Set(prev.map((a) => a.id));
        return [...prev, ...data.items.filter((a) => !ids.has(a.id))];
      });
    }
  }, [data, page, isPlaceholderData]);

  useEffect(() => {
    setPage(1);
    setAllAlbums([]);
  }, [query, sortBy, filterVip, categoryId]);

  const go = (q: string, vip: boolean, category: string, replace = true) => {
    const href = buildSearchPath(q, vip, category);
    const current = buildSearchPath(urlQ, urlVip, urlCategory);
    if (href === current) return;
    navigate(href, { replace });
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    lastUrlQ.current = inputValue.trim();
    go(inputValue, urlVip, urlCategory, true);
  };

  const clearSearch = () => {
    setInputValue("");
    lastUrlQ.current = "";
    go("", urlVip, urlCategory, true);
  };

  const hasQueryOrVip = !!(query.trim() || filterVip !== undefined);
  const isCategoryLanding = !!categorySlug && !hasQueryOrVip;
  const origin = typeof window !== "undefined" ? window.location.origin : "https://yukvix.com";
  const canonical = isCategoryLanding
    ? `${origin}/search?category=${encodeURIComponent(categorySlug)}`
    : `${origin}/search`;

  const selectedCategory = categories?.find((c) => c.slug === categorySlug);
  const total = data?.total ?? 0;
  const hasMore = allAlbums.length > 0 && allAlbums.length < total;
  const visibleCategories = (categories ?? []).filter(
    (c) => c.slug === categorySlug || ((c as { albumCount?: number }).albumCount ?? 1) > 0
  );
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
          {isCategoryLanding && selectedCategory ? selectedCategory.name : t("search.title")}
        </h1>

        <form onSubmit={handleSearch} className="mb-6">
          <div className="flex gap-2 max-w-xl">
            <div className="relative flex-1">
              <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
              <input
                type="search"
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                placeholder={t("search.placeholder")}
                enterKeyHint="search"
                autoComplete="off"
                className="w-full h-11 pl-10 pr-10 rounded-xl bg-secondary border border-border text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all"
              />
              {inputValue && (
                <button
                  type="button"
                  onClick={clearSearch}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  aria-label={t("search.clearSearch")}
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
            <button
              type="submit"
              className="h-11 px-4 rounded-xl bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors shrink-0"
            >
              {t("search.title")}
            </button>
          </div>
        </form>

        <div className="flex flex-wrap gap-3 mb-6">
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as "newest" | "oldest" | "popular")}
            className="h-9 px-3 rounded-lg bg-secondary border border-border text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
          >
            <option value="newest">{t("gallery.sort.newest")}</option>
            <option value="popular">{t("gallery.sort.popular")}</option>
            <option value="oldest">{t("gallery.sort.oldest")}</option>
          </select>

          <button
            type="button"
            onClick={() => go(urlQ, !urlVip, urlCategory)}
            className={`flex items-center gap-1.5 h-9 px-3 rounded-lg border text-sm transition-all ${
              filterVip === true
                ? "bg-primary/20 border-primary/50 text-primary"
                : "bg-secondary border-border text-muted-foreground hover:text-foreground"
            }`}
          >
            <Crown className="w-3.5 h-3.5" />
            {t("gallery.vipOnly")}
          </button>

          {visibleCategories.map((cat) => (
            <button
              type="button"
              key={cat.id}
              onClick={() => go(urlQ, urlVip, categorySlug === cat.slug ? "" : cat.slug)}
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

        {data && hasActiveSearch && (
          <p className="text-sm text-muted-foreground mb-6">
            {t("search.resultsFound", { count: data.total.toLocaleString() })}
            {query && <span> {t("search.forQuery")} "<strong className="text-foreground">{query}</strong>"</span>}
          </p>
        )}

        {!hasActiveSearch ? (
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
                type="button"
                onClick={clearSearch}
                className="text-sm text-primary mt-2 hover:underline"
              >
                {t("search.clearSearch")}
              </button>
            )}
          </div>
        ) : null}

        {isFetching && page === 1 && allAlbums.length === 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
            {Array.from({ length: 20 }).map((_, i) => (
              <div key={i} className="rounded-xl overflow-hidden">
                <div className="aspect-[3/4] skeleton rounded-xl" />
              </div>
            ))}
          </div>
        )}

        <div className="flex flex-col items-center gap-3 py-8">
          {allAlbums.length > 0 && total > 0 && (
            <p className="text-sm text-muted-foreground">
              {t("gallery.showingRange", { shown: allAlbums.length, total })}
            </p>
          )}
          {isFetching && page > 1 && <Loader2 className="w-6 h-6 text-primary animate-spin" />}
          {hasMore && !isFetching && (
            <Button
              variant="outline"
              onClick={() => setPage((p) => p + 1)}
              className="border-border/50 px-8"
            >
              {t("gallery.loadMore")}
            </Button>
          )}
          {!hasMore && allAlbums.length > 0 && !isFetching && (
            <p className="text-sm text-muted-foreground">{t("gallery.allLoaded")}</p>
          )}
        </div>
      </div>
    </div>
  );
}
