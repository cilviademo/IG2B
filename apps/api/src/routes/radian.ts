// RADIAN admin surface (Wave 0): Project Registry CRUD + budget/governor status.
// Everything keys off the registry, so it's editable at runtime without redeploy.
import { Router } from "express";
import * as repo from "@indigold/db";
import { seedProjectsIfEmpty, budgetStatus } from "@indigold/db";
import { id, enqueue } from "@indigold/shared";
import { providersStatus, providerConfigured, PROVIDER_ENV, ALL_PROVIDERS, type Provider } from "@indigold/shared/providers";
import { calibrate, AGENT_KINDS, type AgentKind } from "@indigold/shared";
import { DEFAULT_CONSTRAINTS, attentionScore, urgencyFromDate, computeSignalToNoise, type ConstraintProfile } from "@indigold/shared";
import { getEmbedder } from "@indigold/shared";
import { findVerb, verbsFor } from "@indigold/shared";
import { timeMachine, type RangeKey, type TimeMachineInput } from "@indigold/shared";
import { applyAction, suggestQuests, type QuestAction, type QuestSeed } from "@indigold/shared";
import { semanticNeighbors } from "@indigold/db";
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

// ---- Living OS G1: Companion Panel — "Ask Radian" verb router ----
// Every verb maps to an EXISTING system (assistance/research/Oracle/Encompass) and
// runs async through the job queue (governed + ledgered + provenanced). The frontend
// makes NO direct model calls; it polls GET /radian/job/:id for honest job state.
radianRouter.get("/verbs/:entity", (req: Authed, res) => {
  const e = req.params.entity as "node" | "project" | "brief" | "capture";
  res.json({ verbs: verbsFor(e).map((v) => ({ verb: v.verb, label: v.label })) });
});

radianRouter.post("/ask", async (req: Authed, res) => {
  const subjectType = String(req.body?.subject_type || "");
  const subjectId = String(req.body?.subject_id || "");
  const verb = String(req.body?.verb || "");
  const question = req.body?.question ? String(req.body.question) : undefined;
  const spec = findVerb(verb);
  if (!spec) return res.status(400).json({ error: "unknown_verb" });
  if (!["node", "project", "brief", "capture"].includes(subjectType) || !subjectId) return res.status(400).json({ error: "bad_subject" });

  // create_task is synchronous (no model): a Task node linked to the subject.
  if (spec.fulfilment.kind === "sync") {
    const subjTitle = subjectType === "node" ? (await repo.nodes.get(req.userId!, subjectId))?.title : subjectId;
    const tid = id("node");
    await repo.nodes.create({
      id: tid, user_id: req.userId!, type: "concept", title: `Task — ${String(subjTitle || subjectId).slice(0, 60)}`,
      summary: question || "Owner-created task", truth_layer: "B", truth_label: "Task", mvs: 60, tags: ["task"],
      meta: { task: { status: "open", subject_type: subjectType, subject_id: subjectId }, epistemic_type: "decision" },
    });
    if (subjectType === "node") await repo.edges.create({ id: id("edge"), user_id: req.userId!, source_id: subjectId, target_id: tid, relationship: "depends_on", weight: 0.7, valid_from: new Date().toISOString(), label: "task" });
    await repo.emitEvent({ user_id: req.userId!, actor: "user", event_type: "state_transition", subject_type: "node", subject_id: tid, correlation_id: subjectId, payload: { created: "task" } });
    return res.status(201).json({ mode: "done", task: tid });
  }

  // Job-backed verbs → enqueue the right existing job with the right payload.
  const job = spec.fulfilment.job;
  let payload: Record<string, unknown>;
  if (job === "assist") payload = { nodeId: subjectId };
  else if (job === "research") payload = subjectType === "capture" ? { captureId: subjectId } : { nodeId: subjectId };
  else if (job === "simulation") {
    const t = subjectType === "node" ? (await repo.nodes.get(req.userId!, subjectId))?.title : subjectId;
    payload = { question: question || `What if I prioritize "${t || subjectId}"?`, contextNodeIds: subjectType === "node" ? [subjectId] : [] };
  } else if (job === "context_pack") payload = { subjectId, purpose: `Pack for ${subjectType}` };
  else payload = { subjectType, subjectId, verb, question }; // "ask"

  const j = await enqueue(job, req.userId!, payload);
  await repo.jobs.record({ id: j.id, user_id: req.userId!, type: j.type, status: "queued" });
  res.status(202).json({ mode: "job", job: j.id, verb });
});

