// RADIAN admin surface (Wave 0): Project Registry CRUD + budget/governor status.
// Everything keys off the registry, so it's editable at runtime without redeploy.
import { Router } from "express";
import * as repo from "@indigold/db";
import { seedProjectsIfEmpty, budgetStatus } from "@indigold/db";
import { id, enqueue } from "@indigold/shared";
import { providersStatus, providerConfigured, PROVIDER_ENV, ALL_PROVIDERS, type Provider } from "@indigold/shared/providers";
import { calibrate } from "@indigold/shared";
import type { Authed } from "../middleware/auth";

export const projectsRouter = Router();

// List (seeds the 8 default domains on first use — idempotent).
projectsRouter.get("/", async (req: Authed, res) => {
  await seedProjectsIfEmpty(req.userId!);
  res.json({ items: await repo.projects.list(req.userId!) });
});

// Create a new project/domain.
projectsRouter.post("/", async (req: Authed, res) => {
  const name = String(req.body?.name || "").trim();
  if (!name) return res.status(400).json({ error: "name_required" });
  const pid = id("proj");
  await repo.projects.upsert({
    id: pid, user_id: req.userId!, name,
    description: String(req.body?.description || ""),
    status: req.body?.status === "dormant" ? "dormant" : "active",
    tags: Array.isArray(req.body?.tags) ? req.body.tags.map(String) : [],
    objectives: String(req.body?.objectives || ""),
  });
  res.status(201).json(await repo.projects.get(req.userId!, pid));
});

// Update objectives/status/tags/etc. (no DELETE — set status:"dormant" instead).
projectsRouter.patch("/:id", async (req: Authed, res) => {
  const existing = await repo.projects.get(req.userId!, req.params.id);
  if (!existing) return res.status(404).json({ error: "not_found" });
  const patch: Record<string, unknown> = {};
  for (const k of ["name", "description", "status", "objectives"] as const) {
    if (typeof req.body?.[k] === "string") patch[k] = req.body[k];
  }
  if (Array.isArray(req.body?.tags)) patch.tags = req.body.tags.map(String);
  await repo.projects.patch(req.userId!, req.params.id, patch);
  res.json(await repo.projects.get(req.userId!, req.params.id));
});

export const radianRouter = Router();

// ---- Stage 7: Opportunities (review queue; never auto-promoted) ----
radianRouter.get("/opportunities", async (req: Authed, res) => {
  await repo.opportunities.expireStale(req.userId!);
  res.json({ items: await repo.opportunities.list(req.userId!) });
});
radianRouter.post("/opportunities/scan", async (req: Authed, res) => {
  const j = await enqueue("opportunity_scan", req.userId!, {});
  await repo.jobs.record({ id: j.id, user_id: req.userId!, type: j.type, status: "queued" });
  res.status(202).json({ queued: true, job: j.id });
});
radianRouter.patch("/opportunities/:id", async (req: Authed, res) => {
  const status = String(req.body?.status || "");
  if (!["review", "accepted", "rejected", "expired"].includes(status)) return res.status(400).json({ error: "bad_status" });
  await repo.opportunities.setStatus(req.userId!, req.params.id, status);
  res.json({ ok: true });
});

// ---- Stage 8: Decision journal ----
radianRouter.get("/decisions", async (req: Authed, res) => res.json({ items: await repo.decisions.list(req.userId!) }));
radianRouter.get("/decisions/due", async (req: Authed, res) => res.json({ items: await repo.decisions.due(req.userId!) }));
radianRouter.post("/decisions", async (req: Authed, res) => {
  const decision = String(req.body?.decision || "").trim();
  if (!decision) return res.status(400).json({ error: "decision_required" });
  const did = id("dec");
  await repo.decisions.create({
    id: did, user_id: req.userId!, decision,
    reasoning: String(req.body?.reasoning || ""),
    confidence: Math.max(0, Math.min(1, Number(req.body?.confidence ?? 0.5))),
    expected_outcome: String(req.body?.expected_outcome || ""),
    review_by: req.body?.review_by ? String(req.body.review_by) : null,
  });
  res.status(201).json({ id: did });
});
radianRouter.post("/decisions/:id/outcome", async (req: Authed, res) => {
  await repo.decisions.recordOutcome(req.userId!, req.params.id, String(req.body?.outcome || ""), Boolean(req.body?.success));
  res.json({ ok: true });
});
radianRouter.get("/calibration", async (req: Authed, res) => {
  res.json(calibrate(await repo.decisions.forCalibration(req.userId!)));
});

