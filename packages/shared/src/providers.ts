// LLM Provider Framework — multi-provider, secure, stub-safe.
//
// Extends the Wave 0 ModelAdapter seam (model.ts) to Anthropic / OpenAI / Gemini /
// OpenRouter / Local-Ollama, with per-task provider+model selection and three run
// modes (stub / live / replay). NO secrets are ever returned, logged, or exposed.
// Keys come only from env (Render); when missing, providers fail GRACEFULLY with a
// safe status — the app never crashes unless a provider is explicitly required.

import {
  type ModelAdapter,
  type CompleteOpts,
  type CompleteResult,
  type TokenUsage,
  type ModelTier,
  type ToolAdapter,
  type ToolResult,
  deterministicAdapter,
  anthropicAdapter,
  stubTool,
  estTokens,
  resolveModelTimeoutMs,
} from "./model";

export type Provider = "anthropic" | "openai" | "gemini" | "openrouter" | "ollama" | "deterministic";
export type LLMMode = "stub" | "live" | "replay";

export const ALL_PROVIDERS: Provider[] = ["anthropic", "openai", "gemini", "openrouter", "ollama"];

// Which env var configures each provider (key, or base URL for local Ollama).
export const PROVIDER_ENV: Record<Exclude<Provider, "deterministic">, string> = {
  anthropic: "ANTHROPIC_API_KEY",
  openai: "OPENAI_API_KEY",
  gemini: "GEMINI_API_KEY",
  openrouter: "OPENROUTER_API_KEY",
  ollama: "OLLAMA_BASE_URL",
};

type Env = Record<string, string | undefined>;

// ---------------------------------------------------------------------------
// Run mode. Explicit LLM_MODE wins; otherwise infer: any key present => live,
// else stub (so the sandbox/CI never needs a key and never makes a real call).
// ---------------------------------------------------------------------------
export function llmMode(env: Env = process.env): LLMMode {
  const m = (env.LLM_MODE || "").toLowerCase();
  if (m === "stub" || m === "live" || m === "replay") return m;
  const anyKey = ALL_PROVIDERS.some((p) => providerConfigured(p, env).configured);
  return anyKey ? "live" : "stub";
}

export interface ProviderStatus {
  configured: boolean;
  reason?: string; // safe reason only, e.g. "missing_env_var"
  models_available?: boolean;
}

export function providerConfigured(provider: Provider, env: Env = process.env): ProviderStatus {
  if (provider === "deterministic") return { configured: true, models_available: true };
  const key = PROVIDER_ENV[provider];
  const val = env[key];
  if (!val) return { configured: false, reason: "missing_env_var" };
  return { configured: true, models_available: true };
}

// ---------------------------------------------------------------------------
// Provider adapters (fetch-based, no SDKs). OpenAI / OpenRouter / Ollama share the
// OpenAI-compatible Chat Completions shape. Auth headers + keys are NEVER logged;
// errors are redacted to status + a short, key-free detail.
// ---------------------------------------------------------------------------
function redact(s: string): string {
  return (s || "").replace(/(sk-[A-Za-z0-9_-]{6})[A-Za-z0-9_-]+/g, "$1…").slice(0, 200);
}

function openAICompatibleAdapter(cfg: { provider: Provider; baseUrl: string; apiKey?: string; model: string }): ModelAdapter {
  return {
    provider: cfg.provider,
    model: cfg.model,
    async complete(opts: CompleteOpts): Promise<CompleteResult> {
      const headers: Record<string, string> = { "content-type": "application/json" };
      if (cfg.apiKey) headers.authorization = `Bearer ${cfg.apiKey}`;
      if (cfg.provider === "openrouter") headers["http-referer"] = "https://indigold.app";
      const messages = [
        ...(opts.system ? [{ role: "system", content: opts.system + (opts.json ? "\nRespond with ONLY valid JSON." : "") }] : []),
        { role: "user", content: opts.prompt },
      ];
      let res: Response;
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), resolveModelTimeoutMs());
      try {
        res = await fetch(`${cfg.baseUrl.replace(/\/+$/, "")}/chat/completions`, {
          method: "POST",
          headers,
          body: JSON.stringify({
            model: cfg.model,
            messages,
            max_tokens: opts.maxTokens ?? 1024,
            temperature: opts.temperature ?? 0.2,
            ...(opts.json ? { response_format: { type: "json_object" } } : {}),
          }),
          signal: ctrl.signal,
        });
      } catch (e) {
        throw new Error(ctrl.signal.aborted ? `${cfg.provider}_timeout` : `${cfg.provider}_network: ${redact(e instanceof Error ? e.message : "")}`);
      } finally {
        clearTimeout(timer);
      }
      if (!res.ok) throw new Error(`${cfg.provider}_${res.status}: ${redact(await res.text().catch(() => ""))}`);
      const j = (await res.json()) as { choices?: { message?: { content?: string } }[]; usage?: { prompt_tokens?: number; completion_tokens?: number } };
      const text = j.choices?.[0]?.message?.content ?? "";
      return { text, usage: { input: j.usage?.prompt_tokens ?? estTokens(opts.prompt), output: j.usage?.completion_tokens ?? estTokens(text) }, model: cfg.model };
    },
    async embed() {
      throw new Error(`${cfg.provider}_embed_not_wired`);
    },
  };
}

