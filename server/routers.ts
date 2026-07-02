import { systemRouter } from "./_core/systemRouter";
import { router } from "./_core/trpc";
import { accountRouter } from "./routers/account";
import { albumsRouter } from "./routers/albums";
import { analyticsRouter } from "./routers/analytics";
import { authRouter } from "./routers/auth";
import { cmsRouter } from "./routers/cms";
import { creatorsRouter } from "./routers/creators";
import { downloadsRouter } from "./routers/downloads";
import { importJobsRouter } from "./routers/import-jobs";
import { importSourcesRouter } from "./routers/import-sources";
import { mediaRouter } from "./routers/media";
import { paymentsRouter } from "./routers/payments";
import { photosRouter } from "./routers/photos";
import { subscriptionsRouter } from "./routers/subscriptions";
import { tagsRouter } from "./routers/tags";
import { usersRouter } from "./routers/users";
import { smtpRouter } from "./routers/smtp";
import { authEmailRouter } from "./routers/auth-email";
import { emailLogsRouter } from "./routers/email-logs";
import { seoRouter } from "./routers/seo";
import { zipImportRouter } from "./routers/zip-import";

export const appRouter = router({
  system: systemRouter,

  /**
   * auth namespace — self-hostable, no Manus platform required.
   *
   * Procedures:
   *   auth.register   — create account with email + password
   *   auth.login      — sign in with email + password
   *   auth.me         — get current user (null if unauthenticated)
   *   auth.logout     — clear session cookie
   *   auth.updateProfile  — update name / avatarUrl
   *   auth.changePassword — change password (local accounts only)
   *
   * Session: HttpOnly cookie containing a signed JWT (HS256).
   * The JWT_SECRET env var is the only external dependency.
   *
   * Manus OAuth still works in parallel via /api/oauth/callback
   * so the project continues to function on the Manus platform.
   */
  auth: authRouter,

  albums: albumsRouter,
  photos: photosRouter,
  subscriptions: subscriptionsRouter,
  users: usersRouter,
  analytics: analyticsRouter,
  cms: cmsRouter,
  payments: paymentsRouter,
  account: accountRouter,
  media: mediaRouter,
  importSources: importSourcesRouter,
  importJobs: importJobsRouter,
  creators: creatorsRouter,
  downloads: downloadsRouter,
  tags: tagsRouter,
  smtp: smtpRouter,
  authEmail: authEmailRouter,
  emailLogs: emailLogsRouter,
  seo: seoRouter,
  zipImport: zipImportRouter,
});

export type AppRouter = typeof appRouter;