// Honest job state for the panel (queued/running/done/failed + result).
radianRouter.get("/job/:id", async (req: Authed, res) => {
  const j = await repo.jobs.get(req.userId!, req.params.id);
  if (!j) return res.status(404).json({ error: "not_found" });
  res.json(j);
});

// ---- Living OS G2: Time Machine / Memory Replay (deterministic; NO model calls) ----
// Assembles the owner's real data (Event Store + captures + nodes/edges + timeline +
// briefs + decisions) and runs the pure G2 core. Works identically in stub/live mode
// — it never waits on an LLM. ?range=7d|30d|90d|180d|365d|custom (&days=N for custom).
radianRouter.get("/time-machine", async (req: Authed, res) => {
  const range = String(req.query.range || "30d") as RangeKey;
  const customDays = req.query.days ? Number(req.query.days) : undefined;
  const uid = req.userId!;
  const [nodes, edges, events, timeline, briefs, decisions, captures] = await Promise.all([
    repo.nodes.list(uid), repo.edges.list(uid), repo.events.listForUser(uid),
    repo.timeline.list(uid), repo.briefs.list(uid), repo.decisions.list(uid), repo.captures.list(uid),
  ]);
  const input: TimeMachineInput = {
    nodes: nodes as TimeMachineInput["nodes"],
    edges: edges as TimeMachineInput["edges"],
    events: (events as { event_type: string; created_at?: string; actor?: string }[]),
    timeline: (timeline as TimeMachineInput["timeline"]),
    briefs: (briefs as TimeMachineInput["briefs"]),
    decisions: (decisions as TimeMachineInput["decisions"]),
    captures: (captures as { id: string; title?: string; captured_at?: string; source?: string }[]),
  };
  res.json(timeMachine(input, range, Date.now(), customDays));
});

// ---- Living OS G3: Quest / Action System (deterministic; every change emits an event) ----
const QUEST_STATES_ALL = ["suggested", "accepted", "active", "blocked", "completed", "archived"];

// List quests (optionally filter by comma-separated states).
radianRouter.get("/quests", async (req: Authed, res) => {
  const states = req.query.state ? String(req.query.state).split(",").filter(Boolean) : undefined;
  res.json({ items: await repo.quests.list(req.userId!, states) });
});

// Node ids that carry an in-play quest — the Atlas overlays a badge on these.
radianRouter.get("/quests/node-ids", async (req: Authed, res) => {
  res.json({ node_ids: await repo.quests.activeNodeIds(req.userId!) });
});

// Create one quest from a seed (brief/node/capture/time_machine/companion). Defaults
// to "suggested"; pass state:"active" to accept-and-start in one tap.
radianRouter.post("/quests", async (req: Authed, res) => {
  const b = (req.body || {}) as Partial<QuestSeed> & { state?: string };
  const title = String(b.title || "").trim();
  if (!title) return res.status(400).json({ error: "title_required" });
  // Only anchor to a node that actually exists (the node_id FK would otherwise 500);
  // an unknown id degrades to an unanchored quest rather than failing the request.
  let nodeId = b.node_id ?? null;
  if (nodeId && !(await repo.nodes.get(req.userId!, nodeId))) nodeId = null;
  const qid = id("quest");
  await repo.quests.create({
    id: qid, user_id: req.userId!, title, summary: String(b.summary || ""),
    kind: b.kind || "side", state: b.state && QUEST_STATES_ALL.includes(b.state) ? b.state : "suggested",
    source_type: b.source_type || "system", source_id: b.source_id ?? null, node_id: nodeId, meta: b.meta || {},
  });
  await repo.emitEvent({ user_id: req.userId!, actor: "user", event_type: "state_transition", subject_type: "quest", subject_id: qid, correlation_id: b.source_id || qid, payload: { created: true, kind: b.kind, source: b.source_type } });
  res.status(201).json(await repo.quests.get(req.userId!, qid));
});