function geminiAdapter(apiKey: string, model: string): ModelAdapter {
  return {
    provider: "gemini",
    model,
    async complete(opts: CompleteOpts): Promise<CompleteResult> {
      // Key goes in a header (x-goog-api-key), never the URL/logs.
      let res: Response;
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), resolveModelTimeoutMs());
      try {
        res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
          method: "POST",
          headers: { "content-type": "application/json", "x-goog-api-key": apiKey },
          body: JSON.stringify({
            systemInstruction: opts.system ? { parts: [{ text: opts.system + (opts.json ? "\nRespond with ONLY valid JSON." : "") }] } : undefined,
            contents: [{ role: "user", parts: [{ text: opts.prompt }] }],
            generationConfig: { maxOutputTokens: opts.maxTokens ?? 1024, temperature: opts.temperature ?? 0.2 },
          }),
          signal: ctrl.signal,
        });
      } catch (e) {
        throw new Error(ctrl.signal.aborted ? "gemini_timeout" : `gemini_network: ${redact(e instanceof Error ? e.message : "")}`);
      } finally {
        clearTimeout(timer);
      }
      if (!res.ok) throw new Error(`gemini_${res.status}: ${redact(await res.text().catch(() => ""))}`);
      const j = (await res.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[]; usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number } };
      const text = (j.candidates?.[0]?.content?.parts || []).map((p) => p.text || "").join("");
      return { text, usage: { input: j.usageMetadata?.promptTokenCount ?? estTokens(opts.prompt), output: j.usageMetadata?.candidatesTokenCount ?? estTokens(text) }, model };
    },
    async embed() {
      throw new Error("gemini_embed_not_wired");
    },
  };
}

/** Build a live adapter for a provider+model. Throws (graceful, redacted) when the
 *  required env var is missing — callers decide whether to require it. */
export function makeLiveAdapter(provider: Provider, model: string, env: Env = process.env): ModelAdapter {
  switch (provider) {
    case "deterministic":
      return deterministicAdapter(model);
    case "anthropic": {
      const key = env.ANTHROPIC_API_KEY;
      if (!key) throw new Error("anthropic_provider_not_configured: missing ANTHROPIC_API_KEY");
      return anthropicAdapter(key, model);
    }
    case "openai": {
      const key = env.OPENAI_API_KEY;
      if (!key) throw new Error("openai_provider_not_configured: missing OPENAI_API_KEY");
      return openAICompatibleAdapter({ provider, baseUrl: "https://api.openai.com/v1", apiKey: key, model });
    }
    case "openrouter": {
      const key = env.OPENROUTER_API_KEY;
      if (!key) throw new Error("openrouter_provider_not_configured: missing OPENROUTER_API_KEY");
      return openAICompatibleAdapter({ provider, baseUrl: "https://openrouter.ai/api/v1", apiKey: key, model });
    }
    case "gemini": {
      const key = env.GEMINI_API_KEY;
      if (!key) throw new Error("gemini_provider_not_configured: missing GEMINI_API_KEY");
      return geminiAdapter(key, model);
    }
    case "ollama": {
      const base = env.OLLAMA_BASE_URL;
      if (!base) throw new Error("ollama_provider_not_configured: missing OLLAMA_BASE_URL");
      return openAICompatibleAdapter({ provider, baseUrl: `${base.replace(/\/+$/, "")}/v1`, model });
    }
  }
}

// ---------------------------------------------------------------------------
// Per-task provider + model selection (config-driven, env overrides).
// ---------------------------------------------------------------------------
export type TaskType = "classification" | "synthesis" | "research" | "planning";

export interface TaskModel {
  task: TaskType;
  provider: Provider;
  model: string;
  maxTokens: number;
  temperature: number;
  tier: ModelTier; // cost tier used for budgeting
}

