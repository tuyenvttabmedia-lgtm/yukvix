/**
 * PhotoSwipeViewer — Premium image viewer with 3-tier loading strategy:
 *
 * Tier 1: thumb (400px)   → album grid
 * Tier 2: medium (1200px) → lightbox default
 * Tier 3: original (4K)   → on-demand when VIP user zooms > 2x
 *
 * Features:
 * - Desktop: scroll wheel zoom, drag pan, double-click zoom 100%, ESC close, ← → nav
 * - Mobile: pinch zoom, swipe nav, double-tap zoom, swipe-down close
 * - Guest: zoom capped at 2x, no original load
 * - VIP: unlimited zoom, lazy loads original at > 2x with smooth fade-in transition
 *
 * Original upgrade flow:
 *   1. User zooms > 2x → spinner overlay appears
 *   2. Original image preloaded in background (hidden <img>)
 *   3. When loaded: PhotoSwipe slide src swapped + CSS fade-in plays (opacity 0→1, 350ms)
 *   4. Spinner disappears, medium image seamlessly replaced by original
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

interface PhotoSwipeViewerProps {
  items: PhotoSwipeItem[];
  initialIndex: number;
  isVip: boolean;
  albumTitle?: string;
  onClose: () => void;
  onDownload?: (index: number) => void;
}

// ---------------------------------------------------------------------------
// Loading overlay — rendered via portal above PhotoSwipe (z-index 100001)
// ---------------------------------------------------------------------------
function OriginalLoadingOverlay({ visible }: { visible: boolean }) {
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
      </div>
    </div>,
    document.body
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------
export default function PhotoSwipeViewer({
  items,
  initialIndex,
  isVip,
  albumTitle,
  onClose,
}: PhotoSwipeViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const originalLoadedRef = useRef<Set<number>>(new Set());
  const originalLoadingRef = useRef<Set<number>>(new Set());
  const [loadingOriginal, setLoadingOriginal] = useState(false);

  const getDataSource = useCallback(() => {
    return items.map((item) => {
      // For ZIP import photos: prefer webpUrl (4K) over mediumUrl (1200px)
      // displayUrl is signed URL for VIP content, use it when available
      const src = item.displayUrl || item.webpUrl || item.mediumUrl || item.originalUrl || "";
      const w = item.width || 0;
      const h = item.height || 0;
      // When width/height are unknown (ZIP import), use 0 to let PhotoSwipe
      // auto-detect from the loaded image. Fall back to 4:3 portrait ratio.
      const displayW = w > 0 ? Math.min(w, 3840) : 1200;
      const displayH = h > 0 ? Math.round(displayW / (w / h)) : 1600;
      return {
        src,
        width: displayW,
        height: displayH,
        alt: item.altText || albumTitle || "",
        _originalSrc: item.originalUrl || item.webpUrl || "",
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

    // -----------------------------------------------------------------------
    // Lazy-load original with smooth fade-in when zoom > 2x (VIP only)
    // -----------------------------------------------------------------------
    lightbox.on("zoomPanUpdate", () => {
      if (!isVip) return;
      const pswp = lightbox.pswp;
      if (!pswp) return;

      const currentZoom = pswp.currSlide?.currZoomLevel ?? 1;
      const slideIndex = pswp.currIndex;
      const item = items[slideIndex];
      if (!item?.originalUrl) return;

      if (
        currentZoom > 2 &&
        !originalLoadedRef.current.has(item.id) &&
        !originalLoadingRef.current.has(item.id)
      ) {
        originalLoadingRef.current.add(item.id);
        setLoadingOriginal(true);

        // Step 1: preload original in background
        const img = new Image();

        img.onload = () => {
          originalLoadedRef.current.add(item.id);
          originalLoadingRef.current.delete(item.id);
          setLoadingOriginal(false);

          // Step 2: only upgrade if user is still on the same slide
          if (!pswp.currSlide || pswp.currIndex !== slideIndex) return;

          const originalW = item.width || 4000;
          const originalH = item.height || 2667;

          // Step 3: find the <img> element PhotoSwipe is currently rendering
          const imgEl = pswp.currSlide.container?.querySelector(
            ".pswp__img:not(.pswp__img--placeholder)"
          ) as HTMLImageElement | null;

          if (imgEl) {
            // Step 4: start transparent, swap src, then fade in
            imgEl.style.transition = "none";
            imgEl.style.opacity = "0";

            // Allow one frame for opacity:0 to apply before changing src
            requestAnimationFrame(() => {
              imgEl.src = item.originalUrl!;
              imgEl.onload = () => {
                // Step 5: fade in over 350ms with ease-out
                imgEl.style.transition = "opacity 0.35s cubic-bezier(0.23, 1, 0.32, 1)";
                imgEl.style.opacity = "1";
                // Clean up inline styles after transition
                imgEl.addEventListener(
                  "transitionend",
                  () => {
                    imgEl.style.transition = "";
                    imgEl.style.opacity = "";
                  },
                  { once: true }
                );
              };
            });
          }

          // Step 6: update PhotoSwipe internal data for correct pan/zoom bounds
          pswp.currSlide.data.src = item.originalUrl!;
          pswp.currSlide.data.width = originalW;
          pswp.currSlide.data.height = originalH;
          pswp.currSlide.updateContentSize(true);
        };

        img.onerror = () => {
          originalLoadingRef.current.delete(item.id);
          setLoadingOriginal(false);
          console.warn(`[PhotoSwipe] Failed to load original for item ${item.id}`);
        };

        img.src = item.originalUrl;
      }
    });

    // Auto-detect image dimensions when width/height are unknown (ZIP import)
    // This fires after PhotoSwipe loads the image and can read naturalWidth/naturalHeight
    lightbox.on("contentLoad", (e) => {
      const slide = e.slide;
      if (!slide) return;
      const item = items[slide.index];
      if (!item) return;
      // Only auto-detect if dimensions are unknown (NULL from ZIP import)
      if (!item.width || !item.height) {
        const img = slide.container?.querySelector(".pswp__img") as HTMLImageElement | null;
        if (img) {
          const onLoad = () => {
            if (img.naturalWidth > 0 && img.naturalHeight > 0) {
              slide.data.width = img.naturalWidth;
              slide.data.height = img.naturalHeight;
              slide.updateContentSize(true);
            }
          };
          if (img.complete && img.naturalWidth > 0) {
            onLoad();
          } else {
            img.addEventListener("load", onLoad, { once: true });
          }
        }
      }
    });

    // Hide spinner when navigating to a different slide
    lightbox.on("change", () => {
      setLoadingOriginal(false);
    });

    lightbox.on("close", () => {
      setLoadingOriginal(false);
      onClose();
    });

    lightbox.init();
    lightbox.loadAndOpen(initialIndex);

    return () => {
      lightbox.destroy();
      setLoadingOriginal(false);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <>
      <div ref={containerRef} />
      <OriginalLoadingOverlay visible={loadingOriginal} />
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
        /* GPU-accelerated — no layout/paint cost */
        will-change: opacity;
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
