/**
 * PhotoSwipeViewer — Premium image viewer with 3-tier loading strategy:
 *
 * Tier 1: thumb (400px)   → album grid (fast first paint)
 * Tier 2: medium          → lightbox first paint
 * Tier 3: original (4K)   → auto-upgrade after medium paints, for anyone who can view the photo
 *
 * Features:
 * - Desktop: scroll wheel zoom, drag pan, double-click zoom 100%, ESC close, ← → nav
 * - Mobile: pinch zoom, swipe nav, double-tap zoom, swipe-down close
 * - Guest: zoom capped at 2x; still receives 4K after first paint
 * - VIP: unlimited zoom; overlay only if they zoom before 4K is ready
 */
import PhotoSwipeLightbox from "photoswipe/lightbox";
import "photoswipe/style.css";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

export interface PhotoSwipeItem {
  id: number;
  thumbUrl?: string;
  mediumUrl?: string;
  webpUrl?: string;
  originalUrl?: string;
  displayUrl?: string;
  width?: number;
  height?: number;
  altText?: string;
}

export type SignedPhotoUrls = {
  displayUrl?: string | null;
  originalUrl?: string | null;
  width?: number | null;
  height?: number | null;
};

interface PhotoSwipeViewerProps {
  items: PhotoSwipeItem[];
  initialIndex: number;
  isVip: boolean;
  albumTitle?: string;
  onClose: () => void;
  onDownload?: (index: number) => void;
  resolveUrls?: (photoId: number) => Promise<SignedPhotoUrls | null>;
}

// ---------------------------------------------------------------------------
// Loading overlay — rendered via portal above PhotoSwipe (z-index 100001)
// ---------------------------------------------------------------------------
function OriginalLoadingOverlay({ visible, isVip }: { visible: boolean; isVip?: boolean }) {
  if (!visible) return null;
  return createPortal(
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 100001,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        pointerEvents: "none",
        animation: "pswp-overlay-fade-in 0.2s ease",
      }}
    >
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: "12px",
          background: "rgba(10,10,10,0.75)",
          backdropFilter: "blur(12px)",
          WebkitBackdropFilter: "blur(12px)",
          borderRadius: "16px",
          padding: "20px 28px",
          border: "1px solid rgba(255,255,255,0.08)",
          boxShadow: "0 8px 32px rgba(0,0,0,0.5)",
        }}
      >
        {/* Spinner ring */}
        <div
          style={{
            width: "40px",
            height: "40px",
            borderRadius: "50%",
            border: "3px solid rgba(255,165,0,0.2)",
            borderTopColor: "rgba(255,165,0,0.9)",
            animation: "pswp-spin 0.7s linear infinite",
          }}
        />
        <span
          style={{
            fontSize: "13px",
            fontFamily: "'Inter', sans-serif",
            color: "rgba(255,255,255,0.75)",
            letterSpacing: "0.02em",
            whiteSpace: "nowrap",
          }}
        >
          Đang tải ảnh chất lượng cao…
        </span>
        {isVip ? (
          <span
            style={{
              fontSize: "11px",
              fontFamily: "'Inter', sans-serif",
              color: "rgba(255,165,0,0.85)",
              background: "rgba(255,165,0,0.1)",
              border: "1px solid rgba(255,165,0,0.25)",
              borderRadius: "20px",
              padding: "2px 10px",
              letterSpacing: "0.05em",
              textTransform: "uppercase",
            }}
          >
            VIP · Original 4K
          </span>
        ) : null}
      </div>
    </div>,
    document.body
  );
}

type PswpSlide = {
  width?: number;
  height?: number;
  data?: { src?: string; width?: number; height?: number };
  content?: { element?: HTMLElement; width?: number; height?: number; slide?: PswpSlide };
  updateContentSize?: (force?: boolean) => void;
};

