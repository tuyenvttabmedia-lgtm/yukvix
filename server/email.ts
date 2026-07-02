/**
 * Email service using Nodemailer.
 * Supports SMTP (Gmail, SendGrid, Mailgun, custom SMTP) and Ethereal for local dev.
 *
 * Environment variables:
 *   SMTP_HOST       — SMTP server hostname (e.g. smtp.gmail.com)
 *   SMTP_PORT       — SMTP port (default: 587)
 *   SMTP_SECURE     — "true" for port 465 TLS, "false" for STARTTLS (default: false)
 *   SMTP_USER       — SMTP username / email address
 *   SMTP_PASS       — SMTP password or app password
 *   SMTP_FROM       — Sender address (default: SMTP_USER)
 *   SMTP_FROM_NAME  — Sender display name (default: Yukvix)
 *
 * If SMTP_HOST is not set, the service auto-creates an Ethereal test account
 * and logs a preview URL to the console — perfect for local development.
 */
import nodemailer from "nodemailer";
import type { Transporter } from "nodemailer";
import { getDb } from "./db";
import { insertEmailLog } from "./db";
import { smtpSettings } from "../drizzle/schema";

// --- Retry + Log Core ---------------------------------------------------------

const RETRY_DELAYS_MS = [1000, 3000, 5000]; // delays between attempts

/**
 * Core send helper with retry logic and automatic email logging.
 * All public send* functions should delegate to this.
 */
export async function sendMailWithRetry(opts: {
  type: string;
  to: string;
  subject: string;
  html: string;
  text?: string;
  metadata?: Record<string, unknown>;
}): Promise<{ success: boolean; messageId?: string; previewUrl?: string; error?: string; attempts: number }> {
  const maxAttempts = 3;
  let lastError = "";
  let attempts = 0;

  for (let i = 0; i < maxAttempts; i++) {
    attempts = i + 1;
    if (i > 0) {
      await new Promise((r) => setTimeout(r, RETRY_DELAYS_MS[i - 1] ?? 5000));
      console.log(`[Email] Retry attempt ${attempts}/${maxAttempts} for ${opts.to}`);
    }
    try {
      const transporter = await getTransporter();
      const info = await transporter.sendMail({
        from: await getSenderAddress(),
        to: opts.to,
        subject: opts.subject,
        html: opts.html,
        text: opts.text,
      });
      const previewUrl = (nodemailer.getTestMessageUrl(info) || undefined) as string | undefined;
      if (previewUrl) console.log(`[Email] Preview: ${previewUrl}`);
      console.log(`[Email] Sent "${opts.type}" to ${opts.to} (attempt ${attempts}, messageId: ${info.messageId})`);

      // Log success
      await insertEmailLog({
        type: opts.type,
        recipient: opts.to,
        subject: opts.subject,
        status: "sent",
        attempts,
        messageId: info.messageId,
        metadata: opts.metadata ? JSON.stringify(opts.metadata) : undefined,
      });

      return { success: true, messageId: info.messageId, previewUrl, attempts };
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
      console.error(`[Email] Attempt ${attempts}/${maxAttempts} failed for ${opts.to}:`, lastError);
    }
  }

  // All attempts exhausted — log failure
  await insertEmailLog({
    type: opts.type,
    recipient: opts.to,
    subject: opts.subject,
    status: "failed",
    attempts,
    error: lastError,
    metadata: opts.metadata ? JSON.stringify(opts.metadata) : undefined,
  });

  return { success: false, error: lastError, attempts };
}

let _transporter: Transporter | null = null;
let _testAccountEmail: string | null = null;
let _cachedSmtpUpdatedAt: Date | null = null;

// --- DB-based SMTP Config ---

export interface SmtpConfig {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  password: string;
  fromName: string;
  fromEmail: string;
}

export async function getSmtpConfigFromDb(): Promise<SmtpConfig | null> {
  try {
    const db = await getDb();
    if (!db) return null;
    const [settings] = await db.select().from(smtpSettings).limit(1);
    if (!settings || !settings.enabled) return null;
    return {
      host: settings.host,
      port: settings.port,
      secure: settings.secure,
      user: settings.user,
      password: settings.password,
      fromName: settings.fromName,
      fromEmail: settings.fromEmail,
    };
  } catch {
    return null;
  }
}

