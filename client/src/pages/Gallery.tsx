import { trpc } from "@/lib/trpc";
import AlbumCard from "@/components/AlbumCard";
import SeoHead from "@/components/SeoHead";
import { useEffect, useMemo, useRef, useState } from "react";
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
const AUTO_PAGES = 2;

type SortBy = "newest" | "oldest" | "popular";

function parseGalleryParams(searchStr: string) {
  const raw = searchStr.startsWith("?") ? searchStr.slice(1) : searchStr;
  const params = new URLSearchParams(raw);
  const sortRaw = params.get("sort");
  const sort: SortBy =
    sortRaw === "popular" || sortRaw === "oldest" || sortRaw === "newest"
      ? sortRaw
      : "newest";
  return {
    sort,
    vip: params.get("vip") === "true",
    category: params.get("category") || "",
    tag: params.get("tag") || undefined,
  };
}

function buildGalleryPath(opts: {
  sort: SortBy;
  vip: boolean;
  category: string;
  tag?: string;
}) {
  const p = new URLSearchParams();
  if (opts.sort !== "newest") p.set("sort", opts.sort);
  if (opts.vip) p.set("vip", "true");
  if (opts.category) p.set("category", opts.category);
  if (opts.tag) p.set("tag", opts.tag);
  const qs = p.toString();
  return qs ? `/gallery?${qs}` : "/gallery";
}

export default function Gallery() {
  const [, navigate] = useLocation();
  const searchStr = useSearch();
  const { t } = useTranslation();
  const parsed = useMemo(() => parseGalleryParams(searchStr), [searchStr]);
  const sortBy = parsed.sort;
  const filterVip = parsed.vip ? true : undefined;
  const categorySlug = parsed.category;
  const tagSlug = parsed.tag;

  const [categoryId, setCategoryId] = useState<number | undefined>(undefined);
  const [page, setPage] = useState(1);
  const [allAlbums, setAllAlbums] = useState<any[]>([]);
  const [hasMore, setHasMore] = useState(true);
  const loaderRef = useRef<HTMLDivElement>(null);

  const hasFilterParams =
    parsed.sort !== "newest" ||
    parsed.vip ||
    !!parsed.category ||
    !!tagSlug;
  const origin = typeof window !== "undefined" ? window.location.origin : "https://yukvix.com";

  const { data: categories } = trpc.albums.categories.useQuery();

  useEffect(() => {
    if (categories && categorySlug) {
      setCategoryId(categories.find((c) => c.slug === categorySlug)?.id);
    } else {
      setCategoryId(undefined);
    }
  }, [categories, categorySlug]);

  const { data, isFetching } = trpc.albums.list.useQuery(
    { page, limit: LIMIT, sortBy, isVip: filterVip, categoryId, tagSlug },
    {
      placeholderData: (prev: any) => prev,
      enabled: !categorySlug || categories !== undefined,
    }
  );

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

  useEffect(() => {
    setPage(1);
    setAllAlbums([]);
    setHasMore(true);
  }, [sortBy, filterVip, categoryId, tagSlug]);

  const canAutoLoad = page < AUTO_PAGES && hasMore && !isFetching;

  useEffect(() => {
    if (!loaderRef.current || !canAutoLoad) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && canAutoLoad) {
          setPage((p) => p + 1);
        }
      },
      { threshold: 0.1, rootMargin: "200px" }
    );
    observer.observe(loaderRef.current);
    return () => observer.disconnect();
  }, [canAutoLoad]);

  const updateFilters = (next: {
    sort?: SortBy;
    vip?: boolean;
    category?: string;
    tag?: string | undefined;
  }) => {
    navigate(
      buildGalleryPath({
        sort: next.sort ?? sortBy,
        vip: next.vip ?? parsed.vip,
        category: next.category ?? categorySlug,
        tag: "tag" in next ? next.tag : tagSlug,
      }),
      { replace: true }
    );
  };

  const total = data?.total ?? 0;
  const showLoadMore = hasMore && page >= AUTO_PAGES;

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
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
          <div>
            <h1
              className="text-2xl md:text-3xl font-bold text-foreground"
              style={{ fontFamily: "'Playfair Display', serif" }}
            >
              {t("gallery.title")}
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              {data ? t("gallery.albumCount", { count: total.toLocaleString() }) : t("common.loading")}
            </p>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <Select value={sortBy} onValueChange={(v) => updateFilters({ sort: v as SortBy })}>
              <SelectTrigger className="h-9 w-[140px] bg-secondary border-border">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="newest">{t("gallery.sort.newest")}</SelectItem>
                <SelectItem value="popular">{t("gallery.sort.popular")}</SelectItem>
                <SelectItem value="oldest">{t("gallery.sort.oldest")}</SelectItem>
              </SelectContent>
            </Select>

            <button
              onClick={() => updateFilters({ vip: !parsed.vip })}
              className={`flex items-center gap-1.5 h-9 px-3 rounded-lg border text-sm transition-all ${
                parsed.vip
                  ? "bg-primary/20 border-primary/50 text-primary"
                  : "bg-secondary border-border text-muted-foreground hover:text-foreground"
              }`}
            >
              <Crown className="w-3.5 h-3.5" />
              {t("gallery.vipOnly")}
            </button>
          </div>
        </div>

        {tagSlug && (
          <div className="flex items-center gap-2 mb-4">
            <span className="text-sm text-muted-foreground">{t("gallery.filteringByTag")}</span>
            <span className="flex items-center gap-1.5 bg-primary/10 border border-primary/30 text-primary text-sm px-3 py-1 rounded-full">
              <Tag className="w-3.5 h-3.5" />
              {tagSlug}
              <button
                onClick={() => updateFilters({ tag: undefined })}
                className="ml-1 hover:text-primary/70 transition-colors"
                aria-label="Xóa filter tag"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </span>
          </div>
        )}

        {categories && categories.length > 0 && (
          <div className="flex gap-2 flex-wrap mb-6">
            <button
              onClick={() => updateFilters({ category: "" })}
              className={`px-4 py-1.5 rounded-full text-sm border transition-all ${
                !categorySlug
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-secondary border-border text-muted-foreground hover:text-foreground"
              }`}
            >
              {t("common.all")}
            </button>
            {categories.map((cat) => (
              <button
                key={cat.id}
                onClick={() =>
                  updateFilters({ category: categorySlug === cat.slug ? "" : cat.slug })
                }
                className={`px-4 py-1.5 rounded-full text-sm border transition-all ${
                  categorySlug === cat.slug
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-secondary border-border text-muted-foreground hover:text-foreground"
                }`}
              >
                {cat.name}
              </button>
            ))}
          </div>
        )}

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

        <div ref={loaderRef} className="flex flex-col items-center gap-3 py-10">
          {allAlbums.length > 0 && total > 0 && (
            <p className="text-sm text-muted-foreground">
              {t("gallery.showingRange", { shown: allAlbums.length, total })}
            </p>
          )}
          {isFetching && page > 1 && (
            <Loader2 className="w-6 h-6 text-primary animate-spin" />
          )}
          {showLoadMore && !isFetching && (
            <Button
              variant="outline"
              onClick={() => setPage((p) => p + 1)}
              className="border-border/50 px-6"
            >
              {t("gallery.loadMore")}
            </Button>
          )}
          {!hasMore && allAlbums.length > 0 && (
            <p className="text-sm text-muted-foreground">{t("gallery.allLoaded")}</p>
          )}
        </div>
      </div>
    </div>
  );
}
