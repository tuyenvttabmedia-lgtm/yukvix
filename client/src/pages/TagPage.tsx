import { trpc } from "@/lib/trpc";
import { useState } from "react";
import { Link, useLocation } from "wouter";
import AlbumCard from "@/components/AlbumCard";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Tag, ChevronLeft, ChevronRight } from "lucide-react";
import { useTranslation } from "react-i18next";
import SeoHead from "@/components/SeoHead";

interface TagPageProps {
  params: { slug: string };
}

export default function TagPage({ params }: TagPageProps) {
  const { t } = useTranslation();
  const [page, setPage] = useState(1);
  const [sortBy, setSortBy] = useState<"newest" | "oldest" | "popular">("newest");
  const LIMIT = 24;

  const { data, isLoading, error } = trpc.tags.bySlug.useQuery({
    slug: params.slug,
    page,
    limit: LIMIT,
    sortBy,
  });

  const totalPages = data ? Math.ceil(data.total / LIMIT) : 0;

  if (error) {
    return (
      <div className="container py-20 text-center">
        <h1 className="text-2xl font-bold mb-4">{t("tags.notFound")}</h1>
        <Link href="/gallery">
          <Button variant="outline">{t("common.backToGallery")}</Button>
        </Link>
      </div>
    );
  }

  const tag = data?.tag;
  const tagDisplayName = tag ? tag.name.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()) : params.slug;
  const pageTitle = tag?.seoTitle || `${tagDisplayName} Cosplay Gallery & Photos | Yukvix`;
  const pageDesc = tag?.seoDescription || `Browse ${tagDisplayName} cosplay galleries, creator collections, photo sets, and premium content on Yukvix.`;
  const canonicalSlug = tag?.slug || params.slug;
  const origin = typeof window !== "undefined" ? window.location.origin : "https://yukvix.com";

  return (
    <>
      <SeoHead
        title={pageTitle}
        description={pageDesc}
        canonical={`${origin}/tag/${canonicalSlug}`}
        keywords={`${tagDisplayName} cosplay, ${tagDisplayName} cosplay photos, ${tagDisplayName} gallery, yukvix`}
      />

      <div className="container py-8">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-2 text-muted-foreground text-sm mb-3">
            <Link href="/gallery" className="hover:text-foreground transition-colors">{t("nav.gallery")}</Link>
            <span>/</span>
            <span>{t("nav.tags")}</span>
          </div>

          {isLoading ? (
            <div className="h-10 w-48 bg-muted animate-pulse rounded" />
          ) : tag ? (
            <div className="flex items-center gap-3 flex-wrap">
              <div className="flex items-center gap-2">
                <Tag className="w-6 h-6 text-primary" />
                <h1 className="text-3xl font-bold">#{tag.name}</h1>
              </div>
              <Badge variant="secondary" className="text-base px-3 py-1">
                {t("creators.albumCount", { count: data?.total ?? 0 })}
              </Badge>
            </div>
          ) : null}

          {tag?.seoDescription && (
            <p className="mt-3 text-muted-foreground max-w-2xl">{tag.seoDescription}</p>
          )}
        </div>

        {/* Sort + Controls */}
        <div className="flex items-center justify-between mb-6 gap-4 flex-wrap">
          <p className="text-sm text-muted-foreground">
            {data ? t("tags.showingRange", { from: (page - 1) * LIMIT + 1, to: Math.min(page * LIMIT, data.total), total: data.total }) : t("common.loading")}
          </p>
          <Select value={sortBy} onValueChange={(v) => { setSortBy(v as typeof sortBy); setPage(1); }}>
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="newest">{t("gallery.sort.newest")}</SelectItem>
              <SelectItem value="popular">{t("gallery.sort.popular")}</SelectItem>
              <SelectItem value="oldest">{t("gallery.sort.oldest")}</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Album Grid */}
        {isLoading ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-4">
            {Array.from({ length: 12 }).map((_, i) => (
              <div key={i} className="aspect-[3/4] bg-muted animate-pulse rounded-lg" />
            ))}
          </div>
        ) : data?.albums.length === 0 ? (
          <div className="text-center py-20 text-muted-foreground">
            <Tag className="w-12 h-12 mx-auto mb-4 opacity-30" />
            <p className="text-lg">{t("tags.noAlbumsForTag")}</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-4">
            {data?.albums.map((album) => (
              <AlbumCard key={album.id} album={album} />
            ))}
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-center gap-2 mt-10">
            <Button variant="outline" size="sm" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}>
              <ChevronLeft className="w-4 h-4" />
            </Button>
            {Array.from({ length: Math.min(7, totalPages) }, (_, i) => {
              let pageNum: number;
              if (totalPages <= 7) pageNum = i + 1;
              else if (page <= 4) pageNum = i + 1;
              else if (page >= totalPages - 3) pageNum = totalPages - 6 + i;
              else pageNum = page - 3 + i;
              return (
                <Button
                  key={pageNum}
                  variant={page === pageNum ? "default" : "outline"}
                  size="sm"
                  onClick={() => setPage(pageNum)}
                  className="w-9"
                >
                  {pageNum}
                </Button>
              );
            })}
            <Button variant="outline" size="sm" onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}>
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        )}
      </div>
    </>
  );
}
