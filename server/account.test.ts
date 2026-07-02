/**
 * Tests for account router procedures.
 * Covers: myProfile, updateProfile, changePassword, myVipStatus, myPaymentHistory
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { appRouter } from "./routers";

// --- Mocks --------------------------------------------------------------------
vi.mock("./db", async () => {
  const actual = await vi.importActual<typeof import("./db")>("./db");
  return {
    ...actual,
    getUserById: vi.fn(),
    getDb: vi.fn(),
  };
});

vi.mock("./auth-local", async () => {
  const actual = await vi.importActual<typeof import("./auth-local")>("./auth-local");
  return {
    ...actual,
    hashPassword: vi.fn().mockResolvedValue("hashed_new_password"),
    verifyPassword: vi.fn().mockResolvedValue(true),
  };
});

import * as db from "./db";
import * as authLocal from "./auth-local";

beforeEach(() => {
  vi.resetAllMocks();
  // Re-apply default mock implementations after reset
  vi.mocked(authLocal.hashPassword).mockResolvedValue("hashed_new_password");
  vi.mocked(authLocal.verifyPassword).mockResolvedValue(true);
});

// --- Mock DB query builder -----------------------------------------------------
function makeMockDb(overrides: Record<string, unknown> = {}) {
  const chain = {
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    leftJoin: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    offset: vi.fn().mockResolvedValue([]),
    update: vi.fn().mockReturnThis(),
    set: vi.fn().mockReturnThis(),
    ...overrides,
  };
  return chain;
}

// --- Shared context -----------------------------------------------------------
const adminCtx = {
  user: { id: 1, role: "admin" as const, name: "Admin", email: "admin@test.com" },
  req: {} as any,
  res: {} as any,
};

const userCtx = {
  user: { id: 2, role: "user" as const, name: "User", email: "user@test.com" },
  req: {} as any,
  res: {} as any,
};

// --- Tests --------------------------------------------------------------------
describe("account.myProfile", () => {
  it("returns profile for authenticated user", async () => {
    const mockUser = {
      id: 2,
      name: "Test User",
      email: "test@example.com",
      avatarUrl: null,
      role: "user",
      createdAt: new Date("2025-01-01"),
      passwordHash: "hash",
      openId: null,
      status: "active",
    };
    vi.mocked(db.getUserById).mockResolvedValueOnce(mockUser as any);

    const caller = appRouter.createCaller(userCtx);
    const result = await caller.account.myProfile();

    expect(result.id).toBe(2);
    expect(result.name).toBe("Test User");
    expect(result.email).toBe("test@example.com");
    expect(result.role).toBe("user");
    // passwordHash should NOT be exposed
    expect((result as any).passwordHash).toBeUndefined();
  });

  it("throws NOT_FOUND when user does not exist", async () => {
    vi.mocked(db.getUserById).mockResolvedValueOnce(undefined);

    const caller = appRouter.createCaller(userCtx);
    await expect(caller.account.myProfile()).rejects.toThrow("User not found");
  });
});

describe("account.updateProfile", () => {
  it("updates name and email successfully", async () => {
    const mockDb = makeMockDb();
    mockDb.select = vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([]), // no conflicting email
        }),
      }),
    });
    mockDb.update = vi.fn().mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue(undefined),
      }),
    });
    vi.mocked(db.getDb).mockResolvedValueOnce(mockDb as any);

    const caller = appRouter.createCaller(userCtx);
    const result = await caller.account.updateProfile({ name: "New Name", email: "new@test.com" });
    expect(result.success).toBe(true);
  });

  it("throws CONFLICT when email is taken by another user", async () => {
    const mockDb = makeMockDb();
    mockDb.select = vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([{ id: 99 }]), // different user has this email
        }),
      }),
    });
    vi.mocked(db.getDb).mockResolvedValueOnce(mockDb as any);

    const caller = appRouter.createCaller(userCtx);
    await expect(
      caller.account.updateProfile({ email: "taken@test.com" })
    ).rejects.toThrow();
  });
});

describe("account.changePassword", () => {
  it("changes password successfully with correct current password", async () => {
    const mockDb = makeMockDb();
    mockDb.select = vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([{ id: 2, passwordHash: "old_hash" }]),
        }),
      }),
    });
    mockDb.update = vi.fn().mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue(undefined),
      }),
    });
    vi.mocked(db.getDb).mockResolvedValue(mockDb as any);
    vi.mocked(authLocal.verifyPassword).mockResolvedValueOnce(true);

    const caller = appRouter.createCaller(userCtx);
    const result = await caller.account.changePassword({
      currentPassword: "old_pass",
      newPassword: "new_pass_123",
      confirmPassword: "new_pass_123",
    });
    expect(result.success).toBe(true);
  });

  it("throws BAD_REQUEST when confirm password does not match", async () => {
    const caller = appRouter.createCaller(userCtx);
    await expect(
      caller.account.changePassword({
        currentPassword: "old",
        newPassword: "new_pass_123",
        confirmPassword: "different",
      })
    ).rejects.toThrow("Passwords do not match");
  });

  it("throws UNAUTHORIZED when current password is wrong", async () => {
    const mockDb = makeMockDb();
    mockDb.select = vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([{ id: 2, passwordHash: "old_hash" }]),
        }),
      }),
    });
    vi.mocked(db.getDb).mockResolvedValueOnce(mockDb as any);
    vi.mocked(authLocal.verifyPassword).mockResolvedValueOnce(false);

    const caller = appRouter.createCaller(userCtx);
    await expect(
      caller.account.changePassword({
        currentPassword: "wrong_pass",
        newPassword: "new_pass_123",
        confirmPassword: "new_pass_123",
      })
    ).rejects.toThrow("Current password is incorrect");
  });

  it("throws BAD_REQUEST when account has no password (OAuth account)", async () => {
    const mockDb = makeMockDb();
    mockDb.select = vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([{ id: 2, passwordHash: null }]),
        }),
      }),
    });
    vi.mocked(db.getDb).mockResolvedValueOnce(mockDb as any);

    const caller = appRouter.createCaller(userCtx);
    await expect(
      caller.account.changePassword({
        currentPassword: "any",
        newPassword: "new_pass_123",
        confirmPassword: "new_pass_123",
      })
    ).rejects.toThrow();
  });
});

describe("account.myVipStatus", () => {
  it("returns isVip=true with daysLeft when active subscription exists", async () => {
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 30 * 86400000); // 30 days from now
    const startedAt = new Date(now.getTime() - 5 * 86400000); // 5 days ago

    const mockDb = makeMockDb();
    // First query: active subscription
    mockDb.select = vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        leftJoin: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            orderBy: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue([
                {
                  id: 1,
                  status: "active",
                  startedAt,
                  expiresAt,
                  planId: 1,
                  planName: "Monthly VIP",
                  planPrice: "9.99",
                  planCurrency: "usd",
                  planIntervalDays: 30,
                  planBadge: "Popular",
                },
              ]),
            }),
          }),
        }),
      }),
    });
    vi.mocked(db.getDb).mockResolvedValueOnce(mockDb as any);

    const caller = appRouter.createCaller(userCtx);
    const result = await caller.account.myVipStatus();

    expect(result.isVip).toBe(true);
    expect(result.subscription).not.toBeNull();
    expect((result.subscription as any).daysLeft).toBeGreaterThan(0);
    expect((result.subscription as any).progressPercent).toBeGreaterThan(0);
  });

  it("returns isVip=false when no active subscription", async () => {
    const mockDb = makeMockDb();
    // First query: no active subscription
    let callCount = 0;
    mockDb.select = vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        leftJoin: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            orderBy: vi.fn().mockReturnValue({
              limit: vi.fn().mockImplementation(() => {
                callCount++;
                if (callCount === 1) return Promise.resolve([]); // no active
                return Promise.resolve([]); // no last sub either
              }),
            }),
          }),
        }),
      }),
    });
    vi.mocked(db.getDb).mockResolvedValue(mockDb as any);

    const caller = appRouter.createCaller(userCtx);
    const result = await caller.account.myVipStatus();

    expect(result.isVip).toBe(false);
    expect(result.subscription).toBeNull();
  });
});

describe("account.renewVip", () => {
  it("throws NOT_FOUND or PRECONDITION_FAILED when no plans available", async () => {
    // With NOWPayments/CCBill, payment is always configured via env/DB
    // This test verifies the procedure rejects when no active plans exist
    const dbModule = await import("./db");
    const spy = vi.spyOn(dbModule, "getSubscriptionPlans").mockResolvedValueOnce([]);

    const caller = appRouter.createCaller(userCtx);
    await expect(
      caller.account.renewVip({
        successUrl: "https://example.com/success",
        cancelUrl: "https://example.com/cancel",
      })
    ).rejects.toThrow();

    spy.mockRestore();
  });

  it("throws NOT_FOUND when no active plans exist", async () => {
    process.env.STRIPE_SECRET_KEY = "sk_test_dummy";

    const mockDb = makeMockDb();
    // Last subscription query returns nothing
    mockDb.select = vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          orderBy: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([]),
          }),
        }),
      }),
    });
    vi.mocked(db.getDb).mockResolvedValueOnce(mockDb as any);

    // getSubscriptionPlans returns empty
    vi.mocked(db.getDb).mockResolvedValueOnce(mockDb as any);

    // Mock getSubscriptionPlans via db module
    const dbModule = await import("./db");
    const spy = vi.spyOn(dbModule, "getSubscriptionPlans").mockResolvedValueOnce([]);

    const caller = appRouter.createCaller(userCtx);
    await expect(
      caller.account.renewVip({
        successUrl: "https://example.com/success",
        cancelUrl: "https://example.com/cancel",
      })
    ).rejects.toThrow("No VIP plans available.");

    spy.mockRestore();
    delete process.env.STRIPE_SECRET_KEY;
  });
});

describe("account.myPaymentHistory", () => {
  it("returns paginated payment history for user", async () => {
    const mockItems = [
      {
        id: 1,
        status: "active",
        startedAt: new Date("2025-01-01"),
        expiresAt: new Date("2026-01-01"),
        createdAt: new Date("2025-01-01"),
        stripeSessionId: "cs_test_123",
        planName: "Monthly VIP",
        planPrice: "9.99",
        planCurrency: "usd",
        planIntervalDays: 30,
        planBadge: null,
      },
    ];

    let selectCallCount = 0;
    const mockDb = {
      select: vi.fn().mockImplementation(() => {
        selectCallCount++;
        if (selectCallCount === 1) {
          // items query: select → from → leftJoin → where → orderBy → limit → offset
          return {
            from: vi.fn().mockReturnValue({
              leftJoin: vi.fn().mockReturnValue({
                where: vi.fn().mockReturnValue({
                  orderBy: vi.fn().mockReturnValue({
                    limit: vi.fn().mockReturnValue({
                      offset: vi.fn().mockResolvedValue(mockItems),
                    }),
                  }),
                }),
              }),
            }),
          };
        }
        // count query: select → from → where
        return {
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue([{ total: 1 }]),
          }),
        };
      }),
    };

    vi.mocked(db.getDb).mockResolvedValue(mockDb as any);

    const caller = appRouter.createCaller(userCtx);
    const result = await caller.account.myPaymentHistory({ page: 1, limit: 10 });

    expect(result.items).toHaveLength(1);
    expect(result.items[0].stripeSessionId).toBe("cs_test_123");
    expect(result.total).toBe(1);
  });

  it("returns empty list when user has no payments", async () => {
    let selectCallCount2 = 0;
    const mockDb2 = {
      select: vi.fn().mockImplementation(() => {
        selectCallCount2++;
        if (selectCallCount2 === 1) {
          return {
            from: vi.fn().mockReturnValue({
              leftJoin: vi.fn().mockReturnValue({
                where: vi.fn().mockReturnValue({
                  orderBy: vi.fn().mockReturnValue({
                    limit: vi.fn().mockReturnValue({
                      offset: vi.fn().mockResolvedValue([]),
                    }),
                  }),
                }),
              }),
            }),
          };
        }
        return {
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue([{ total: 0 }]),
          }),
        };
      }),
    };
    vi.mocked(db.getDb).mockResolvedValue(mockDb2 as any);

    const caller = appRouter.createCaller(userCtx);
    const result = await caller.account.myPaymentHistory({ page: 1, limit: 10 });

    expect(result.items).toHaveLength(0);
    expect(result.total).toBe(0);
  });
});
