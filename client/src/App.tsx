import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import { lazy, Suspense, useEffect } from "react";
import { trpc } from "./lib/trpc";
import Navbar from "./components/Navbar";
import Footer from "./components/Footer";
import MobileTabBar from "./components/MobileTabBar";
import SeoTracking from "./components/SeoTracking";

// ─── Eagerly loaded (critical path — always needed on first render) ───────────
import Home from "./pages/Home";
import NotFound from "@/pages/NotFound";

// ─── Public pages (lazy — loaded on navigation) ───────────────────────────────
const Gallery = lazy(() => import("./pages/Gallery"));
const AlbumDetail = lazy(() => import("./pages/AlbumDetail"));
const Search = lazy(() => import("./pages/Search"));
const VipPage = lazy(() => import("./pages/VipPage"));
const Bookmarks = lazy(() => import("./pages/Bookmarks"));
const PaymentSuccess = lazy(() => import("./pages/PaymentSuccess"));
const PaymentCancel = lazy(() => import("./pages/PaymentCancel"));
const CryptoPaymentStatus = lazy(() => import("./pages/CryptoPaymentStatus"));
const TagPage = lazy(() => import("./pages/TagPage"));
const CreatorPage = lazy(() => import("./pages/CreatorPage"));
const CreatorsPage = lazy(() => import("./pages/CreatorsPage"));
const TagsPage = lazy(() => import("./pages/TagsPage"));
const AccountPage = lazy(() => import("./pages/AccountPage"));
const StaticPage = lazy(() => import("./pages/StaticPage"));
const AboutPage = lazy(() => import("./pages/AboutPage"));
const InfoPage = lazy(() => import("./pages/InfoPage"));
const ContactPage = lazy(() => import("./pages/ContactPage"));
const DmcaPage = lazy(() => import("./pages/DmcaPage"));

// ─── Auth pages (lazy — standalone, rarely visited) ──────────────────────────
const LoginPage = lazy(() => import("./pages/LoginPage"));
const RegisterPage = lazy(() => import("./pages/RegisterPage"));
const ForgotPasswordPage = lazy(() => import("./pages/ForgotPasswordPage"));
const ResetPasswordPage = lazy(() => import("./pages/ResetPasswordPage"));
const VerifyEmail = lazy(() => import("./pages/VerifyEmail"));

// ─── Admin pages (lazy — separate chunk, only admins visit) ──────────────────
const AdminOverview = lazy(() => import("./pages/admin/AdminOverview"));
const AdminAlbums = lazy(() => import("./pages/admin/AdminAlbums"));
const AdminUsers = lazy(() => import("./pages/admin/AdminUsers"));
const AdminSubscriptions = lazy(() => import("./pages/admin/AdminSubscriptions"));
const AdminAlbumEditor = lazy(() => import("./pages/admin/AdminAlbumEditor"));
const AdminUserDetail = lazy(() => import("./pages/admin/AdminUserDetail"));
const AdminAppearance = lazy(() => import("./pages/admin/cms/AdminAppearance"));
const AdminMenus = lazy(() => import("./pages/admin/cms/AdminMenus"));
const AdminCategories = lazy(() => import("./pages/admin/cms/AdminCategories"));
const AdminPages = lazy(() => import("./pages/admin/cms/AdminPages"));
const AdminPaymentSettings = lazy(() => import("./pages/admin/payments/AdminPaymentSettings"));
const AdminStorageSettings = lazy(() => import("./pages/admin/AdminStorageSettings"));
const AdminImport = lazy(() => import("./pages/admin/AdminImport"));
const AdminImportSources = lazy(() => import("./pages/admin/AdminImportSources"));
const AdminImportHistory = lazy(() => import("./pages/admin/AdminImportHistory"));
const AdminImportLogs = lazy(() => import("./pages/admin/AdminImportLogs"));
const AdminMediaLibrary = lazy(() => import("./pages/admin/AdminMediaLibrary"));
const AdminPlans = lazy(() => import("./pages/admin/payments/AdminPlans"));
const AdminPaymentHistory = lazy(() => import("./pages/admin/payments/AdminPaymentHistory"));
const AdminVipManagement = lazy(() => import("./pages/admin/payments/AdminVipManagement"));
const AdminWebhookMonitor = lazy(() => import("./pages/admin/payments/AdminWebhookMonitor"));
const AdminTags = lazy(() => import("./pages/admin/AdminTags"));
const AdminCreators = lazy(() => import("./pages/admin/AdminCreators"));
const AdminAnalytics = lazy(() => import("./pages/admin/AdminAnalytics"));
const AdminSmtp = lazy(() => import("./pages/admin/AdminSmtp"));
const AdminEmailLogs = lazy(() => import("./pages/admin/AdminEmailLogs"));
const AdminContactSubmissions = lazy(() => import("./pages/admin/AdminContactSubmissions"));
const AdminDmcaSubmissions = lazy(() => import("./pages/admin/AdminDmcaSubmissions"));
const AdminSeoSettings = lazy(() => import("./pages/admin/AdminSeoSettings"));
const AdminSeoBulk = lazy(() => import("./pages/admin/AdminSeoBulk"));
const AdminZipImport = lazy(() => import("./pages/admin/AdminZipImport"));
const AdminAlbumSeoReview = lazy(() => import("./pages/admin/AdminAlbumSeoReview"));
const AdminAiSettings = lazy(() => import("./pages/admin/AdminAiSettings"));
const AdminDesignPreview = lazy(() => import("./pages/admin/AdminDesignPreview"));

