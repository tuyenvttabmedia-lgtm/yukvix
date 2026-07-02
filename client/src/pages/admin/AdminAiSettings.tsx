/**
 * Admin AI Settings Page
 * Route: /admin/settings/ai
 *
 * Allows admin to configure AI provider, API key, model, and prompt version
 * without database access. Supports OpenAI, OpenRouter, and Gemini.
 *
 * Actions:
 * - Validate API Key: calls provider's /models endpoint to verify key
 * - Test SEO Generation: runs generateSeoData with a sample filename
 * - Clear AI Cache: deletes seo_cache table + invalidates in-memory config cache
 */

import { useState } from "react";
import { trpc } from "@/lib/trpc";
import AdminLayout from "./AdminLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import {
  Bot,
  CheckCircle2,
  XCircle,
  Loader2,
  Eye,
  EyeOff,
  FlaskConical,
  Trash2,
  Save,
  AlertTriangle,
  Info,
} from "lucide-react";

const PROVIDERS = [
  {
    id: "openrouter" as const,
    label: "OpenRouter",
    description: "Access 100+ models via unified API. Recommended.",
    defaultModel: "google/gemini-2.0-flash-exp:free",
    modelPlaceholder: "google/gemini-2.0-flash-exp:free",
    docsUrl: "https://openrouter.ai/keys",
  },
  {
    id: "openai" as const,
    label: "OpenAI",
    description: "GPT-4o, GPT-4o-mini, etc.",
    defaultModel: "gpt-4o-mini",
    modelPlaceholder: "gpt-4o-mini",
    docsUrl: "https://platform.openai.com/api-keys",
  },
  {
    id: "gemini" as const,
    label: "Google Gemini",
    description: "Gemini 2.0 Flash, Pro, etc. via OpenAI-compatible API.",
    defaultModel: "gemini-2.0-flash-exp",
    modelPlaceholder: "gemini-2.0-flash-exp",
    docsUrl: "https://aistudio.google.com/app/apikey",
  },
];