// Deterministically suggest quests from the REAL (often sparse) live vault: inbox
// backlog, brief / recommended focus, review queue, high-MVS nodes, Time Machine
// resurfaced + forgotten gems, and active projects — with an onboarding fallback so a
// fresh vault is never empty. No LLM. Idempotent-ish: skips titles that already exist.
radianRouter.post("/quests/suggest", async (req: Authed, res) => {
  const uid = req.userId!;
  await seedProjectsIfEmpty(uid); // ensures a fresh vault has active domains to act on
  const [briefs, nodes, edges, captures, opps, projects, decisionsR, packsR] = await Promise.all([
    repo.briefs.list(uid), repo.nodes.list(uid), repo.edges.list(uid), repo.captures.list(uid),
    repo.opportunities.list(uid), repo.projects.list(uid), repo.decisions.list(uid), repo.contextPacks.list(uid),
  ]);
  const latest = briefs.find((b) => b.kind === "daily") || briefs[0];
  const payload = (latest?.payload || {}) as { recommended_actions?: { text: string; priority?: string }[]; urgent_actions?: { text: string; priority?: string }[] };
  const recommendedFocus = payload.recommended_actions || payload.urgent_actions || [];

  const inboxCount = (captures as { status?: string }[]).filter((c) => c.status === "inbox").length;
  const reviewCount = (opps as { status?: string }[]).filter((o) => o.status === "review").length;
  const topNodes = [...nodes].sort((a, b) => b.mvs - a.mvs).slice(0, 5).map((n) => ({ id: n.id, title: n.title, summary: n.summary, mvs: n.mvs }));
  const tm = timeMachine({ nodes: nodes as TimeMachineInput["nodes"], edges: edges as TimeMachineInput["edges"] }, "30d");
  const forgottenGems = tm.resurfaced.forgottenGems.map((g) => ({ id: g.id, title: g.title }));
  const resurfacedThemes = tm.resurfaced.resurfacedThemes;
  const blockedIds = new Set(edges.filter((e) => /block/i.test(e.relationship)).map((e) => e.target_id));
  const blockedNodes = nodes.filter((n) => blockedIds.has(n.id)).map((n) => ({ id: n.id, title: n.title }));
  const activeProjects = (projects as { id: string; name: string; status?: string }[]).filter((p) => p.status === "active").map((p) => ({ id: p.id, name: p.name }));

  const seeds = suggestQuests({
    inboxCount, reviewCount, recommendedFocus, briefId: latest?.id, topNodes,
    forgottenGems, resurfacedThemes, activeProjects, blockedNodes,
    hasDecisions: decisionsR.length > 0, hasContextPacks: packsR.length > 0,
  });
  const existing = new Set((await repo.quests.list(uid)).map((q) => q.title));
  let created = 0;
  for (const s of seeds) {
    if (existing.has(s.title)) continue;
    const qid = id("quest");
    await repo.quests.create({ id: qid, user_id: uid, title: s.title, summary: s.summary, kind: s.kind, state: "suggested", source_type: s.source_type, source_id: s.source_id ?? null, node_id: s.node_id ?? null, meta: s.meta });
    await repo.emitEvent({ user_id: uid, actor: "agent:Radian", event_type: "state_transition", subject_type: "quest", subject_id: qid, correlation_id: s.source_id || qid, payload: { suggested: true, source: s.source_type } });
    created++;
  }
  res.status(201).json({ created, items: await repo.quests.list(uid, ["suggested"]) });
});

// Apply a state-machine action (accept/start/block/unblock/complete/archive).
radianRouter.post("/quests/:id/action", async (req: Authed, res) => {
  const action = String(req.body?.action || "") as QuestAction;
  const q = await repo.quests.get(req.userId!, req.params.id);
  if (!q) return res.status(404).json({ error: "not_found" });
  const next = applyAction(q.state as never, action);
  if (!next) return res.status(409).json({ error: "illegal_transition", from: q.state, action });
  await repo.quests.setState(req.userId!, q.id, next);
  await repo.emitEvent({ user_id: req.userId!, actor: "user", event_type: "state_transition", subject_type: "quest", subject_id: q.id, correlation_id: q.source_id || q.id, payload: { from: q.state, to: next, action } });
  res.json(await repo.quests.get(req.userId!, q.id));
});

