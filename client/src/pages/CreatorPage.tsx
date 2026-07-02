import { trpc } from "@/lib/trpc";
import { Link } from "wouter";
import AlbumCard from "@/components/AlbumCard";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { User, Twitter, Instagram, ExternalLink, Images, SlidersHorizontal } from "lucide-react";
import SeoHead from "@/components/SeoHead";
import { useState } from "react";
import { useTranslation } from "react-i18next";

interface CreatorPageProps {
  params: { slug: string };
}

export default function CreatorPage({ params }: CreatorPageProps) {
  const { t } = useTranslation();
  const [sortBy, setSortBy] = useState<"newest" | "oldest" | "popular">("newest");
  const [vipFilter, setVipFilter] = useState<"all" | "vip" | "free">("all");

  const { data, isLoading, error } = trpc.creators.bySlug.useQuery({ slug: params.slug });

  if (error) {
    return (
      <div className="container py-20 text-center">
        <h1 className="text-2xl font-bold mb-4">{t("creators.notFound")}</h1>
        <Link href="/gallery">
          <Button variant="outline">{t("common.backToGallery")}</Button>
        </Link>
      </div>
    );
  }

  const creator = data?.creator;
  const socialLinks = (() => {
    try { return creator?.socialLinks ? JSON.parse(creator.socialLinks) : {}; }
    catch { return {}; }
  })();

  // Client-side sort + filter (albums already fetched)
  const filteredAlbums = (() => {
    if (!data?.albums) return [];
    let list = [...data.albums];
    // VIP filter
    if (vipFilter === "vip") list = list.filter((a: any) => a.isVip);
    else if (vipFilter === "free") list = list.filter((a: any) => !a.isVip);
    // Sort
    if (sortBy === "oldest") list.sort((a: any, b: any) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
    else if (sortBy === "popular") list.sort((a: any, b: any) => (b.viewCount ?? 0) - (a.viewCount ?? 0));
    else list.sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    return list;
  })();

  const vipCount = data?.albums?.filter((a: any) => a.isVip).length ?? 0;
  const freeCount = data?.albums?.filter((a: any) => !a.isVip).length ?? 0;

  return (
    <>
      {creator && (() => {
        const baseUrl = typeof window !== "undefined" ? window.location.origin : "";
        const creatorCanonical = (creator as any).canonicalUrl || `${baseUrl}/creator/${creator.slug}`;
        const creatorOgImage = (creator as any).ogImage || creator.bannerUrl || creator.avatarUrl || undefined;
        const creatorKeywords = [
          (creator as any).focusKeyword,
          (creator as any).seoKeywords,
          creator.name,
          "cosplay",
          "cosplayer",
        ].filter(Boolean).join(", ");
        const creatorNoIndex = (creator as any).robotsIndex === false;
        const creatorLang = (creator as any).seoLanguage || "en";
        return (
          <SeoHead
            title={creator.seoTitle || `${creator.name} — Yukvix`}
            description={creator.seoDescription || creator.bio || `Browse ${creator.name}'s cosplay gallery on Yukvix.`}
            ogImage={creatorOgImage}
            ogType="profile"
            canonical={creatorCanonical}
            keywords={creatorKeywords}
            noIndex={creatorNoIndex}
            lang={creatorLang}
          />
        );
      })()}

      <div>
        {/* Banner */}
        <div className="relative h-48 sm:h-64 bg-gradient-to-br from-primary/20 to-secondary/20 overflow-hidden">
          {creator?.bannerUrl && (
            <img src={creator.bannerUrl} alt="" className="w-full h-full object-cover" />
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-background/80 to-transparent" />
        </div>

        <div className="container">
          {/* Profile header */}
          <div className="relative -mt-16 mb-8 flex items-end gap-6 flex-wrap">
            {/* Avatar */}
            <div className="w-28 h-28 rounded-full border-4 border-background bg-muted overflow-hidden flex-shrink-0 shadow-xl">
              {creator?.avatarUrl ? (
                <img src={creator.avatarUrl} alt={creator.name} className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  <User className="w-12 h-12 text-muted-foreground" />
                </div>
              )}
            </div>

            {/* Name + info */}
            <div className="pb-2 flex-1 min-w-0">
              {isLoading ? (
                <div className="h-8 w-48 bg-muted animate-pulse rounded mb-2" />
              ) : creator ? (
                <>
                  <h1 className="text-2xl sm:text-3xl font-bold truncate" style={{ fontFamily: "'Playfair Display', serif" }}>
                    {creator.name}
                  </h1>
                  <div className="flex items-center gap-3 mt-1 flex-wrap">
                    <Badge variant="secondary" className="flex items-center gap-1">
                      <Images className="w-3 h-3" />
                      {t("creators.albumCount", { count: data?.totalAlbums ?? 0 })}
                    </Badge>
                    {vipCount > 0 && (
                      <Badge className="bg-amber-500/20 text-amber-400 border-amber-500/30 text-xs">
                        {vipCount} {t("common.vip")}
                      </Badge>
                    )}
                    {freeCount > 0 && (
                      <Badge variant="outline" className="text-xs">
                        {freeCount} {t("common.free")}
                      </Badge>
                    )}
                    {/* Social links */}
                    {socialLinks.twitter && (
                      <a href={`https://twitter.com/${socialLinks.twitter}`} target="_blank" rel="noopener noreferrer"
                        className="text-muted-foreground hover:text-foreground transition-colors">
                        <Twitter className="w-4 h-4" />
                      </a>
                    )}
                    {socialLinks.instagram && (
                      <a href={`https://instagram.com/${socialLinks.instagram}`} target="_blank" rel="noopener noreferrer"
                        className="text-muted-foreground hover:text-foreground transition-colors">
                        <Instagram className="w-4 h-4" />
                      </a>
                    )}
                    {socialLinks.website && (
                      <a href={socialLinks.website} target="_blank" rel="noopener noreferrer"
                        className="text-muted-foreground hover:text-foreground transition-colors">
                        <ExternalLink className="w-4 h-4" />
                      </a>
                    )}
                  </div>
                </>
              ) : null}
            </div>
          </div>

          {/* Bio */}
          {creator?.bio && (
            <p className="text-muted-foreground mb-8 w-full leading-relaxed whitespace-pre-line">{creator.bio}</p>
          )}

          {/* Albums header + filters */}
          <div className="flex items-center justify-between mb-6 gap-4 flex-wrap">
            <h2 className="text-xl font-semibold">{t("creators.albums")}</h2>
            <div className="flex items-center gap-2 flex-wrap">
              {/* VIP filter */}
              <div className="flex gap-1">
                {(["all", "free", "vip"] as const).map((f) => (
                  <Button
                    key={f}
                    variant={vipFilter === f ? "default" : "outline"}
                    size="sm"
                    onClick={() => setVipFilter(f)}
                    className={`text-xs ${vipFilter === f ? "bg-primary" : "border-border/50"}`}
                  >
                    {f === "all" ? t("common.all") : f === "vip" ? `⭐ ${t("common.vip")}` : t("common.free")}
                  </Button>
                ))}
              </div>

              {/* Sort */}
              <Select value={sortBy} onValueChange={(v) => setSortBy(v as typeof sortBy)}>
                <SelectTrigger className="w-40 bg-secondary/50 border-border/50 text-sm">
                  <SlidersHorizontal className="w-3.5 h-3.5 mr-2 text-muted-foreground" />
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="newest">{t("gallery.sort.newest")}</SelectItem>
                  <SelectItem value="popular">{t("gallery.sort.popular")}</SelectItem>
                  <SelectItem value="oldest">{t("gallery.sort.oldest")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {isLoading ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-4">
              {Array.from({ length: 12 }).map((_, i) => (
                <div key={i} className="aspect-[3/4] bg-muted animate-pulse rounded-lg" />
              ))}
            </div>
          ) : filteredAlbums.length === 0 ? (
            <div className="text-center py-20 text-muted-foreground">
              <Images className="w-12 h-12 mx-auto mb-4 opacity-30" />
              <p>
                {vipFilter !== "all"
                  ? t(vipFilter === "vip" ? "creators.noVipAlbums" : "creators.noFreeAlbums")
                  : t("creators.noAlbums")}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-4 pb-12">
              {filteredAlbums.map((album: any) => (
                <AlbumCard key={album.id} album={album} />
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
