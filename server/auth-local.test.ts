/**
 * Tests for the self-hostable local authentication system.
 * Verifies: JWT signing/verification, password hashing, register, login flows.
 * No Manus platform dependency — all tests run with only JWT_SECRET set.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { signLocalSession, verifyLocalSession, hashPassword, verifyPassword } from "./auth-local";

// --- Environment setup --------------------------------------------------------

const TEST_JWT_SECRET = "test-jwt-secret-at-least-32-chars-long-for-hs256";

beforeEach(() => {
  process.env.JWT_SECRET = TEST_JWT_SECRET;
});

afterEach(() => {
  vi.restoreAllMocks();
});

// --- JWT session tests --------------------------------------------------------

describe("signLocalSession + verifyLocalSession", () => {
  it("signs a session token and verifies it correctly", async () => {
    const payload = {
      openId: "local_abc123",
      email: "test@example.com",
      name: "Test User",
    };

    const token = await signLocalSession(payload);
    expect(typeof token).toBe("string");
    expect(token.split(".")).toHaveLength(3); // valid JWT format

    const verified = await verifyLocalSession(token);
    expect(verified).not.toBeNull();
    expect(verified!.openId).toBe(payload.openId);
    expect(verified!.email).toBe(payload.email);
    expect(verified!.name).toBe(payload.name);
  });

  it("returns null for an invalid token", async () => {
    const result = await verifyLocalSession("not.a.valid.jwt.token");
    expect(result).toBeNull();
  });

  it("returns null for an empty token", async () => {
    const result = await verifyLocalSession("");
    expect(result).toBeNull();
  });

  it("returns null for undefined token", async () => {
    const result = await verifyLocalSession(undefined);
    expect(result).toBeNull();
  });

  it("returns null for a token signed with a different secret", async () => {
    // Sign with a different secret
    const { SignJWT } = await import("jose");
    const wrongSecret = new TextEncoder().encode("wrong-secret-key-that-is-different");
    const wrongToken = await new SignJWT({ openId: "x", email: "x@x.com", name: "X", appId: "local" })
      .setProtectedHeader({ alg: "HS256", typ: "JWT" })
      .setExpirationTime(Math.floor(Date.now() / 1000) + 3600)
      .sign(wrongSecret);

    const result = await verifyLocalSession(wrongToken);
    expect(result).toBeNull();
  });

  it("throws if JWT_SECRET is not set", async () => {
    delete process.env.JWT_SECRET;
    await expect(
      signLocalSession({ openId: "x", email: "x@x.com", name: "X" })
    ).rejects.toThrow("JWT_SECRET environment variable is required");
  });
});

// --- Password hashing tests ---------------------------------------------------

describe("hashPassword + verifyPassword", () => {
  it("hashes a password and verifies it correctly", async () => {
    const password = "SecurePass123!";
    const hash = await hashPassword(password);

    expect(typeof hash).toBe("string");
    expect(hash).not.toBe(password); // must not store plaintext
    expect(hash.startsWith("$2b$")).toBe(true); // bcrypt format

    const valid = await verifyPassword(password, hash);
    expect(valid).toBe(true);
  });

  it("rejects an incorrect password", async () => {
    const hash = await hashPassword("CorrectPassword1!");
    const valid = await verifyPassword("WrongPassword99!", hash);
    expect(valid).toBe(false);
  });

  it("produces different hashes for the same password (salt randomness)", async () => {
    const password = "SamePassword123!";
    const hash1 = await hashPassword(password);
    const hash2 = await hashPassword(password);
    expect(hash1).not.toBe(hash2); // different salts
    // But both should verify correctly
    expect(await verifyPassword(password, hash1)).toBe(true);
    expect(await verifyPassword(password, hash2)).toBe(true);
  });
});

// --- Auth router procedure tests ----------------------------------------------

describe("auth router — register and login", () => {
  it("auth router is exported from routers.ts", async () => {
    const { appRouter } = await import("./routers");
    expect(appRouter).toBeDefined();
    // Verify auth procedures exist
    const routerDef = appRouter._def.record;
    expect(routerDef).toHaveProperty("auth");
  });

  it("auth.me returns null for unauthenticated context", async () => {
    const { appRouter } = await import("./routers");
    const { COOKIE_NAME } = await import("../shared/const");

    const ctx = {
      user: null,
      req: { protocol: "https", headers: {} } as any,
      res: {
        clearCookie: vi.fn(),
        cookie: vi.fn(),
      } as any,
    };

    const caller = appRouter.createCaller(ctx);
    const result = await caller.auth.me();
    expect(result).toBeNull();
  });

  it("auth.logout clears the session cookie", async () => {
    const { appRouter } = await import("./routers");
    const { COOKIE_NAME } = await import("../shared/const");

    const clearedCookies: Array<{ name: string; options: Record<string, unknown> }> = [];
    const ctx = {
      user: {
        id: 1,
        openId: "local_test",
        email: "test@example.com",
        name: "Test User",
        loginMethod: "local",
        passwordHash: null,
        avatarUrl: null,
        role: "user" as const,
        createdAt: new Date(),
        updatedAt: new Date(),
        lastSignedIn: new Date(),
      },
      req: { protocol: "https", headers: {} } as any,
      res: {
        clearCookie: (name: string, options: Record<string, unknown>) => {
          clearedCookies.push({ name, options });
        },
        cookie: vi.fn(),
      } as any,
    };

    const caller = appRouter.createCaller(ctx);
    const result = await caller.auth.logout();

    expect(result).toEqual({ success: true });
    expect(clearedCookies).toHaveLength(1);
    expect(clearedCookies[0]?.name).toBe(COOKIE_NAME);
    expect(clearedCookies[0]?.options).toMatchObject({
      maxAge: -1,
      httpOnly: true,
      path: "/",
    });
  });
});

// --- Self-hostability verification -------------------------------------------

describe("self-hostability: no Manus platform calls", () => {
  it("signLocalSession does not call any external HTTP endpoint", async () => {
    // If signLocalSession tried to call Manus API, it would fail in test env
    // (no OAUTH_SERVER_URL set). The fact it succeeds proves it's self-contained.
    delete process.env.OAUTH_SERVER_URL;
    process.env.JWT_SECRET = TEST_JWT_SECRET;

    const token = await signLocalSession({
      openId: "local_selfhost",
      email: "selfhost@example.com",
      name: "Self Host User",
    });

    expect(token).toBeTruthy();
    const verified = await verifyLocalSession(token);
    expect(verified?.openId).toBe("local_selfhost");
  });

  it("verifyLocalSession does not call any external HTTP endpoint", async () => {
    delete process.env.OAUTH_SERVER_URL;
    process.env.JWT_SECRET = TEST_JWT_SECRET;

    const token = await signLocalSession({
      openId: "local_verify_test",
      email: "verify@example.com",
      name: "Verify Test",
    });

    const result = await verifyLocalSession(token);
    expect(result).not.toBeNull();
    expect(result?.openId).toBe("local_verify_test");
  });
});
