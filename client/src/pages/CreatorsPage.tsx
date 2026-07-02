import { useAuth } from "@/_core/hooks/useAuth";
import SeoHead from "@/components/SeoHead";
import { trpc } from "@/lib/trpc";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Search, Users, ImageIcon, SlidersHorizontal, X } from "lucide-react";
import { Link } from "wouter";
import { useState, useCallback, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";

const LIMIT = 24;

export default function CreatorsPage() {
  const { t } = useTranslation();
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [sortBy, setSortBy] = useState<"albumCount" | "name" | "newest">("albumCount");
  const [hasAlbums, setHasAlbums] = useState(false);
  const [page, setPage] = useState(1);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Debounce search input
  const handleSearchChange = useCallback((val: string) => {
    setSearch(val);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setDebouncedSearch(val);
      setPage(1);
    }, 350);
  }, []);

  const { data, isLoading } = trpc.creators.list.useQuery({
    page,
    limit: LIMIT,
    search: debouncedSearch || undefined,
    sortBy,
    hasAlbums: hasAlbums || undefined,
  });

  const totalPages = Math.ceil((data?.total ?? 0) / LIMIT);
  const hasFilters = debouncedSearch || hasAlbums || sortBy !== "albumCount";

  const clearFilters = () => {
    setSearch("");
    setDebouncedSearch("");
    setSortBy("albumCount");
    setHasAlbums(false);
    setPage(1);
  };

  return (
    <>
      <SeoHead
        title="Creators — Yukvix"
        description="Browse all cosplay creators on Yukvix. Find your favourite cosplayers and explore their exclusive galleries."
        canonical={typeof window !== "undefined" ? `${window.location.origin}/creators` : "/creators"}
      />
      <div className="min-h-screen py-8">
        <div className="container">
          {/* Header */}
          <div className="mb-8">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                <Users className="w-5 h-5 text-primary" />
              </div>
              <div>
                <h1 className="text-3xl font-bold text-foreground" style={{ fontFamily: "'Playfair Display', serif" }}>
                  Creators
                </h1>
                <p className="text-sm text-muted-foreground">
                  {data?.total !== undefined ? t("creators.count", { count: data.total.toLocaleString() }) : t("common.loading")}
                </p>
              </div>
            </div>
          </div>

          {/* Search & Filters */}
          <div className="flex flex-col sm:flex-row gap-3 mb-6">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder={t("creators.searchPlaceholder")}
                value={search}
                onChange={(e) => handleSearchChange(e.target.value)}
                className="pl-9 bg-secondary/50 border-border/50 focus:border-primary/50"
              />
              {search && (
                <button
                  onClick={() => handleSearchChange("")}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>

            <div className="flex gap-2 shrink-0">
              <Select value={sortBy} onValueChange={(v) => { setSortBy(v as typeof sortBy); setPage(1); }}>
                <SelectTrigger className="w-44 bg-secondary/50 border-border/50">
                  <SlidersHorizontal className="w-4 h-4 mr-2 text-muted-foreground" />
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="albumCount">{t("creators.sortMostAlbums")}</SelectItem>
                  <SelectItem value="name">{t("creators.sortNameAZ")}</SelectItem>
                  <SelectItem value="newest">{t("gallery.sort.newest")}</SelectItem>
                </SelectContent>
              </Select>

              <Button
                variant={hasAlbums ? "default" : "outline"}
                size="sm"
                onClick={() => { setHasAlbums(!hasAlbums); setPage(1); }}
                className={hasAlbums ? "bg-primary" : "border-border/50"}
              >
                <ImageIcon className="w-4 h-4 mr-1.5" />
                {t("creators.hasAlbums")}
              </Button>

              {hasFilters && (
                <Button variant="ghost" size="sm" onClick={clearFilters} className="text-muted-foreground hover:text-foreground">
                  <X className="w-4 h-4 mr-1" />
                  {t("common.clearFilters")}
                </Button>
              )}
            </div>
          </div>

          {/* Results */}
          {isLoading ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
              {Array.from({ length: 12 }).map((_, i) => (
                <div key={i} className="space-y-2">
                  <div className="aspect-square rounded-2xl bg-secondary/50 animate-pulse" />
                  <div className="h-4 bg-secondary/50 rounded animate-pulse mx-2" />
                  <div className="h-3 bg-secondary/30 rounded animate-pulse mx-4" />
                </div>
              ))}
            </div>
          ) : data?.items.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border/50 p-16 text-center">
              <Users className="w-12 h-12 text-muted-foreground mx-auto mb-4 opacity-30" />
              <p className="text-muted-foreground font-medium">{t("creators.noResults")}</p>
              {hasFilters && (
                <Button variant="ghost" size="sm" onClick={clearFilters} className="mt-3 text-primary">
                  {t("common.clearFilters")}
                </Button>
              )}
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
                {data?.items.map((creator: any) => (
                  <Link key={creator.id} href={`/creator/${creator.slug}`}>
                    <div className="group cursor-pointer">
                      {/* Avatar */}
                      <div className="relative aspect-square rounded-2xl overflow-hidden bg-secondary/50 mb-3 ring-2 ring-transparent group-hover:ring-primary/40 transition-all duration-200">
                        {creator.avatarUrl ? (
                          <img
                            src={creator.avatarUrl}
                            alt={creator.name}
                            className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                            loading="lazy"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center">
                            <span className="text-4xl font-bold text-muted-foreground/30" style={{ fontFamily: "'Playfair Display', serif" }}>
                              {creator.name.charAt(0).toUpperCase()}
                            </span>
                          </div>
                        )}
                        {/* Hover overlay */}
                        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-200" />
                        <div className="absolute bottom-2 left-0 right-0 flex justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                          <span className="text-xs text-white font-medium bg-black/50 px-2 py-0.5 rounded-full">
                            {t("creators.viewProfile")}
                          </span>
                        </div>
                      </div>

                      {/* Info */}
                      <div className="text-center px-1">
                        <p className="font-semibold text-foreground text-sm truncate group-hover:text-primary transition-colors">
                          {creator.name}
                        </p>
                        {creator.albumCount > 0 ? (
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {t("creators.albumCount", { count: creator.albumCount })}
                          </p>
                        ) : (
                          <p className="text-xs text-muted-foreground/50 mt-0.5">{t("creators.noAlbums")}</p>
                        )}
                      </div>
                    </div>
                  </Link>
                ))}
              </div>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex items-center justify-center gap-2 mt-10">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPage(p => Math.max(1, p - 1))}
                    disabled={page === 1}
                    className="border-border/50"
                  >
                    {t("common.prev")}
                  </Button>
                  <div className="flex gap-1">
                    {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                      const pageNum = Math.max(1, Math.min(totalPages - 4, page - 2)) + i;
                      return (
                        <Button
                          key={pageNum}
                          variant={pageNum === page ? "default" : "outline"}
                          size="sm"
                          onClick={() => setPage(pageNum)}
                          className={pageNum === page ? "bg-primary" : "border-border/50 w-9"}
                        >
                          {pageNum}
                        </Button>
                      );
                    })}
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                    disabled={page === totalPages}
                    className="border-border/50"
                  >
                    {t("common.next")}
                  </Button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </>
  );
}