// Defaults keep Anthropic first-class but the architecture is provider-agnostic.
const TASK_DEFAULTS: Record<TaskType, { tier: ModelTier; maxTokens: number; temperature: number; model: Partial<Record<Provider, string>> }> = {
  classification: { tier: "cheap", maxTokens: 800, temperature: 0.1, model: { anthropic: "claude-haiku-4-5-20251001", openai: "gpt-4o-mini", openrouter: "anthropic/claude-3.5-haiku", gemini: "gemini-1.5-flash", ollama: "llama3.1" } },
  synthesis: { tier: "strong", maxTokens: 3000, temperature: 0.3, model: { anthropic: "claude-sonnet-4-6", openai: "gpt-4o", openrouter: "anthropic/claude-3.5-sonnet", gemini: "gemini-1.5-pro", ollama: "llama3.1:70b" } },
  research: { tier: "strong", maxTokens: 3000, temperature: 0.2, model: { anthropic: "claude-sonnet-4-6", openai: "gpt-4o", openrouter: "perplexity/sonar", gemini: "gemini-1.5-pro", ollama: "llama3.1:70b" } },
  planning: { tier: "strong", maxTokens: 3000, temperature: 0.3, model: { anthropic: "claude-sonnet-4-6", openai: "gpt-4o", openrouter: "anthropic/claude-3.5-sonnet", gemini: "gemini-1.5-pro", ollama: "llama3.1:70b" } },
};

const TASK_ENV: Record<TaskType, string> = {
  classification: "LLM_CLASSIFICATION_PROVIDER",
  synthesis: "LLM_SYNTHESIS_PROVIDER",
  research: "LLM_RESEARCH_PROVIDER",
  planning: "LLM_PLANNING_PROVIDER",
};

export function defaultProvider(env: Env = process.env): Provider {
  // Accept LLM_PROVIDER (the documented Render var) as an alias of LLM_DEFAULT_PROVIDER.
  const p = (env.LLM_DEFAULT_PROVIDER || env.LLM_PROVIDER || "anthropic") as Provider;
  return ([...ALL_PROVIDERS, "deterministic"] as Provider[]).includes(p) ? p : "anthropic";
}

export function resolveTask(task: TaskType, env: Env = process.env): TaskModel {
  const d = TASK_DEFAULTS[task];
  const provider = ((env[TASK_ENV[task]] as Provider) || defaultProvider(env)) as Provider;
  const modelOverride = env[`LLM_${task.toUpperCase()}_MODEL`];
  const model = modelOverride || d.model[provider] || d.model.anthropic || "claude-haiku-4-5-20251001";
  return { task, provider, model, maxTokens: d.maxTokens, temperature: d.temperature, tier: d.tier };
}

/** Resolve the adapter for a task honoring LLM_MODE.
 *  - stub:   deterministic (no network) — for tests/sandbox.
 *  - live:   real provider; throws (redacted) if the provider's key is missing.
 *  - replay: deterministic-with-fixtures hook (recorded golden responses). */
export function getTaskAdapter(task: TaskType, env: Env = process.env, mode: LLMMode = llmMode(env)): { adapter: ModelAdapter; resolved: TaskModel; mode: LLMMode } {
  const resolved = resolveTask(task, env);
  if (mode === "stub" || mode === "replay") {
    // replay uses the same deterministic seam; a recorded-fixtures layer can wrap it.
    return { adapter: deterministicAdapter(resolved.model), resolved, mode };
  }
  return { adapter: makeLiveAdapter(resolved.provider, resolved.model, env), resolved, mode };
}

