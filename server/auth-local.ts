/**
 * Self-hostable authentication service.
 * Replaces Manus OAuth with email/password + JWT — no external platform required.
 *
 * Design:
 * - Passwords are hashed with bcryptjs (pure JS, no native bindings)
 * - Sessions are signed JWTs stored in HttpOnly cookies (same mechanism as Manus SDK)
 * - openId field is repurposed as a stable internal UUID for local users (prefix: "local_")
 * - Manus OAuth flow is preserved in parallel so the project still works on Manus platform
 */
import bcrypt from "bcryptjs";
import { SignJWT, jwtVerify } from "jose";
import { nanoid } from "nanoid";
import { COOKIE_NAME, SESSION_MAX_AGE_MS } from "../shared/const";
import * as db from "./db";
import { getSessionCookieOptions } from "./_core/cookies";
import type { Request, Response } from "express";

const BCRYPT_ROUNDS = 12;
const LOCAL_USER_PREFIX = "local_";

// --- JWT helpers (self-contained, uses JWT_SECRET env var) --------------------

function getJwtSecret(): Uint8Array {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error("JWT_SECRET environment variable is required");
  return new TextEncoder().encode(secret);
}

export async function signLocalSession(payload: {
  openId: string;
  email: string;
  name: string;
}): Promise<string> {
  const secretKey = getJwtSecret();
  const expiresAt = Math.floor((Date.now() + SESSION_MAX_AGE_MS) / 1000);
  return new SignJWT({
    openId: payload.openId,
    email: payload.email,
    name: payload.name,
    // appId is set to "local" so verifySession in sdk.ts still passes the shape check
    appId: "local",
  })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setIssuedAt()
    .setExpirationTime(expiresAt)
    .sign(secretKey);
}

export async function verifyLocalSession(
  token: string
): Promise<{ openId: string; email: string; name: string } | null> {
  try {
    const secretKey = getJwtSecret();
    const { payload } = await jwtVerify(token, secretKey, {
      algorithms: ["HS256"],
    });
    const { openId, email, name } = payload as Record<string, unknown>;
    if (
      typeof openId !== "string" ||
      typeof email !== "string" ||
      typeof name !== "string"
    ) {
      return null;
    }
    return { openId, email, name };
  } catch {
    return null;
  }
}

// --- Password helpers ---------------------------------------------------------

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_ROUNDS);
}

export async function verifyPassword(
  password: string,
  hash: string
): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

// --- Registration -------------------------------------------------------------

export type RegisterInput = {
  email: string;
  password: string;
  name: string;
};

export type AuthResult =
  | { success: true; token: string; user: Awaited<ReturnType<typeof db.getUserByOpenId>> }
  | { success: false; error: string };

export async function registerLocal(input: RegisterInput): Promise<AuthResult> {
  const { email, password, name } = input;

  // Validate inputs
  if (!email || !email.includes("@")) {
    return { success: false, error: "Invalid email address" };
  }
  if (!password || password.length < 8) {
    return { success: false, error: "Password must be at least 8 characters" };
  }
  if (!name || name.trim().length < 2) {
    return { success: false, error: "Name must be at least 2 characters" };
  }

  // Check if email already exists
  const existing = await db.getUserByEmail(email.toLowerCase().trim());
  if (existing) {
    return { success: false, error: "Email already registered" };
  }

  // Create user
  const openId = `${LOCAL_USER_PREFIX}${nanoid(16)}`;
  const passwordHash = await hashPassword(password);

  await db.upsertUser({
    openId,
    email: email.toLowerCase().trim(),
    name: name.trim(),
    passwordHash,
    loginMethod: "local",
    lastSignedIn: new Date(),
  });

  const user = await db.getUserByOpenId(openId);
  if (!user) {
    return { success: false, error: "Failed to create user" };
  }

  const token = await signLocalSession({
    openId: user.openId,
    email: user.email ?? "",
    name: user.name ?? "",
  });

  return { success: true, token, user };
}

// --- Login --------------------------------------------------------------------

export type LoginInput = {
  email: string;
  password: string;
};

export async function loginLocal(input: LoginInput): Promise<AuthResult> {
  const { email, password } = input;

  if (!email || !password) {
    return { success: false, error: "Email and password are required" };
  }

  const user = await db.getUserByEmail(email.toLowerCase().trim());
  if (!user) {
    // Timing-safe: still run bcrypt to avoid user enumeration
    await bcrypt.compare(password, "$2b$12$invalidhashfortimingnormalization");
    return { success: false, error: "Invalid email or password" };
  }

  if (!user.passwordHash) {
    return {
      success: false,
      error: "This account uses a different login method. Try signing in with OAuth.",
    };
  }

  const valid = await verifyPassword(password, user.passwordHash);
  if (!valid) {
    return { success: false, error: "Invalid email or password" };
  }

  if (user.status === "banned") {
    return { success: false, error: "This account has been suspended." };
  }

  // Update lastSignedIn
  await db.upsertUser({ openId: user.openId, lastSignedIn: new Date() });

  const token = await signLocalSession({
    openId: user.openId,
    email: user.email ?? "",
    name: user.name ?? "",
  });

  return { success: true, token, user };
}

// --- Cookie helpers -----------------------------------------------------------

export function setAuthCookie(res: Response, req: Request, token: string): void {
  const cookieOptions = getSessionCookieOptions(req);
  res.cookie(COOKIE_NAME, token, { ...cookieOptions, maxAge: SESSION_MAX_AGE_MS });
}

export function clearAuthCookie(res: Response, req: Request): void {
  const cookieOptions = getSessionCookieOptions(req);
  res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
}
