import type { Request } from "express";
import { ENV } from "./env";

/** Canonical public origin for emails and absolute links. Never trust client Origin. */
export function getPublicSiteUrl(_req?: Request): string {
  const fromEnv = (ENV.siteUrl || process.env.VITE_APP_URL || "").trim().replace(/\/$/, "");
  if (fromEnv) return fromEnv;
  return "https://yukvix.com";
}
