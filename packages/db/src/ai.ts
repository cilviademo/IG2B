// Governed model orchestrator — the SINGLE path every RADIAN AI call goes through.
// It enforces the budget governor BEFORE calling, runs the provider-agnostic
// adapter, then logs the cost ledger + usage rollup AFTER. Pipeline code calls
// these helpers and never touches a provider directly (Iron principles #2, #4, #5).

import { id } from "@indigold/shared";
import {
  loadModelConfig,
  getModel,
  governorDecision,
  tierAllowed,
  preflightBlock,
  estimateCostCents,
  estTokens,
  BudgetExceededError,
  type ModelTier,
  type GovernorState,
} from "@indigold/shared/model";
import { getTaskAdapter, type TaskType } from "@indigold/shared/providers";
import { aiCalls, usage, projects, type ProjectRow } from "./repos";
import { SEED_PROJECTS } from "@indigold/shared/registry";

export interface GovernedCompleteCtx {
  userId: string;
  tier: ModelTier; // budgeting tier (fallback when no task given)
  purpose: string; // ledger label, e.g. "ingest_classify"
  task?: TaskType; // when set, the provider+model+mode come from the LLM framework
  system?: string;
  prompt: string;
  json?: boolean;
  maxTokens?: number;
  sourceId?: string; // capture/node id for provenance
  promptVersion?: string; // from the prompt registry
}

export interface GovernedResult {
  text: string;
  usage: { input: number; output: number };
  model: string;
  provider: string;
  cost_cents: number;
  governor: GovernorState;
}

/** Budget-checked, ledgered completion. Throws BudgetExceededError when the
 *  governor blocks the tier — callers catch it and QUEUE the work (never fake). */
export async function governedComplete(ctx: GovernedCompleteCtx): Promise<GovernedResult> {
  const cfg = loadModelConfig();
  // Provider/model/mode resolution: task-based (LLM framework) when a task is set,
  // else the tier-based default adapter. Budgeting always uses a cost tier.
  const sel = ctx.task ? getTaskAdapter(ctx.task) : null;
  const tier: ModelTier = sel ? sel.resolved.tier : ctx.tier;
  const month = await aiCalls.monthCostCents(ctx.userId);
  const state = governorDecision(month, cfg.monthlyBudgetCents);

  // Pre-flight estimate so even the FIRST call is blocked when it would breach the
  // budget (the "$0.01 -> queue, no calls" force-test). Worst-case output = maxTokens.
  const maxTok = ctx.maxTokens ?? cfg.tiers[tier].maxTokens;
  const est = estimateCostCents(cfg.tiers[tier], { input: estTokens((ctx.system || "") + ctx.prompt), output: maxTok });
  const blocked = !tierAllowed(state, tier) || preflightBlock(month, est, cfg.monthlyBudgetCents);

  if (blocked) {
    const why = !tierAllowed(state, tier) ? `governor_${state}` : "governor_block_preflight";
    // Log the refusal so it's VISIBLE in the ledger (not a silent skip). Zero spend.
    await aiCalls.log({
      id: id("aicall"), user_id: ctx.userId, purpose: ctx.purpose, provider: "n/a",
      model: cfg.tiers[tier].model, tier, input_tokens: 0, output_tokens: 0,
      cost_cents: 0, source_id: ctx.sourceId, prompt_version: ctx.promptVersion, status: why,
    });
    throw new BudgetExceededError(state === "ok" ? "block" : state, tier);
  }

  const adapter = sel ? sel.adapter : getModel(tier, cfg);
  const res = await adapter.complete({
    system: ctx.system,
    prompt: ctx.prompt,
    json: ctx.json,
    maxTokens: maxTok,
  });
  const cost = estimateCostCents(cfg.tiers[tier], res.usage);

  await aiCalls.log({
    id: id("aicall"), user_id: ctx.userId, purpose: ctx.purpose, provider: adapter.provider,
    model: res.model, tier, input_tokens: res.usage.input, output_tokens: res.usage.output,
    cost_cents: cost, source_id: ctx.sourceId, prompt_version: ctx.promptVersion, status: "ok",
  });
  await usage.add(ctx.userId, { tokens: res.usage.input + res.usage.output, apiCalls: 1, costCents: Math.round(cost) });

  return { ...res, provider: adapter.provider, cost_cents: cost, governor: state };
}

/** Budget snapshot for the /radian/status endpoint + Meta-Radian. */
export async function budgetStatus(userId: string) {
  const cfg = loadModelConfig();
  const month = await aiCalls.monthCostCents(userId);
  return {
    provider: cfg.apiKey ? "anthropic" : "deterministic",
    month_cost_cents: month,
    budget_cents: cfg.monthlyBudgetCents,
    state: governorDecision(month, cfg.monthlyBudgetCents),
    by_purpose: await aiCalls.monthByPurpose(userId),
    tiers: cfg.tiers,
  };
}

/** Seed the Project Registry from defaults on first use (idempotent: only when empty). */
export async function seedProjectsIfEmpty(userId: string): Promise<number> {
  if ((await projects.count(userId)) > 0) return 0;
  for (const s of SEED_PROJECTS) {
    await projects.upsert({
      id: id("proj"), user_id: userId, name: s.name, description: s.description,
      status: s.status, tags: s.tags, objectives: s.objectives,
    });
  }
  return SEED_PROJECTS.length;
}

/** Wave D4: assemble the full export bundle. The vault must be reconstructable from
 *  this JSON + the R2 objects (assets are metadata only here). No lock-in. */
export async function buildExportBundle(userId: string) {
  const { EXPORT_BUNDLE_VERSION } = await import("@indigold/shared");
  const repo = await import("./repos");
  const [projectsR, capturesR, nodesR, edgesR, eventsR, briefsR, decisionsR, oppsR, constraintsR, assetsR] = await Promise.all([
    repo.projects.list(userId), repo.captures.list(userId), repo.nodes.list(userId), repo.edges.list(userId),
    repo.events.listForUser(userId), repo.briefs.list(userId), repo.decisions.list(userId),
    repo.opportunities.list(userId), repo.constraints.get(userId), repo.assets.listForUser(userId),
  ]);
  return {
    app: "Indigold" as const,
    bundle_version: EXPORT_BUNDLE_VERSION,
    exported_at: new Date().toISOString(),
    user_id: userId,
    counts: {
      projects: projectsR.length, captures: capturesR.length, nodes: nodesR.length, edges: edgesR.length,
      events: eventsR.length, briefs: briefsR.length, decisions: decisionsR.length, opportunities: oppsR.length, assets: assetsR.length,
    },
    data: {
      projects: projectsR, captures: capturesR, nodes: nodesR, edges: edgesR, events: eventsR,
      briefs: briefsR, decisions: decisionsR, opportunities: oppsR, constraints: constraintsR, assets: assetsR,
    },
  };
}

/** Semantic neighbours of a query text — embeds it with the active embedder, then
 *  cosine-ranks the user's stored embeddings of the same model. Returns subject ids
 *  + scores. (Native pgvector `<=>` is a drop-in perf upgrade for scale.) */
export async function semanticNeighbors(userId: string, queryText: string, k = 5, excludeId?: string) {
  const { getEmbedder, cosineRank } = await import("@indigold/shared");
  const embedder = getEmbedder();
  const { vector } = await embedder.embed(queryText);
  const repo = await import("./repos");
  const rows = await repo.embeddings.listForUser(userId, embedder.model);
  return { model: embedder.model, provider: embedder.provider, matches: cosineRank(vector, rows, k, excludeId) };
}

export type { ProjectRow };