// ─── Page loading fallback ────────────────────────────────────────────────────
function PageLoader() {
  return (
    <div className="min-h-[50vh] flex items-center justify-center">
      <div className="flex flex-col items-center gap-3">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        <p className="text-sm text-muted-foreground">Đang tải...</p>
      </div>
    </div>
  );
}

function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Navbar />
      <main className="flex-1 pb-14 md:pb-0">{children}</main>
      <Footer />
      <MobileTabBar />
    </div>
  );
}

function Router() {
  return (
    <Suspense fallback={<PageLoader />}>
      <Switch>
        {/* Public pages with Navbar + Footer */}
        <Route path="/">
          {() => <PublicLayout><Home /></PublicLayout>}
        </Route>
        <Route path="/gallery">
          {() => <PublicLayout><Gallery /></PublicLayout>}
        </Route>
        <Route path="/album/:slug">
          {(params) => <PublicLayout><AlbumDetail params={params} /></PublicLayout>}
        </Route>
        <Route path="/search">
          {() => <PublicLayout><Search /></PublicLayout>}
        </Route>
        <Route path="/vip">
          {() => <PublicLayout><VipPage /></PublicLayout>}
        </Route>
        <Route path="/bookmarks">
          {() => <PublicLayout><Bookmarks /></PublicLayout>}
        </Route>
        <Route path="/tag/:slug">
          {(params) => <PublicLayout><TagPage params={params as { slug: string }} /></PublicLayout>}
        </Route>
        <Route path="/creator/:slug">
          {(params) => <PublicLayout><CreatorPage params={params as { slug: string }} /></PublicLayout>}
        </Route>
        <Route path="/creators">
          {() => <PublicLayout><CreatorsPage /></PublicLayout>}
        </Route>
        <Route path="/tags">
          {() => <PublicLayout><TagsPage /></PublicLayout>}
        </Route>
        <Route path="/account">
          {() => <PublicLayout><AccountPage /></PublicLayout>}
        </Route>
        <Route path="/payment/success">
          {() => <PublicLayout><PaymentSuccess /></PublicLayout>}
        </Route>
        <Route path="/payment/cancel">
          {() => <PublicLayout><PaymentCancel /></PublicLayout>}
        </Route>
        <Route path="/payment/crypto/:orderId">
          {() => <CryptoPaymentStatus />}
        </Route>

        {/* Auth pages — standalone, no Navbar/Footer wrapper */}
        <Route path="/login" component={LoginPage} />
        <Route path="/register" component={RegisterPage} />
        <Route path="/forgot-password" component={ForgotPasswordPage} />
        <Route path="/reset-password" component={ResetPasswordPage} />
        <Route path="/verify-email" component={VerifyEmail} />

        {/* Admin pages (no public footer) */}
        <Route path="/admin/_design-preview" component={AdminDesignPreview} />
                <Route path="/admin" component={AdminOverview} />
        <Route path="/admin/albums" component={AdminAlbums} />
        <Route path="/admin/users" component={AdminUsers} />
        <Route path="/admin/subscriptions" component={AdminSubscriptions} />
        <Route path="/admin/albums/:id">
          {(params) => <AdminAlbumEditor albumId={parseInt(params.id || "0", 10)} />}
        </Route>
        <Route path="/admin/users/:id" component={AdminUserDetail} />

        {/* CMS admin routes */}
        <Route path="/admin/cms/appearance" component={AdminAppearance} />
        <Route path="/admin/cms/menus" component={AdminMenus} />
        <Route path="/admin/cms/categories" component={AdminCategories} />
        <Route path="/admin/cms/pages" component={AdminPages} />

        {/* Payment admin routes */}
        <Route path="/admin/payments/settings" component={AdminPaymentSettings} />
        <Route path="/admin/payments/plans" component={AdminPlans} />
        <Route path="/admin/payments/history" component={AdminPaymentHistory} />
        <Route path="/admin/payments/vip" component={AdminVipManagement} />
        <Route path="/admin/payments/webhooks" component={AdminWebhookMonitor} />

        {/* Content admin routes */}
        <Route path="/admin/tags" component={AdminTags} />
        <Route path="/admin/creators" component={AdminCreators} />

        {/* Analytics admin route */}
        <Route path="/admin/analytics" component={AdminAnalytics} />

        {/* Infrastructure admin routes */}
        <Route path="/admin/storage" component={AdminStorageSettings} />
        <Route path="/admin/media" component={AdminMediaLibrary} />
        <Route path="/admin/smtp" component={AdminSmtp} />
        <Route path="/admin/email-logs" component={AdminEmailLogs} />
        <Route path="/admin/contact-submissions" component={AdminContactSubmissions} />
        <Route path="/admin/dmca-submissions" component={AdminDmcaSubmissions} />
        <Route path="/admin/seo" component={AdminSeoSettings} />
        <Route path="/admin/seo/bulk" component={AdminSeoBulk} />

        {/* ZIP Import (separate from legacy crawler) */}
        <Route path="/admin/zip-import" component={AdminZipImport} />
        <Route path="/admin/albums/:id/seo-review" component={AdminAlbumSeoReview} />

        {/* AI Settings */}
        <Route path="/admin/settings/ai" component={AdminAiSettings} />

        {/* Import pipeline admin routes */}
        <Route path="/admin/import" component={AdminImport} />
        <Route path="/admin/import/sources" component={AdminImportSources} />
        <Route path="/admin/import/history" component={AdminImportHistory} />
        <Route path="/admin/import/logs/:id">
          {() => <AdminImportLogs />}
        </Route>

        {/* Public static pages */}
        <Route path="/about" component={AboutPage} />
        <Route path="/info" component={InfoPage} />
        <Route path="/privacy">{() => <StaticPage slug="privacy" />}</Route>
        <Route path="/terms">{() => <StaticPage slug="terms" />}</Route>
        <Route path="/contact" component={ContactPage} />
        <Route path="/dmca" component={DmcaPage} />

        <Route path="/404" component={NotFound} />
        <Route component={NotFound} />
      </Switch>
    </Suspense>
  );
}

function DynamicFavicon() {
  const { data: settings } = trpc.cms.getPublicSettings.useQuery();
  useEffect(() => {
    const faviconUrl = settings?.["favicon_url"];
    if (!faviconUrl) return;
    const selectors = [
      'link[rel="icon"]',
      'link[rel="shortcut icon"]',
      'link[rel="apple-touch-icon"]',
    ];
    selectors.forEach((sel) => {
      const el = document.querySelector(sel) as HTMLLinkElement | null;
      if (el) {
        el.href = faviconUrl;
      } else {
        const link = document.createElement("link");
        link.rel = "icon";
        link.href = faviconUrl;
        document.head.appendChild(link);
      }
    });
  }, [settings]);
  return null;
}

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="dark">
        <TooltipProvider>
          <Toaster />
          <DynamicFavicon />
          <SeoTracking />
          <Router />
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