export default function AdminAiSettings() {
  const { data: currentConfig, isLoading: configLoading, refetch } = trpc.zipImport.getAiConfig.useQuery();

  const [provider, setProvider] = useState<"openrouter" | "openai" | "gemini">("openrouter");
  const [apiKey, setApiKey] = useState("");
  const [model, setModel] = useState("");
  const [promptVersion, setPromptVersion] = useState("v4.17");
  const [showApiKey, setShowApiKey] = useState(false);
  const [testFilename, setTestFilename] = useState("XIUREN No.11299 白小蝶.zip");

  // Sync form with loaded config
  const [initialized, setInitialized] = useState(false);
  if (currentConfig && !initialized) {
    setProvider(currentConfig.provider as "openrouter" | "openai" | "gemini");
    setModel(currentConfig.model || "");
    setInitialized(true);
  }

  const updateConfig = trpc.zipImport.updateAiConfig.useMutation({
    onSuccess: () => {
      toast.success("AI settings saved successfully");
      refetch();
    },
    onError: (err) => toast.error(`Save failed: ${err.message}`),
  });

  const validateKey = trpc.zipImport.validateApiKey.useMutation({
    onSuccess: (result) => {
      if (result.valid) {
        toast.success(`API key valid! Found ${result.models.length} models.`);
        setValidatedModels(result.models);
      } else {
        toast.error(`API key invalid: ${result.error}`);
        setValidatedModels([]);
      }
    },
    onError: (err) => toast.error(`Validation error: ${err.message}`),
  });

  const testSeo = trpc.zipImport.testSeoGeneration.useMutation({
    onSuccess: (result) => {
      if (result.success && result.seo) {
        toast.success("SEO generation test passed!");
        setTestResult(result.seo);
      } else {
        toast.error(`SEO test failed: ${result.error}`);
        setTestResult(null);
      }
    },
    onError: (err) => toast.error(`Test error: ${err.message}`),
  });

  const clearCache = trpc.zipImport.clearAiCache.useMutation({
    onSuccess: () => toast.success("AI cache cleared successfully"),
    onError: (err) => toast.error(`Clear cache failed: ${err.message}`),
  });

  const [validatedModels, setValidatedModels] = useState<string[]>([]);
  const [testResult, setTestResult] = useState<Record<string, unknown> | null>(null);

  const selectedProvider = PROVIDERS.find((p) => p.id === provider) || PROVIDERS[0];

  const handleSave = () => {
    if (!apiKey.trim()) {
      toast.error("API key is required");
      return;
    }
    if (!model.trim()) {
      toast.error("Model name is required");
      return;
    }
    updateConfig.mutate({ provider, apiKey: apiKey.trim(), model: model.trim(), promptVersion });
  };

  const handleValidate = () => {
    if (!apiKey.trim()) {
      toast.error("Enter an API key first");
      return;
    }
    validateKey.mutate({ provider, apiKey: apiKey.trim() });
  };

  const handleTest = () => {
    if (!testFilename.trim()) {
      toast.error("Enter a test filename");
      return;
    }
    testSeo.mutate({ filename: testFilename.trim() });
  };

  return (
    <AdminLayout>
      <div className="p-6 max-w-3xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
            <Bot className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-foreground">AI Settings</h1>
            <p className="text-sm text-muted-foreground">
              Configure AI provider for SEO generation. Changes take effect immediately.
            </p>
          </div>
        </div>

        {/* Current Status */}
        {configLoading ? (
          <Card>
            <CardContent className="py-6 flex items-center gap-2 text-muted-foreground">
              <Loader2 className="w-4 h-4 animate-spin" />
              Loading current configuration...
            </CardContent>
          </Card>
        ) : currentConfig ? (
          <Card className="border-border/50">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
                Current Configuration
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-3">
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">Provider:</span>
                <Badge variant="secondary">{currentConfig.provider}</Badge>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">Model:</span>
                <Badge variant="secondary" className="font-mono text-xs">{currentConfig.model}</Badge>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">API Key:</span>
                {currentConfig.apiKeyConfigured ? (
                  <Badge variant="default" className="bg-green-500/20 text-green-600 border-green-500/30">
                    <CheckCircle2 className="w-3 h-3 mr-1" /> Configured
                  </Badge>
                ) : (
                  <Badge variant="destructive" className="bg-red-500/20 text-red-600 border-red-500/30">
                    <XCircle className="w-3 h-3 mr-1" /> Not set
                  </Badge>
                )}
              </div>
            </CardContent>
          </Card>
        ) : null}

        {/* Provider Selection */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Provider</CardTitle>
            <CardDescription>Select the AI provider for SEO generation.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {PROVIDERS.map((p) => (
                <button
                  key={p.id}
                  onClick={() => {
                    setProvider(p.id);
                    if (!model) setModel(p.defaultModel);
                  }}
                  className={`p-3 rounded-lg border text-left transition-all ${
                    provider === p.id
                      ? "border-primary bg-primary/5 ring-1 ring-primary/30"
                      : "border-border/50 hover:border-border hover:bg-secondary/50"
                  }`}
                >
                  <div className="font-medium text-sm text-foreground">{p.label}</div>
                  <div className="text-xs text-muted-foreground mt-0.5 leading-tight">{p.description}</div>
                </button>
              ))}
            </div>
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Info className="w-3.5 h-3.5 shrink-0" />
              Get your API key from{" "}
              <a
                href={selectedProvider.docsUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary hover:underline"
              >
                {selectedProvider.docsUrl}
              </a>
            </div>
          </CardContent>
        </Card>

        {/* API Key + Model */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Credentials & Model</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* API Key */}
            <div className="space-y-1.5">
              <Label htmlFor="apiKey">API Key</Label>
              <div className="relative">
                <Input
                  id="apiKey"
                  type={showApiKey ? "text" : "password"}
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder={`Enter ${selectedProvider.label} API key`}
                  className="pr-10 font-mono text-sm"
                />
                <button
                  type="button"
                  onClick={() => setShowApiKey((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {showApiKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              <p className="text-xs text-muted-foreground">
                {currentConfig?.apiKeyConfigured
                  ? "A key is already saved. Leave blank to keep existing key, or enter a new one to replace it."
                  : "No API key configured. Enter your key to enable AI SEO generation."}
              </p>
            </div>

            {/* Model */}
            <div className="space-y-1.5">
              <Label htmlFor="model">Model</Label>
              <Input
                id="model"
                value={model}
                onChange={(e) => setModel(e.target.value)}
                placeholder={selectedProvider.modelPlaceholder}
                className="font-mono text-sm"
              />
              <p className="text-xs text-muted-foreground">
                Default for {selectedProvider.label}: <code className="bg-secondary px-1 rounded">{selectedProvider.defaultModel}</code>
              </p>
            </div>

            {/* Prompt Version */}
            <div className="space-y-1.5">
              <Label htmlFor="promptVersion">Prompt Version</Label>
              <Input
                id="promptVersion"
                value={promptVersion}
                onChange={(e) => setPromptVersion(e.target.value)}
                placeholder="v4.17"
                className="font-mono text-sm max-w-[120px]"
              />
              <p className="text-xs text-muted-foreground">
                Changing this invalidates all cached SEO results (forces re-generation).
              </p>
            </div>

            {/* Validate + Save buttons */}
            <div className="flex gap-2 pt-1">
              <Button
                variant="outline"
                size="sm"
                onClick={handleValidate}
                disabled={validateKey.isPending || !apiKey.trim()}
              >
                {validateKey.isPending ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <CheckCircle2 className="w-4 h-4 mr-2" />
                )}
                Validate API Key
              </Button>
              <Button
                size="sm"
                onClick={handleSave}
                disabled={updateConfig.isPending}
              >
                {updateConfig.isPending ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Save className="w-4 h-4 mr-2" />
                )}
                Save Settings
              </Button>
            </div>

            {/* Validated models list */}
            {validatedModels.length > 0 && (
              <div className="mt-2 p-3 rounded-lg bg-green-500/5 border border-green-500/20">
                <p className="text-xs font-medium text-green-600 mb-2">
                  <CheckCircle2 className="w-3.5 h-3.5 inline mr-1" />
                  API key valid — {validatedModels.length} models available:
                </p>
                <div className="flex flex-wrap gap-1">
                  {validatedModels.slice(0, 10).map((m) => (
                    <button
                      key={m}
                      onClick={() => setModel(m)}
                      className="text-xs font-mono bg-secondary hover:bg-secondary/80 px-2 py-0.5 rounded border border-border/50 transition-colors"
                    >
                      {m}
                    </button>
                  ))}
                  {validatedModels.length > 10 && (
                    <span className="text-xs text-muted-foreground px-2 py-0.5">
                      +{validatedModels.length - 10} more
                    </span>
                  )}
                </div>
                <p className="text-xs text-muted-foreground mt-1">Click a model to select it.</p>
              </div>
            )}
          </CardContent>
        </Card>

        <Separator />

        {/* Test SEO Generation */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <FlaskConical className="w-4 h-4 text-primary" />
              Test SEO Generation
            </CardTitle>
            <CardDescription>
              Run a live SEO generation test with the current configuration. Bypasses cache.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex gap-2">
              <Input
                value={testFilename}
                onChange={(e) => setTestFilename(e.target.value)}
                placeholder="e.g. XIUREN No.11299 白小蝶.zip"
                className="font-mono text-sm"
              />
              <Button
                variant="outline"
                onClick={handleTest}
                disabled={testSeo.isPending || !testFilename.trim()}
                className="shrink-0"
              >
                {testSeo.isPending ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <FlaskConical className="w-4 h-4" />
                )}
                <span className="ml-2">Test</span>
              </Button>
            </div>

            {testResult && (
              <div className="mt-2 p-3 rounded-lg bg-secondary/50 border border-border/50 space-y-2">
                <p className="text-xs font-medium text-green-600 flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5" /> SEO generation successful
                </p>
                <div className="grid grid-cols-1 gap-1.5 text-xs">
                  {[
                    ["Title", testResult.albumTitle as string],
                    ["SEO Title", testResult.seoTitle as string],
                    ["Meta Description", testResult.metaDescription as string],
                    ["Focus Keyword", testResult.focusKeyword as string],
                    ["Category", testResult.category as string],
                    ["Creator", testResult.creator as string],
                    ["Slug", testResult.slug as string],
                  ].map(([label, value]) => (
                    <div key={label} className="flex gap-2">
                      <span className="text-muted-foreground w-28 shrink-0">{label}:</span>
                      <span className="text-foreground font-medium break-all">{value || "—"}</span>
                    </div>
                  ))}
                  <div className="flex gap-2">
                    <span className="text-muted-foreground w-28 shrink-0">Tags:</span>
                    <div className="flex flex-wrap gap-1">
                      {(testResult.tags as string[] || []).map((t) => (
                        <Badge key={t} variant="secondary" className="text-xs">{t}</Badge>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {testSeo.isError && (
              <div className="p-3 rounded-lg bg-red-500/5 border border-red-500/20 text-xs text-red-600 flex items-start gap-2">
                <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                {testSeo.error?.message}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Clear Cache */}
        <Card className="border-destructive/20">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2 text-destructive">
              <Trash2 className="w-4 h-4" />
              Clear AI Cache
            </CardTitle>
            <CardDescription>
              Deletes all cached SEO results from the database and resets the in-memory config cache.
              Use this after changing the prompt version or when SEO output quality degrades.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button
              variant="destructive"
              size="sm"
              onClick={() => clearCache.mutate()}
              disabled={clearCache.isPending}
            >
              {clearCache.isPending ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Trash2 className="w-4 h-4 mr-2" />
              )}
              Clear AI Cache
            </Button>
            <p className="text-xs text-muted-foreground mt-2">
              This only clears the SEO cache. It does not affect albums or import jobs.
            </p>
          </CardContent>
        </Card>
      </div>
    </AdminLayout>
  );
}
