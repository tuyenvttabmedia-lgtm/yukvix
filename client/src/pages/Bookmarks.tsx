import { useAuth } from "@/_core/hooks/useAuth";

import { trpc } from "@/lib/trpc";
import AlbumCard from "@/components/AlbumCard";
import { Bookmark, Crown, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";
import { useTranslation } from "react-i18next";

export default function Bookmarks() {
  const { t } = useTranslation();
  const { user, isAuthenticated } = useAuth();

  const { data: bookmarks, isLoading, refetch } = trpc.users.myBookmarks.useQuery(undefined, {
    enabled: isAuthenticated,
  });

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <Lock className="w-12 h-12 text-muted-foreground/30 mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-foreground mb-2">{t("bookmarks.signInTitle")}</h2>
          <p className="text-muted-foreground mb-6">{t("bookmarks.signInDesc")}</p>
          <Button
            className="bg-primary text-primary-foreground hover:bg-primary/90"
            onClick={() => (window.location.href = "/login")}
          >
            {t("auth.signIn")}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen py-8">
      <div className="container">
        <div className="flex items-center gap-3 mb-8">
          <Bookmark className="w-6 h-6 text-primary" />
          <h1
            className="text-2xl md:text-3xl font-bold text-foreground"
            style={{ fontFamily: "'Playfair Display', serif" }}
          >
            {t("bookmarks.title")}
          </h1>
        </div>

        {isLoading ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
            {Array.from({ length: 10 }).map((_, i) => (
              <div key={i} className="rounded-xl overflow-hidden">
                <div className="aspect-[3/4] skeleton rounded-xl" />
              </div>
            ))}
          </div>
        ) : bookmarks && bookmarks.length > 0 ? (
          <>
            <p className="text-sm text-muted-foreground mb-6">{t("bookmarks.savedCount", { count: bookmarks.length })}</p>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
              {bookmarks.map((b) =>
                b.album ? (
                  <AlbumCard
                    key={b.albumId}
                    album={b.album}
                    isBookmarked={true}
                    onBookmarkChange={() => refetch()}
                  />
                ) : null
              )}
            </div>
          </>
        ) : (
          <div className="text-center py-24">
            <Bookmark className="w-12 h-12 text-muted-foreground/30 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-foreground mb-2">{t("bookmarks.empty")}</h3>
            <p className="text-muted-foreground mb-6">
              {t("bookmarks.emptyDesc")}
            </p>
            <Link href="/gallery">
              <Button className="bg-primary text-primary-foreground hover:bg-primary/90">
                {t("bookmarks.exploreGallery")}
              </Button>
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
