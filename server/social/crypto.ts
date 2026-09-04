import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { SocialCryptoError } from "./types";

const VERSION = "s1";
const ALGO = "aes-256-gcm";
const IV_LENGTH = 12;
const KEY_LENGTH = 32;

/** site_settings key. Admin UI overrides env SOCIAL_CREDENTIALS_KEY. */
export const SOCIAL_CREDENTIALS_SETTING_KEY = "social.credentials_key";

export type SocialCryptoKeySource = NodeJS.ProcessEnv | Buffer;

function decodeKey(raw: string): Buffer {
  const trimmed = raw.trim();
  if (/^[0-9a-fA-F]{64}$/.test(trimmed)) {
    return Buffer.from(trimmed, "hex");
  }
  try {
    const b64 = Buffer.from(trimmed, "base64");
    if (b64.length === KEY_LENGTH) return b64;
  } catch {
    /* fall through */
  }
  throw new SocialCryptoError(
    "Encryption key must be 32 bytes (64 hex chars or base64)"
  );
}

export function parseSocialCredentialsKey(raw: string): Buffer {
  const key = decodeKey(raw);
  if (key.length !== KEY_LENGTH) {
    throw new SocialCryptoError("Encryption key must be 32 bytes");
  }
  return key;
}

export function generateSocialCredentialsKeyHex(): string {
  return randomBytes(KEY_LENGTH).toString("hex");
}

export function hintSocialCredentialsKey(raw: string): string {
  const hex = parseSocialCredentialsKey(raw).toString("hex");
  return `${hex.slice(0, 4)}…${hex.slice(-4)}`;
}

export function getSocialCredentialsKey(
  env: NodeJS.ProcessEnv = process.env
): Buffer {
  const raw = env.SOCIAL_CREDENTIALS_KEY;
  if (!raw || !raw.trim()) {
    throw new SocialCryptoError("Social encryption key is missing");
  }
  return parseSocialCredentialsKey(raw);
}

function resolveKey(source?: SocialCryptoKeySource): Buffer {
  if (source && Buffer.isBuffer(source)) {
    if (source.length !== KEY_LENGTH) {
      throw new SocialCryptoError("Encryption key must be 32 bytes");
    }
    return source;
  }
  return getSocialCredentialsKey(source);
}

export async function inspectSocialCredentialsKey(): Promise<{
  raw: string;
  source: "db" | "env";
} | null> {
  const { getSetting } = await import("../settings-service");
  const dbVal = (await getSetting(SOCIAL_CREDENTIALS_SETTING_KEY, undefined, "")).trim();
  if (dbVal) return { raw: dbVal, source: "db" };
  const envVal = (process.env.SOCIAL_CREDENTIALS_KEY || "").trim();
  if (envVal) return { raw: envVal, source: "env" };
  return null;
}

export async function peekSocialCredentialsKey(): Promise<{
  configured: boolean;
  source: "db" | "env" | "none";
  hint: string | null;
}> {
  const inspected = await inspectSocialCredentialsKey();
  if (!inspected) return { configured: false, source: "none", hint: null };
  try {
    return {
      configured: true,
      source: inspected.source,
      hint: hintSocialCredentialsKey(inspected.raw),
    };
  } catch {
    return { configured: false, source: inspected.source, hint: "invalid" };
  }
}

export async function loadSocialCredentialsKey(): Promise<Buffer> {
  const inspected = await inspectSocialCredentialsKey();
  if (!inspected) {
    throw new SocialCryptoError(
      "Social encryption key is not configured. Generate it in Admin → Social Distribution."
    );
  }
  return parseSocialCredentialsKey(inspected.raw);
}

export async function saveSocialCredentialsKey(raw: string): Promise<{
  configured: true;
  source: "db";
  hint: string;
}> {
  const trimmed = raw.trim();
  const hint = hintSocialCredentialsKey(trimmed);
  const { setSetting } = await import("../settings-service");
  await setSetting(SOCIAL_CREDENTIALS_SETTING_KEY, trimmed);
  return { configured: true, source: "db", hint };
}

export function encryptSocialSecret(
  plaintext: string,
  env?: SocialCryptoKeySource
): string {
  if (typeof plaintext !== "string") {
    throw new SocialCryptoError("plaintext must be a string");
  }
  const key = resolveKey(env);
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGO, key, iv);
  const encrypted = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return [
    VERSION,
    iv.toString("base64"),
    tag.toString("base64"),
    encrypted.toString("base64"),
  ].join(".");
}

export function decryptSocialSecret(
  ciphertext: string,
  env?: SocialCryptoKeySource
): string {
  if (!ciphertext || typeof ciphertext !== "string") {
    throw new SocialCryptoError("ciphertext is required");
  }
  const parts = ciphertext.split(".");
  if (parts.length !== 4 || parts[0] !== VERSION) {
    throw new SocialCryptoError("malformed ciphertext");
  }
  const key = resolveKey(env);
  try {
    const iv = Buffer.from(parts[1], "base64");
    const tag = Buffer.from(parts[2], "base64");
    const data = Buffer.from(parts[3], "base64");
    if (iv.length !== IV_LENGTH || tag.length !== 16 || data.length === 0) {
      throw new SocialCryptoError("malformed ciphertext");
    }
    const decipher = createDecipheriv(ALGO, key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(data), decipher.final()]).toString(
      "utf8"
    );
  } catch (err) {
    if (err instanceof SocialCryptoError) throw err;
    throw new SocialCryptoError("failed to decrypt social credentials");
  }
}

export function encryptSocialCredentials(
  credentials: Record<string, unknown>,
  env?: SocialCryptoKeySource
): string {
  return encryptSocialSecret(JSON.stringify(credentials), env);
}

export function decryptSocialCredentials(
  ciphertext: string,
  env?: SocialCryptoKeySource
): Record<string, unknown> {
  const json = decryptSocialSecret(ciphertext, env);
  try {
    const parsed = JSON.parse(json);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new SocialCryptoError("credentials payload must be an object");
    }
    return parsed as Record<string, unknown>;
  } catch (err) {
    if (err instanceof SocialCryptoError) throw err;
    throw new SocialCryptoError("credentials payload is not valid JSON");
  }
}

export async function encryptSocialCredentialsAsync(
  credentials: Record<string, unknown>
): Promise<string> {
  return encryptSocialCredentials(credentials, await loadSocialCredentialsKey());
}

export async function decryptSocialCredentialsAsync(
  ciphertext: string
): Promise<Record<string, unknown>> {
  return decryptSocialCredentials(ciphertext, await loadSocialCredentialsKey());
}
