import { describe, expect, it } from "vitest";
import {
  decryptSocialCredentials,
  decryptSocialSecret,
  encryptSocialCredentials,
  encryptSocialSecret,
  generateSocialCredentialsKeyHex,
  hintSocialCredentialsKey,
  parseSocialCredentialsKey,
} from "./crypto";
import { SocialCryptoError } from "./types";

const KEY = "a".repeat(64);
const env = { SOCIAL_CREDENTIALS_KEY: KEY } as NodeJS.ProcessEnv;
const otherEnv = {
  SOCIAL_CREDENTIALS_KEY: "b".repeat(64),
} as NodeJS.ProcessEnv;

describe("social crypto", () => {
  it("encrypts and decrypts a string", () => {
    const cipher = encryptSocialSecret("bot-token-value", env);
    expect(cipher.startsWith("s1.")).toBe(true);
    expect(cipher).not.toContain("bot-token-value");
    expect(decryptSocialSecret(cipher, env)).toBe("bot-token-value");
  });

  it("encrypts credential objects", () => {
    const cipher = encryptSocialCredentials({ botToken: "secret-1" }, env);
    expect(decryptSocialCredentials(cipher, env)).toEqual({
      botToken: "secret-1",
    });
  });

  it("fails with the wrong key", () => {
    const cipher = encryptSocialSecret("hello", env);
    expect(() => decryptSocialSecret(cipher, otherEnv)).toThrow(
      SocialCryptoError
    );
  });

  it("fails on malformed ciphertext", () => {
    expect(() => decryptSocialSecret("not-valid", env)).toThrow(/malformed/);
    expect(() => decryptSocialSecret("s1.xxxx", env)).toThrow(/malformed/);
  });

  it("fails safely when key is missing", () => {
    expect(() =>
      encryptSocialSecret("x", {
        SOCIAL_CREDENTIALS_KEY: "",
      } as NodeJS.ProcessEnv)
    ).toThrow(/missing/);
  });

  it("encrypts with a generated admin key buffer", () => {
    const generated = generateSocialCredentialsKeyHex();
    expect(generated).toMatch(/^[0-9a-f]{64}$/);
    const buf = parseSocialCredentialsKey(generated);
    const viaBuffer = encryptSocialSecret("via-buffer", buf);
    expect(decryptSocialSecret(viaBuffer, buf)).toBe("via-buffer");
    expect(hintSocialCredentialsKey(generated)).toMatch(
      /^[0-9a-f]{4}…[0-9a-f]{4}$/
    );
    expect(hintSocialCredentialsKey(generated)).not.toBe(generated);
  });

  it("does not silently store plaintext", () => {
    const cipher = encryptSocialSecret("plaintext-token", env);
    expect(cipher.includes("plaintext-token")).toBe(false);
  });
});