// Snooze a quest (hours, default 24). Keeps state; sets a not-before timestamp.
radianRouter.post("/quests/:id/snooze", async (req: Authed, res) => {
  const q = await repo.quests.get(req.userId!, req.params.id);
  if (!q) return res.status(404).json({ error: "not_found" });
  const hours = Math.max(1, Number(req.body?.hours || 24));
  const until = new Date(Date.now() + hours * 3600000).toISOString();
  await repo.quests.snooze(req.userId!, q.id, until);
  await repo.emitEvent({ user_id: req.userId!, actor: "user", event_type: "state_transition", subject_type: "quest", subject_id: q.id, correlation_id: q.source_id || q.id, payload: { snooze_until: until } });
  res.json(await repo.quests.get(req.userId!, q.id));
});

// Resume a snoozed quest (clears the not-before timestamp; state is unchanged).
radianRouter.post("/quests/:id/resume", async (req: Authed, res) => {
  const q = await repo.quests.get(req.userId!, req.params.id);
  if (!q) return res.status(404).json({ error: "not_found" });
  await repo.quests.resume(req.userId!, q.id);
  await repo.emitEvent({ user_id: req.userId!, actor: "user", event_type: "state_transition", subject_type: "quest", subject_id: q.id, correlation_id: q.source_id || q.id, payload: { resumed: true } });
  res.json(await repo.quests.get(req.userId!, q.id));
});

// Convert a quest into a Project (Registry) — keeps provenance + links the quest.
radianRouter.post("/quests/:id/convert-project", async (req: Authed, res) => {
  const q = await repo.quests.get(req.userId!, req.params.id);
  if (!q) return res.status(404).json({ error: "not_found" });
  const pid = id("proj");
  await repo.projects.upsert({ id: pid, user_id: req.userId!, name: q.title, description: q.summary || "", status: "active", tags: [String(q.kind)], objectives: q.summary || "" });
  await repo.quests.setProject(req.userId!, q.id, pid);
  if (q.state !== "completed" && q.state !== "archived") await repo.quests.setState(req.userId!, q.id, "active");
  await repo.emitEvent({ user_id: req.userId!, actor: "user", event_type: "state_transition", subject_type: "quest", subject_id: q.id, correlation_id: q.id, payload: { converted_to_project: pid } });
  res.status(201).json({ quest: await repo.quests.get(req.userId!, q.id), project: pid });
});


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

// ---- Semantic memory (pgvector-backed embeddings) ----
// Status: provider + how many nodes are embedded.
radianRouter.get("/embeddings", async (req: Authed, res) => {
  const e = getEmbedder();
  res.json({ provider: e.provider, model: e.model, dim: e.dim, embedded: await repo.embeddings.count(req.userId!), active: e.provider !== "deterministic" });
});
// Backfill: embed every node (idempotent — content-hash skips unchanged).
radianRouter.post("/embeddings/backfill", async (req: Authed, res) => {
  const nodes = await repo.nodes.list(req.userId!);
  let queued = 0;
  for (const n of nodes) {
    const j = await enqueue("embed", req.userId!, { nodeId: n.id });
    await repo.jobs.record({ id: j.id, user_id: req.userId!, type: j.type, status: "queued" });
    queued++;
  }
  res.status(202).json({ queued });
});
// Semantic neighbours of a node (cosine over embeddings of the active model).
radianRouter.get("/similar/:nodeId", async (req: Authed, res) => {
  const node = await repo.nodes.get(req.userId!, req.params.nodeId);
  if (!node) return res.status(404).json({ error: "not_found" });
  const text = `${node.title}\n${node.summary}\n${(node.tags || []).join(" ")}`;
  const { model, provider, matches } = await semanticNeighbors(req.userId!, text, 10, req.params.nodeId);
  const hydrated = await repo.nodes.byIds(req.userId!, matches.map((m) => m.subject_id));
  const byId = new Map(hydrated.map((n) => [n.id, n]));
  res.json({
    model, provider,
    items: matches.map((m) => ({ id: m.subject_id, score: Number(m.score.toFixed(3)), title: byId.get(m.subject_id)?.title })).filter((x) => x.title),
  });
});

