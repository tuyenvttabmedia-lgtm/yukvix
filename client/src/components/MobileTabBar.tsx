import { Link, useLocation } from "wouter";
import { Home, Images, Search, Crown, User } from "lucide-react";
import { useAuth } from "@/_core/hooks/useAuth";
import { useCallback } from "react";

/**
 * Trigger haptic feedback using the best available API:
 * 1. navigator.vibrate (Android Chrome, Firefox)
 * 2. window.webkit.messageHandlers (WKWebView iOS wrapper)
 * Silently no-ops on unsupported browsers (iOS Safari standalone, desktop).
 */
function triggerHaptic(style: "light" | "medium" | "heavy" = "light") {
  try {
    // Vibration API — Android Chrome / Firefox
    if (typeof navigator !== "undefined" && navigator.vibrate) {
      const duration = style === "light" ? 8 : style === "medium" ? 15 : 25;
      navigator.vibrate(duration);
      return;
    }
    // iOS WKWebView bridge (if wrapped in a native shell)
    const webkit = (window as any).webkit;
    if (webkit?.messageHandlers?.haptic) {
      webkit.messageHandlers.haptic.postMessage(style);
    }
  } catch {
    // Ignore — haptic is purely cosmetic
  }
}

const tabs = [
  { label: "Home", href: "/", icon: Home },
  { label: "Gallery", href: "/gallery", icon: Images },
  { label: "Search", href: "/search", icon: Search },
  { label: "VIP", href: "/vip", icon: Crown },
  { label: "Account", href: "/account", icon: User },
];

export default function MobileTabBar() {
  const [location] = useLocation();
  const { isAuthenticated } = useAuth();

  // Replace Account with Login link if not authenticated
  const resolvedTabs = tabs.map((tab) => {
    if (tab.href === "/account" && !isAuthenticated) {
      return { ...tab, label: "Login", href: "/login" };
    }
    return tab;
  });

  const handleTabClick = useCallback((isActive: boolean) => {
    // Already on this tab — medium pulse; navigating — light tap
    triggerHaptic(isActive ? "medium" : "light");
  }, []);

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-50 md:hidden"
      style={{
        background: "oklch(0.09 0.008 260 / 0.97)",
        borderTop: "1px solid oklch(0.25 0.01 260 / 0.6)",
        backdropFilter: "blur(16px)",
        WebkitBackdropFilter: "blur(16px)",
        paddingBottom: "env(safe-area-inset-bottom, 0px)",
      }}
    >
      <div className="flex items-stretch h-14">
        {resolvedTabs.map((tab) => {
          const Icon = tab.icon;
          // Active if exact match for "/" or starts with path for others
          const isActive =
            tab.href === "/"
              ? location === "/"
              : location.startsWith(tab.href);
          const isVip = tab.href === "/vip";

          return (
            <Link key={tab.href} href={tab.href} className="flex-1" onClick={() => handleTabClick(isActive)}>
              <div
                className={`flex flex-col items-center justify-center h-full gap-0.5 transition-all duration-150 active:scale-95 ${
                  isActive
                    ? isVip
                      ? "text-primary"
                      : "text-primary"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <div className="relative">
                  <Icon
                    className={`transition-all duration-150 ${
                      isActive ? "w-5 h-5" : "w-5 h-5"
                    }`}
                    strokeWidth={isActive ? 2.5 : 1.8}
                    style={
                      isVip && isActive
                        ? { color: "oklch(0.72 0.18 50)" }
                        : isVip
                        ? { color: "oklch(0.72 0.18 50 / 0.6)" }
                        : undefined
                    }
                  />
                  {isActive && (
                    <span
                      className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-primary"
                      style={
                        isVip ? { background: "oklch(0.72 0.18 50)" } : undefined
                      }
                    />
                  )}
                </div>
                <span
                  className={`text-[10px] font-medium leading-none transition-all duration-150 ${
                    isActive ? "opacity-100" : "opacity-60"
                  }`}
                  style={
                    isVip && isActive
                      ? { color: "oklch(0.72 0.18 50)" }
                      : isVip
                      ? { color: "oklch(0.72 0.18 50 / 0.6)" }
                      : undefined
                  }
                >
                  {tab.label}
                </span>
              </div>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
