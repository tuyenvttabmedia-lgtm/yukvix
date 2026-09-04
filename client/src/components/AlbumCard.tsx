import { Bookmark, BookmarkCheck, Crown, Eye, ImageIcon, Lock } from "lucide-react";
import { useState } from "react";
import { Link } from "wouter";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { toast } from "sonner";

interface AlbumCardProps {
  album: {
    id: number;
    title: string;
    slug: string;
    coverUrl?: string | null;
    photoCount: number;
    viewCount: number;
    isVip: boolean;
    cosplayer?: string | null;
    character?: string | null;
    series?: string | null;
    creatorName?: string | null;
    creatorSlug?: string | null;
  };
  isBookmarked?: boolean;
  onBookmarkChange?: (albumId: number, bookmarked: boolean) => void;
  className?: string;
}

export default function AlbumCard({ album, isBookmarked: initialBookmarked = false, onBookmarkChange, className }: AlbumCardProps) {
  const { isAuthenticated } = useAuth();
  const [bookmarked, setBookmarked] = useState(initialBookmarked);
  const [imageLoaded, setImageLoaded] = useState(false);

  const toggleBookmark = trpc.users.toggleBookmark.useMutation({
    onSuccess: (data) => {
      setBookmarked(data.bookmarked);
      onBookmarkChange?.(album.id, data.bookmarked);
      toast.success(data.bookmarked ? "Added to bookmarks" : "Removed from bookmarks");
    },
    onError: () => toast.error("Failed to update bookmark"),
  });

  const handleBookmark = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!isAuthenticated) {
      toast.error("Please sign in to bookmark albums");
      return;
    }
    toggleBookmark.mutate({ albumId: album.id });
  };

  return (
    <Link href={`/album/${album.slug}`} className={`block group ${className || ""}`}>
      <div className="relative overflow-hidden rounded-xl bg-card border border-border/50 transition-all duration-300 hover:border-primary/30 hover:shadow-lg hover:shadow-primary/5">
        {/* Cover Image */}
        <div className="relative aspect-[3/4] overflow-hidden bg-muted">
          {!imageLoaded && (
            <div className="absolute inset-0 skeleton" />
          )}
          {album.coverUrl ? (
            <img
              src={album.coverUrl}
              alt={album.title}
              className={`w-full h-full object-cover transition-all duration-500 group-hover:scale-105 ${imageLoaded ? "opacity-100" : "opacity-0"}`}
              loading="lazy"
              onLoad={() => setImageLoaded(true)}
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <ImageIcon className="w-12 h-12 text-muted-foreground/30" />
            </div>
          )}

          {/* Gradient overlay */}
          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />

          {/* VIP Lock overlay */}
          {album.isVip && (
            <div className="absolute top-2 left-2">
              <span className="vip-badge flex items-center gap-1">
                <Crown className="w-2.5 h-2.5" />
                VIP
              </span>
            </div>
          )}

          {/* Bookmark button */}
          <button
            onClick={handleBookmark}
            className="absolute top-2 right-2 w-8 h-8 rounded-full bg-black/50 backdrop-blur-sm flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all duration-200 hover:bg-primary/80 hover:scale-110"
          >
            {bookmarked ? (
              <BookmarkCheck className="w-4 h-4 text-primary" />
            ) : (
              <Bookmark className="w-4 h-4 text-white" />
            )}
          </button>

          {/* Photo count */}
          <div className="absolute bottom-2 right-2 flex items-center gap-1 bg-black/60 backdrop-blur-sm rounded-full px-2 py-0.5 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
            <ImageIcon className="w-3 h-3 text-white/80" />
            <span className="text-xs text-white/80">{album.photoCount}</span>
          </div>

          {/* VIP lock icon for locked albums */}
          {album.isVip && (
            <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-300">
              <div className="w-12 h-12 rounded-full bg-primary/20 backdrop-blur-sm border border-primary/30 flex items-center justify-center">
                <Lock className="w-5 h-5 text-primary" />
              </div>
            </div>
          )}
        </div>

        {/* Info */}
        <div className="p-3">
          <h3 className="text-sm font-semibold text-foreground line-clamp-1 group-hover:text-primary transition-colors">
            {album.title}
          </h3>
          {((album.cosplayer || album.creatorName) || album.character) && (
            <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">
              {(album.cosplayer || album.creatorName) && (
                <span>{album.cosplayer || album.creatorName}</span>
              )}
              {(album.cosplayer || album.creatorName) && album.character && (
                <span className="mx-1">·</span>
              )}
              {album.character && <span>{album.character}</span>}
            </p>
          )}
          {album.creatorName && album.creatorSlug && (
            <p className="text-xs text-primary/70 mt-0.5 line-clamp-1 hover:text-primary transition-colors">
              <span onClick={(e) => { e.preventDefault(); window.location.href = `/creator/${album.creatorSlug}`; }}>
                by {album.creatorName}
              </span>
            </p>
          )}
          <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <ImageIcon className="w-3 h-3" />
              {album.photoCount} photos
            </span>
            <span className="flex items-center gap-1">
              <Eye className="w-3 h-3" />
              {album.viewCount.toLocaleString()}
            </span>
          </div>
        </div>
      </div>
    </Link>
  );
}
