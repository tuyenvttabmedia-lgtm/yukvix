import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock getDb to avoid real DB calls
vi.mock("./db", () => {
  const mockDb = {
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue([]),
    insert: vi.fn().mockReturnThis(),
    values: vi.fn().mockResolvedValue(undefined),
    update: vi.fn().mockReturnThis(),
    set: vi.fn().mockReturnThis(),
  };

  return {
    getDb: vi.fn().mockResolvedValue(mockDb),
    getUserByOpenId: vi.fn().mockResolvedValue(null),
    getUserByEmail: vi.fn().mockResolvedValue(null),
    getUserById: vi.fn().mockResolvedValue(null),
    createEmailVerificationToken: vi.fn().mockResolvedValue(undefined),
    getEmailVerificationToken: vi.fn().mockResolvedValue(null),
    markEmailVerificationTokenUsed: vi.fn().mockResolvedValue(undefined),
    setUserEmailVerified: vi.fn().mockResolvedValue(undefined),
    invalidateUserEmailVerificationTokens: vi.fn().mockResolvedValue(undefined),
  };
});

// Mock email module
vi.mock("./email", () => ({
  sendVerificationEmail: vi.fn().mockResolvedValue({ success: true, messageId: "test-id" }),
  getSmtpConfigFromDb: vi.fn().mockResolvedValue(null),
  testSmtpConnection: vi.fn().mockResolvedValue({ success: true }),
  invalidateEmailTransporter: vi.fn(),
}));

describe("Email Verification Feature", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("DB helpers", () => {
    it("createEmailVerificationToken is exported from db module", async () => {
      const db = await import("./db");
      expect(db.createEmailVerificationToken).toBeDefined();
      expect(typeof db.createEmailVerificationToken).toBe("function");
    });

    it("getEmailVerificationToken is exported from db module", async () => {
      const db = await import("./db");
      expect(db.getEmailVerificationToken).toBeDefined();
      expect(typeof db.getEmailVerificationToken).toBe("function");
    });

    it("markEmailVerificationTokenUsed is exported from db module", async () => {
      const db = await import("./db");
      expect(db.markEmailVerificationTokenUsed).toBeDefined();
      expect(typeof db.markEmailVerificationTokenUsed).toBe("function");
    });

    it("setUserEmailVerified is exported from db module", async () => {
      const db = await import("./db");
      expect(db.setUserEmailVerified).toBeDefined();
      expect(typeof db.setUserEmailVerified).toBe("function");
    });

    it("invalidateUserEmailVerificationTokens is exported from db module", async () => {
      const db = await import("./db");
      expect(db.invalidateUserEmailVerificationTokens).toBeDefined();
      expect(typeof db.invalidateUserEmailVerificationTokens).toBe("function");
    });
  });

  describe("Email service", () => {
    it("sendVerificationEmail is exported from email module", async () => {
      const email = await import("./email");
      expect(email.sendVerificationEmail).toBeDefined();
      expect(typeof email.sendVerificationEmail).toBe("function");
    });

    it("getSmtpConfigFromDb is exported from email module", async () => {
      const email = await import("./email");
      expect(email.getSmtpConfigFromDb).toBeDefined();
      expect(typeof email.getSmtpConfigFromDb).toBe("function");
    });

    it("testSmtpConnection is exported from email module", async () => {
      const email = await import("./email");
      expect(email.testSmtpConnection).toBeDefined();
      expect(typeof email.testSmtpConnection).toBe("function");
    });

    it("invalidateEmailTransporter is exported from email module", async () => {
      const email = await import("./email");
      expect(email.invalidateEmailTransporter).toBeDefined();
      expect(typeof email.invalidateEmailTransporter).toBe("function");
    });
  });

  describe("Router exports", () => {
    it("authEmailRouter is exported from auth-email router", async () => {
      const { authEmailRouter } = await import("./routers/auth-email");
      expect(authEmailRouter).toBeDefined();
      expect(authEmailRouter._def).toBeDefined();
      expect(authEmailRouter._def.procedures).toBeDefined();
    });

    it("authEmailRouter has sendVerification procedure", async () => {
      const { authEmailRouter } = await import("./routers/auth-email");
      expect(authEmailRouter._def.procedures.sendVerification).toBeDefined();
    });

    it("authEmailRouter has verifyEmail procedure", async () => {
      const { authEmailRouter } = await import("./routers/auth-email");
      expect(authEmailRouter._def.procedures.verifyEmail).toBeDefined();
    });

    it("authEmailRouter has status procedure", async () => {
      const { authEmailRouter } = await import("./routers/auth-email");
      expect(authEmailRouter._def.procedures.status).toBeDefined();
    });

    it("smtpRouter is exported from smtp router", async () => {
      const { smtpRouter } = await import("./routers/smtp");
      expect(smtpRouter).toBeDefined();
      expect(smtpRouter._def).toBeDefined();
    });

    it("smtpRouter has getSettings procedure", async () => {
      const { smtpRouter } = await import("./routers/smtp");
      expect(smtpRouter._def.procedures.getSettings).toBeDefined();
    });

    it("smtpRouter has saveSettings procedure", async () => {
      const { smtpRouter } = await import("./routers/smtp");
      expect(smtpRouter._def.procedures.saveSettings).toBeDefined();
    });

    it("smtpRouter has testConnection procedure", async () => {
      const { smtpRouter } = await import("./routers/smtp");
      expect(smtpRouter._def.procedures.testConnection).toBeDefined();
    });
  });

  describe("App router integration", () => {
    it("appRouter includes smtp namespace", async () => {
      const { appRouter } = await import("./routers");
      expect(appRouter._def.procedures).toBeDefined();
      // Check smtp procedures are accessible via the combined router
      const procNames = Object.keys(appRouter._def.procedures);
      expect(procNames.some((p) => p.startsWith("smtp."))).toBe(true);
    });

    it("appRouter includes authEmail namespace", async () => {
      const { appRouter } = await import("./routers");
      const procNames = Object.keys(appRouter._def.procedures);
      expect(procNames.some((p) => p.startsWith("authEmail."))).toBe(true);
    });
  });
});
