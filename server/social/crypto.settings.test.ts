import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../settings-service", () => ({
  getSetting: vi.fn(),
  setSetting: vi.fn(),
}));

import { getSetting, setSetting } from "../settings-service";
import {
  peekSocialCredentialsKey,
  saveSocialCredentialsKey,
} from "./crypto";

describe("social credentials key admin settings", () => {
  beforeEach(() => {
    vi.mocked(getSetting).mockReset();
    vi.mocked(setSetting).mockReset();
    delete process.env.SOCIAL_CREDENTIALS_KEY;
  });

  it("reports missing when neither db nor env is set", async () => {
    vi.mocked(getSetting).mockResolvedValue("");
    await expect(peekSocialCredentialsKey()).resolves.toEqual({
      configured: false,
      source: "none",
      hint: null,
    });
  });

  it("never returns the full key to callers", async () => {
    const full = "a".repeat(64);
    vi.mocked(getSetting).mockResolvedValue(full);
    const status = await peekSocialCredentialsKey();
    expect(status.configured).toBe(true);
    expect(status.source).toBe("db");
    expect(status.hint).toBe("aaaa…aaaa");
    expect(JSON.stringify(status)).not.toContain(full);
  });

  it("saves a validated key to site_settings", async () => {
    const key = "b".repeat(64);
    vi.mocked(setSetting).mockResolvedValue(undefined);
    const result = await saveSocialCredentialsKey(key);
    expect(setSetting).toHaveBeenCalledWith("social.credentials_key", key);
    expect(result.source).toBe("db");
    expect(result.hint).not.toBe(key);
  });
});
