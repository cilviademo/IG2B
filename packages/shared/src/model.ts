// RADIAN model seam — provider-agnostic, two-tier, config-driven.
//
// Iron principle #2: ALL AI behind this interface. Adding OpenAI/Gemini/Ollama
// later implements `ModelAdapter` and touches ZERO pipeline code. Anthropic is the
// first real implementation (fetch-based, no SDK dependency). The deterministic
// adapter lets the whole platform run in the sandbox / offline with no key.
//
// This module is PURE (no DB, no node-only deps beyond fetch) so it bundles
// anywhere. Budget enforcement + cost-ledger logging live in packages/db (which
// can see the database); this file provides the governor DECISION as a pure fn.

// ---------------------------------------------------------------------------
// Tiers & config
// ---------------------------------------------------------------------------
export type ModelTier = "cheap" | "strong";

export interface TierPricing {
  model: string;
  inputPerMTok: number; // USD cents per 1M input tokens
  outputPerMTok: number; // USD cents per 1M output tokens
  maxTokens: number;
}

export interface ModelConfig {
  apiKey?: string; // ANTHROPIC_API_KEY (Render env only); absent => deterministic
  tiers: Record<ModelTier, TierPricing>;
  monthlyBudgetCents: number;
}

// Defaults are overridable via env (Render only) so model strings + budgets are
// hot-swappable without code changes. Pricing in CENTS per 1M tokens.
export function loadModelConfig(env: Record<string, string | undefined> = process.env): ModelConfig {
  const n = (k: string, d: number) => (env[k] ? Number(env[k]) : d);
  return {
    apiKey: env.ANTHROPIC_API_KEY || undefined,
    monthlyBudgetCents: n("RADIAN_MONTHLY_BUDGET_CENTS", 1500), // $15/mo default
    tiers: {
      cheap: {
        model: env.RADIAN_MODEL_CHEAP || "claude-haiku-4-5-20251001",
        inputPerMTok: n("RADIAN_CHEAP_IN_CENTS", 100), // $1.00 / Mtok
        outputPerMTok: n("RADIAN_CHEAP_OUT_CENTS", 500), // $5.00 / Mtok
        maxTokens: n("RADIAN_CHEAP_MAXTOK", 1024),
      },
      strong: {
        model: env.RADIAN_MODEL_STRONG || "claude-sonnet-4-6",
        inputPerMTok: n("RADIAN_STRONG_IN_CENTS", 300), // $3.00 / Mtok
        outputPerMTok: n("RADIAN_STRONG_OUT_CENTS", 1500), // $15.00 / Mtok
        maxTokens: n("RADIAN_STRONG_MAXTOK", 2048),
      },
    },
  };
}

// Live model calls are bounded by a hard timeout so a slow/hung provider can NEVER hang a
// request — on abort the adapter throws and the caller falls back to the deterministic floor or
// queues (capture-instant / AI-async). Override with LLM_TIMEOUT_MS (clamped 3s–120s).
export function resolveModelTimeoutMs(env: Record<string, string | undefined> = process.env): number {
  const raw = Number(env.LLM_TIMEOUT_MS);
  if (!Number.isFinite(raw) || raw <= 0) return 30000;
  return Math.max(3000, Math.min(120000, Math.round(raw)));
}

export interface TokenUsage {
  input: number;
  output: number;
}

export function estimateCostCents(tier: TierPricing, usage: TokenUsage): number {
  return (usage.input * tier.inputPerMTok) / 1_000_000 + (usage.output * tier.outputPerMTok) / 1_000_000;
}

// Rough token estimate for pre-flight budgeting (real usage comes from the API).
export const estTokens = (s: string) => Math.ceil((s || "").split(/\s+/).filter(Boolean).length * 1.34) + 8;

// ---------------------------------------------------------------------------
// Budget governor (Iron principle #4) — PURE decision; the ledger sum is supplied
// by the caller (db). 80% -> degrade to cheap/ingest-only; 100% -> block (queue).
// ---------------------------------------------------------------------------
export type GovernorState = "ok" | "degrade" | "block";

export function governorDecision(monthToDateCents: number, budgetCents: number): GovernorState {
  if (budgetCents <= 0) return "block";
  const pct = monthToDateCents / budgetCents;
  if (pct >= 1) return "block";
  if (pct >= 0.8) return "degrade";
  return "ok";
}

/** Is a tier permitted given governor state? In "degrade" only the cheap tier runs. */
export function tierAllowed(state: GovernorState, tier: ModelTier): boolean {
  if (state === "block") return false;
  if (state === "degrade") return tier === "cheap";
  return true;
}

/** Pre-flight: would a call costing ~estCents push month-to-date over budget?
 *  This is what makes a tiny budget ($0.01) block the FIRST call (queue, no spend). */
export function preflightBlock(monthToDateCents: number, estCents: number, budgetCents: number): boolean {
  if (budgetCents <= 0) return true;
  return monthToDateCents + estCents > budgetCents;
}

export class BudgetExceededError extends Error {
  constructor(public state: GovernorState, public tier: ModelTier) {
    super(`budget_governor_${state}: tier "${tier}" not permitted`);
    this.name = "BudgetExceededError";
  }
}

// ---------------------------------------------------------------------------
// ModelAdapter interface — every provider implements this.
// ---------------------------------------------------------------------------
export interface CompleteOpts {
  system?: string;
  prompt: string;
  maxTokens?: number;
  temperature?: number;
  json?: boolean; // request strict JSON output
}
export interface CompleteResult {
  text: string;
  usage: TokenUsage;
  model: string;
}
export interface ModelAdapter {
  readonly provider: string;
  readonly model: string;
  complete(opts: CompleteOpts): Promise<CompleteResult>;
  // Embeddings: Anthropic has no native endpoint; a real deploy plugs a provider
  // (Voyage/local). Deterministic adapter returns a hash vector for sandbox use.
  embed(text: string): Promise<{ vector: number[]; usage: TokenUsage }>;
}

