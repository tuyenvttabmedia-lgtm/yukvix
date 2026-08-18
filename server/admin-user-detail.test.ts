import { describe, expect, it, vi, beforeEach } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

// --- Mock DB helpers ---------------------------------------------------------
vi.mock("./db", () => ({
  getDb: vi.fn(),
  upsertUser: vi.fn(),
  getUserByOpenId: vi.fn(),
  getUserByEmail: vi.fn(),
  getUserById: vi.fn(),
  listAlbums: vi.fn(),
  getAlbumBySlug: vi.fn(),
  getAlbumById: vi.fn(),
  getAlbumPhotos: vi.fn(),
  getAlbumPhotoCount: vi.fn(),
  isBookmarked: vi.fn(),
  incrementAlbumView: vi.fn(),
  getAnalytics: vi.fn(),
  listUsers: vi.fn(),
  listSubscriptions: vi.fn(),
  getUserActiveSubscription: vi.fn(),
  getSubscriptionPlans: vi.fn(),
  getUserBookmarks: vi.fn(),
  getUserBookmarkIds: vi.fn(),
  addBookmark: vi.fn(),
  removeBookmark: vi.fn(),
  getBookmarksCount: vi.fn(),
  getUserAlbumsCount: vi.fn(),
  getUserDetail: vi.fn(),
  banUser: vi.fn(),
  unbanUser: vi.fn(),
  updateUserRole: vi.fn(),
  deleteUserById: vi.fn(),
  updateUserPassword: vi.fn(),
  invalidateUserPasswordResetTokens: vi.fn(),
  createPasswordResetToken: vi.fn(),
  getPasswordResetToken: vi.fn(),
  markPasswordResetTokenUsed: vi.fn(),
  createSubscription: vi.fn(),
  activateSubscription: vi.fn(),
}));

// --- Mock email service -------------------------------------------------------
vi.mock("./email", () => ({
  sendPasswordResetEmail: vi.fn().mockResolvedValue({ success: true, messageId: "test-msg-id" }),
  sendTempPasswordEmail: vi.fn().mockResolvedValue({ success: true, messageId: "test-msg-id" }),
}));

// --- Mock bcryptjs ------------------------------------------------------------
vi.mock("bcryptjs", () => ({
  default: {
    hash: vi.fn().mockResolvedValue("$2b$10$hashedpassword"),
    compare: vi.fn().mockResolvedValue(true),
    genSalt: vi.fn().mockResolvedValue("salt"),
  },
}));

// --- Helpers ------------------------------------------------------------------
function makeAdminCtx(overrides: Partial<TrpcContext["user"]> = {}): TrpcContext {
  return {
    user: {
      id: 1,
      openId: "admin-open-id",
      email: "admin@yukvix.com",
      name: "Admin User",
      loginMethod: "email",
      role: "admin",
      status: "active",
      passwordHash: null,
      createdAt: new Date("2024-01-01"),
      updatedAt: new Date("2024-01-01"),
      lastSignedIn: new Date("2024-01-01"),
      ...overrides,
    },
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: vi.fn() } as unknown as TrpcContext["res"],
  };
}

function makeUserCtx(): TrpcContext {
  return {
    user: {
      id: 2,
      openId: "user-open-id",
      email: "user@yukvix.com",
      name: "Regular User",
      loginMethod: "email",
      role: "user",
      status: "active",
      passwordHash: null,
      createdAt: new Date("2024-01-01"),
      updatedAt: new Date("2024-01-01"),
      lastSignedIn: new Date("2024-01-01"),
    },
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: vi.fn() } as unknown as TrpcContext["res"],
  };
}

const mockUserDetail = {
  id: 5,
  openId: "target-user-open-id",
  name: "Target User",
  email: "target@yukvix.com",
  loginMethod: "email",
  role: "user" as const,
  status: "active" as const,
  passwordHash: "$2b$10$hash",
  createdAt: new Date("2024-06-01"),
  updatedAt: new Date("2024-06-01"),
  lastSignedIn: new Date("2024-12-01"),
  bookmarksCount: 12,
  albumsCount: 3,
  subscription: null,
};

// --- Tests --------------------------------------------------------------------
describe("admin.users.adminGetDetail", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns user detail for admin", async () => {
    const { getUserDetail } = await import("./db");
    vi.mocked(getUserDetail).mockResolvedValue(mockUserDetail);

    const caller = appRouter.createCaller(makeAdminCtx());
    const result = await caller.users.adminGetDetail({ userId: 5 });

    expect(result).toMatchObject({ id: 5, name: "Target User", bookmarksCount: 12 });
    expect(getUserDetail).toHaveBeenCalledWith(5);
  });

  it("throws NOT_FOUND when user does not exist", async () => {
    const { getUserDetail } = await import("./db");
    vi.mocked(getUserDetail).mockResolvedValue(null);

    const caller = appRouter.createCaller(makeAdminCtx());
    await expect(caller.users.adminGetDetail({ userId: 999 })).rejects.toThrow("User not found");
  });

  it("throws FORBIDDEN for non-admin users", async () => {
    const caller = appRouter.createCaller(makeUserCtx());
    await expect(caller.users.adminGetDetail({ userId: 5 })).rejects.toThrow();
  });
});

