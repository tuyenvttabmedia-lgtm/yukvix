import { useAuth } from "@/_core/hooks/useAuth";
import AlbumCard from "@/components/AlbumCard";
import { trpc } from "@/lib/trpc";
import SeoHead, { buildImageGallerySchema, buildBreadcrumbSchema } from "@/components/SeoHead";
import { Bookmark, BookmarkCheck, Crown, Download, Eye, ImageIcon, Lock, Loader2, Mail, Share2, Tag, X } from "lucide-react";
import PhotoSwipeViewer, { PhotoSwipeStyles, type PhotoSwipeItem } from "@/components/PhotoSwipeViewer";
import { useEffect, useRef, useState } from "react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";

interface AlbumDetailProps {
  params: { slug: string };
}

const PAGE_LIMIT = 24;

export default function AlbumDetail({ params }: AlbumDetailProps) {
  const { t } = useTranslation();
  const { user, isAuthenticated } = useAuth();
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [bookmarked, setBookmarked] = useState(false);

  // Paginated photo state — accumulated across pages
  const [allPhotos, setAllPhotos] = useState<any[]>([]);
  const [cursor, setCursor] = useState<number | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const albumIdRef = useRef<number | null>(null);

  const isVip = user?.role === "vip" || user?.role === "admin" || user?.role === "super_admin";
  const [zipLoading, setZipLoading] = useState(false);
  const [showEmailVerifyDialog, setShowEmailVerifyDialog] = useState(false);
  const utils = trpc.useUtils();

  // --- Album metadata (no photos) ----------------------------------------------
  const { data, isLoading, error } = trpc.albums.bySlug.useQuery(
    { slug: params.slug },
    { enabled: !!params.slug }
  );

  const sendVerification = trpc.authEmail.sendVerification.useMutation({
    onSuccess: () => {
      toast.success(t("album.verificationSent"), { duration: 5000 });
    },
    onError: (err) => toast.error(err.message),
  });

  const getZipUrl = trpc.downloads.getZipUrl.useMutation({
    onSuccess: (res) => {
      window.open(res.zipUrl, "_blank");
      toast.success(t("album.zipStarted"));
      setZipLoading(false);
    },
    onError: (e) => {
      setZipLoading(false);
      try {
        const parsed = JSON.parse(e.message);
        if (parsed?.type === "EMAIL_NOT_VERIFIED") {
          setShowEmailVerifyDialog(true);
          return;
        }
      } catch { /* not JSON */ }
      toast.error(e.message);
    },
  });

  const { data: relatedAlbums } = trpc.albums.related.useQuery(
    { albumId: data?.album?.id ?? 0, limit: 6 },
    { enabled: !!data?.album?.id }
  );

  // --- Paginated photo loader ---------------------------------------------------
  const photosQuery = trpc.photos.byAlbumPaginated.useQuery(
    {
      albumId: data?.album?.id ?? 0,
      cursor,
      limit: PAGE_LIMIT,
    },
    {
      // Note: do NOT add !loadingMore here — it would disable the query
      // right when we need it (after setLoadingMore(true) fires), causing a freeze.
      enabled: !!data?.album?.id && hasMore,
    }
  );

  // Accumulate photos as pages load
  useEffect(() => {
    if (!photosQuery.data) return;
    const albumId = data?.album?.id;
    if (!albumId) return;

    // Reset on album change
    if (albumIdRef.current !== albumId) {
      albumIdRef.current = albumId;
      setAllPhotos([]);
      setCursor(null);
      setHasMore(true);
    }

    const newItems = photosQuery.data.items as any[];
    if (newItems.length > 0) {
      setAllPhotos((prev) => {
        // Deduplicate by id
        const existingIds = new Set(prev.map((p: any) => p.id));
        const fresh = newItems.filter((p: any) => !existingIds.has(p.id));
        return fresh.length > 0 ? [...prev, ...fresh] : prev;
      });
    }

    const nextCursor = photosQuery.data.nextCursor;
    if (nextCursor === null || nextCursor === undefined) {
      setHasMore(false);
    }
    setLoadingMore(false);
  }, [photosQuery.data, data?.album?.id]);

  // --- Bookmark sync ------------------------------------------------------------
  useEffect(() => {
    if (data) setBookmarked(data.bookmarked);
  }, [data]);

  // --- Reset on slug change -----------------------------------------------------
  useEffect(() => {
    setAllPhotos([]);
    setCursor(null);
    setHasMore(true);
    setLoadingMore(false);
    albumIdRef.current = null;
    setLightboxIndex(null);
  }, [params.slug]);

  // --- IntersectionObserver sentinel -------------------------------------------
  useEffect(() => {
    if (!hasMore || loadingMore || !data?.album?.id) return;
    const sentinel = sentinelRef.current;
    if (!sentinel) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          // Advance cursor to load next page
          const lastPhoto = allPhotos[allPhotos.length - 1];
          if (lastPhoto) {
            setLoadingMore(true);
            setCursor(lastPhoto.sortOrder ?? allPhotos.length - 1);
          }
        }
      },
      { rootMargin: "300px" }
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasMore, loadingMore, allPhotos, data?.album?.id]);

  // --- Lightbox helpers ---------------------------------------------------------
  const openLightbox = (index: number) => {
    if (allPhotos[index]) setLightboxIndex(index);
  };
  const closeLightbox = () => setLightboxIndex(null);

  // Map allPhotos to PhotoSwipeItem format
  const photoSwipeItems: PhotoSwipeItem[] = allPhotos.map((p) => ({
    id: p.id,
    thumbUrl: p.thumbUrl,
    mediumUrl: p.mediumUrl || p.displayUrl || p.webpUrl,
    webpUrl: p.webpUrl,
    originalUrl: p.originalUrl,
    displayUrl: p.displayUrl,
    width: p.width,
    height: p.height,
    altText: p.altText,
  }));

  const toggleBookmark = trpc.users.toggleBookmark.useMutation({
    onSuccess: (result) => {
      setBookmarked(result.bookmarked);
      toast.success(result.bookmarked ? t("album.bookmarkAdded") : t("album.bookmarkRemoved"));
    },
  });

  const handleShare = () => {
    navigator.clipboard.writeText(window.location.href);
    toast.success(t("album.linkCopied"));
  };

  // --- Loading state ------------------------------------------------------------
  if (isLoading) {
    return (
      <div className="min-h-screen py-8">
        <div className="container">
          <div className="h-8 skeleton rounded w-48 mb-4" />
          <div className="h-64 skeleton rounded-xl mb-6" />
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
            {Array.from({ length: 12 }).map((_, i) => (
              <div key={i} className="aspect-square skeleton rounded-lg" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <p className="text-muted-foreground mb-4">{t("album.notFound")}</p>
          <Link href="/gallery">
            <Button variant="outline">{t("common.backToGallery")}</Button>
          </Link>
        </div>
      </div>
    );
  }

  const { album, tags, lockedCount, isVipLocked, totalPhotos, creatorName, creatorSlug } = data;

  const baseUrl = typeof window !== "undefined" ? window.location.origin : "";
  const canonicalUrl = (album as any).canonicalUrl || `${baseUrl}/album/${album.slug}`;
  const coverImage = (album as any).ogImage || album.coverUrl || allPhotos[0]?.thumbUrl || allPhotos[0]?.originalUrl || "";
  const metaTitle = album.seoTitle || album.title;
  const metaDesc =
    album.seoDescription ||
    `${album.title}${album.cosplayer ? ` by ${album.cosplayer}` : ""}${album.character ? ` — ${album.character}` : ""}${album.series ? ` from ${album.series}` : ""}. ${totalPhotos} photos on Yukvix.`;
  const keywords = [
    (album as any).focusKeyword,
    album.seoKeywords,
    album.title,
    album.cosplayer,
    album.character,
    album.series,
    "cosplay",
    "cosplay photos",
    ...tags.map((t: any) => t.name),
  ]
    .filter(Boolean)
    .join(", ");
  const robotsNoIndex = (album as any).robotsIndex === false;
  const seoLang = (album as any).seoLanguage || "en";

  const galleryJsonLd = buildImageGallerySchema({
    name: album.title,
    description: metaDesc,
    url: canonicalUrl,
    author: album.cosplayer || undefined,
    datePublished: album.createdAt ? new Date(album.createdAt).toISOString() : undefined,
    dateModified: album.updatedAt ? new Date(album.updatedAt).toISOString() : undefined,
    images: allPhotos.slice(0, 10).map((p: any) => ({
      url: p.webpUrl || p.originalUrl || p.thumbUrl || "",
      caption: p.altText || `${album.title} cosplay photo`,
      width: p.width || undefined,
      height: p.height || undefined,
    })),
  });

  const breadcrumbJsonLd = buildBreadcrumbSchema([
    { name: "Home", url: baseUrl + "/" },
    { name: "Gallery", url: baseUrl + "/gallery" },
    { name: album.title, url: canonicalUrl },
  ]);

  return (
    <div className="min-h-screen py-8">
      {/* Email Verification Required Dialog */}
      {showEmailVerifyDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={() => setShowEmailVerifyDialog(false)}>
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
          <div
            className="relative bg-card border border-border rounded-2xl p-6 max-w-sm w-full shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => setShowEmailVerifyDialog(false)}
              className="absolute top-4 right-4 text-muted-foreground hover:text-foreground transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
            <div className="flex flex-col items-center text-center gap-4">
              <div className="w-14 h-14 rounded-full bg-amber-500/10 border border-amber-500/20 flex items-center justify-center">
                <Mail className="w-7 h-7 text-amber-400" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-foreground mb-1">{t("album.verifyEmailTitle")}</h3>
                <p className="text-sm text-muted-foreground">
                  {t("album.verifyEmailDesc")}
                </p>
              </div>
              <div className="flex flex-col gap-2 w-full">
                <Button
                  className="w-full"
                  onClick={() => {
                    sendVerification.mutate({ origin: window.location.origin });
                    setShowEmailVerifyDialog(false);
                  }}
                  disabled={sendVerification.isPending}
                >
                  {sendVerification.isPending ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <Mail className="w-4 h-4 mr-2" />
                  )}
                  {t("album.sendVerification")}
                </Button>
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={() => { window.location.href = "/account"; }}
                >
                  {t("album.goToAccount")}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      <SeoHead
        title={metaTitle}
        description={metaDesc}
        keywords={keywords}
        canonical={canonicalUrl}
        ogImage={coverImage || undefined}
        ogType="article"
        jsonLd={[galleryJsonLd, breadcrumbJsonLd]}
        noIndex={robotsNoIndex}
        lang={seoLang}
      />
      <div className="container">
        {/* Breadcrumb */}
        <div className="flex items-center gap-2 text-sm text-muted-foreground mb-6">
          <Link href="/gallery" className="hover:text-foreground transition-colors">
            {t("nav.gallery")}
          </Link>
          <span>/</span>
          <span className="text-foreground">{album.title}</span>
        </div>

        {/* Album Header */}
        <div className="flex flex-col md:flex-row md:items-start justify-between gap-6 mb-8">
          <div className="flex-1">
            <div className="flex items-center gap-3 mb-2">
              {album.isVip && (
                <span className="vip-badge flex items-center gap-1">
                  <Crown className="w-2.5 h-2.5" />
                  VIP
                </span>
              )}
              {album.series && (
                <span className="text-xs text-muted-foreground bg-secondary px-2 py-0.5 rounded-full">
                  {album.series}
                </span>
              )}
            </div>
            <h1
              className="text-2xl md:text-4xl font-bold text-foreground mb-2"
              style={{ fontFamily: "'Playfair Display', serif" }}
            >
              {album.title}
            </h1>
            {(album.cosplayer || album.character || creatorName) && (
              <p className="text-muted-foreground flex flex-wrap items-center gap-x-2 gap-y-1">
                {creatorName && creatorSlug && (
                  <a
                    href={`/creator/${creatorSlug}`}
                    className="inline-flex items-center gap-1 text-primary hover:underline font-medium"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
                    {creatorName}
                  </a>
                )}
                {creatorName && (album.cosplayer || album.character) && <span className="text-border">·</span>}
                {album.cosplayer && (
                  <span>
                    by <strong className="text-foreground">{album.cosplayer}</strong>
                  </span>
                )}
                {album.cosplayer && album.character && <span className="mx-1">·</span>}
                {album.character && (
                  <span>
                    as <strong className="text-foreground">{album.character}</strong>
                  </span>
                )}
              </p>
            )}
            {album.description && (
              <p className="text-sm text-muted-foreground mt-3 max-w-2xl leading-relaxed">
                {album.description}
              </p>
            )}
            <div className="flex items-center gap-4 mt-4 text-sm text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <ImageIcon className="w-4 h-4" />
                {t("album.photoCount", { count: totalPhotos })}
                {isVipLocked && (
                  <span className="text-primary">({t("album.freePreview", { count: data.previewCount ?? allPhotos.length })})</span>
                )}
              </span>
              <span className="flex items-center gap-1.5">
                <Eye className="w-4 h-4" />
                {t("album.viewCount", { count: album.viewCount.toLocaleString() })}
              </span>
            </div>
            {tags.length > 0 && (
              <div className="flex flex-wrap gap-2 mt-4">
                {tags.map((tag: any) => (
                  <Link
                    key={tag.id}
                    href={`/tag/${encodeURIComponent(tag.slug || tag.name)}`}
                    className="flex items-center gap-1 text-xs bg-primary/10 border border-primary/20 text-primary px-2.5 py-1 rounded-full hover:bg-primary/20 hover:border-primary/50 transition-all"
                  >
                    <Tag className="w-3 h-3" />
                    {tag.name}
                  </Link>
                ))}
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2 shrink-0 flex-wrap">
            <Button
              variant="outline"
              size="sm"
              onClick={handleShare}
              className="border-border hover:border-primary/50"
            >
              <Share2 className="w-4 h-4 mr-2" />
              {t("album.share")}
            </Button>
            {isAuthenticated && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => toggleBookmark.mutate({ albumId: album.id })}
                className={`border-border ${bookmarked ? "text-primary border-primary/50" : "hover:border-primary/50"}`}
              >
                {bookmarked ? (
                  <BookmarkCheck className="w-4 h-4 mr-2 text-primary" />
                ) : (
                  <Bookmark className="w-4 h-4 mr-2" />
                )}
                {bookmarked ? t("album.saved") : t("album.save")}
              </Button>
            )}
            {/* ZIP Download — VIP only */}
            {isVip ? (
              <Button
                size="sm"
                onClick={() => {
                  // Always go through server first to check email verification,
                  // log the download, then open the URL returned by server.
                  setZipLoading(true);
                  getZipUrl.mutate({ albumId: album.id });
                }}
                disabled={zipLoading}
                className="bg-primary hover:bg-primary/90"
                title={album.zipKey || album.zipUrl ? `ZIP ready${album.zipSize ? ` (${(album.zipSize / 1024 / 1024).toFixed(1)} MB)` : ''}` : 'ZIP will be generated on first download'}
              >
                {zipLoading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Download className="w-4 h-4 mr-2" />}
                {zipLoading ? t("album.preparingZip") : (album.zipKey || album.zipUrl) ? `${t("album.downloadZip")}${album.zipSize ? ` (${(album.zipSize / 1024 / 1024).toFixed(1)}MB)` : ''}` : t("album.downloadZip")}
              </Button>
            ) : album.isVip ? (
              <Button size="sm" variant="outline" onClick={() => window.location.href = "/vip"} className="border-primary/50 text-primary hover:bg-primary/10">
                <Crown className="w-4 h-4 mr-2" />
                {t("album.vipToDownload")}
              </Button>
            ) : null}
          </div>
        </div>

        {/* Photo Grid — incremental, loads 24 at a time via IntersectionObserver */}
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2 md:gap-3">
          {allPhotos.map((photo, index) => (
            <button
              key={photo.id}
              onClick={() => openLightbox(index)}
              className="relative group aspect-square overflow-hidden rounded-lg bg-muted hover:ring-2 hover:ring-primary/50 transition-all"
            >
              {/* Grid: use thumbUrl (400px) for fast grid loading */}
              <img
                src={photo.thumbUrl || photo.displayUrl || ""}
                alt={photo.altText || `${album.title} — photo ${index + 1}`}
                className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                loading={index < 8 ? "eager" : "lazy"}
                decoding="async"
              />
              <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors" />
            </button>
          ))}

          {/* Sentinel: triggers next page load when scrolled into view */}
          {hasMore && (
            <div ref={sentinelRef} className="col-span-full h-8" aria-hidden />
          )}

          {/* Loading indicator */}
          {loadingMore && (
            <div className="col-span-full flex justify-center py-4">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <div className="w-4 h-4 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
                {t("album.loadingMore")}
              </div>
            </div>
          )}

          {/* Locked photo placeholders for VIP albums — show blurred preview */}
          {isVipLocked &&
            Array.from({ length: Math.min(lockedCount, 20) }).map((_, i) => {
              // Use a photo from the gallery as background (cycle through available photos)
              const previewPhoto = allPhotos[i % Math.max(allPhotos.length, 1)];
              const previewUrl = previewPhoto?.displayUrl || previewPhoto?.thumbUrl || "";
              return (
                <div
                  key={`locked-${i}`}
                  className="relative aspect-square overflow-hidden rounded-lg bg-muted border border-border/50 group cursor-pointer hover:ring-2 hover:ring-primary/50 transition-all"
                >
                  {/* Blurred background image — visible but blurred to tease content */}
                  {previewUrl && (
                    <img
                      src={previewUrl}
                      alt="Locked preview"
                      className="w-full h-full object-cover blur-md scale-110"
                      loading="lazy"
                      decoding="async"
                    />
                  )}
                  {/* Subtle dark overlay — light enough to see the blurred photo */}
                  <div className="absolute inset-0 bg-black/30 group-hover:bg-black/20 transition-colors" />
                  {/* Lock icon + text overlay */}
                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-2">
                    <div className="w-10 h-10 rounded-full bg-black/50 backdrop-blur-sm flex items-center justify-center">
                      <Lock className="w-5 h-5 text-primary" />
                    </div>
                    <span className="text-xs font-semibold text-white drop-shadow-lg bg-black/40 px-2 py-0.5 rounded-full">VIP Only</span>
                  </div>
                </div>
              );
            })}
        </div>

        {/* VIP Upsell */}
        {isVipLocked && (
          <div
            className="mt-8 rounded-2xl p-8 text-center"
            style={{
              background: "linear-gradient(135deg, oklch(0.14 0.015 50 / 0.5), oklch(0.12 0.008 260))",
              border: "1px solid oklch(0.72 0.18 50 / 0.3)",
            }}
          >
            <Crown className="w-10 h-10 text-primary mx-auto mb-4" />
            <h3
              className="text-xl font-bold text-foreground mb-2"
              style={{ fontFamily: "'Playfair Display', serif" }}
            >
              {t("album.unlockPhotos", { count: lockedCount })}
            </h3>
            <p className="text-muted-foreground mb-6 max-w-md mx-auto">
              {t("album.vipUpsellDesc", { total: totalPhotos })}
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
              <Link href="/vip">
                <Button size="lg" className="bg-primary text-primary-foreground hover:bg-primary/90 gap-2">
                  <Crown className="w-4 h-4" />
                  {t("vip.upgradeBtn")}
                </Button>
              </Link>
              {!isAuthenticated && (
                <Button
                  variant="outline"
                  size="lg"
                  onClick={() => (window.location.href = "/login")}
                  className="border-border hover:border-primary/50"
                >
                  {t("auth.signIn")}
                </Button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Related Albums */}
      {relatedAlbums && relatedAlbums.length >= 2 && (
        <div className="mt-16 container">
          <h2
            className="text-2xl font-bold text-foreground mb-6"
            style={{ fontFamily: "'Playfair Display', serif" }}
          >
            {t("album.relatedAlbums")}
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
            {relatedAlbums.map((album) => (
              <AlbumCard key={album.id} album={album} />
            ))}
          </div>
        </div>
      )}

      {/* PhotoSwipe Styles */}
      <PhotoSwipeStyles />

      {/* PhotoSwipe Lightbox — Premium 3-tier viewer */}
      {lightboxIndex !== null && photoSwipeItems.length > 0 && (
        <PhotoSwipeViewer
          items={photoSwipeItems}
          initialIndex={lightboxIndex}
          isVip={isVip}
          albumTitle={album.title}
          onClose={closeLightbox}
        />
      )}
    </div>
  );
}
