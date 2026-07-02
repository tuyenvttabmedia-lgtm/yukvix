/**
 * AI Provider Service (V4.17)
 * Standalone external AI provider — does NOT use Manus invokeLLM.
 * Supports: OpenRouter (recommended), OpenAI, Gemini (via OpenAI-compatible API).
 *
 * Config is read from admin_settings table (key: 'ai_provider_config').
 * Falls back to ENV vars when DB config is absent.
 *
 * ENV fallbacks:
 *   AI_PROVIDER=openrouter|openai|gemini (default: openrouter)
 *   AI_API_KEY=<your key>
 *   AI_MODEL=google/gemini-2.0-flash-exp (default for openrouter)
 */

import { getDb } from "../db";
import { adminSettings } from "../../drizzle/schema";
import { eq } from "drizzle-orm";

export interface AiProviderConfig {
  provider: "openrouter" | "openai" | "gemini";
  apiKey: string;
  model: string;
  baseUrl?: string;
}

export interface AiMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface AiCompletionOptions {
  messages: AiMessage[];
  temperature?: number;
  maxTokens?: number;
  responseFormat?: { type: "json_object" } | { type: "json_schema"; json_schema: Record<string, unknown> };
}

export interface AiCompletionResult {
  content: string;
  model: string;
  usage?: { promptTokens: number; completionTokens: number; totalTokens: number };
}

// Provider endpoint map
const PROVIDER_ENDPOINTS: Record<string, string> = {
  openrouter: "https://openrouter.ai/api/v1",
  openai: "https://api.openai.com/v1",
  gemini: "https://generativelanguage.googleapis.com/v1beta/openai",
};

// Default models per provider
const DEFAULT_MODELS: Record<string, string> = {
  openrouter: "google/gemini-2.0-flash-exp:free",
  openai: "gpt-4o-mini",
  gemini: "gemini-2.0-flash-exp",
};

// Cache config for 5 minutes to avoid DB hit on every SEO call
let _configCache: AiProviderConfig | null = null;
let _configCacheExpiry = 0;

/**
 * Load AI provider config from admin_settings, with ENV fallback.
 */
export async function getAiProviderConfig(): Promise<AiProviderConfig> {
  const now = Date.now();
  if (_configCache && now < _configCacheExpiry) return _configCache;

  try {
    const db = await getDb();
    if (!db) throw new Error("DB not available");
    const rows = await db
      .select()
      .from(adminSettings)
      .where(eq(adminSettings.key, "ai_provider_config"))
      .limit(1);

    if (rows.length > 0 && rows[0].value) {
      const cfg = JSON.parse(rows[0].value) as Partial<AiProviderConfig>;
      if (cfg.apiKey && cfg.provider) {
        _configCache = {
          provider: cfg.provider,
          apiKey: cfg.apiKey,
          model: cfg.model || DEFAULT_MODELS[cfg.provider] || "google/gemini-2.0-flash-exp:free",
          baseUrl: cfg.baseUrl,
        };
        _configCacheExpiry = now + 5 * 60 * 1000;
        return _configCache;
      }
    }
  } catch {
    // DB not ready — fall through to ENV
  }

  // ENV fallback
  const provider = (process.env.AI_PROVIDER || "openrouter") as AiProviderConfig["provider"];
  _configCache = {
    provider,
    apiKey: process.env.AI_API_KEY || "",
    model: process.env.AI_MODEL || DEFAULT_MODELS[provider] || "google/gemini-2.0-flash-exp:free",
  };
  _configCacheExpiry = now + 5 * 60 * 1000;
  return _configCache;
}

/**
 * Invalidate config cache (call after saving new AI provider settings).
 */
export function invalidateAiConfigCache(): void {
  _configCache = null;
  _configCacheExpiry = 0;
}

/**
 * Call AI provider with OpenAI-compatible chat completions API.
 * Throws on network error or non-2xx response.
 */
export async function callAi(options: AiCompletionOptions): Promise<AiCompletionResult> {
  const config = await getAiProviderConfig();

  if (!config.apiKey) {
    throw new Error(
      "AI provider API key not configured. Set AI_API_KEY env var or configure in Admin → Settings → AI Provider."
    );
  }

  const baseUrl = config.baseUrl || PROVIDER_ENDPOINTS[config.provider] || PROVIDER_ENDPOINTS.openrouter;
  const url = `${baseUrl}/chat/completions`;

  const body: Record<string, unknown> = {
    model: config.model,
    messages: options.messages,
    temperature: options.temperature ?? 0.7,
    max_tokens: options.maxTokens ?? 2048,
  };

  if (options.responseFormat) {
    body.response_format = options.responseFormat;
  }

  // OpenRouter-specific headers
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${config.apiKey}`,
  };
  if (config.provider === "openrouter") {
    headers["HTTP-Referer"] = process.env.SITE_URL || "https://yukvix.com";
    headers["X-Title"] = "Yukvix CosplayVault";
  }

  const response = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(60_000), // 60s timeout
  });

  if (!response.ok) {
    const errText = await response.text().catch(() => "unknown error");
    throw new Error(`AI provider error ${response.status}: ${errText}`);
  }

  const data = await response.json() as {
    choices: Array<{ message: { content: string } }>;
    model: string;
    usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
  };

  const content = data.choices?.[0]?.message?.content ?? "";
  return {
    content,
    model: data.model || config.model,
    usage: data.usage
      ? {
          promptTokens: data.usage.prompt_tokens,
          completionTokens: data.usage.completion_tokens,
          totalTokens: data.usage.total_tokens,
        }
      : undefined,
  };
}

/**
 * Save AI provider config to admin_settings.
 */
export async function saveAiProviderConfig(cfg: AiProviderConfig): Promise<void> {
  const value = JSON.stringify(cfg);
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db
    .insert(adminSettings)
    .values({ key: "ai_provider_config", value })
    .onDuplicateKeyUpdate({ set: { value, updatedAt: new Date() } });
  invalidateAiConfigCache();
}
