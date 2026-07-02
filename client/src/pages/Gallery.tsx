import { trpc } from "@/lib/trpc";
import AlbumCard from "@/components/AlbumCard";
import SeoHead from "@/components/SeoHead";
import { useEffect, useRef, useState } from "react";
import { Crown, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useLocation, useSearch } from "wouter";
import { useTranslation } from "react-i18next";
import { Tag, X } from "lucide-react";

const LIMIT = 20;

export default function Gallery() {
  const [, setLocation] = useLocation();
  const searchStr = useSearch();
  const { t } = useTranslation();
  const [sortBy, setSortBy] = useState<"newest" | "oldest" | "popular">("newest");
  const [filterVip, setFilterVip] = useState<boolean | undefined>(undefined);
  const [categoryId, setCategoryId] = useState<number | undefined>(undefined);
  const [page, setPage] = useState(1);
  const [allAlbums, setAllAlbums] = useState<any[]>([]);
  const [hasMore, setHasMore] = useState(true);
  const loaderRef = useRef<HTMLDivElement>(null);

  // Read ?tag= from URL
  const tagSlug = new URLSearchParams(searchStr).get("tag") || undefined;

  // Detect filter/query params that should be noindex
  const searchParams = new URLSearchParams(searchStr);
  const hasFilterParams = searchParams.has("page") || searchParams.has("sort") ||
    searchParams.has("search") || searchParams.has("creator") ||
    (searchParams.has("tag") && !!tagSlug); // tag= is noindex (canonical /tag/[slug] handles indexing)
  const origin = typeof window !== "undefined" ? window.location.origin : "https://yukvix.com";

  const { data: categories } = trpc.albums.categories.useQuery();

  const { data, isFetching } = trpc.albums.list.useQuery(
    { page, limit: LIMIT, sortBy, isVip: filterVip, categoryId, tagSlug },
    { placeholderData: (prev: any) => prev }
  );

  // Append new page results
  useEffect(() => {
    if (data) {
      if (page === 1) {
        setAllAlbums(data.items);
      } else {
        setAllAlbums((prev) => {
          const existingIds = new Set(prev.map((a) => a.id));
          const newItems = data.items.filter((a) => !existingIds.has(a.id));
          return [...prev, ...newItems];
        });
      }
      setHasMore(data.items.length === LIMIT);
    }
  }, [data, page]);

  // Reset on filter change
  useEffect(() => {
    setPage(1);
    setAllAlbums([]);
    setHasMore(true);
  }, [sortBy, filterVip, categoryId, tagSlug]);

  // Infinite scroll via IntersectionObserver
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

  return (
    <div className="min-h-screen py-8">
      <SeoHead
        title="Cosplay Gallery"
        description="Browse thousands of stunning cosplay photos. Filter by category, VIP status, and more. New albums added daily."
        keywords="cosplay gallery, cosplay photos, anime cosplay, browse cosplay"
        canonical={`${origin}/gallery`}
        noIndex={hasFilterParams}
      />
      <div className="container">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
          <div>
            <h1
              className="text-2xl md:text-3xl font-bold text-foreground"
              style={{ fontFamily: "'Playfair Display', serif" }}
            >
              {t("gallery.title")}
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              {data ? t("gallery.albumCount", { count: data.total.toLocaleString() }) : t("common.loading")}
            </p>
          </div>

          {/* Filters */}
          <div className="flex items-center gap-2 flex-wrap">
            {/* Sort */}
            <Select value={sortBy} onValueChange={(v) => setSortBy(v as any)}>
              <SelectTrigger className="h-9 w-[140px] bg-secondary border-border">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="newest">{t("gallery.sort.newest")}</SelectItem>
                <SelectItem value="popular">{t("gallery.sort.popular")}</SelectItem>
                <SelectItem value="oldest">{t("gallery.sort.oldest")}</SelectItem>
              </SelectContent>
            </Select>

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
          </div>
        </div>

        {/* Active tag filter badge */}
        {tagSlug && (
          <div className="flex items-center gap-2 mb-4">
            <span className="text-sm text-muted-foreground">Đang lọc theo tag:</span>
            <span className="flex items-center gap-1.5 bg-primary/10 border border-primary/30 text-primary text-sm px-3 py-1 rounded-full">
              <Tag className="w-3.5 h-3.5" />
              {tagSlug}
              <button
                onClick={() => setLocation("/gallery")}
                className="ml-1 hover:text-primary/70 transition-colors"
                aria-label="Xóa filter tag"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </span>
          </div>
        )}

        {/* Category tabs */}
        {categories && categories.length > 0 && (
          <div className="flex gap-2 flex-wrap mb-6">
            <button
              onClick={() => setCategoryId(undefined)}
              className={`px-4 py-1.5 rounded-full text-sm border transition-all ${
                !categoryId
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-secondary border-border text-muted-foreground hover:text-foreground"
              }`}
            >
              {t("common.all")}
            </button>
            {categories.map((cat) => (
              <button
                key={cat.id}
                onClick={() => setCategoryId(categoryId === cat.id ? undefined : cat.id)}
                className={`px-4 py-1.5 rounded-full text-sm border transition-all ${
                  categoryId === cat.id
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-secondary border-border text-muted-foreground hover:text-foreground"
                }`}
              >
                {cat.name}
              </button>
            ))}
          </div>
        )}

        {/* Masonry Grid */}
        {allAlbums.length > 0 ? (
          <div className="masonry-grid">
            {allAlbums.map((album, i) => (
              <div
                key={album.id}
                className="masonry-item animate-fade-in"
                style={{ animationDelay: `${(i % 20) * 30}ms` }}
              >
                <AlbumCard album={album} />
              </div>
            ))}
          </div>
        ) : !isFetching ? (
          <div className="text-center py-24">
            <p className="text-muted-foreground">{t("gallery.noAlbums")}</p>
          </div>
        ) : null}

        {/* Loading skeletons for first load */}
        {isFetching && page === 1 && allAlbums.length === 0 && (
          <div className="masonry-grid">
            {Array.from({ length: 20 }).map((_, i) => (
              <div key={i} className="masonry-item">
                <div
                  className="skeleton rounded-xl"
                  style={{ height: `${200 + (i % 3) * 80}px` }}
                />
              </div>
            ))}
          </div>
        )}

        {/* Infinite scroll loader */}
        <div ref={loaderRef} className="flex justify-center py-8">
          {isFetching && page > 1 && (
            <Loader2 className="w-6 h-6 text-primary animate-spin" />
          )}
          {!hasMore && allAlbums.length > 0 && (
            <p className="text-sm text-muted-foreground">{t("gallery.allLoaded")}</p>
          )}
        </div>
      </div>
    </div>
  );
}
