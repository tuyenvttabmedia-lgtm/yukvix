/**
 * Tests for the password reset flow:
 *   auth.forgotPassword → auth.validateResetToken → auth.resetPassword
 *
 * All DB calls are mocked so tests run without a real database.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

// --- Mock DB module ------------------------------------------------------------
vi.mock("./db", () => ({
  getUserByEmail: vi.fn(),
  getUserById: vi.fn(),
  getUserByOpenId: vi.fn(),
  createPasswordResetToken: vi.fn(),
  getPasswordResetToken: vi.fn(),
  markPasswordResetTokenUsed: vi.fn(),
  invalidateUserPasswordResetTokens: vi.fn(),
  updateUserPassword: vi.fn(),
  deleteExpiredPasswordResetTokens: vi.fn(),
}));

// --- Mock email module --------------------------------------------------------
vi.mock("./email", () => ({
  sendPasswordResetEmail: vi.fn().mockResolvedValue({ success: true, messageId: "test-id" }),
  sendPasswordChangedEmail: vi.fn().mockResolvedValue({ success: true, messageId: "test-id" }),
}));

// --- Mock auth-local for hashPassword / verifyPassword -----------------------
vi.mock("./auth-local", () => ({
  registerLocal: vi.fn(),
  loginLocal: vi.fn(),
  setAuthCookie: vi.fn(),
  clearAuthCookie: vi.fn(),
  hashPassword: vi.fn().mockResolvedValue("$2b$10$newhashedpassword"),
  verifyPassword: vi.fn().mockResolvedValue(true),
}));

import * as db from "./db";
import * as email from "./email";

// --- Helpers ------------------------------------------------------------------

function makeCtx(): TrpcContext {
  return {
    user: null,
    req: {
      protocol: "https",
      headers: { origin: "https://yukvix.com" },
    } as unknown as TrpcContext["req"],
    res: {
      clearCookie: vi.fn(),
      cookie: vi.fn(),
    } as unknown as TrpcContext["res"],
  };
}

const mockUser = {
  id: 42,
  openId: "local-42",
  name: "Sakura Cosplay",
  email: "sakura@yukvix.com",
  passwordHash: "$2b$10$existinghash",
  role: "user" as const,
  loginMethod: "local",
  avatarUrl: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  lastSignedIn: new Date(),
};

const mockToken = {
  id: 1,
  userId: 42,
  token: "valid-reset-token-64-chars-long-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
  expiresAt: new Date(Date.now() + 60 * 60 * 1000), // 1 hour from now
  usedAt: null,
  createdAt: new Date(),
};

// --- Tests --------------------------------------------------------------------

describe("auth.forgotPassword", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns generic success even when email not found (prevents enumeration)", async () => {
    vi.mocked(db.getUserByEmail).mockResolvedValue(undefined);
    const caller = appRouter.createCaller(makeCtx());
    const result = await caller.auth.forgotPassword({
      email: "nonexistent@example.com",
      origin: "https://yukvix.com",
    });
    expect(result.success).toBe(true);
    expect(result.message).toContain("If an account");
    // Email must NOT be sent for non-existent users
    expect(email.sendPasswordResetEmail).not.toHaveBeenCalled();
  });

  it("returns generic success for OAuth-only accounts (no passwordHash)", async () => {
    vi.mocked(db.getUserByEmail).mockResolvedValue({
      ...mockUser,
      passwordHash: null,
    });
    const caller = appRouter.createCaller(makeCtx());
    const result = await caller.auth.forgotPassword({
      email: mockUser.email,
      origin: "https://yukvix.com",
    });
    expect(result.success).toBe(true);
    expect(email.sendPasswordResetEmail).not.toHaveBeenCalled();
  });

  it("creates token and sends reset email for valid local account", async () => {
    vi.mocked(db.getUserByEmail).mockResolvedValue(mockUser);
    vi.mocked(db.invalidateUserPasswordResetTokens).mockResolvedValue(undefined);
    vi.mocked(db.createPasswordResetToken).mockResolvedValue(undefined);

    const caller = appRouter.createCaller(makeCtx());
    const result = await caller.auth.forgotPassword({
      email: mockUser.email,
      origin: "https://yukvix.com",
    });

    expect(result.success).toBe(true);
    // Old tokens should be invalidated first
    expect(db.invalidateUserPasswordResetTokens).toHaveBeenCalledWith(mockUser.id);
    // New token should be created
    expect(db.createPasswordResetToken).toHaveBeenCalledWith(
      mockUser.id,
      expect.any(String), // nanoid token
      expect.any(Date)    // expiresAt
    );
    // Email should be sent
    expect(email.sendPasswordResetEmail).toHaveBeenCalledWith(
      mockUser.email,
      mockUser.name,
      expect.stringContaining("/reset-password?token=")
    );
  });

  it("uses canonical site URL, ignoring client origin", async () => {
    vi.mocked(db.getUserByEmail).mockResolvedValue(mockUser);
    vi.mocked(db.invalidateUserPasswordResetTokens).mockResolvedValue(undefined);
    vi.mocked(db.createPasswordResetToken).mockResolvedValue(undefined);

    const caller = appRouter.createCaller(makeCtx());
    await caller.auth.forgotPassword({
      email: mockUser.email,
      origin: "https://mycustomdomain.com",
    });

    const [, , resetUrl] = vi.mocked(email.sendPasswordResetEmail).mock.calls[0]!;
    const { getPublicSiteUrl } = await import("./_core/site-url");
    expect(resetUrl).toContain(`${getPublicSiteUrl()}/reset-password?token=`);
    expect(resetUrl).not.toContain("mycustomdomain.com");
  });
});

describe("auth.validateResetToken", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns valid=false for non-existent token", async () => {
    vi.mocked(db.getPasswordResetToken).mockResolvedValue(null);
    const caller = appRouter.createCaller(makeCtx());
    const result = await caller.auth.validateResetToken({ token: "nonexistent" });
    expect(result.valid).toBe(false);
    expect((result as any).reason).toBe("Token not found");
  });

  it("returns valid=false for already-used token", async () => {
    vi.mocked(db.getPasswordResetToken).mockResolvedValue({
      ...mockToken,
      usedAt: new Date(Date.now() - 1000),
    });
    const caller = appRouter.createCaller(makeCtx());
    const result = await caller.auth.validateResetToken({ token: mockToken.token });
    expect(result.valid).toBe(false);
    expect((result as any).reason).toBe("Token already used");
  });

  it("returns valid=false for expired token", async () => {
    vi.mocked(db.getPasswordResetToken).mockResolvedValue({
      ...mockToken,
      expiresAt: new Date(Date.now() - 1000), // expired 1 second ago
    });
    const caller = appRouter.createCaller(makeCtx());
    const result = await caller.auth.validateResetToken({ token: mockToken.token });
    expect(result.valid).toBe(false);
    expect((result as any).reason).toBe("Token expired");
  });

  it("returns valid=true with masked email for valid token", async () => {
    vi.mocked(db.getPasswordResetToken).mockResolvedValue(mockToken);
    vi.mocked(db.getUserById).mockResolvedValue(mockUser);
    const caller = appRouter.createCaller(makeCtx());
    const result = await caller.auth.validateResetToken({ token: mockToken.token });
    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.maskedEmail).toContain("@yukvix.com");
      expect(result.maskedEmail).toContain("*");
      // Should NOT expose full email
      expect(result.maskedEmail).not.toBe(mockUser.email);
    }
  });
});

describe("auth.resetPassword", () => {
  beforeEach(() => vi.clearAllMocks());

  it("throws BAD_REQUEST for non-existent token", async () => {
    vi.mocked(db.getPasswordResetToken).mockResolvedValue(null);
    const caller = appRouter.createCaller(makeCtx());
    await expect(
      caller.auth.resetPassword({ token: "bad-token", newPassword: "NewPass123!" })
    ).rejects.toMatchObject({ code: "BAD_REQUEST", message: expect.stringContaining("Invalid") });
  });

  it("throws BAD_REQUEST for already-used token", async () => {
    vi.mocked(db.getPasswordResetToken).mockResolvedValue({
      ...mockToken,
      usedAt: new Date(),
    });
    const caller = appRouter.createCaller(makeCtx());
    await expect(
      caller.auth.resetPassword({ token: mockToken.token, newPassword: "NewPass123!" })
    ).rejects.toMatchObject({ code: "BAD_REQUEST", message: expect.stringContaining("already been used") });
  });

  it("throws BAD_REQUEST for expired token", async () => {
    vi.mocked(db.getPasswordResetToken).mockResolvedValue({
      ...mockToken,
      expiresAt: new Date(Date.now() - 1000),
    });
    const caller = appRouter.createCaller(makeCtx());
    await expect(
      caller.auth.resetPassword({ token: mockToken.token, newPassword: "NewPass123!" })
    ).rejects.toMatchObject({ code: "BAD_REQUEST", message: expect.stringContaining("expired") });
  });

  it("successfully resets password with valid token", async () => {
    vi.mocked(db.getPasswordResetToken).mockResolvedValue(mockToken);
    vi.mocked(db.getUserById).mockResolvedValue(mockUser);
    vi.mocked(db.updateUserPassword).mockResolvedValue(undefined);
    vi.mocked(db.invalidateUserPasswordResetTokens).mockResolvedValue(undefined);

    const caller = appRouter.createCaller(makeCtx());
    const result = await caller.auth.resetPassword({
      token: mockToken.token,
      newPassword: "NewSecurePass123!",
    });

    expect(result.success).toBe(true);
    expect(result.message).toContain("successfully");

    // Password should be hashed and saved
    const { hashPassword } = await import("./auth-local");
    expect(hashPassword).toHaveBeenCalledWith("NewSecurePass123!");
    expect(db.updateUserPassword).toHaveBeenCalledWith(mockUser.id, "$2b$10$newhashedpassword");

    // All tokens for this user should be invalidated
    expect(db.invalidateUserPasswordResetTokens).toHaveBeenCalledWith(mockUser.id);

    // Confirmation email should be sent
    expect(email.sendPasswordChangedEmail).toHaveBeenCalledWith(
      mockUser.email,
      mockUser.name
    );
  });

  it("rejects passwords shorter than 8 characters", async () => {
    const caller = appRouter.createCaller(makeCtx());
    await expect(
      caller.auth.resetPassword({ token: mockToken.token, newPassword: "short" })
    ).rejects.toThrow();
  });
});

describe("email masking", () => {
  it("masks email correctly for validateResetToken", async () => {
    const testCases = [
      { email: "sakura@yukvix.com", shouldContain: ["s", "@yukvix.com", "*"] },
      { email: "ab@test.com", shouldContain: ["a", "@test.com"] },
      { email: "john.doe@example.com", shouldContain: ["j", "@example.com", "*"] },
    ];

    for (const tc of testCases) {
      vi.mocked(db.getPasswordResetToken).mockResolvedValue(mockToken);
      vi.mocked(db.getUserById).mockResolvedValue({ ...mockUser, email: tc.email });

      const caller = appRouter.createCaller(makeCtx());
      const result = await caller.auth.validateResetToken({ token: mockToken.token });

      if (result.valid) {
        for (const part of tc.shouldContain) {
          expect(result.maskedEmail).toContain(part);
        }
        // Full email should never be exposed
        expect(result.maskedEmail).not.toBe(tc.email);
      }
    }
  });
});
