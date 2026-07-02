/**
 * Admin SMTP Settings Router
 * Allows admin to configure, test, and manage SMTP settings stored in DB.
 */
import { z } from "zod";
import { router, adminProcedure } from "../_core/trpc";
import { getDb } from "../db";
import { smtpSettings } from "../../drizzle/schema";
import { eq } from "drizzle-orm";
import {
  getSmtpConfigFromDb,
  testSmtpConnection,
  invalidateEmailTransporter,
  type SmtpConfig,
} from "../email";

export const smtpRouter = router({
  /**
   * Get current SMTP settings (password masked).
   */
  getSettings: adminProcedure.query(async () => {
    const db = await getDb();
    if (!db) return null;
    const [settings] = await db.select().from(smtpSettings).limit(1);
    if (!settings) return null;
    return {
      id: settings.id,
      host: settings.host,
      port: settings.port,
      secure: settings.secure,
      user: settings.user,
      password: settings.password ? "••••••••" : "",
      fromName: settings.fromName,
      fromEmail: settings.fromEmail,
      enabled: settings.enabled,
      updatedAt: settings.updatedAt,
    };
  }),

  /**
   * Save/update SMTP settings.
   */
  saveSettings: adminProcedure
    .input(
      z.object({
        host: z.string().min(1, "Host is required"),
        port: z.number().int().min(1).max(65535),
        secure: z.boolean(),
        user: z.string().min(1, "Username is required"),
        password: z.string().min(1, "Password is required"),
        fromName: z.string().min(1, "From name is required"),
        fromEmail: z.string().email("Invalid from email"),
        enabled: z.boolean().default(true),
      })
    )
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      const [existing] = await db.select({ id: smtpSettings.id }).from(smtpSettings).limit(1);

      if (existing) {
        // Update: only update password if it's not the masked placeholder
        const updateData: Record<string, any> = {
          host: input.host,
          port: input.port,
          secure: input.secure,
          user: input.user,
          fromName: input.fromName,
          fromEmail: input.fromEmail,
          enabled: input.enabled,
        };
        // Only update password if it's not the masked value
        if (input.password !== "••••••••") {
          updateData.password = input.password;
        }
        await db.update(smtpSettings).set(updateData).where(eq(smtpSettings.id, existing.id));
      } else {
        // Insert new
        await db.insert(smtpSettings).values({
          host: input.host,
          port: input.port,
          secure: input.secure,
          user: input.user,
          password: input.password,
          fromName: input.fromName,
          fromEmail: input.fromEmail,
          enabled: input.enabled,
        });
      }

      // Invalidate cached transporter so next email uses new settings
      invalidateEmailTransporter();

      return { success: true };
    }),

  /**
   * Test SMTP connection without saving.
   */
  testConnection: adminProcedure
    .input(
      z.object({
        host: z.string().min(1),
        port: z.number().int().min(1).max(65535),
        secure: z.boolean(),
        user: z.string().min(1),
        password: z.string().min(1),
      })
    )
    .mutation(async ({ input }) => {
      // If password is masked, use the stored password
      let password = input.password;
      if (password === "••••••••") {
        const config = await getSmtpConfigFromDb();
        if (config) {
          password = config.password;
        } else {
          return { success: false, error: "No stored password found. Please enter the password." };
        }
      }

      const result = await testSmtpConnection({
        host: input.host,
        port: input.port,
        secure: input.secure,
        user: input.user,
        password,
        fromName: "",
        fromEmail: "",
      });

      return result;
    }),
});

// Re-export the smtpRouter with email log/queue procedures added via a separate router
// (keeping smtp.ts focused on SMTP config; email logs live in a separate router file)