function photoImg(content?: { element?: HTMLElement } | null): HTMLImageElement | null {
  const el = content?.element;
  if (el instanceof HTMLImageElement) return el;
  const nested = el?.querySelector?.("img.pswp__img:not(.pswp__img--placeholder), img");
  return nested instanceof HTMLImageElement ? nested : null;
}

function slideFromEvent(e: {
  slide?: PswpSlide;
  content?: { element?: HTMLElement; slide?: PswpSlide };
}): PswpSlide | null {
  return e.slide || e.content?.slide || null;
}

function applyNaturalPhotoSize(slide?: PswpSlide | null, pswp?: { updateSize?: (force?: boolean) => void } | null) {
  const img = photoImg(slide?.content);
  if (!img || img.naturalWidth < 2 || img.naturalHeight < 2) return;
  const nw = img.naturalWidth;
  const nh = img.naturalHeight;
  const content = slide?.content;
  if (content) {
    content.width = nw;
    content.height = nh;
  }
  if (slide) {
    slide.width = nw;
    slide.height = nh;
    if (slide.data) {
      slide.data.width = nw;
      slide.data.height = nh;
    }
    slide.updateContentSize?.(true);
  }
  pswp?.updateSize?.(true);
}

export default function PhotoSwipeViewer({
  items,
  initialIndex,
  isVip,
  albumTitle,
  onClose,
  resolveUrls,
}: PhotoSwipeViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const originalLoadedRef = useRef<Set<number>>(new Set());
  const originalLoadingRef = useRef<Set<number>>(new Set());
  const urlCacheRef = useRef<Map<number, SignedPhotoUrls>>(new Map());
  const [loadingOriginal, setLoadingOriginal] = useState(false);

  const getDataSource = useCallback(() => {
    return items.map((item) => {
      const cached = urlCacheRef.current.get(item.id);
      const src = cached?.displayUrl || item.displayUrl || item.mediumUrl || "";
      const w = Number(cached?.width || item.width) || 0;
      const h = Number(cached?.height || item.height) || 0;
      if (item.displayUrl || item.originalUrl) {
        urlCacheRef.current.set(item.id, {
          displayUrl: item.displayUrl,
          originalUrl: item.originalUrl,
          width: item.width,
          height: item.height,
        });
      }
      return {
        src,
        msrc: item.thumbUrl || undefined,
        width: w > 1 && h > 1 ? w : 1600,
        height: w > 1 && h > 1 ? h : 1600,
        alt: item.altText || albumTitle || "",
        _originalSrc: cached?.originalUrl || item.originalUrl || item.webpUrl || "",
        _id: item.id,
      };
    });
  }, [items, albumTitle]);

  useEffect(() => {
    const dataSource = getDataSource();

    const lightbox = new PhotoSwipeLightbox({
      dataSource,
      pswpModule: () => import("photoswipe"),
      index: initialIndex,
      maxZoomLevel: isVip ? 4 : 2,
      initialZoomLevel: "fit",
      secondaryZoomLevel: isVip ? 2 : 1.5,
      pinchToClose: true,
      closeOnVerticalDrag: true,
      bgOpacity: 0.95,
      padding: { top: 20, bottom: 40, left: 0, right: 0 },
      preload: [1, 1],
    });

    const applyDisplayToIndex = (index: number, urls: SignedPhotoUrls) => {
      const src = urls.displayUrl;
      if (!src) return;
      const slideData = dataSource[index] as {
        src?: string;
        width?: number;
        height?: number;
        _originalSrc?: string;
      };
      if (slideData) {
        slideData.src = src;
        if (urls.width) slideData.width = Number(urls.width);
        if (urls.height) slideData.height = Number(urls.height);
        if (urls.originalUrl) slideData._originalSrc = urls.originalUrl;
      }
      const pswp = lightbox.pswp;
      if (!pswp || pswp.currIndex !== index) return;
      const imgEl = pswp.currSlide?.container?.querySelector(
        ".pswp__img:not(.pswp__img--placeholder)"
      ) as HTMLImageElement | null;
      const itemId = items[index]?.id;
      if (imgEl && imgEl.src !== src && !(itemId && originalLoadedRef.current.has(itemId))) {
        imgEl.src = src;
      }
      if (pswp.currSlide?.data && !(itemId && originalLoadedRef.current.has(itemId))) {
        pswp.currSlide.data.src = src;
        if (urls.width) pswp.currSlide.data.width = Number(urls.width);
        if (urls.height) pswp.currSlide.data.height = Number(urls.height);
      }
    };

    const upgradeToOriginal = (
      slideIndex: number,
      originalUrl: string,
      item: PhotoSwipeItem,
      opts?: { silent?: boolean }
    ) => {
      if (originalLoadedRef.current.has(item.id) || originalLoadingRef.current.has(item.id)) return;
      originalLoadingRef.current.add(item.id);
      if (!opts?.silent) setLoadingOriginal(true);
      const img = new Image();
      const applyHq = () => {
        const pswp = lightbox.pswp;
        if (!pswp?.currSlide || pswp.currIndex !== slideIndex) return false;
        const originalW = img.naturalWidth || item.width || 4000;
        const originalH = img.naturalHeight || item.height || 2667;
        const imgEl = pswp.currSlide.container?.querySelector(
          ".pswp__img:not(.pswp__img--placeholder)"
        ) as HTMLImageElement | null;
        if (imgEl && imgEl.src !== originalUrl) imgEl.src = originalUrl;
        pswp.currSlide.data.src = originalUrl;
        pswp.currSlide.data.width = originalW;
        pswp.currSlide.data.height = originalH;
        (pswp.currSlide as PswpSlide).width = originalW;
        (pswp.currSlide as PswpSlide).height = originalH;
        pswp.currSlide.updateContentSize(true);
        pswp.updateSize(true);
        return true;
      };
      img.onload = () => {
        originalLoadedRef.current.add(item.id);
        originalLoadingRef.current.delete(item.id);
        setLoadingOriginal(false);
        if (!applyHq()) requestAnimationFrame(() => applyHq());
      };
      img.onerror = () => {
        originalLoadingRef.current.delete(item.id);
        setLoadingOriginal(false);
      };
      img.src = originalUrl;
    };

    const kickHq = (index: number, urls?: SignedPhotoUrls | null) => {
      const item = items[index];
      if (!item) return;
      const hq = urls?.originalUrl || urlCacheRef.current.get(item.id)?.originalUrl || item.originalUrl;
      if (hq) upgradeToOriginal(index, hq, item, { silent: true });
    };

    const ensureIndex = async (index: number) => {
      const item = items[index];
      if (!item) return;
      const cached = urlCacheRef.current.get(item.id);
      if (cached?.displayUrl) {
        applyDisplayToIndex(index, cached);
        kickHq(index, cached);
        return cached;
      }
      if (item.displayUrl) {
        const seeded = {
          displayUrl: item.displayUrl,
          originalUrl: item.originalUrl,
          width: item.width,
          height: item.height,
        };
        urlCacheRef.current.set(item.id, seeded);
        applyDisplayToIndex(index, seeded);
        kickHq(index, seeded);
        return seeded;
      }
      if (!resolveUrls) return null;
      const urls = await resolveUrls(item.id);
      if (!urls?.displayUrl) return null;
      urlCacheRef.current.set(item.id, urls);
      applyDisplayToIndex(index, urls);
      kickHq(index, urls);
      return urls;
    };

    lightbox.on("zoomPanUpdate", () => {
      const pswp = lightbox.pswp;
      if (!pswp) return;
      const item = items[pswp.currIndex];
      if (!item) return;
      const zoom = pswp.currSlide?.currZoomLevel ?? 1;
      if (zoom > 1.5 && originalLoadingRef.current.has(item.id) && !originalLoadedRef.current.has(item.id)) {
        setLoadingOriginal(true);
      }
    });

    const syncSlideSize = (slide?: PswpSlide | null) => {
      applyNaturalPhotoSize(slide, lightbox.pswp);
    };

    lightbox.on("contentLoad", (e) => {
      const img = photoImg(e.content);
      const slide = slideFromEvent(e) || lightbox.pswp?.currSlide;
      if (!img) return;
      const run = () => syncSlideSize(slide);
      if (img.complete && img.naturalWidth > 1) run();
      else img.addEventListener("load", run, { once: true });
    });
    lightbox.on("loadComplete", (e) => {
      syncSlideSize(slideFromEvent(e) || lightbox.pswp?.currSlide);
      const i = lightbox.pswp?.currIndex ?? initialIndex;
      kickHq(i);
    });
    lightbox.on("change", () => {
      setLoadingOriginal(false);
      syncSlideSize(lightbox.pswp?.currSlide);
      const i = lightbox.pswp?.currIndex ?? 0;
      void ensureIndex(i);
      void ensureIndex(i + 1);
      void ensureIndex(i - 1);
    });
    lightbox.on("openingAnimationEnd", () => {
      syncSlideSize(lightbox.pswp?.currSlide);
      const i = lightbox.pswp?.currIndex ?? initialIndex;
      void ensureIndex(i);
      void ensureIndex(i + 1);
      void ensureIndex(i - 1);
    });

    lightbox.on("close", () => {
      setLoadingOriginal(false);
      onClose();
    });

    lightbox.init();
    lightbox.loadAndOpen(initialIndex);
    kickHq(initialIndex);

    return () => {
      lightbox.destroy();
      setLoadingOriginal(false);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <>
      <div ref={containerRef} />
      <OriginalLoadingOverlay visible={loadingOriginal} isVip={isVip} />
    </>
  );
}

// ---------------------------------------------------------------------------
// Global CSS overrides — injected once per page
// ---------------------------------------------------------------------------
export function PhotoSwipeStyles() {
  return (
    <style>{`
      .pswp {
        --pswp-bg: #0a0a0a;
        --pswp-placeholder-bg: #1a1a1a;
        --pswp-root-z-index: 100000;
        --pswp-preloader-color: rgba(255, 165, 0, 0.8);
        --pswp-preloader-color-secondary: rgba(255, 165, 0, 0.2);
        --pswp-icon-color: #fff;
        --pswp-icon-color-secondary: rgba(255,255,255,0.6);
        --pswp-icon-stroke-color: #0a0a0a;
        --pswp-icon-stroke-width: 1.2px;
        --pswp-error-text-color: #f87171;
      }

      .pswp__button--close,
      .pswp__button--arrow--prev,
      .pswp__button--arrow--next {
        width: 44px;
        height: 44px;
        background: rgba(255,255,255,0.12) !important;
        border-radius: 50%;
        backdrop-filter: blur(8px);
        transition: background 0.15s ease;
      }
      .pswp__button--close:hover,
      .pswp__button--arrow--prev:hover,
      .pswp__button--arrow--next:hover {
        background: rgba(255,255,255,0.22) !important;
      }

      .pswp__counter {
        font-family: 'Inter', sans-serif;
        font-size: 13px;
        color: rgba(255,255,255,0.7);
        padding: 8px 12px;
        background: rgba(0,0,0,0.4);
        border-radius: 20px;
        backdrop-filter: blur(8px);
      }

      .pswp__top-bar {
        background: linear-gradient(to bottom, rgba(0,0,0,0.5), transparent);
        padding-top: 8px;
      }

      .pswp__img {
        border-radius: 4px;
        object-fit: contain !important;
        object-position: center center;
        will-change: opacity;
      }
      .pswp__img--placeholder {
        object-fit: contain !important;
      }

      /* Spinner keyframe */
      @keyframes pswp-spin {
        to { transform: rotate(360deg); }
      }

      /* Overlay entrance */
      @keyframes pswp-overlay-fade-in {
        from { opacity: 0; transform: translateY(6px); }
        to   { opacity: 1; transform: translateY(0); }
      }
    `}</style>
  );
}
