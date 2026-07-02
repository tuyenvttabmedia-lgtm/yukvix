import SeoHead from "@/components/SeoHead";
import { trpc } from "@/lib/trpc";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, Tag, SlidersHorizontal, X, Hash } from "lucide-react";
import { Link } from "wouter";
import { useState, useCallback, useRef } from "react";
import { useTranslation } from "react-i18next";

export default function TagsPage() {
  const { t } = useTranslation();
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [sortBy, setSortBy] = useState<"popular" | "name" | "newest">("popular");
  const [minAlbums, setMinAlbums] = useState(0);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleSearchChange = useCallback((val: string) => {
    setSearch(val);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setDebouncedSearch(val), 350);
  }, []);

  const { data: tags, isLoading } = trpc.tags.listWithCount.useQuery({
    search: debouncedSearch || undefined,
    sortBy,
    minAlbums,
  });

  const hasFilters = debouncedSearch || sortBy !== "popular" || minAlbums > 0;

  const clearFilters = () => {
    setSearch("");
    setDebouncedSearch("");
    setSortBy("popular");
    setMinAlbums(0);
  };

  // Color palette for tag chips (cycles)
  const tagColors = [
    "bg-violet-500/10 text-violet-400 border-violet-500/20 hover:bg-violet-500/20",
    "bg-blue-500/10 text-blue-400 border-blue-500/20 hover:bg-blue-500/20",
    "bg-emerald-500/10 text-emerald-400 border-emerald-500/20 hover:bg-emerald-500/20",
    "bg-amber-500/10 text-amber-400 border-amber-500/20 hover:bg-amber-500/20",
    "bg-rose-500/10 text-rose-400 border-rose-500/20 hover:bg-rose-500/20",
    "bg-cyan-500/10 text-cyan-400 border-cyan-500/20 hover:bg-cyan-500/20",
    "bg-fuchsia-500/10 text-fuchsia-400 border-fuchsia-500/20 hover:bg-fuchsia-500/20",
    "bg-orange-500/10 text-orange-400 border-orange-500/20 hover:bg-orange-500/20",
  ];

  return (
    <>
      <SeoHead
        title="Cosplay Tags & Categories | Yukvix"
        description="Explore cosplay tags, creators, styles, themes, and premium photo collections on Yukvix."
        canonical={typeof window !== "undefined" ? `${window.location.origin}/tags` : "https://yukvix.com/tags"}
      />
      <div className="min-h-screen py-8">
        <div className="container">
          {/* Header */}
          <div className="mb-8">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                <Hash className="w-5 h-5 text-primary" />
              </div>
              <div>
                <h1 className="text-3xl font-bold text-foreground" style={{ fontFamily: "'Playfair Display', serif" }}>
                  Tags
                </h1>
                <p className="text-sm text-muted-foreground">
                  {tags !== undefined ? t("tags.count", { count: tags.length.toLocaleString() }) : t("common.loading")}
                </p>
              </div>
            </div>
          </div>

          {/* Search & Filters */}
          <div className="flex flex-col sm:flex-row gap-3 mb-6">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder={t("tags.searchPlaceholder")}
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

            <div className="flex gap-2 shrink-0 flex-wrap">
              <Select value={sortBy} onValueChange={(v) => setSortBy(v as typeof sortBy)}>
                <SelectTrigger className="w-44 bg-secondary/50 border-border/50">
                  <SlidersHorizontal className="w-4 h-4 mr-2 text-muted-foreground" />
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="popular">{t("gallery.sort.popular")}</SelectItem>
                  <SelectItem value="name">{t("creators.sortNameAZ")}</SelectItem>
                  <SelectItem value="newest">{t("gallery.sort.newest")}</SelectItem>
                </SelectContent>
              </Select>

              {/* Min albums quick filters */}
              {[0, 1, 5, 10].map((n) => (
                <Button
                  key={n}
                  variant={minAlbums === n ? "default" : "outline"}
                  size="sm"
                  onClick={() => setMinAlbums(n)}
                  className={minAlbums === n ? "bg-primary" : "border-border/50"}
                >
                  {n === 0 ? t("common.all") : t("tags.minAlbums", { count: n })}
                </Button>
              ))}

              {hasFilters && (
                <Button variant="ghost" size="sm" onClick={clearFilters} className="text-muted-foreground hover:text-foreground">
                  <X className="w-4 h-4 mr-1" />
                  {t("common.clear")}
                </Button>
              )}
            </div>
          </div>

          {/* Results */}
          {isLoading ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
              {Array.from({ length: 24 }).map((_, i) => (
                <div key={i} className="rounded-xl bg-secondary/50 animate-pulse aspect-[4/3]" />
              ))}
            </div>
          ) : !tags || tags.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border/50 p-16 text-center">
              <Tag className="w-12 h-12 text-muted-foreground mx-auto mb-4 opacity-30" />
              <p className="text-muted-foreground font-medium">{t("tags.noResults")}</p>
              {hasFilters && (
                <Button variant="ghost" size="sm" onClick={clearFilters} className="mt-3 text-primary">
                  {t("common.clearFilters")}
                </Button>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
              {tags.map((tag: any, idx: number) => {
                const accentColors = [
                  "from-violet-500/30", "from-blue-500/30", "from-emerald-500/30",
                  "from-amber-500/30", "from-rose-500/30", "from-cyan-500/30",
                  "from-fuchsia-500/30", "from-orange-500/30",
                ];
                const accent = accentColors[idx % accentColors.length];
                return (
                  <Link key={tag.id} href={`/tag/${tag.slug}`}>
                    <div className="group relative overflow-hidden rounded-xl border border-border/50 hover:border-primary/40 transition-all duration-200 hover:shadow-lg hover:shadow-primary/5 cursor-pointer aspect-[4/3] bg-secondary">
                      {/* Thumbnail */}
                      {tag.coverUrl ? (
                        <img
                          src={tag.coverUrl}
                          alt={tag.name}
                          className="absolute inset-0 w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                          loading="lazy"
                        />
                      ) : (
                        <div className="absolute inset-0 flex items-center justify-center">
                          <Hash className="w-8 h-8 text-muted-foreground/20" />
                        </div>
                      )}
                      {/* Gradient overlay */}
                      <div className={`absolute inset-0 bg-gradient-to-t ${accent} to-black/70`} />
                      {/* Label */}
                      <div className="absolute bottom-0 left-0 right-0 p-3">
                        <p className="font-semibold text-white text-sm line-clamp-1">{tag.name}</p>
                        {tag.albumCount > 0 && (
                          <p className="text-xs text-white/60 mt-0.5">{t("creators.albumCount", { count: tag.albumCount })}</p>
                        )}
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          )}

          {/* Stats footer */}
          {tags && tags.length > 0 && (
            <div className="mt-10 pt-6 border-t border-border/30 text-center text-sm text-muted-foreground">
              {t("tags.showing", { count: tags.length })}
              {minAlbums > 0 && <> {t("tags.withMinAlbums", { count: minAlbums })}</>}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