// ---- Wave B4: Constraint Engine (owner-maintained; injected into planning) ----
radianRouter.get("/constraints", async (req: Authed, res) => {
  const saved = await repo.constraints.get(req.userId!);
  res.json({ ...DEFAULT_CONSTRAINTS, ...(saved || {}) });
});
radianRouter.put("/constraints", async (req: Authed, res) => {
  const body = (req.body || {}) as ConstraintProfile;
  const profile: ConstraintProfile = {
    weekly_hours: Math.max(0, Number(body.weekly_hours ?? DEFAULT_CONSTRAINTS.weekly_hours)),
    money_budget_cents: body.money_budget_cents != null ? Math.max(0, Number(body.money_budget_cents)) : undefined,
    energy_notes: typeof body.energy_notes === "string" ? body.energy_notes : undefined,
    max_concurrent_builds: body.max_concurrent_builds != null ? Math.max(1, Number(body.max_concurrent_builds)) : DEFAULT_CONSTRAINTS.max_concurrent_builds,
    risk_tolerance: ["low", "medium", "high"].includes(String(body.risk_tolerance)) ? body.risk_tolerance : DEFAULT_CONSTRAINTS.risk_tolerance,
    commitments: Array.isArray(body.commitments) ? body.commitments.map(String) : [],
    updated_at: new Date().toISOString(),
  };
  await repo.constraints.set(req.userId!, profile);
  await repo.emitEvent({ user_id: req.userId!, actor: "user", event_type: "constraint_updated", subject_type: "constraints", subject_id: req.userId!, correlation_id: req.userId!, payload: { weekly_hours: profile.weekly_hours } });
  res.json(profile);
});

// ---- Wave B6: Attention Layer (importance/urgency/recency/signal, not raw MVS) ----
radianRouter.get("/attention", async (req: Authed, res) => {
  const nodes = await repo.nodes.list(req.userId!);
  const evts = await repo.events.recent(req.userId!, 500);
  const stn = computeSignalToNoise(evts as { event_type: string; payload?: { source?: string } }[]);
  const now = Date.now();
  const scored = nodes.map((n) => {
    const meta = (n as { meta?: { review_by?: string } }).meta || {};
    const updated = (n as { updated_at?: string }).updated_at;
    const recencyDays = updated ? (now - new Date(updated).getTime()) / 86400000 : 30;
    const attention = attentionScore({
      importance: n.mvs,
      urgency: urgencyFromDate(meta.review_by, now),
      recencyDays,
      signal: stn[n.type] ?? 0.6,
    });
    return { id: n.id, title: n.title, type: n.type, mvs: n.mvs, attention };
  }).sort((a, b) => b.attention - a.attention);
  res.json({ items: scored.slice(0, 25) });
});

// ---- Wave D4: Export bundle (no lock-in — vault reconstructable from this + R2) ----
radianRouter.get("/export-bundle", async (req: Authed, res) => {
  res.json(await repo.buildExportBundle(req.userId!));
});
radianRouter.post("/export-bundle", async (req: Authed, res) => {
  const j = await enqueue("export_bundle", req.userId!, {});
  await repo.jobs.record({ id: j.id, user_id: req.userId!, type: j.type, status: "queued" });
  res.status(202).json({ queued: true, job: j.id });
});

// ---- Wave C2: Multi-timescale reviews ----
radianRouter.get("/reviews", async (req: Authed, res) => {
  const kinds = new Set(["monthly_review", "quarterly_review", "annual_review"]);
  const items = (await repo.briefs.list(req.userId!)).filter((b) => kinds.has(b.kind));
  res.json({ items });
});
radianRouter.post("/reviews/:timescale", async (req: Authed, res) => {
  const t = req.params.timescale;
  if (!["monthly", "quarterly", "annual"].includes(t)) return res.status(400).json({ error: "bad_timescale" });
  const j = await enqueue(`${t}_review` as "monthly_review", req.userId!, {});
  await repo.jobs.record({ id: j.id, user_id: req.userId!, type: j.type, status: "queued" });
  res.status(202).json({ queued: true, job: j.id });
});