// ---------------------------------------------------------------------------
// Deterministic adapter — no key, no network. Keeps the sandbox + offline mode
// fully functional and tests reproducible.
// ---------------------------------------------------------------------------
export function deterministicAdapter(model = "deterministic"): ModelAdapter {
  return {
    provider: "deterministic",
    model,
    async complete(opts) {
      const clean = opts.prompt.replace(/\s+/g, " ").trim();
      const text = opts.json
        ? JSON.stringify({ note: "deterministic stub", echo: clean.slice(0, 120) })
        : (clean.split(/(?<=[.!?])\s/)[0] || clean).slice(0, 220);
      return { text, usage: { input: estTokens(opts.prompt) + estTokens(opts.system || ""), output: estTokens(text) }, model };
    },
    async embed(text) {
      // 16-dim deterministic hash embedding — stable + cheap, for stub retrieval.
      const v = new Array(16).fill(0);
      for (let i = 0; i < text.length; i++) v[i % 16] += text.charCodeAt(i);
      const norm = Math.sqrt(v.reduce((s, x) => s + x * x, 0)) || 1;
      return { vector: v.map((x) => x / norm), usage: { input: estTokens(text), output: 0 } };
    },
  };
}

// ---------------------------------------------------------------------------
// Anthropic adapter — fetch-based Messages API (no SDK dependency). Activated
// only when an API key is present (Render env). Key never logged.
// ---------------------------------------------------------------------------
export function anthropicAdapter(apiKey: string, model: string): ModelAdapter {
  return {
    provider: "anthropic",
    model,
    async complete(opts) {
      // Hard timeout: abort a slow/hung call so it never blocks the request (deterministic floor).
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), resolveModelTimeoutMs());
      let res: Response;
      try {
        res = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-api-key": apiKey,
            "anthropic-version": "2023-06-01",
          },
          body: JSON.stringify({
            model,
            max_tokens: opts.maxTokens ?? 1024,
            temperature: opts.temperature ?? 0.2,
            system: opts.json ? `${opts.system || ""}\nRespond with ONLY valid JSON, no prose.`.trim() : opts.system,
            messages: [{ role: "user", content: opts.prompt }],
          }),
          signal: ctrl.signal,
        });
      } catch (e) {
        throw new Error(ctrl.signal.aborted ? "anthropic_timeout" : `anthropic_network: ${(e instanceof Error ? e.message : "").slice(0, 120)}`);
      } finally {
        clearTimeout(timer);
      }
      if (!res.ok) {
        const detail = await res.text().catch(() => "");
        throw new Error(`anthropic_${res.status}: ${detail.slice(0, 200)}`);
      }
      const j = (await res.json()) as { content?: { text?: string }[]; usage?: { input_tokens?: number; output_tokens?: number } };
      const text = (j.content || []).map((c) => c.text || "").join("");
      return {
        text,
        usage: { input: j.usage?.input_tokens ?? 0, output: j.usage?.output_tokens ?? 0 },
        model,
      };
    },
    async embed() {
      // No native Anthropic embeddings endpoint. A real deploy plugs Voyage/local
      // behind this method; until then callers should use entity/tag retrieval.
      throw new Error("embed_not_supported: configure an embeddings provider (Voyage/local)");
    },
  };
}

/** Factory: real adapter when a key is configured, deterministic otherwise. */
export function getModel(tier: ModelTier, cfg: ModelConfig = loadModelConfig()): ModelAdapter {
  const t = cfg.tiers[tier];
  if (cfg.apiKey) return anthropicAdapter(cfg.apiKey, t.model);
  return deterministicAdapter(t.model);
}

// ---------------------------------------------------------------------------
// ToolAdapter interface (Iron principle: tools behind a seam too). Define now;
// implement web-search + GitHub in Wave 2. arXiv/YouTube/Gmail/Notion are future.
// ---------------------------------------------------------------------------
export interface ToolResult {
  ok: boolean;
  data?: unknown;
  error?: string;
}
export interface ToolAdapter {
  readonly name: string;
  run(input: Record<string, unknown>): Promise<ToolResult>;
}

// ---------------------------------------------------------------------------
// Privacy boundary (Iron principle #7). Secret/INTERNAL-flagged captures are
// excluded from research prompts and ANY tool-using (external) call, so private
// material never leaks into a web/GitHub query. Local single-shot enrichment of
// the owner's own item is allowed; outward-facing research/tools are not.
// ---------------------------------------------------------------------------
export const RESEARCH_EXCLUDED_SENSITIVITY = new Set(["secret", "internal"]);
export function isResearchSafe(sensitivity: string): boolean {
  return !RESEARCH_EXCLUDED_SENSITIVITY.has(sensitivity);
}
export function filterResearchSafe<T extends { sensitivity: string }>(items: T[]): T[] {
  return items.filter((i) => isResearchSafe(i.sensitivity));
}

/** Placeholder tools — replaced by real web-search + GitHub adapters in Wave 2. */
export function stubTool(name: string): ToolAdapter {
  return { name, async run() { return { ok: false, error: `${name}_not_implemented_until_wave2` }; } };
}
export const toolRegistry: Record<string, ToolAdapter> = {
  web_search: stubTool("web_search"),
  github: stubTool("github"),
};