describe("admin.users.ban", () => {
  beforeEach(() => vi.clearAllMocks());

  it("bans a user successfully", async () => {
    const { banUser } = await import("./db");
    vi.mocked(banUser).mockResolvedValue(undefined);

    const caller = appRouter.createCaller(makeAdminCtx());
    const result = await caller.users.ban({ userId: 5 });

    expect(result).toEqual({ success: true });
    expect(banUser).toHaveBeenCalledWith(5);
  });

  it("prevents admin from banning themselves", async () => {
    const caller = appRouter.createCaller(makeAdminCtx());
    await expect(caller.users.ban({ userId: 1 })).rejects.toThrow("Cannot ban yourself");
  });

  it("throws FORBIDDEN for non-admin", async () => {
    const caller = appRouter.createCaller(makeUserCtx());
    await expect(caller.users.ban({ userId: 5 })).rejects.toThrow();
  });
});

describe("admin.users.unban", () => {
  beforeEach(() => vi.clearAllMocks());

  it("unbans a user successfully", async () => {
    const { unbanUser } = await import("./db");
    vi.mocked(unbanUser).mockResolvedValue(undefined);

    const caller = appRouter.createCaller(makeAdminCtx());
    const result = await caller.users.unban({ userId: 5 });

    expect(result).toEqual({ success: true });
    expect(unbanUser).toHaveBeenCalledWith(5);
  });
});

describe("admin.users.grantVip", () => {
  beforeEach(() => vi.clearAllMocks());

  it("grants VIP with a manual subscription", async () => {
    const { updateUserRole, getSubscriptionPlans, createSubscription, activateSubscription } = await import("./db");
    vi.mocked(updateUserRole).mockResolvedValue(undefined);
    vi.mocked(getSubscriptionPlans).mockResolvedValue([{ id: 1 }] as any);
    vi.mocked(createSubscription).mockResolvedValue(undefined as any);
    vi.mocked(activateSubscription).mockResolvedValue(undefined as any);

    const caller = appRouter.createCaller(makeAdminCtx());
    const result = await caller.users.grantVip({ userId: 5 });

    expect(result.success).toBe(true);
    expect(createSubscription).toHaveBeenCalledWith(expect.objectContaining({
      userId: 5,
      planId: 1,
      provider: "manual",
    }));
    expect(activateSubscription).toHaveBeenCalled();
    expect(updateUserRole).toHaveBeenCalledWith(5, "vip");
  });
});

describe("admin.users.removeVip", () => {
  beforeEach(() => vi.clearAllMocks());

  it("removes VIP from user", async () => {
    const { updateUserRole } = await import("./db");
    vi.mocked(updateUserRole).mockResolvedValue(undefined);

    const caller = appRouter.createCaller(makeAdminCtx());
    const result = await caller.users.removeVip({ userId: 5 });

    expect(result).toEqual({ success: true });
    expect(updateUserRole).toHaveBeenCalledWith(5, "user");
  });
});

describe("admin.users.adminResetPassword", () => {
  beforeEach(() => vi.clearAllMocks());

  it("resets password and sends email when user has email", async () => {
    const { getUserDetail, updateUserPassword } = await import("./db");
    const { sendTempPasswordEmail } = await import("./email");

    vi.mocked(getUserDetail).mockResolvedValue({
      ...mockUserDetail,
      email: "target@yukvix.com",
      name: "Target User",
    });
    vi.mocked(updateUserPassword).mockResolvedValue(undefined);
    vi.mocked(sendTempPasswordEmail).mockResolvedValue({ success: true, messageId: "msg-1" });

    const caller = appRouter.createCaller(makeAdminCtx());
    const result = await caller.users.adminResetPassword({ userId: 5 });

    expect(result.success).toBe(true);
    expect(result.tempPassword).toBeDefined();
    expect(result.tempPassword.length).toBeGreaterThanOrEqual(12);
    expect(result.emailSent).toBe(true);
    expect(sendTempPasswordEmail).toHaveBeenCalledWith(
      "target@yukvix.com",
      "Target User",
      expect.any(String)
    );
  });

  it("resets password without sending email when user has no email", async () => {
    const { getUserDetail, updateUserPassword } = await import("./db");
    const { sendTempPasswordEmail } = await import("./email");

    vi.mocked(getUserDetail).mockResolvedValue({
      ...mockUserDetail,
      email: null,
      name: "No Email User",
    });
    vi.mocked(updateUserPassword).mockResolvedValue(undefined);

    const caller = appRouter.createCaller(makeAdminCtx());
    const result = await caller.users.adminResetPassword({ userId: 5 });

    expect(result.success).toBe(true);
    expect(result.emailSent).toBe(false);
    expect(sendTempPasswordEmail).not.toHaveBeenCalled();
  });

  it("throws NOT_FOUND when user does not exist", async () => {
    const { getUserDetail } = await import("./db");
    vi.mocked(getUserDetail).mockResolvedValue(null);

    const caller = appRouter.createCaller(makeAdminCtx());
    await expect(caller.users.adminResetPassword({ userId: 999 })).rejects.toThrow("User not found");
  });
});

describe("admin.users.adminDelete", () => {
  beforeEach(() => vi.clearAllMocks());

  it("deletes a user successfully", async () => {
    const { deleteUserById } = await import("./db");
    vi.mocked(deleteUserById).mockResolvedValue(undefined);

    const caller = appRouter.createCaller(makeAdminCtx());
    const result = await caller.users.adminDelete({ userId: 5 });

    expect(result).toEqual({ success: true });
    expect(deleteUserById).toHaveBeenCalledWith(5);
  });

  it("prevents admin from deleting themselves", async () => {
    const caller = appRouter.createCaller(makeAdminCtx());
    await expect(caller.users.adminDelete({ userId: 1 })).rejects.toThrow("Cannot delete your own account");
  });

  it("throws FORBIDDEN for non-admin", async () => {
    const caller = appRouter.createCaller(makeUserCtx());
    await expect(caller.users.adminDelete({ userId: 5 })).rejects.toThrow();
  });
});
