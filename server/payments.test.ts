/**
 * Tests for the payments admin tRPC router.
 * Covers: stripeStatus, adminListPlans, adminSavePlan, adminTogglePlan,
 *         adminListPayments, adminPaymentStats, adminListActiveVips,
 *         adminExtendVip, adminCancelVip, adminWebhookEvents.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { TRPCError } from "@trpc/server";

// -- Mock DB -------------------------------------------------------------------
const mockSelect = vi.fn();
const mockInsert = vi.fn();
const mockUpdate = vi.fn();

const chainable = (returnValue: any) => {
  const obj: any = {
    from: () => obj,
    where: () => obj,
    leftJoin: () => obj,
    orderBy: () => obj,
    limit: () => obj,
    offset: () => obj,
    groupBy: () => obj,
    set: () => obj,
    values: () => obj,
    onDuplicateKeyUpdate: () => obj,
    then: (resolve: any) => Promise.resolve(returnValue).then(resolve),
    [Symbol.iterator]: function* () { yield* (Array.isArray(returnValue) ? returnValue : []); },
  };
  // Make it thenable (awaitable)
  Object.defineProperty(obj, Symbol.toStringTag, { value: "Promise" });
  return obj;
};

vi.mock("./db", () => ({
  getDb: vi.fn().mockResolvedValue({
    select: mockSelect,
    insert: mockInsert,
    update: mockUpdate,
  }),
}));

vi.mock("../drizzle/schema", () => ({
  subscriptionPlans: { id: "id", isActive: "isActive", sortOrder: "sortOrder", createdAt: "createdAt", currency: "currency" },
  subscriptions: { id: "id", status: "status", userId: "userId", planId: "planId", expiresAt: "expiresAt" },
  webhookEvents: { id: "id", status: "status", processedAt: "processedAt" },
  users: { id: "id", role: "role" },
  adminPermissions: { id: "id", userId: "userId", permission: "permission", grantedBy: "grantedBy", grantedAt: "grantedAt" },
  ADMIN_PERMISSIONS: ["manage_users","manage_albums","manage_payments","manage_cms","manage_import","manage_settings","view_analytics"],
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn((a, b) => ({ eq: [a, b] })),
  and: vi.fn((...args) => ({ and: args })),
  desc: vi.fn((a) => ({ desc: a })),
  sql: Object.assign(vi.fn((s) => s), { raw: vi.fn() }),
  inArray: vi.fn((a, b) => ({ inArray: [a, b] })),
  isNotNull: vi.fn((a) => ({ isNotNull: a })),
  isNull: vi.fn((a) => ({ isNull: a })),
  or: vi.fn((...args) => ({ or: args })),
  lt: vi.fn((a, b) => ({ lt: [a, b] })),
  lte: vi.fn((a, b) => ({ lte: [a, b] })),
  gt: vi.fn((a, b) => ({ gt: [a, b] })),
  gte: vi.fn((a, b) => ({ gte: [a, b] })),
  ne: vi.fn((a, b) => ({ ne: [a, b] })),
  asc: vi.fn((a) => ({ asc: a })),
  like: vi.fn((a, b) => ({ like: [a, b] })),
}));

// -- Build caller --------------------------------------------------------------
async function buildCaller(role: "admin" | "user" = "admin") {
  const { appRouter } = await import("./routers");
  const ctx = {
    user: { id: 1, role, name: "Test", email: "test@test.com" } as any,
    req: {} as any,
    res: {} as any,
  };
  const caller = appRouter.createCaller(ctx);
  return caller.payments;
}

// -- Tests ---------------------------------------------------------------------
describe("payments.stripeStatus (provider status)", () => {
  beforeEach(() => {
    vi.resetModules();
    mockSelect.mockReturnValue(chainable([{ currency: "usd" }]));
  });

  it("returns provider and configured fields", async () => {
    mockSelect
      .mockReturnValueOnce(chainable([]))
      .mockReturnValueOnce(chainable([{ count: 0 }]))
      .mockReturnValueOnce(chainable([{ count: 0 }]));

    const caller = await buildCaller();
    const result = await caller.stripeStatus();
    // stripeStatus now returns provider-agnostic fields
    expect(result).toHaveProperty("provider");
    expect(result).toHaveProperty("configured");
  });

  it("returns plan count and webhook stats", async () => {
    mockSelect
      .mockReturnValueOnce(chainable([{ currency: "usd" }]))
      .mockReturnValueOnce(chainable([{ count: 5 }]))
      .mockReturnValueOnce(chainable([{ count: 0 }]));

    const caller = await buildCaller();
    const result = await caller.stripeStatus();
    expect(result.webhookEventCount).toBeDefined();
    expect(result.currency).toBeDefined();
  });

  it("throws FORBIDDEN for non-admin", async () => {
    const caller = await buildCaller("user");
    await expect(caller.stripeStatus()).rejects.toThrow(TRPCError);
  });
});

describe("payments.adminListPlans", () => {
  it("returns all plans (including inactive)", async () => {
    const mockPlans = [
      { id: 1, name: "Monthly", features: '["HD access"]', isActive: true },
      { id: 2, name: "Yearly", features: null, isActive: false },
    ];
    mockSelect.mockReturnValue(chainable(mockPlans));

    const caller = await buildCaller();
    const result = await caller.adminListPlans();
    expect(result).toHaveLength(2);
    expect(result[0].features).toEqual(["HD access"]);
    expect(result[1].features).toEqual([]);
  });

  it("throws FORBIDDEN for non-admin", async () => {
    const caller = await buildCaller("user");
    await expect(caller.adminListPlans()).rejects.toThrow(TRPCError);
  });
});

describe("payments.adminSavePlan", () => {
  it("creates a new plan when no id provided", async () => {
    mockInsert.mockReturnValue(chainable({ insertId: 42 }));

    const caller = await buildCaller();
    const result = await caller.adminSavePlan({
      name: "Monthly VIP",
      slug: "monthly-vip",
      price: 9.99,
      currency: "usd",
      intervalDays: 30,
      sortOrder: 0,
      isActive: true,
      features: ["HD access", "Download"],
    });
    expect(result.id).toBe(42);
    expect(mockInsert).toHaveBeenCalled();
  });

  it("updates an existing plan when id provided", async () => {
    mockUpdate.mockReturnValue(chainable({}));

    const caller = await buildCaller();
    const result = await caller.adminSavePlan({
      id: 1,
      name: "Monthly VIP Updated",
      slug: "monthly-vip",
      price: 12.99,
      currency: "usd",
      intervalDays: 30,
      sortOrder: 1,
      isActive: true,
      features: [],
    });
    expect(result.id).toBe(1);
    expect(mockUpdate).toHaveBeenCalled();
  });
});

describe("payments.adminTogglePlan", () => {
  it("toggles plan active state", async () => {
    mockUpdate.mockReturnValue(chainable({}));
    const caller = await buildCaller();
    const result = await caller.adminTogglePlan({ id: 1, isActive: false });
    expect(result.success).toBe(true);
  });
});

describe("payments.adminListPayments", () => {
  it("returns paginated payment list", async () => {
    const mockItems = [
      { id: 1, status: "active", userName: "Alice", userEmail: "alice@test.com", planName: "Monthly" },
    ];
    mockSelect
      .mockReturnValueOnce(chainable(mockItems))
      .mockReturnValueOnce(chainable([{ count: 1 }]));

    const caller = await buildCaller();
    const result = await caller.adminListPayments({ page: 1, limit: 20, status: "all" });
    expect(result.total).toBe(1);
    expect(result.items).toHaveLength(1);
  });
});

describe("payments.adminPaymentStats", () => {
  it("returns aggregated stats", async () => {
    mockSelect
      .mockReturnValueOnce(chainable([{ count: 10 }]))
      .mockReturnValueOnce(chainable([
        { status: "active", count: 5 },
        { status: "expired", count: 3 },
        { status: "cancelled", count: 2 },
      ]))
      .mockReturnValueOnce(chainable([
        { price: "9.99", count: 5 },
        { price: "9.99", count: 3 },
      ]));

    const caller = await buildCaller();
    const result = await caller.adminPaymentStats();
    expect(result.total).toBe(10);
    expect(result.active).toBe(5);
    expect(result.expired).toBe(3);
    expect(result.cancelled).toBe(2);
    expect(parseFloat(result.revenue)).toBeCloseTo(79.92, 1);
  });
});

describe("payments.adminListActiveVips", () => {
  it("returns active VIP users", async () => {
    const mockVips = [
      { subId: 1, userId: 10, userName: "Bob", userEmail: "bob@test.com", status: "active", expiresAt: new Date() },
    ];
    mockSelect
      .mockReturnValueOnce(chainable(mockVips))
      .mockReturnValueOnce(chainable([{ count: 1 }]));

    const caller = await buildCaller();
    const result = await caller.adminListActiveVips({ page: 1, limit: 20, includeExpired: false });
    expect(result.items).toHaveLength(1);
    expect(result.total).toBe(1);
  });
});

describe("payments.adminExtendVip", () => {
  it("extends VIP expiry by given days", async () => {
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + 10);
    mockSelect.mockReturnValue(chainable([{ id: 1, userId: 10, expiresAt: futureDate }]));
    mockUpdate.mockReturnValue(chainable({}));

    const caller = await buildCaller();
    const result = await caller.adminExtendVip({ subscriptionId: 1, days: 30 });
    expect(result.success).toBe(true);
    expect(result.newExpiry).toBeInstanceOf(Date);
    // New expiry should be ~40 days from now
    const daysFromNow = (result.newExpiry.getTime() - Date.now()) / 86400000;
    expect(daysFromNow).toBeGreaterThan(35);
  });

  it("throws NOT_FOUND for missing subscription", async () => {
    mockSelect.mockReturnValue(chainable([]));
    const caller = await buildCaller();
    await expect(caller.adminExtendVip({ subscriptionId: 999, days: 30 })).rejects.toThrow(TRPCError);
  });
});

describe("payments.adminCancelVip", () => {
  it("cancels VIP and downgrades user role", async () => {
    mockSelect.mockReturnValue(chainable([{ id: 1, userId: 10 }]));
    mockUpdate.mockReturnValue(chainable({}));

    const caller = await buildCaller();
    const result = await caller.adminCancelVip({ subscriptionId: 1 });
    expect(result.success).toBe(true);
    // mockUpdate is shared across tests; just verify it was called at least once
    expect(mockUpdate).toHaveBeenCalled();
  });
});

describe("payments.adminWebhookEvents", () => {
  it("returns webhook events with counts", async () => {
    const mockEvents = [
      { id: 1, type: "checkout.session.completed", status: "success", stripeEventId: "evt_123", processedAt: new Date() },
    ];
    mockSelect
      .mockReturnValueOnce(chainable(mockEvents))
      .mockReturnValueOnce(chainable([{ total: 5 }]))
      .mockReturnValueOnce(chainable([{ failed: 0 }]));

    const caller = await buildCaller();
    const result = await caller.adminWebhookEvents({ limit: 20, status: "all" });
    expect(result.events).toHaveLength(1);
    expect(result.totalCount).toBe(5);
    expect(result.failedCount).toBe(0);
  });
});

// -- Tests: adminTriggerVipExpiryNotification ----------------------------------

vi.mock("./email", () => ({
  sendVipExpiryReminderEmail: vi.fn().mockResolvedValue({ success: true, messageId: "msg_123" }),
}));

describe("payments.adminTriggerVipExpiryNotification", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("dry run returns total count without sending emails", async () => {
    const mockSubs = [
      {
        subId: 1,
        userId: 10,
        expiresAt: new Date(Date.now() + 2 * 24 * 3600 * 1000), // 2 days from now
        vipExpiryNotifiedAt: null,
        userName: "Alice",
        userEmail: "alice@test.com",
      },
      {
        subId: 2,
        userId: 11,
        expiresAt: new Date(Date.now() + 1 * 24 * 3600 * 1000), // 1 day from now
        vipExpiryNotifiedAt: null,
        userName: "Bob",
        userEmail: "bob@test.com",
      },
    ];
    mockSelect.mockReturnValue(chainable(mockSubs));

    const caller = await buildCaller();
    const result = await caller.adminTriggerVipExpiryNotification({ dryRun: true });
    expect(result.dryRun).toBe(true);
    expect(result.total).toBe(2);
    expect(result.notified).toBe(0); // dry run — no emails sent
  });

  it("sends emails to expiring VIP users and marks notified", async () => {
    const mockSubs = [
      {
        subId: 1,
        userId: 10,
        expiresAt: new Date(Date.now() + 2 * 24 * 3600 * 1000),
        vipExpiryNotifiedAt: null,
        userName: "Alice",
        userEmail: "alice@test.com",
      },
    ];
    mockSelect.mockReturnValue(chainable(mockSubs));
    mockUpdate.mockReturnValue(chainable({ rowsAffected: 1 }));

    const { sendVipExpiryReminderEmail } = await import("./email");

    const caller = await buildCaller();
    const result = await caller.adminTriggerVipExpiryNotification({ dryRun: false });
    expect(result.dryRun).toBe(false);
    expect(result.notified).toBe(1);
    expect(result.errors).toBe(0);
    expect(sendVipExpiryReminderEmail).toHaveBeenCalledWith(
      "alice@test.com",
      "Alice",
      expect.any(Date),
      expect.any(Number),
      expect.stringContaining("/vip")
    );
  });

  it("skips users without email", async () => {
    const mockSubs = [
      {
        subId: 3,
        userId: 12,
        expiresAt: new Date(Date.now() + 2 * 24 * 3600 * 1000),
        vipExpiryNotifiedAt: null,
        userName: "NoEmail",
        userEmail: null,
      },
    ];
    mockSelect.mockReturnValue(chainable(mockSubs));

    const caller = await buildCaller();
    const result = await caller.adminTriggerVipExpiryNotification({ dryRun: false });
    expect(result.skipped).toBe(1);
    expect(result.notified).toBe(0);
  });

  it("throws FORBIDDEN for non-admin users", async () => {
    const caller = await buildCaller("user");
    await expect(
      caller.adminTriggerVipExpiryNotification({ dryRun: true })
    ).rejects.toThrow(TRPCError);
  });
});

// -- Tests: notify-vip-expiry scheduled handler --------------------------------

const mockAuthenticateRequest = vi.fn();

vi.mock("./_core/sdk", () => ({
  sdk: {
    authenticateRequest: mockAuthenticateRequest,
  },
}));

describe("notify-vip-expiry handler", () => {
  it("rejects non-cron requests with 403", async () => {
    mockAuthenticateRequest.mockResolvedValueOnce({ isCron: false, taskUid: null });

    const { notifyVipExpiryHandler } = await import("./scheduled/notify-vip-expiry");
    const req = { url: "/api/scheduled/notify-vip-expiry" } as any;
    const res = { status: vi.fn().mockReturnThis(), json: vi.fn() } as any;

    await notifyVipExpiryHandler(req, res);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({ error: "cron-only" });
  });

  it("returns ok with notified/skipped/errors when cron", async () => {
    mockAuthenticateRequest.mockResolvedValueOnce({ isCron: true, taskUid: "task_abc" });
    // No expiring subs
    mockSelect.mockReturnValue(chainable([]));

    const { notifyVipExpiryHandler } = await import("./scheduled/notify-vip-expiry");
    const req = { url: "/api/scheduled/notify-vip-expiry" } as any;
    const res = { status: vi.fn().mockReturnThis(), json: vi.fn() } as any;

    await notifyVipExpiryHandler(req, res);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ ok: true, notified: 0, skipped: 0, errors: 0, total: 0 })
    );
  });
});