// Invalidate cached transporter (call when SMTP settings change)
export function invalidateEmailTransporter() {
  _transporter = null;
  _cachedSmtpUpdatedAt = null;
}

// Test SMTP connection without saving
export async function testSmtpConnection(config: SmtpConfig): Promise<{ success: boolean; error?: string }> {
  try {
    const transporter = nodemailer.createTransport({
      host: config.host,
      port: config.port,
      secure: config.secure,
      auth: { user: config.user, pass: config.password },
    });
    await transporter.verify();
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

async function getTransporter(): Promise<Transporter> {
  // Try DB-based SMTP first
  const dbConfig = await getSmtpConfigFromDb();
  if (dbConfig) {
    // Check if we need to recreate transporter
    const dbInst = await getDb();
    const [settings] = dbInst ? await dbInst.select({ updatedAt: smtpSettings.updatedAt }).from(smtpSettings).limit(1) : [];
    if (!_transporter || !_cachedSmtpUpdatedAt || (settings && settings.updatedAt > _cachedSmtpUpdatedAt)) {
      _transporter = nodemailer.createTransport({
        host: dbConfig.host,
        port: dbConfig.port,
        secure: dbConfig.secure,
        auth: { user: dbConfig.user, pass: dbConfig.password },
        connectionTimeout: 10000,   // 10s to establish TCP connection
        greetingTimeout: 8000,      // 8s to receive SMTP greeting
        socketTimeout: 30000,       // 30s idle socket timeout
        tls: { rejectUnauthorized: process.env.NODE_ENV === "production" },
      });
      _cachedSmtpUpdatedAt = settings?.updatedAt ?? new Date();
      console.log(`[Email] SMTP connected via DB config to ${dbConfig.host}:${dbConfig.port}`);
    }
    return _transporter;
  }

  // Fallback to env-based SMTP
  if (_transporter) return _transporter;

  const host = process.env.SMTP_HOST;

  if (!host) {
    // -- Development fallback: Ethereal test account --------------------------
    console.log("[Email] SMTP not configured -- creating Ethereal test account...");
    const testAccount = await nodemailer.createTestAccount();
    _testAccountEmail = testAccount.user;
    console.log(`[Email] Ethereal test account: ${testAccount.user} / ${testAccount.pass}`);
    console.log("[Email] Preview emails at: https://ethereal.email");

    _transporter = nodemailer.createTransport({
      host: "smtp.ethereal.email",
      port: 587,
      secure: false,
      auth: {
        user: testAccount.user,
        pass: testAccount.pass,
      },
    });
    return _transporter;
  }

  // -- Production SMTP --------------------------------------------------------
  const port = parseInt(process.env.SMTP_PORT ?? "587", 10);
  const secure = process.env.SMTP_SECURE === "true";

  _transporter = nodemailer.createTransport({
    host,
    port,
    secure,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
    connectionTimeout: 10000,
    greetingTimeout: 8000,
    socketTimeout: 30000,
    tls: {
      rejectUnauthorized: process.env.NODE_ENV === "production",
    },
  });

  try {
    await _transporter.verify();
    console.log(`[Email] SMTP connected to ${host}:${port}`);
  } catch (err) {
    console.error("[Email] SMTP connection failed:", err);
  }

  return _transporter;
}

async function getSenderAddress(): Promise<string> {
  // Try DB config first
  const dbConfig = await getSmtpConfigFromDb();
  if (dbConfig) {
    return `"${dbConfig.fromName}" <${dbConfig.fromEmail}>`;
  }
  const name = process.env.SMTP_FROM_NAME ?? "Yukvix";
  const email = process.env.SMTP_FROM ?? process.env.SMTP_USER ?? "noreply@yukvix.com";
  return `"${name}" <${email}>`;
}

// --- HTML Email Templates -----------------------------------------------------

function passwordResetTemplate(resetUrl: string, userName: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Reset Your Password — Yukvix</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { background: #0a0a0a; font-family: 'Helvetica Neue', Arial, sans-serif; color: #e5e5e5; }
    .wrapper { max-width: 560px; margin: 40px auto; padding: 0 16px; }
    .card { background: #141414; border: 1px solid #2a2a2a; border-radius: 12px; overflow: hidden; }
    .header { background: linear-gradient(135deg, #1a0a00 0%, #2d1200 100%); padding: 32px 40px; text-align: center; border-bottom: 1px solid #3d1f00; }
    .logo { display: inline-flex; align-items: center; gap: 10px; text-decoration: none; }
    .logo-icon { width: 36px; height: 36px; background: #f97316; border-radius: 8px; display: inline-flex; align-items: center; justify-content: center; font-size: 18px; }
    .logo-text { font-size: 22px; font-weight: 700; color: #fff; letter-spacing: -0.5px; }
    .body { padding: 40px; }
    h1 { font-size: 22px; font-weight: 700; color: #fff; margin-bottom: 12px; }
    p { font-size: 15px; line-height: 1.6; color: #a3a3a3; margin-bottom: 16px; }
    .name { color: #f97316; font-weight: 600; }
    .btn-wrap { text-align: center; margin: 32px 0; }
    .btn { display: inline-block; background: #f97316; color: #fff !important; text-decoration: none; padding: 14px 36px; border-radius: 8px; font-size: 15px; font-weight: 700; letter-spacing: 0.3px; }
    .btn:hover { background: #ea6c0a; }
    .url-box { background: #1e1e1e; border: 1px solid #2a2a2a; border-radius: 6px; padding: 12px 16px; margin: 16px 0; word-break: break-all; font-size: 12px; color: #737373; font-family: monospace; }
    .warning { background: #1c1008; border: 1px solid #3d2000; border-radius: 8px; padding: 16px; margin-top: 24px; }
    .warning p { color: #a16207; margin: 0; font-size: 13px; }
    .footer { padding: 24px 40px; border-top: 1px solid #1e1e1e; text-align: center; }
    .footer p { font-size: 12px; color: #525252; margin: 0; }
    .footer a { color: #f97316; text-decoration: none; }
  </style>
</head>
<body>
  <div class="wrapper">
    <div class="card">
      <div class="header">
        <div class="logo">
          <div class="logo-icon">✦</div>
          <span class="logo-text">Yukvix</span>
        </div>
      </div>
      <div class="body">
        <h1>Reset Your Password</h1>
        <p>Hi <span class="name">${escapeHtml(userName)}</span>,</p>
        <p>We received a request to reset the password for your Yukvix account. Click the button below to choose a new password.</p>
        <div class="btn-wrap">
          <a href="${resetUrl}" class="btn">Reset My Password</a>
        </div>
        <p style="font-size:13px; color:#737373;">If the button doesn't work, copy and paste this link into your browser:</p>
        <div class="url-box">${resetUrl}</div>
        <div class="warning">
          <p>⏱ This link expires in <strong>1 hour</strong>. If you didn't request a password reset, you can safely ignore this email — your password will not change.</p>
        </div>
      </div>
      <div class="footer">
        <p>© ${new Date().getFullYear()} Yukvix · Premium Cosplay Gallery</p>
        <p style="margin-top:6px;">Need help? <a href="mailto:support@yukvix.com">support@yukvix.com</a></p>
      </div>
    </div>
  </div>
</body>
</html>`;
}

function passwordChangedTemplate(userName: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>Password Changed — Yukvix</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { background: #0a0a0a; font-family: 'Helvetica Neue', Arial, sans-serif; color: #e5e5e5; }
    .wrapper { max-width: 560px; margin: 40px auto; padding: 0 16px; }
    .card { background: #141414; border: 1px solid #2a2a2a; border-radius: 12px; overflow: hidden; }
    .header { background: linear-gradient(135deg, #0a1a0a 0%, #0d2d0d 100%); padding: 32px 40px; text-align: center; border-bottom: 1px solid #1a3d1a; }
    .logo { display: inline-flex; align-items: center; gap: 10px; }
    .logo-icon { width: 36px; height: 36px; background: #22c55e; border-radius: 8px; display: inline-flex; align-items: center; justify-content: center; font-size: 18px; }
    .logo-text { font-size: 22px; font-weight: 700; color: #fff; }
    .body { padding: 40px; }
    h1 { font-size: 22px; font-weight: 700; color: #fff; margin-bottom: 12px; }
    p { font-size: 15px; line-height: 1.6; color: #a3a3a3; margin-bottom: 16px; }
    .name { color: #22c55e; font-weight: 600; }
    .success-box { background: #0a1a0a; border: 1px solid #166534; border-radius: 8px; padding: 16px; margin: 20px 0; }
    .success-box p { color: #4ade80; margin: 0; font-size: 14px; }
    .footer { padding: 24px 40px; border-top: 1px solid #1e1e1e; text-align: center; }
    .footer p { font-size: 12px; color: #525252; margin: 0; }
    .footer a { color: #f97316; text-decoration: none; }
  </style>
</head>
<body>
  <div class="wrapper">
    <div class="card">
      <div class="header">
        <div class="logo">
          <div class="logo-icon">✓</div>
          <span class="logo-text">Yukvix</span>
        </div>
      </div>
      <div class="body">
        <h1>Password Successfully Changed</h1>
        <p>Hi <span class="name">${escapeHtml(userName)}</span>,</p>
        <p>Your Yukvix account password has been successfully updated.</p>
        <div class="success-box">
          <p>✓ Your password was changed on ${new Date().toUTCString()}</p>
        </div>
        <p>If you did not make this change, please contact our support team immediately at <a href="mailto:support@yukvix.com" style="color:#f97316;">support@yukvix.com</a> or reset your password again.</p>
      </div>
      <div class="footer">
        <p>© ${new Date().getFullYear()} Yukvix · Premium Cosplay Gallery</p>
      </div>
    </div>
  </div>
</body>
</html>`;
}

// --- Utility ------------------------------------------------------------------

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

// --- Public API ---------------------------------------------------------------

export type SendEmailResult =
  | { success: true; messageId: string; previewUrl?: string }
  | { success: false; error: string };

/**
 * Send a password reset email with a signed reset link.
 * @param to        Recipient email address
 * @param userName  Recipient's display name
 * @param resetUrl  Full URL to the reset password page (includes token)
 */
export async function sendPasswordResetEmail(
  to: string,
  userName: string,
  resetUrl: string
): Promise<SendEmailResult> {
  const result = await sendMailWithRetry({
    type: "password_reset",
    to,
    subject: "Reset Your Yukvix Password",
    html: passwordResetTemplate(resetUrl, userName),
    text: `Hi ${userName},\n\nReset your Yukvix password by visiting:\n${resetUrl}\n\nThis link expires in 1 hour.\n\nIf you didn't request this, ignore this email.`,
    metadata: { userName },
  });
  if (result.success) return { success: true, messageId: result.messageId!, previewUrl: result.previewUrl };
  return { success: false, error: result.error! };
}

/**
 * Send a confirmation email after password has been changed.
 * @param to        Recipient email address
 * @param userName  Recipient's display name
 */
export async function sendPasswordChangedEmail(
  to: string,
  userName: string
): Promise<SendEmailResult> {
  const result = await sendMailWithRetry({
    type: "password_changed",
    to,
    subject: "Your Yukvix Password Has Been Changed",
    html: passwordChangedTemplate(userName),
    text: `Hi ${userName},\n\nYour Yukvix password was successfully changed.\n\nIf you did not make this change, contact support immediately.`,
    metadata: { userName },
  });
  if (result.success) return { success: true, messageId: result.messageId!, previewUrl: result.previewUrl };
  return { success: false, error: result.error! };
}

/** Returns the Ethereal test account email (only set in dev mode). */
export function getTestAccountEmail(): string | null {
  return _testAccountEmail;
}

/**
 * Send a temporary password to a user (admin-initiated password reset).
 * @param to           Recipient email address
 * @param userName     Recipient's display name
 * @param tempPassword The generated temporary password
 */
export async function sendTempPasswordEmail(
  to: string,
  userName: string,
  tempPassword: string
): Promise<SendEmailResult & { _devPreviewUrl?: string }> {
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>Password Reset by Admin — Yukvix</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { background: #0a0a0a; font-family: 'Helvetica Neue', Arial, sans-serif; color: #e5e5e5; }
    .wrapper { max-width: 560px; margin: 40px auto; padding: 0 16px; }
    .card { background: #141414; border: 1px solid #2a2a2a; border-radius: 12px; overflow: hidden; }
    .header { background: linear-gradient(135deg, #1a0a00 0%, #2d1200 100%); padding: 32px 40px; text-align: center; border-bottom: 1px solid #3d1f00; }
    .logo-text { font-size: 22px; font-weight: 700; color: #fff; letter-spacing: -0.5px; }
    .body { padding: 40px; }
    h1 { font-size: 22px; font-weight: 700; color: #fff; margin-bottom: 12px; }
    p { font-size: 15px; line-height: 1.6; color: #a3a3a3; margin-bottom: 16px; }
    .name { color: #f97316; font-weight: 600; }
    .pass-box { background: #1a1a1a; border: 1px solid #f97316; border-radius: 8px; padding: 16px 24px; text-align: center; margin: 24px 0; }
    .pass-box code { font-size: 22px; font-weight: 700; color: #f97316; letter-spacing: 3px; font-family: monospace; }
    .warning { background: #1c1008; border: 1px solid #3d2000; border-radius: 8px; padding: 16px; margin-top: 8px; }
    .warning p { color: #a16207; margin: 0; font-size: 13px; }
    .footer { padding: 24px 40px; border-top: 1px solid #1e1e1e; text-align: center; }
    .footer p { font-size: 12px; color: #525252; margin: 0; }
  </style>
</head>
<body>
  <div class="wrapper">
    <div class="card">
      <div class="header">
        <span class="logo-text">✦ Yukvix</span>
      </div>
      <div class="body">
        <h1>Your Password Has Been Reset</h1>
        <p>Hi <span class="name">${escapeHtml(userName)}</span>,</p>
        <p>An administrator has reset your Yukvix account password. Your temporary password is:</p>
        <div class="pass-box">
          <code>${escapeHtml(tempPassword)}</code>
        </div>
        <div class="warning">
          <p>⚠️ Please log in immediately and change your password from your account settings. This temporary password should not be shared.</p>
        </div>
        <p style="margin-top:16px; font-size:13px; color:#737373;">If you did not expect this, contact support immediately at <a href="mailto:support@yukvix.com" style="color:#f97316;">support@yukvix.com</a>.</p>
      </div>
      <div class="footer">
        <p>© ${new Date().getFullYear()} Yukvix · Premium Cosplay Gallery</p>
      </div>
    </div>
  </div>
</body>
</html>`;

  const result = await sendMailWithRetry({
    type: "temp_password",
    to,
    subject: "Your Yukvix Password Has Been Reset by Admin",
    html,
    text: `Hi ${userName},\n\nAn administrator has reset your Yukvix password.\n\nTemporary password: ${tempPassword}\n\nPlease log in and change your password immediately.\n\nIf you did not expect this, contact support@yukvix.com.`,
    metadata: { userName },
  });
  if (result.success) return { success: true, messageId: result.messageId!, previewUrl: result.previewUrl, _devPreviewUrl: result.previewUrl };
  return { success: false, error: result.error! };
}


// --- Email Verification Template & Sender ------------------------------------

function emailVerificationTemplate(verifyUrl: string, userName: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Verify Your Email — Yukvix</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { background: #0a0a0a; font-family: 'Helvetica Neue', Arial, sans-serif; color: #e5e5e5; }
    .wrapper { max-width: 560px; margin: 40px auto; padding: 0 16px; }
    .card { background: #141414; border: 1px solid #2a2a2a; border-radius: 12px; overflow: hidden; }
    .header { background: linear-gradient(135deg, #1a0a00 0%, #2d1200 100%); padding: 32px 40px; text-align: center; border-bottom: 1px solid #3d1f00; }
    .logo { display: inline-flex; align-items: center; gap: 10px; text-decoration: none; }
    .logo-icon { width: 36px; height: 36px; background: #f97316; border-radius: 8px; display: inline-flex; align-items: center; justify-content: center; font-size: 18px; }
    .logo-text { font-size: 22px; font-weight: 700; color: #fff; letter-spacing: -0.5px; }
    .body { padding: 40px; }
    h1 { font-size: 22px; font-weight: 700; color: #fff; margin-bottom: 12px; }
    p { font-size: 15px; line-height: 1.6; color: #a3a3a3; margin-bottom: 16px; }
    .name { color: #f97316; font-weight: 600; }
    .btn-wrap { text-align: center; margin: 32px 0; }
    .btn { display: inline-block; background: #f97316; color: #fff !important; text-decoration: none; padding: 14px 36px; border-radius: 8px; font-size: 15px; font-weight: 700; letter-spacing: 0.3px; }
    .btn:hover { background: #ea6c0a; }
    .url-box { background: #1e1e1e; border: 1px solid #2a2a2a; border-radius: 6px; padding: 12px 16px; margin: 16px 0; word-break: break-all; font-size: 12px; color: #737373; font-family: monospace; }
    .warning { background: #1c1008; border: 1px solid #3d2000; border-radius: 8px; padding: 16px; margin-top: 24px; }
    .warning p { color: #a16207; margin: 0; font-size: 13px; }
    .footer { padding: 24px 40px; border-top: 1px solid #1e1e1e; text-align: center; }
    .footer p { font-size: 12px; color: #525252; margin: 0; }
    .footer a { color: #f97316; text-decoration: none; }
  </style>
</head>
<body>
  <div class="wrapper">
    <div class="card">
      <div class="header">
        <div class="logo">
          <div class="logo-icon">✦</div>
          <span class="logo-text">Yukvix</span>
        </div>
      </div>
      <div class="body">
        <h1>Verify Your Email</h1>
        <p>Hi <span class="name">${escapeHtml(userName)}</span>,</p>
        <p>Thanks for signing up! Please verify your email address by clicking the button below:</p>
        <div class="btn-wrap">
          <a href="${verifyUrl}" class="btn">Verify My Email</a>
        </div>
        <p style="font-size:13px; color:#737373;">If the button doesn't work, copy and paste this link into your browser:</p>
        <div class="url-box">${verifyUrl}</div>
        <div class="warning">
          <p>⏱ This link expires in <strong>24 hours</strong>. If you didn't create an account, you can safely ignore this email.</p>
        </div>
      </div>
      <div class="footer">
        <p>© ${new Date().getFullYear()} Yukvix · Premium Cosplay Gallery</p>
        <p style="margin-top:6px;">Need help? <a href="mailto:support@yukvix.com">support@yukvix.com</a></p>
      </div>
    </div>
  </div>
</body>
</html>`;
}

/**
 * Send an email verification link.
 * @param to        Recipient email address
 * @param userName  Recipient's display name
 * @param verifyUrl Full URL to the verify email page (includes token)
 */
export async function sendVerificationEmail(
  to: string,
  userName: string,
  verifyUrl: string
): Promise<SendEmailResult> {
  const result = await sendMailWithRetry({
    type: "email_verify",
    to,
    subject: "Verify Your Yukvix Email",
    html: emailVerificationTemplate(verifyUrl, userName),
    text: `Hi ${userName},\n\nVerify your Yukvix email by visiting:\n${verifyUrl}\n\nThis link expires in 24 hours.\n\nIf you didn't create an account, ignore this email.`,
    metadata: { userName },
  });
  if (result.success) return { success: true, messageId: result.messageId!, previewUrl: result.previewUrl };
  return { success: false, error: result.error! };
}


// --- VIP Expiry Reminder Template & Sender -----------------------------------

function vipExpiryReminderTemplate(
  userName: string,
  expiresAt: Date,
  daysLeft: number,
  renewUrl: string
): string {
  const expiryDateStr = expiresAt.toLocaleDateString("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "Asia/Ho_Chi_Minh",
  });
  const urgencyColor = daysLeft <= 1 ? "#ef4444" : "#f97316";
  const urgencyBg = daysLeft <= 1 ? "#1c0808" : "#1c1008";
  const urgencyBorder = daysLeft <= 1 ? "#3d0000" : "#3d2000";
  const urgencyText = daysLeft <= 1 ? "#fca5a5" : "#a16207";
  const urgencyMsg =
    daysLeft <= 1
      ? "⚠️ Your VIP will expire <strong>within 24 hours</strong>!"
      : `⏰ Your VIP has <strong>${daysLeft} days</strong> remaining.`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Your VIP is expiring soon — Yukvix</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { background: #0a0a0a; font-family: 'Helvetica Neue', Arial, sans-serif; color: #e5e5e5; }
    .wrapper { max-width: 560px; margin: 40px auto; padding: 0 16px; }
    .card { background: #141414; border: 1px solid #2a2a2a; border-radius: 12px; overflow: hidden; }
    .header { background: linear-gradient(135deg, #1a0a00 0%, #2d1200 100%); padding: 32px 40px; text-align: center; border-bottom: 1px solid #3d1f00; }
    .logo { display: inline-flex; align-items: center; gap: 10px; text-decoration: none; }
    .logo-icon { width: 36px; height: 36px; background: #f97316; border-radius: 8px; display: inline-flex; align-items: center; justify-content: center; font-size: 18px; }
    .logo-text { font-size: 22px; font-weight: 700; color: #fff; letter-spacing: -0.5px; }
    .vip-badge { display: inline-block; background: linear-gradient(135deg, #f97316, #fbbf24); color: #000; font-size: 11px; font-weight: 800; padding: 3px 10px; border-radius: 20px; letter-spacing: 1px; margin-top: 12px; text-transform: uppercase; }
    .body { padding: 40px; }
    h1 { font-size: 22px; font-weight: 700; color: #fff; margin-bottom: 12px; }
    p { font-size: 15px; line-height: 1.6; color: #a3a3a3; margin-bottom: 16px; }
    .name { color: #f97316; font-weight: 600; }
    .urgency-box { background: ${urgencyBg}; border: 1px solid ${urgencyBorder}; border-radius: 8px; padding: 16px; margin: 20px 0; }
    .urgency-box p { color: ${urgencyText}; margin: 0; font-size: 14px; }
    .expiry-info { background: #1a1a1a; border: 1px solid #2a2a2a; border-radius: 8px; padding: 16px 20px; margin: 16px 0; display: flex; justify-content: space-between; align-items: center; }
    .expiry-label { font-size: 13px; color: #737373; }
    .expiry-date { font-size: 16px; font-weight: 700; color: ${urgencyColor}; }
    .btn-wrap { text-align: center; margin: 32px 0; }
    .btn { display: inline-block; background: linear-gradient(135deg, #f97316, #fbbf24); color: #000 !important; text-decoration: none; padding: 14px 40px; border-radius: 8px; font-size: 15px; font-weight: 800; letter-spacing: 0.5px; }
    .benefits { background: #0f0f0f; border: 1px solid #1e1e1e; border-radius: 8px; padding: 16px 20px; margin: 20px 0; }
    .benefits p { color: #737373; font-size: 13px; margin-bottom: 8px; }
    .benefits ul { list-style: none; padding: 0; }
    .benefits li { font-size: 13px; color: #a3a3a3; padding: 4px 0; }
    .benefits li::before { content: "✦ "; color: #f97316; }
    .footer { padding: 24px 40px; border-top: 1px solid #1e1e1e; text-align: center; }
    .footer p { font-size: 12px; color: #525252; margin: 0; }
    .footer a { color: #f97316; text-decoration: none; }
  </style>
</head>
<body>
  <div class="wrapper">
    <div class="card">
      <div class="header">
        <div class="logo">
          <div class="logo-icon">✦</div>
          <span class="logo-text">Yukvix</span>
        </div>
        <div class="vip-badge">VIP Member</div>
      </div>
      <div class="body">
        <h1>Your VIP membership is expiring soon</h1>
        <p>Hello <span class="name">${escapeHtml(userName)}</span>,</p>
        <p>Thank you for being a VIP member of Yukvix. We want to remind you that your VIP membership is expiring soon.</p>

        <div class="urgency-box">
          <p>${urgencyMsg}</p>
        </div>

        <table style="width:100%; border-collapse:collapse; margin:16px 0;">
          <tr>
            <td style="padding:10px 16px; background:#1a1a1a; border:1px solid #2a2a2a; border-radius:8px 0 0 8px; font-size:13px; color:#737373;">Expiry Date</td>
            <td style="padding:10px 16px; background:#1a1a1a; border:1px solid #2a2a2a; border-left:none; border-radius:0 8px 8px 0; font-size:16px; font-weight:700; color:${urgencyColor}; text-align:right;">${expiryDateStr}</td>
          </tr>
        </table>

        <div class="btn-wrap">
          <a href="${renewUrl}" class="btn">Renew VIP Now</a>
        </div>

        <div class="benefits">
          <p>VIP benefits you will lose after expiry:</p>
          <ul>
            <li>View all photos in VIP albums</li>
            <li>Download albums as ZIP</li>
            <li>Access the latest exclusive content</li>
            <li>Unlimited high-quality photo viewing</li>
          </ul>
        </div>

        <p style="font-size:13px; color:#737373; text-align:center;">If you no longer wish to receive these notifications, please contact <a href="mailto:support@yukvix.com" style="color:#f97316;">support@yukvix.com</a></p>
      </div>
      <div class="footer">
        <p>© ${new Date().getFullYear()} Yukvix · Premium Cosplay Gallery</p>
        <p style="margin-top:6px;">Need help? <a href="mailto:support@yukvix.com">support@yukvix.com</a></p>
      </div>
    </div>
  </div>
</body>
</html>`;
}

/**
 * Send a VIP expiry reminder email.
 * @param to          Recipient email address
 * @param userName    Recipient's display name
 * @param expiresAt   VIP expiry date
 * @param daysLeft    Number of days remaining (for urgency styling)
 * @param renewUrl    URL to the VIP renewal/subscription page
 */
export async function sendVipExpiryReminderEmail(
  to: string,
  userName: string,
  expiresAt: Date,
  daysLeft: number,
  renewUrl: string
): Promise<SendEmailResult> {
  const subject =
    daysLeft <= 1
      ? "⚠️ Your VIP expires in 24 hours — Renew now!"
      : `⏰ Your VIP has ${daysLeft} days left — Don't let it lapse!`;
  const result = await sendMailWithRetry({
    type: "vip_expiry_reminder",
    to,
    subject,
    html: vipExpiryReminderTemplate(userName, expiresAt, daysLeft, renewUrl),
    text: `Hello ${userName},\n\nYour VIP membership on Yukvix will expire on ${expiresAt.toLocaleDateString("en-US")}.\n\nRenew now at: ${renewUrl}\n\nIf you need support, contact support@yukvix.com`,
    metadata: { userName, daysLeft, expiresAt: expiresAt.toISOString() },
  });
  if (result.success) return { success: true, messageId: result.messageId!, previewUrl: result.previewUrl };
  return { success: false, error: result.error! };
}

// ─── Admin Notification Email ─────────────────────────────────────────────────
/**
 * Send a generic notification email to the site admin (from SMTP fromEmail).
 * Used for contact form and DMCA submissions.
 */
export async function sendAdminNotificationEmail({
  subject,
  body,
}: {
  subject: string;
  body: string;
}): Promise<{ success: boolean; error?: string }> {
  const config = await getSmtpConfigFromDb();
  const adminEmail = config?.fromEmail ?? (process.env.SMTP_FROM ?? process.env.SMTP_USER ?? "admin@yukvix.com");

  const html = `
    <!DOCTYPE html>
    <html>
    <head><meta charset="UTF-8"></head>
    <body style="font-family: Arial, sans-serif; background: #0a0a0a; color: #e5e5e5; padding: 32px;">
      <div style="max-width: 600px; margin: 0 auto; background: #1a1a1a; border-radius: 8px; padding: 32px; border: 1px solid #333;">
        <div style="margin-bottom: 24px; padding-bottom: 16px; border-bottom: 1px solid #333;">
          <span style="font-size: 18px; font-weight: bold; color: #a78bfa;">Yukvix</span>
          <span style="font-size: 12px; color: #888; margin-left: 12px;">Admin Notification</span>
        </div>
        <div style="color: #e5e5e5; line-height: 1.6;">${body}</div>
        <div style="margin-top: 24px; padding-top: 16px; border-top: 1px solid #333; font-size: 12px; color: #666;">
          This is an automated notification from Yukvix.
        </div>
      </div>
    </body>
    </html>
  `;

  const result = await sendMailWithRetry({
    type: "admin_notification",
    to: adminEmail,
    subject,
    html,
    text: body.replace(/<[^>]+>/g, ""),
  });

  return result.success
    ? { success: true }
    : { success: false, error: result.error };
}