// Budget governor + provider snapshot. Surfaces the REAL state (ok/degrade/block)
// and month-to-date spend so cost is never a silent surprise.
radianRouter.get("/status", async (req: Authed, res) => {
  res.json(await budgetStatus(req.userId!));
});

// "Research this" — manual Stage 4 trigger for a node (rate-capped per day).
radianRouter.post("/research/:nodeId", async (req: Authed, res) => {
  const node = await repo.nodes.get(req.userId!, req.params.nodeId);
  if (!node) return res.status(404).json({ error: "not_found" });
  const srcCapId = (node as { source_capture_id?: string | null }).source_capture_id ?? null;
  const cap = srcCapId ? await repo.captures.get(req.userId!, srcCapId) : null;
  if (cap && (cap.sensitivity === "secret" || cap.sensitivity === "internal")) {
    return res.status(403).json({ error: "privacy_excluded", reason: "secret/internal captures are not researched externally" });
  }
  const j = await enqueue("research", req.userId!, { nodeId: node.id, captureId: srcCapId ?? undefined });
  await repo.jobs.record({ id: j.id, user_id: req.userId!, type: j.type, status: "queued" });
  res.status(202).json({ queued: true, job: j.id });
});

// NEXT ACTIONS feed (HIGH-leverage first) — Stage 3 output for the Home queue.
radianRouter.get("/actions", async (req: Authed, res) => {
  const nodes = await repo.nodes.list(req.userId!);
  const actions: unknown[] = [];
  for (const n of nodes as { id: string; meta?: { assist?: { next_actions?: { leverage?: string }[] } } }[]) {
    const na = n.meta?.assist?.next_actions;
    if (Array.isArray(na)) for (const a of na) actions.push({ ...a, node_id: n.id });
  }
  const rank: Record<string, number> = { HIGH: 0, MED: 1, LOW: 2 };
  actions.sort((a, b) => (rank[(a as { leverage?: string }).leverage || "LOW"] ?? 2) - (rank[(b as { leverage?: string }).leverage || "LOW"] ?? 2));
  res.json({ items: actions.slice(0, 25) });
});

// ---- LLM Provider Framework (safe status; NO secrets ever) ----
export const llmRouter = Router();

// GET /llm/status — configured providers + default + mode + budget. Token values
// are NEVER read or returned here; only presence (configured true/false) + reason.
llmRouter.get("/status", async (req: Authed, res) => {
  const budget = await budgetStatus(req.userId!);
  res.json({
    ...providersStatus(),
    budget: {
      monthly_budget_cents: budget.budget_cents,
      month_to_date_cents: budget.month_cost_cents,
      state: budget.state,
    },
  });
});

// POST /llm/provider-config — placeholder, secret-safe. Does NOT accept or persist
// raw keys (no encrypted secret manager yet); it tells the operator which Render
// env var to set. Any "key"/"token" field in the body is ignored and never stored.
llmRouter.post("/provider-config", async (req: Authed, res) => {
  const provider = String(req.body?.provider || "").toLowerCase() as Provider;
  if (!ALL_PROVIDERS.includes(provider)) {
    return res.status(400).json({ error: "unknown_provider", valid: ALL_PROVIDERS });
  }
  const required = PROVIDER_ENV[provider as Exclude<Provider, "deterministic">];
  res.json({
    provider,
    required_env_var: required,
    configured: providerConfigured(provider).configured,
    message: `Set ${required} in Render → Environment, then redeploy the API. Keys are never accepted or stored here.`,
  });
});