// ---------------------------------------------------------------------------
// Tool adapters (Wave 2). GitHub REST is the first real one (repos are a primary
// input). Token-optional (GITHUB_TOKEN raises rate limits); fails gracefully
// offline. arXiv/YouTube/Gmail/Notion are future adapters behind ToolAdapter.
// ---------------------------------------------------------------------------
export function makeGithubTool(env: Env = process.env): ToolAdapter {
  const token = env.GITHUB_TOKEN;
  const headers: Record<string, string> = { accept: "application/vnd.github+json", "user-agent": "indigold-radian" };
  if (token) headers.authorization = `Bearer ${token}`;
  return {
    name: "github",
    async run(input): Promise<ToolResult> {
      const action = String(input.action || "repo");
      const owner = String(input.owner || "");
      const repo = String(input.repo || "");
      if (!owner || !repo) return { ok: false, error: "github_missing_owner_repo" };
      const base = `https://api.github.com/repos/${owner}/${repo}`;
      try {
        if (action === "repo") {
          const r = await fetch(base, { headers });
          if (!r.ok) return { ok: false, error: `github_${r.status}` };
          const j = (await r.json()) as Record<string, unknown>;
          return { ok: true, data: { full_name: j.full_name, description: j.description, language: j.language, stars: j.stargazers_count, topics: j.topics } };
        }
        if (action === "readme") {
          const r = await fetch(`${base}/readme`, { headers: { ...headers, accept: "application/vnd.github.raw" } });
          if (!r.ok) return { ok: false, error: `github_${r.status}` };
          return { ok: true, data: { readme: (await r.text()).slice(0, 4000) } };
        }
        if (action === "tree") {
          const r = await fetch(`${base}/git/trees/HEAD?recursive=1`, { headers });
          if (!r.ok) return { ok: false, error: `github_${r.status}` };
          const j = (await r.json()) as { tree?: { path?: string; type?: string }[] };
          return { ok: true, data: { paths: (j.tree || []).map((t) => t.path).filter(Boolean).slice(0, 80) } };
        }
        return { ok: false, error: "github_unknown_action" };
      } catch (e) {
        return { ok: false, error: `github_network: ${redact(e instanceof Error ? e.message : "")}` };
      }
    },
  };
}

/** True when a web-search provider key is present (Tavily or Brave). */
export function webSearchConfigured(env: Env = process.env): boolean {
  return !!(env.TAVILY_API_KEY || env.BRAVE_API_KEY);
}

/** Real web search behind the ToolAdapter seam. Tavily (preferred) or Brave, by env
 *  key. Returns normalized {title,url,snippet}[] so callers cite real sources — never
 *  fabricated. Honest "not_configured" when no key (caller degrades to general reasoning). */
export function makeWebSearchTool(env: Env = process.env): ToolAdapter {
  const tavily = env.TAVILY_API_KEY;
  const brave = env.BRAVE_API_KEY;
  return {
    name: "web_search",
    async run(input): Promise<ToolResult> {
      const query = String(input.query || "").trim().slice(0, 400);
      if (!query) return { ok: false, error: "web_search_missing_query" };
      const max = Math.min(Math.max(Number(input.max) || 5, 1), 8);
      try {
        if (tavily) {
          const r = await fetch("https://api.tavily.com/search", {
            method: "POST", headers: { "content-type": "application/json" },
            body: JSON.stringify({ api_key: tavily, query, max_results: max, search_depth: "basic" }),
          });
          if (!r.ok) return { ok: false, error: `tavily_${r.status}` };
          const j = (await r.json()) as { results?: { title?: string; url?: string; content?: string }[] };
          return { ok: true, data: { results: (j.results || []).slice(0, max).map((x) => ({ title: x.title || x.url || "", url: x.url || "", snippet: (x.content || "").slice(0, 500) })) } };
        }
        if (brave) {
          const r = await fetch(`https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=${max}`, {
            headers: { accept: "application/json", "x-subscription-token": brave },
          });
          if (!r.ok) return { ok: false, error: `brave_${r.status}` };
          const j = (await r.json()) as { web?: { results?: { title?: string; url?: string; description?: string }[] } };
          return { ok: true, data: { results: (j.web?.results || []).slice(0, max).map((x) => ({ title: x.title || x.url || "", url: x.url || "", snippet: (x.description || "").slice(0, 500) })) } };
        }
        return { ok: false, error: "web_search_not_configured" };
      } catch (e) {
        return { ok: false, error: `web_search_network: ${redact(e instanceof Error ? e.message : "")}` };
      }
    },
  };
}

/** Tool registry resolved against env. */
export function getTools(env: Env = process.env): Record<string, ToolAdapter> {
  return { github: makeGithubTool(env), web_search: makeWebSearchTool(env) };
}

// ---------------------------------------------------------------------------
// Safe status (no secrets) for GET /llm/status and the PWA admin card.
// ---------------------------------------------------------------------------
export function providersStatus(env: Env = process.env) {
  const providers: Record<string, ProviderStatus> = {};
  for (const p of ALL_PROVIDERS) providers[p] = providerConfigured(p, env);
  return {
    default_provider: defaultProvider(env),
    mode: llmMode(env),
    providers,
    tasks: (Object.keys(TASK_ENV) as TaskType[]).map((t) => {
      const r = resolveTask(t, env);
      return { task: t, provider: r.provider, model: r.model, tier: r.tier };
    }),
  };
}