// ---- Wave C1: promote a node to CORE memory (owner-confirmed only) ----
radianRouter.post("/nodes/:id/promote-core", async (req: Authed, res) => {
  const node = await repo.nodes.get(req.userId!, req.params.id);
  if (!node) return res.status(404).json({ error: "not_found" });
  const meta = (node as { meta?: Record<string, unknown> }).meta || {};
  await repo.nodes.setMeta(req.userId!, req.params.id, { ...meta, memory_tier: "core" });
  await repo.emitEvent({ user_id: req.userId!, actor: "user", event_type: "state_transition", subject_type: "node", subject_id: req.params.id, correlation_id: req.params.id, payload: { memory_tier: "core" } });
  res.json({ ok: true, memory_tier: "core" });
});

// ---- Stage 6: Execution Agents (proposal-only drafts) ----
radianRouter.post("/agent-tasks", async (req: Authed, res) => {
  const kind = String(req.body?.kind || "") as AgentKind;
  const nodeId = String(req.body?.nodeId || "");
  if (!AGENT_KINDS.includes(kind)) return res.status(400).json({ error: "bad_kind", valid: AGENT_KINDS });
  if (!nodeId) return res.status(400).json({ error: "nodeId_required" });
  const j = await enqueue("agent_task", req.userId!, { nodeId, kind });
  await repo.jobs.record({ id: j.id, user_id: req.userId!, type: j.type, status: "queued" });
  res.status(202).json({ queued: true, job: j.id, proposal_only: true });
});
radianRouter.get("/agent-tasks", async (req: Authed, res) => {
  const nodes = await repo.nodes.list(req.userId!);
  res.json({ items: nodes.filter((n) => (n as { truth_label?: string }).truth_label === "Artifact") });
});

// ---- Stage 10: Strategic Simulation (on-demand) ----
radianRouter.post("/simulate", async (req: Authed, res) => {
  const question = String(req.body?.question || "").trim();
  if (!question) return res.status(400).json({ error: "question_required" });
  const contextNodeIds = Array.isArray(req.body?.contextNodeIds) ? req.body.contextNodeIds.map(String) : [];
  const j = await enqueue("simulation", req.userId!, { question, contextNodeIds });
  await repo.jobs.record({ id: j.id, user_id: req.userId!, type: j.type, status: "queued" });
  res.status(202).json({ queued: true, job: j.id, note: "estimate, not fact" });
});
radianRouter.get("/simulations", async (req: Authed, res) => {
  const nodes = await repo.nodes.list(req.userId!);
  res.json({ items: nodes.filter((n) => (n as { truth_label?: string }).truth_label === "Analysis") });
});

// ---- Stage 11: Meta-Radian memo (human approves prompt bumps) ----
radianRouter.post("/meta-review", async (req: Authed, res) => {
  const j = await enqueue("meta_review", req.userId!, {});
  await repo.jobs.record({ id: j.id, user_id: req.userId!, type: j.type, status: "queued" });
  res.status(202).json({ queued: true, job: j.id });
});
radianRouter.get("/meta", async (req: Authed, res) => {
  const caps = await repo.captures.list(req.userId!);
  res.json({ items: caps.filter((c) => c.source === "radian_meta") });
});

// Budget governor + provider snapshot. Surfaces the REAL state (ok/degrade/block)
// and month-to-date spend so cost is never a silent surprise.
radianRouter.get("/status", async (req: Authed, res) => {
  res.json(await budgetStatus(req.userId!));
});

// pgvector verdict (owner-gated). Attempts the extension + reports honestly so the
// owner can confirm semantic memory with one curl — the sandbox can't reach the DB.
radianRouter.get("/pgvector-check", async (_req: Authed, res) => {
  try {
    await repo.query(`CREATE EXTENSION IF NOT EXISTS vector`);
    const r = await repo.query<{ extversion: string }>(`SELECT extversion FROM pg_extension WHERE extname='vector'`);
    res.json({ available: true, version: r.rows[0]?.extversion ?? "unknown", note: "pgvector available — embeddings can be enabled; the VectorStore seam switches with no pipeline change." });
  } catch (e) {
    res.json({ available: false, reason: e instanceof Error ? e.message.slice(0, 200) : "unknown", note: "pgvector not available on this plan — entity/tag retrieval remains active. Upgrade the Postgres plan or keep the fallback." });
  }
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
