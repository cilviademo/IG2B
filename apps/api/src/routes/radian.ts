// RADIAN admin surface (Wave 0): Project Registry CRUD + budget/governor status.
// Everything keys off the registry, so it's editable at runtime without redeploy.
import { Router } from "express";
import * as repo from "@indigold/db";
import { seedProjectsIfEmpty, budgetStatus } from "@indigold/db";
import { id, enqueue, queueDepth, redisHealthy } from "@indigold/shared";
import { providersStatus, providerConfigured, resolveTask, PROVIDER_ENV, ALL_PROVIDERS, getTools, webSearchConfigured, type Provider } from "@indigold/shared/providers";
import { calibrate, AGENT_KINDS, type AgentKind } from "@indigold/shared";
import { DEFAULT_CONSTRAINTS, attentionScore, urgencyFromDate, computeSignalToNoise, type ConstraintProfile } from "@indigold/shared";
import { buildAttentionQueue, ageDays, inboxUrgency, type AttentionCandidate } from "@indigold/shared";
import { narrate, type Moment } from "@indigold/shared";
import { getEmbedder } from "@indigold/shared";
import { isResearchSafe, BudgetExceededError } from "@indigold/shared";
import { findVerb, verbsFor } from "@indigold/shared";
import { timeMachine, type RangeKey, type TimeMachineInput } from "@indigold/shared";
import { applyAction, suggestQuests, type QuestAction, type QuestSeed } from "@indigold/shared";
import {
  questReward, computeTracks, momentumFor, progressionSummary, inferTracks, TRACKS,
  MOMENTUM_STYLE, type Track, type CompletedQuest, type CaptureNode,
} from "@indigold/shared";
import { boardroom, type BoardroomSubject, type BoardroomSignals } from "@indigold/shared";
import { horizonScan, RESEARCH_CHAIN } from "@indigold/shared";
import { simulate, parseOptions, type SimSignals } from "@indigold/shared";
import { mentor, type MentorIntent } from "@indigold/shared";
import { morningBriefing } from "@indigold/shared";
import { assembleContext, type ContextCandidate } from "@indigold/shared";
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
projectsRouter.delete("/:id", async (req: Authed, res) => {
  await repo.projects.remove(req.userId!, req.params.id);
  await repo.emitEvent({ user_id: req.userId!, actor: "user", event_type: "deleted", subject_type: "project", subject_id: req.params.id, correlation_id: req.params.id, payload: {} });
  res.json({ ok: true });
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

// ---- Living OS G11: Context Engineering — goal-scoped, token-budgeted retrieval ----
// "Help me build BTZ TRACE" → assemble ONLY the relevant slice (related nodes, research,
// decisions, active quests) that fits the budget, not the whole vault. Deterministic
// (lexical + tag + recency + value + semantic-from-embeddings + hot cache). Persisted as
// a context pack (which also feeds the hot cache next time).
radianRouter.post("/context", async (req: Authed, res) => {
  const uid = req.userId!;
  const goal = String(req.body?.goal || "").trim();
  if (!goal) return res.status(400).json({ error: "goal_required" });
  const budget = Math.max(500, Math.min(16000, Number(req.body?.budget) || 4000));
  const now = Date.now();

  const [nodes, decisionsR, questList, packs] = await Promise.all([
    repo.nodes.list(uid), repo.decisions.list(uid), repo.quests.list(uid), repo.contextPacks.list(uid),
  ]);
  // semantic similarity of each node to the goal (embeddings; deterministic fallback).
  const sem = await semanticNeighbors(uid, goal, 50).catch(() => ({ matches: [] as { subject_id: string; score: number }[] }));
  const semScore = new Map(sem.matches.map((m) => [m.subject_id, m.score]));
  // hot cache = nodes referenced by the last few context packs.
  const hot = new Set<string>();
  for (const p of (packs as { source_nodes?: string[] }[]).slice(0, 5)) for (const n of (p.source_nodes || [])) hot.add(n);

  const recency = (iso?: string) => (iso ? (now - new Date(iso).getTime()) / 86400000 : 999);
  const candidates: ContextCandidate[] = [];
  for (const n of nodes) {
    candidates.push({
      id: n.id, kind: (n as { truth_label?: string }).truth_label === "Research" ? "research" : "node",
      title: n.title, text: `${n.title}\n${n.summary}`, tags: n.tags || [], mvs: n.mvs,
      recencyDays: Math.round(recency((n as { updated_at?: string }).updated_at)),
      semantic: semScore.get(n.id), hot: hot.has(n.id),
    });
  }
  for (const d of decisionsR as { id: string; decision: string; reasoning?: string; outcome?: string }[]) {
    candidates.push({ id: d.id, kind: "decision", title: d.decision, text: `${d.decision}\n${d.reasoning || ""}\n${d.outcome || ""}` });
  }
  for (const q of questList.filter((x) => x.state === "active" || x.state === "accepted")) {
    candidates.push({ id: q.id, kind: "quest", title: q.title, text: `${q.title}\n${q.summary || ""}` });
  }

  const plan = assembleContext(goal, candidates, budget);

  // persist as a context pack (feeds the hot cache next time).
  const cid = id("ctx");
  await repo.contextPacks.create({
    id: cid, user_id: uid, title: `Goal: ${goal}`.slice(0, 80), purpose: goal,
    token_budget: { total: budget, used: plan.tokensUsed },
    source_nodes: plan.included.filter((c) => c.kind === "node" || c.kind === "research").map((c) => c.id),
    sections: plan.sections as never,
  });
  await repo.emitEvent({ user_id: uid, actor: "agent:Encompass", event_type: "review_generated", subject_type: "context_pack", subject_id: cid, correlation_id: cid, payload: { goal, tokensUsed: plan.tokensUsed, included: plan.included.length } });

  res.json({ pack: cid, plan: { ...plan, included: plan.included.map((c) => ({ id: c.id, kind: c.kind, title: c.title, score: Number(c.score.toFixed(2)), reasons: c.reasons, tokens: c.tokens })) }, semantic_provider: sem.matches.length ? (sem as { provider?: string }).provider : "none" });
});

// ---- Conversational Radian: ask anything, with brain modes (Auto/Vault/General/Web/Research) ----
// Radian is a companion, NOT a vault gatekeeper: it answers generally with Claude when the
// vault is thin, and only restricts to the vault when asked. Web/Research go through the
// governed seam; live web is gated by WEB_RESEARCH=on (else honest "not configured", no fake
// sources). secret/internal nodes are excluded from context in every mode.
type ChatMode = "auto" | "vault" | "general" | "web" | "research";
function inferMode(q: string): Exclude<ChatMode, "auto"> {
  const t = q.toLowerCase();
  if (/\b(based on|from|in) (my|the) (vault|notes|captures|atlas|graph)\b|\bmy vault\b/.test(t)) return "vault";
  if (/\b(research|latest|current|recent|news|find|search|sources?|cite|repo|repository|github|gitlab|arxiv|article|paper|reel|tiktok|youtube|on the web|online)\b/.test(t)) return "research";
  return "general"; // default: answer, never refuse
}

radianRouter.post("/chat", async (req: Authed, res) => {
  const uid = req.userId!;
  const question = String(req.body?.question || "").trim().slice(0, 1000);
  if (!question) return res.status(400).json({ error: "question_required" });
  // Durable thread: when a conversationId is given, history comes from the stored
  // thread (authoritative) and both turns are persisted below.
  const conversationId = req.body?.conversationId ? String(req.body.conversationId) : null;
  let history: { role: string; text: string }[];
  if (conversationId) {
    const thread = await repo.messages.list(uid, conversationId, 12).catch(() => []);
    history = thread.slice(-6).map((m) => ({ role: m.role === "you" ? "User" : "Radian", text: String(m.text || "").slice(0, 600) }));
  } else {
    history = (Array.isArray(req.body?.history) ? req.body.history : [])
      .slice(-6).map((h: { role?: string; text?: string }) => ({ role: h.role === "you" ? "User" : "Radian", text: String(h.text || "").slice(0, 600) }));
  }
  const mode = (["auto", "vault", "general", "web", "research"].includes(String(req.body?.mode)) ? String(req.body?.mode) : "auto") as ChatMode;
  const resolvedMode = mode === "auto" ? inferMode(question) : mode;
  const wantWeb = resolvedMode === "web" || resolvedMode === "research";
  const webConfigured = webSearchConfigured(); // real Tavily/Brave key present?

  // Live web search (governed seam) — only in web/research modes, only when configured.
  // Returns real {title,url,snippet}; we cite exactly these, never fabricate.
  let webResults: { title: string; url: string; snippet: string }[] = [];
  if (wantWeb && webConfigured) {
    const tr = await getTools().web_search.run({ query: question, max: 5 });
    if (tr.ok) webResults = ((tr.data as { results?: { title: string; url: string; snippet: string }[] }).results || []).slice(0, 5);
  }

  // Vault retrieval (research-safe only) — context for vault/web/research and connection for general.
  const sem = await semanticNeighbors(uid, question, 12).catch(() => ({ matches: [] as { subject_id: string; score: number }[] }));
  const nodes = await repo.nodes.list(uid);
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const safe = (n: typeof nodes[number]) => isResearchSafe(String((n as { meta?: { sensitivity?: string } }).meta?.sensitivity || "private"));
  let picked = sem.matches.map((m) => byId.get(m.subject_id)).filter((n): n is typeof nodes[number] => !!n).filter(safe).slice(0, 8);
  if (picked.length === 0 && resolvedMode === "vault") picked = nodes.filter(safe).slice(0, 8);
  const ctx = picked.map((n) => `- ${n.title}: ${(n.summary || "").slice(0, 280)}`).join("\n");
  const convo = history.length ? history.map((h: { role: string; text: string }) => `${h.role}: ${h.text}`).join("\n") + "\n\n" : "";

  const webBlock = webResults.length
    ? `\n\nWEB RESULTS (cite these by title; use ONLY these for current/web facts):\n${webResults.map((w) => `- ${w.title} (${w.url}): ${w.snippet}`).join("\n")}`
    : "";

  let system: string;
  if (resolvedMode === "vault") {
    system = "You are Radian, the owner's personal intelligence. Answer ONLY from the vault context. State what IS known; if something isn't covered, say so plainly — don't invent. Be a helpful assistant, not a gatekeeper.";
  } else {
    const webClause = wantWeb
      ? (webResults.length
        ? " Use the WEB RESULTS for current facts and cite them by title; do not invent sources beyond them."
        : " Live web research is NOT available right now, so rely on general knowledge and DO NOT claim current/web-verified facts or cite sources you can't see.")
      : "";
    system = `You are Radian, the owner's personal intelligence OS — a sharp, candid companion.${webClause} Answer the question directly and usefully with your general reasoning first. Then, if the vault context is relevant, add a short "In your Indigold context:" paragraph connecting it to their work. Never refuse for lack of vault context. Never invent sources.`;
  }
  const prompt = `${convo}VAULT CONTEXT${resolvedMode === "vault" ? "" : " (may be empty — use only if relevant)"}:\n${ctx || "(none)"}${webBlock}\n\nQUESTION: ${question}`;

  let answer = "";
  let provider = "deterministic";
  try {
    const r = await repo.governedComplete({
      userId: uid, tier: "strong", task: wantWeb ? "research" : "synthesis", purpose: "chat", system, prompt,
    });
    provider = r.provider;
    answer = r.text || "";
  } catch (e) {
    answer = e instanceof BudgetExceededError ? "Budget governor reached — I've paused model calls to avoid overspending. Try again next cycle." : "";
  }

  const grounding = resolvedMode === "vault" ? "vault" : ctx ? "mixed" : "general";
  const vaultSources = picked.slice(0, 5).map((n) => ({ id: n.id, title: n.title }));
  const webSources = webResults.map((w) => ({ title: w.title, url: w.url }));
  const finalAnswer = answer || "Let me try that another way — could you rephrase, or pick a mode (Vault / General / Research)?";

  // Persist both turns to the durable thread (best-effort; never fail the answer).
  if (conversationId) {
    try {
      await repo.messages.add({ id: id("msg"), conversation_id: conversationId, user_id: uid, role: "you", text: question });
      await repo.messages.add({ id: id("msg"), conversation_id: conversationId, user_id: uid, role: "radian", text: finalAnswer, sources: [...vaultSources, ...webSources], meta: { mode: resolvedMode, grounding, deterministic: provider === "deterministic", usedWeb: webResults.length > 0 } });
      await repo.conversations.touch(conversationId);
    } catch { /* thread persistence is best-effort */ }
  }

  res.json({
    conversationId,
    answer: finalAnswer,
    mode: resolvedMode,
    grounding,
    provider,
    deterministic: provider === "deterministic",
    usedWeb: webResults.length > 0,
    webNote: wantWeb && !webConfigured ? "Web research isn't configured — answered with general reasoning. Save it as a research task to queue for later." : undefined,
    sources: [...vaultSources, ...webSources],
  });
});

// Save a Radian answer to the vault (reuses the capture→ingest pipeline so it's
// classified, connected, and searchable like anything else).
radianRouter.post("/remember", async (req: Authed, res) => {
  const uid = req.userId!;
  const question = String(req.body?.question || "").trim().slice(0, 200);
  const answer = String(req.body?.answer || "").trim();
  if (!answer) return res.status(400).json({ error: "answer_required" });
  const capId = id("cap");
  await repo.captures.create({
    id: capId, user_id: uid, type: "manual_text", source: "radian_chat",
    captured_at: new Date().toISOString(), truth_layer: "A", status: "inbox",
    sensitivity: "internal", processing_status: "unprocessed",
    title: question || "Radian answer", note: answer, url: null, screenshot_ref: null,
  });
  const j = await enqueue("ingest_capture", uid, { captureId: capId });
  await repo.jobs.record({ id: j.id, user_id: uid, type: j.type, status: "queued", payload: j.payload });
  await repo.emitEvent({ user_id: uid, actor: "user", event_type: "capture_created", subject_type: "capture", subject_id: capId, correlation_id: capId, payload: { source: "radian_chat" } });
  res.json({ ok: true, capture: capId });
});

// Owner feedback on an arrival/finding (useful | not_useful | wrong_connection | dismiss).
// Persisted on the node so it survives reload and feeds arrival-card ranking (dismissed
// items stop resurfacing; "not useful" is demoted). Proposal-only: never deletes data.
radianRouter.post("/feedback", async (req: Authed, res) => {
  const uid = req.userId!;
  const nodeId = String(req.body?.nodeId || "");
  const kind = String(req.body?.kind || "");
  if (!nodeId || !["useful", "not_useful", "wrong_connection", "dismiss"].includes(kind)) {
    return res.status(400).json({ error: "nodeId + valid kind required" });
  }
  await repo.nodes.setFeedback(uid, nodeId, { kind, at: new Date().toISOString() });
  await repo.emitEvent({ user_id: uid, actor: "user", event_type: "feedback", subject_type: "node", subject_id: nodeId, correlation_id: nodeId, payload: { kind } });
  res.json({ ok: true });
});

// ---- Durable conversation threads (Sprint 3) ----
radianRouter.post("/conversations", async (req: Authed, res) => {
  const uid = req.userId!;
  const title = String(req.body?.title || "Conversation").trim().slice(0, 120) || "Conversation";
  const anchorType = ["open", "node", "capture", "project", "decision"].includes(String(req.body?.anchorType)) ? String(req.body.anchorType) : "open";
  const anchorId = req.body?.anchorId ? String(req.body.anchorId) : null;
  // Reuse an existing thread for the same anchor (so a node/project/decision has one ongoing
  // conversation — the "workstream thread").
  if (anchorType !== "open" && anchorId) {
    const existing = await repo.conversations.findAnchored(uid, anchorType, anchorId);
    if (existing) return res.json({ conversation: existing, reused: true });
  }
  const c = await repo.conversations.create({ id: id("conv"), user_id: uid, title, anchor_type: anchorType, anchor_id: anchorId });
  res.json({ conversation: c });
});
radianRouter.get("/conversations", async (req: Authed, res) => {
  const uid = req.userId!;
  const q = String(req.query.q || "").trim().slice(0, 120);
  const list = q ? await repo.conversations.search(uid, q) : await repo.conversations.list(uid);
  // Enrich anchored threads with the anchor's title so the UI can show "on: <title>"
  // (Sprint 3b: node/capture/project/decision-anchored threads are recognizable in the list).
  const idsOf = (t: string) => list.filter((c) => c.anchor_type === t && c.anchor_id).map((c) => c.anchor_id as string);
  const titles = new Map<string, string>();
  const projById = list.some((c) => c.anchor_type === "project") ? new Map((await repo.projects.list(uid)).map((p) => [p.id, p.name] as const)) : new Map<string, string>();
  const decById = list.some((c) => c.anchor_type === "decision") ? new Map((await repo.decisions.list(uid) as { id: string; decision: string }[]).map((d) => [d.id, d.decision] as const)) : new Map<string, string>();
  await Promise.all([
    ...[...new Set(idsOf("node"))].map(async (n) => { const x = await repo.nodes.get(uid, n).catch(() => null); if (x) titles.set(n, x.title); }),
    ...[...new Set(idsOf("capture"))].map(async (c) => { const x = await repo.captures.get(uid, c).catch(() => null); if (x) titles.set(c, x.title); }),
  ]);
  for (const c of list) {
    if (c.anchor_id && c.anchor_type === "project" && projById.get(c.anchor_id)) titles.set(c.anchor_id, projById.get(c.anchor_id)!);
    if (c.anchor_id && c.anchor_type === "decision" && decById.get(c.anchor_id)) titles.set(c.anchor_id, decById.get(c.anchor_id)!);
  }
  const conversations = list.map((c) => ({ ...c, anchor_title: c.anchor_id ? (titles.get(c.anchor_id) || null) : null }));
  res.json({ conversations });
});
radianRouter.get("/conversations/:id", async (req: Authed, res) => {
  const conversation = await repo.conversations.get(req.userId!, req.params.id);
  if (!conversation) return res.status(404).json({ error: "not_found" });
  res.json({ conversation, messages: await repo.messages.list(req.userId!, req.params.id) });
});
radianRouter.post("/conversations/:id/archive", async (req: Authed, res) => {
  await repo.conversations.setStatus(req.userId!, req.params.id, "archived");
  res.json({ ok: true });
});

// ---- Sprint 4: Attention Queue — "what needs you now" (deterministic ranker) ----
// Composes the owner's real signals (inbox backlog, blocked/in-play quests, open reviews,
// resurfaced forgotten gems) into a short, scored "do next" list via the pure
// `buildAttentionQueue`. Honours Sprint 2b feedback (dismissed → dropped, useful → boosted)
// and ties into Sprint 3b (revisit → "Discuss" opens that node's thread). No LLM, no mutation.
radianRouter.get("/attention", async (req: Authed, res) => {
  const uid = req.userId!;
  const now = Date.now();
  const [captures, questList, nodes, edges, opps] = await Promise.all([
    repo.captures.list(uid), repo.quests.list(uid), repo.nodes.list(uid), repo.edges.list(uid), repo.opportunities.list(uid),
  ]);
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const cands: AttentionCandidate[] = [];

  // Inbox backlog → triage (louder with age); a few oldest only.
  const inbox = (captures as { id: string; title: string; status?: string; captured_at?: string }[])
    .filter((c) => c.status === "inbox")
    .sort((a, b) => new Date(a.captured_at || 0).getTime() - new Date(b.captured_at || 0).getTime());
  for (const c of inbox.slice(0, 4)) {
    const d = ageDays(c.captured_at, now);
    cands.push({
      id: c.id, kind: "triage", title: c.title || "Untitled capture",
      inputs: { importance: 50, urgency: inboxUrgency(d), recencyDays: 0, signal: 0.6 },
      reason: d >= 1 ? `Captured ${Math.round(d)}d ago — not yet triaged` : "Just captured — triage it",
      action: { label: "Triage", verb: "triage", subjectType: "capture", subjectId: c.id },
    });
  }

  // Quests: blocked → unblock (loud); in-play (snoozed/active) → due.
  for (const q of questList) {
    const rd = Math.round(ageDays((q as { updated_at?: string }).updated_at, now));
    if (q.state === "blocked") {
      cands.push({ id: q.id, kind: "unblock", title: q.title, inputs: { importance: 70, urgency: 90, recencyDays: rd, signal: 0.7 }, reason: "Blocked — needs you to clear the blocker", action: { label: "Unblock", verb: "unblock", subjectType: "quest", subjectId: q.id } });
    } else if (q.state === "active" || q.state === "accepted") {
      const due = (q as { snooze_until?: string | null }).snooze_until;
      cands.push({ id: q.id, kind: "due", title: q.title, inputs: { importance: 60, urgency: due ? urgencyFromDate(due, now) : 45, recencyDays: rd, signal: 0.7 }, reason: due ? "Resuming soon" : "In play — keep momentum", action: { label: "Open", verb: "open", subjectType: "quest", subjectId: q.id } });
    }
  }

  // Open reviews (opportunities awaiting a decision).
  for (const o of (opps as { id: string; title?: string; status?: string; created_at?: string }[]).filter((x) => x.status === "review").slice(0, 3)) {
    cands.push({ id: o.id, kind: "review", title: o.title || "Opportunity", inputs: { importance: 55, urgency: 55, recencyDays: Math.round(ageDays(o.created_at, now)), signal: 0.6 }, reason: "Awaiting your review", action: { label: "Review", verb: "review", subjectType: "opportunity", subjectId: o.id } });
  }

  // Resurfaced forgotten gems → revisit (honours per-node feedback; Discuss opens its thread).
  const tm = timeMachine({ nodes: nodes as TimeMachineInput["nodes"], edges: edges as TimeMachineInput["edges"] }, "30d", now);
  for (const g of tm.resurfaced.forgottenGems.slice(0, 5)) {
    const n = byId.get(g.id);
    const fb = (n as { meta?: { feedback?: { kind?: string } } } | undefined)?.meta?.feedback?.kind as AttentionCandidate["feedback"];
    cands.push({ id: g.id, kind: "revisit", title: g.title, inputs: { importance: Math.max(60, n?.mvs ?? 70), urgency: 30, recencyDays: 30, signal: 0.6 }, reason: "High-value idea gone quiet — worth revisiting", action: { label: "Discuss", verb: "discuss", subjectType: "node", subjectId: g.id }, feedback: fb ?? null });
  }

  const queue = buildAttentionQueue(cands, 7);
  res.json({ queue, counts: { inbox: inbox.length, blocked: questList.filter((q) => q.state === "blocked").length, candidates: cands.length } });
});

// ---- Sprint 5: Narrative Timeline — the vault's history as a readable story ----
// Assembles REAL dated moments (captures, ideas, research, connections, decisions, completed
// quests) from the live vault and runs the pure `narrate` composer → newest-first chapters
// (This week / Last week / by month) each with a deterministic summary. Themes + resurfaced
// (Time Machine, 30d) annotate only the most-recent chapter. No LLM. Replaces the old static
// sample-timeline screen with the owner's actual story.
radianRouter.get("/narrative", async (req: Authed, res) => {
  const uid = req.userId!;
  const now = Date.now();
  const [nodes, edges, decisionsR, captures, questList] = await Promise.all([
    repo.nodes.list(uid), repo.edges.list(uid), repo.decisions.list(uid), repo.captures.list(uid), repo.quests.list(uid),
  ]);
  const moments: Moment[] = [];

  for (const c of captures as { id: string; title?: string; captured_at?: string }[]) {
    if (c.captured_at) moments.push({ id: c.id, date: c.captured_at, kind: "capture", title: c.title || "Capture" });
  }
  for (const n of nodes) {
    const created = (n as { created_at?: string }).created_at;
    if (!created) continue;
    const label = (n as { truth_label?: string }).truth_label;
    const inference = (n as { meta?: { epistemic_type?: string } }).meta?.epistemic_type === "inference";
    const kind: Moment["kind"] = label === "Research" ? "research" : inference ? "research" : "idea";
    moments.push({ id: n.id, date: created, kind, title: n.title });
  }
  // Real connections only (exclude derived_from provenance edges — those are AI plumbing).
  const titleById = new Map(nodes.map((n) => [n.id, n.title] as const));
  for (const e of edges as { id: string; relationship?: string; valid_from?: string; source_id: string; target_id: string }[]) {
    if (!e.valid_from || e.relationship === "derived_from") continue;
    const a = titleById.get(e.source_id), b = titleById.get(e.target_id);
    if (!a || !b) continue;
    moments.push({ id: e.id, date: e.valid_from, kind: "connection", title: `${a} ↔ ${b}` });
  }
  for (const d of decisionsR as { id: string; decision: string; created_at?: string }[]) {
    if (d.created_at) moments.push({ id: d.id, date: d.created_at, kind: "decision", title: d.decision });
  }
  for (const q of questList) {
    if (q.state === "completed" && q.updated_at) moments.push({ id: q.id, date: q.updated_at, kind: "milestone", title: q.title });
  }

  const tm = timeMachine({ nodes: nodes as TimeMachineInput["nodes"], edges: edges as TimeMachineInput["edges"] }, "30d", now);
  const { chapters } = narrate(moments, {
    now,
    themes: tm.replay.themes.map((t) => t.tag),
    resurfaced: tm.resurfaced.resurfacedThemes,
  });
  res.json({ chapters, total_moments: moments.length });
});

// ---- Living OS G10: Companion — the spoken commander's briefing (deterministic) ----
// Assembles a "Jarvis" morning briefing from real signals (momentum, resurfaced, critical
// quests, recommended focus, XP/streak). The PWA reads `speech` aloud. No LLM.
radianRouter.get("/briefing", async (req: Authed, res) => {
  const uid = req.userId!;
  await seedProjectsIfEmpty(uid);
  const now = Date.now();
  const [questList, nodes, edges, projects] = await Promise.all([
    repo.quests.list(uid), repo.nodes.list(uid), repo.edges.list(uid), repo.projects.list(uid),
  ]);
  // project momentum (light) → accelerated + top + dormant.
  const day14 = 14 * 86400000;
  const moms = projects.filter((p) => (p as { status?: string }).status === "active").map((p) => {
    const ptags = new Set(((p.tags as string[]) || []).map((t) => t.toLowerCase()));
    const token = p.name.toLowerCase().split(/\s+/)[0];
    const related = nodes.filter((n) => (n.tags || []).some((t) => ptags.has((t || "").toLowerCase())) || n.title.toLowerCase().includes(token));
    const recentNodes = related.filter((n) => { const u = (n as { updated_at?: string }).updated_at; return u && now - new Date(u).getTime() <= day14; }).length;
    const last = Math.max(0, ...related.map((n) => new Date((n as { updated_at?: string }).updated_at || 0).getTime()));
    const inactivity = last ? Math.round((now - last) / 86400000) : 999;
    const pq = questList.filter((q) => q.project_id === p.id);
    const m = momentumFor({ recentNodes, activeQuests: pq.filter((q) => q.state === "active" || q.state === "accepted").length, completedQuests: pq.filter((q) => q.state === "completed").length, blocked: pq.some((q) => q.state === "blocked"), inactivityDays: inactivity, hasHistory: related.length > 0 || pq.length > 0 });
    return { name: p.name, m };
  });
  const accelerated = moms.filter((x) => x.m === "accelerating" || x.m === "compounding").map((x) => x.name);
  const topMomentum = accelerated[0] || moms.find((x) => x.m === "active")?.name || null;
  const tm = timeMachine({ nodes: nodes as TimeMachineInput["nodes"], edges: edges as TimeMachineInput["edges"] }, "30d");
  const resurfaced = [...tm.resurfaced.resurfacedThemes, ...tm.resurfaced.forgottenGems.map((g) => g.title)].slice(0, 2);
  const inPlay = questList.filter((q) => q.state === "active" || q.state === "accepted");
  const criticalQuests = questList.filter((q) => q.state === "blocked").length;
  const recommendedFocus = (inPlay.length ? inPlay : questList.filter((q) => q.state === "suggested")).slice(0, 3).map((q) => q.title);
  // XP today + streak from the ledger.
  const midnight = new Date(); midnight.setUTCHours(0, 0, 0, 0);
  const todayXp = (await repo.xp.since(uid, midnight.toISOString())).reduce((s, r) => s + r.amount, 0);
  const activeDays = new Set(await repo.xp.activeDays(uid)); let streak = 0;
  for (let i = 0; i < 60; i++) { const k = new Date(now - i * 86400000).toISOString().slice(0, 10); if (activeDays.has(k)) streak++; else if (i > 0) break; }

  const briefing = morningBriefing({ now, acceleratedProjects: accelerated, topMomentum, resurfaced, criticalQuests, activeQuests: inPlay.length, recommendedFocus, todayXp, streak });
  res.json({ briefing });
});

// ---- Living OS G9: Mentor Mode — "talk with past you" (deterministic) ----
// Voices the owner's real history (Time Machine window + decisions/calibration + active
// focus + constraints) as first-person reflection. No LLM; nothing fabricated.
radianRouter.post("/mentor", async (req: Authed, res) => {
  const uid = req.userId!;
  const intent = String(req.body?.intent || "then") as MentorIntent;
  const days = req.body?.range ? Math.max(1, parseInt(String(req.body.range)) || 90) : 90;
  if (!["then", "changed", "wrong", "advice", "best_self"].includes(intent)) return res.status(400).json({ error: "bad_intent" });

  const [nodes, edges, decisionsR, constraintsR] = await Promise.all([
    repo.nodes.list(uid), repo.edges.list(uid), repo.decisions.list(uid), repo.constraints.get(uid),
  ]);
  const tm = timeMachine({ nodes: nodes as TimeMachineInput["nodes"], edges: edges as TimeMachineInput["edges"] }, "custom", Date.now(), days);
  const cal = calibrate(await repo.decisions.forCalibration(uid));
  const decisions = (decisionsR as { decision: string; confidence?: number; outcome_success?: boolean | null; outcome?: string }[])
    .map((d) => ({ decision: d.decision, confidence: d.confidence, success: d.outcome_success ?? null, outcome: d.outcome }));
  const activeFocus = [...nodes].sort((a, b) => b.mvs - a.mvs).slice(0, 4).map((n) => ({ title: n.title, mvs: n.mvs }));
  const profile = (constraintsR || {}) as { weekly_hours?: number; risk_tolerance?: string };

  const reply = mentor(intent, {
    windowLabel: tm.window.label.toLowerCase(),
    topNodes: tm.replay.topNodes.map((n) => ({ title: n.title, mvs: n.mvs })),
    themes: tm.replay.themes.map((t) => t.tag),
    newThemes: tm.changes.newThemes,
    decayedThemes: tm.changes.decayedThemes,
    resurfacedThemes: tm.resurfaced.resurfacedThemes,
    decisions, calibrationNote: cal.note, activeFocus,
    constraints: { weekly_hours: profile.weekly_hours, risk_tolerance: profile.risk_tolerance },
  });
  await repo.emitEvent({ user_id: uid, actor: "agent:Chronos", event_type: "review_generated", subject_type: "mentor", subject_id: uid, correlation_id: uid, payload: { intent, bootstrap: reply.bootstrap } });
  res.json({ reply });
});

// ---- Living OS G7: Simulation Engine — synchronous "what happens if…?" (deterministic) ----
// Best / likely / worst with probability ESTIMATES, computed from real graph signals
// (momentum, value, recency, connectedness). Comparisons ("A vs B") score each option
// against its matching project. Persisted as an "Analysis" node. No LLM; the async
// `simulation` job stays the deeper live path.
radianRouter.post("/whatif", async (req: Authed, res) => {
  const uid = req.userId!;
  const question = String(req.body?.question || "").trim();
  if (!question) return res.status(400).json({ error: "question_required" });
  await seedProjectsIfEmpty(uid);
  const [projects, nodes, edges, quests] = await Promise.all([repo.projects.list(uid), repo.nodes.list(uid), repo.edges.list(uid), repo.quests.list(uid)]);
  const now = Date.now();

  // Compute deterministic signals for a named option by matching a project/node.
  const signalsFor = (name: string): SimSignals => {
    const n = name.toLowerCase();
    const proj = projects.find((p) => p.name.toLowerCase().includes(n) || n.includes(p.name.toLowerCase().split(/\s+/)[0]));
    const ptags = new Set(((proj?.tags as string[]) || []).map((t) => t.toLowerCase()));
    const token = (proj?.name || name).toLowerCase().split(/\s+/)[0];
    const related = nodes.filter((x) => (x.tags || []).some((t) => ptags.has((t || "").toLowerCase())) || x.title.toLowerCase().includes(token));
    if (!proj && related.length === 0) return { hasData: false };
    const lastTouch = Math.max(0, ...related.map((x) => new Date((x as { updated_at?: string }).updated_at || 0).getTime()));
    const recencyDays = lastTouch ? Math.round((now - lastTouch) / 86400000) : 999;
    const recentNodes = related.filter((x) => { const u = (x as { updated_at?: string }).updated_at; return u && now - new Date(u).getTime() <= 14 * 86400000; }).length;
    const pq = proj ? quests.filter((q) => q.project_id === proj.id) : [];
    const mom = momentumFor({
      recentNodes, activeQuests: pq.filter((q) => q.state === "active" || q.state === "accepted").length,
      completedQuests: pq.filter((q) => q.state === "completed").length,
      blocked: pq.some((q) => q.state === "blocked"), inactivityDays: recencyDays, hasHistory: related.length > 0 || pq.length > 0,
    });
    return { hasData: true, momentum: mom, mvs: Math.max(0, ...related.map((x) => x.mvs || 0)), recencyDays, degree: related.length };
  };

  const optionNames = Array.isArray(req.body?.options) && req.body.options.length >= 2
    ? req.body.options.map(String) : parseOptions(question);
  const result = optionNames.length >= 2
    ? simulate({ question, options: optionNames.map((name: string) => ({ name, sig: signalsFor(name) })) })
    : simulate({ question, signals: signalsFor(question) });

  // persist as an Analysis node (shows in GET /radian/simulations).
  const sid = id("node");
  await repo.nodes.create({
    id: sid, user_id: uid, type: "concept", title: `What-if — ${question.slice(0, 60)}`,
    summary: result.recommendation.slice(0, 400), truth_layer: "C", truth_label: "Analysis", mvs: 55, tags: ["simulation", "whatif"],
    meta: { simulation: result, estimate: true, epistemic_type: "inference" },
  });
  await repo.emitEvent({ user_id: uid, actor: "agent:Radian", event_type: "review_generated", subject_type: "node", subject_id: sid, correlation_id: sid, payload: { whatif: true, kind: result.kind } });

  res.json({ result, node: sid });
});

// ---- Living OS G6: Research Engine — horizon scan (deterministic planner) ----
// Proposes the next research directions across active domains (computed from graph gaps;
// no fabricated findings, no network), files a `horizon` brief, and seeds research quests
// so the loop closes. The live web-fetch path (existing `research` job + tool adapters)
// upgrades the same chain when a provider/token is connected.
radianRouter.get("/horizon", async (req: Authed, res) => {
  const latest = (await repo.briefs.list(req.userId!)).find((b) => b.kind === "horizon");
  res.json({ horizon: latest || null, chain: RESEARCH_CHAIN });
});

radianRouter.post("/horizon-scan", async (req: Authed, res) => {
  const uid = req.userId!;
  await seedProjectsIfEmpty(uid);
  const [projects, nodes] = await Promise.all([repo.projects.list(uid), repo.nodes.list(uid)]);
  const directions = horizonScan({
    projects: projects.map((p) => ({ id: p.id, name: p.name, tags: p.tags || [], status: (p as { status?: string }).status })),
    nodes: nodes.map((n) => ({ title: n.title, tags: n.tags || [], mvs: n.mvs, updated_at: (n as { updated_at?: string }).updated_at, source: (n as { source?: string }).source })),
  });
  const briefId = id("brief");
  await repo.briefs.create({ id: briefId, user_id: uid, kind: "horizon", period: new Date().toISOString().slice(0, 10), payload: { directions, scanned_at: new Date().toISOString(), chain: RESEARCH_CHAIN } });
  await repo.emitEvent({ user_id: uid, actor: "agent:Radian", event_type: "brief_generated", subject_type: "brief", subject_id: briefId, correlation_id: briefId, payload: { kind: "horizon", directions: directions.length } });

  // Seed research quests from the top directions (dedup by title).
  const existing = new Set((await repo.quests.list(uid)).map((q) => q.title));
  let made = 0;
  for (const d of directions.filter((x) => x.priority !== "low").slice(0, 3)) {
    const title = `Research: ${d.topic}`;
    if (existing.has(title)) continue;
    const qid = id("quest");
    await repo.quests.create({ id: qid, user_id: uid, title, summary: d.rationale, kind: "research", state: "suggested", source_type: "research", meta: { horizon: true, project_id: d.project_id, source_type: d.sourceType } });
    await repo.emitEvent({ user_id: uid, actor: "agent:Radian", event_type: "state_transition", subject_type: "quest", subject_id: qid, correlation_id: d.project_id || qid, payload: { suggested: true, source: "research" } });
    made++;
  }
  res.status(201).json({ directions, quests_created: made, chain: RESEARCH_CHAIN });
});

// ---- Living OS G5: Boardroom & Multi-Agent Council (synchronous + deterministic) ----
// Six personas deliberate over a subject and converge on a resolved action. Works with
// NO provider key (stub) — every line is rule-derived from the subject + its graph. The
// result is persisted as a "Boardroom" node with provenance + an event.
radianRouter.post("/boardroom", async (req: Authed, res) => {
  const uid = req.userId!;
  const subjectType = String(req.body?.subject_type || "");
  const subjectId = String(req.body?.subject_id || "");
  const question = req.body?.question ? String(req.body.question) : undefined;
  if (!["node", "project", "brief", "capture"].includes(subjectType) || !subjectId) return res.status(400).json({ error: "bad_subject" });

  let subject: BoardroomSubject | null = null;
  const sig: BoardroomSignals = { question };
  const now = Date.now();

  if (subjectType === "node") {
    const n = await repo.nodes.get(uid, subjectId);
    if (!n) return res.status(404).json({ error: "not_found" });
    const edges = await repo.edges.list(uid);
    const touching = edges.filter((e) => e.source_id === subjectId || e.target_id === subjectId);
    const neighborIds = touching.map((e) => (e.source_id === subjectId ? e.target_id : e.source_id));
    const all = await repo.nodes.list(uid);
    const byId = new Map(all.map((x) => [x.id, x]));
    subject = { title: n.title, summary: n.summary, mvs: n.mvs, tags: n.tags || [], type: n.type };
    sig.degree = touching.length;
    sig.recentEdges = touching.filter((e) => e.valid_from && now - new Date(e.valid_from).getTime() <= 14 * 86400000).length;
    sig.inboundBlocked = touching.some((e) => e.target_id === subjectId && /block/i.test(e.relationship));
    sig.recencyDays = (n as { updated_at?: string }).updated_at ? Math.round((now - new Date((n as { updated_at?: string }).updated_at!).getTime()) / 86400000) : 0;
    sig.related = neighborIds.map((idv) => byId.get(idv)?.title).filter((t): t is string => !!t).slice(0, 3);
  } else if (subjectType === "capture") {
    const c = await repo.captures.get(uid, subjectId);
    if (!c) return res.status(404).json({ error: "not_found" });
    subject = { title: c.title, summary: c.note || c.url || "", mvs: 50, tags: [], type: "capture" };
  } else if (subjectType === "project") {
    const proj = (await repo.projects.list(uid)).find((x) => x.id === subjectId);
    if (!proj) return res.status(404).json({ error: "not_found" });
    const all = await repo.nodes.list(uid);
    const ptags = new Set((proj.tags || []).map((t: string) => t.toLowerCase()));
    const related = all.filter((n) => (n.tags || []).some((t) => ptags.has((t || "").toLowerCase())));
    subject = { title: proj.name, summary: proj.description || proj.objectives, mvs: 70, tags: proj.tags || [], type: "project" };
    sig.degree = related.length;
    sig.related = related.slice(0, 3).map((n) => n.title);
  } else {
    const b = (await repo.briefs.list(uid)).find((x) => x.id === subjectId);
    subject = { title: b ? `${b.kind} brief` : "brief", summary: b ? JSON.stringify(b.payload).slice(0, 200) : "", mvs: 50, type: "brief" };
  }

  // shared signals: decision calibration → Historian.
  try { sig.calibrationNote = calibrate(await repo.decisions.forCalibration(uid)).note; } catch { /* none */ }

  const synthesis = boardroom(subject!, sig);

  // persist as a Boardroom node with provenance.
  const bid = id("node");
  await repo.nodes.create({
    id: bid, user_id: uid, type: "concept", title: `Boardroom — ${subject!.title}`.slice(0, 80),
    summary: synthesis.resolved.slice(0, 400), truth_layer: "C", truth_label: "Boardroom", mvs: 60, tags: ["boardroom"],
    meta: { boardroom: synthesis, subject_type: subjectType, subject_id: subjectId, epistemic_type: "inference" },
  });
  if (subjectType === "node") {
    await repo.edges.create({ id: id("edge"), user_id: uid, source_id: subjectId, target_id: bid, relationship: "extends", weight: 0.8, valid_from: new Date().toISOString(), label: "boardroom" });
  }
  await repo.emitEvent({ user_id: uid, actor: "agent:Radian", event_type: "review_generated", subject_type: "node", subject_id: bid, correlation_id: subjectId, payload: { boardroom: true } });

  res.json({ synthesis, node: bid });
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

// Distinct Atlas badges: active (diamond) vs completed (checkmark).
radianRouter.get("/quests/node-status", async (req: Authed, res) => {
  const [active, completed] = await Promise.all([
    repo.quests.nodeIdsByStates(req.userId!, ["accepted", "active"]),
    repo.quests.nodeIdsByStates(req.userId!, ["completed"]),
  ]);
  res.json({ active, completed });
});

// ---- Living OS G4: Progression (deterministic; XP totals recomputed from current
// data, ledger backs today's XP / streak / time deltas). NO LLM. ----
radianRouter.get("/progression", async (req: Authed, res) => {
  const uid = req.userId!;
  const days = req.query.range ? Math.max(1, parseInt(String(req.query.range)) || 30) : 0;
  await seedProjectsIfEmpty(uid);
  const [questList, nodes, edges, projects, activeDays] = await Promise.all([
    repo.quests.list(uid), repo.nodes.list(uid), repo.edges.list(uid), repo.projects.list(uid), repo.xp.activeDays(uid),
  ]);
  const now = Date.now();
  const completedQuests: CompletedQuest[] = questList.filter((q) => q.state === "completed").map((q) => ({ kind: q.kind, title: q.title }));
  const captureNodes: CaptureNode[] = nodes.map((n) => ({ mvs: n.mvs, title: n.title, tags: n.tags || [] }));
  const tracks = computeTracks({ completedQuests, nodes: captureNodes });

  // today's XP + per-track, from the ledger (UTC midnight).
  const midnight = new Date(); midnight.setUTCHours(0, 0, 0, 0);
  const todayRows = await repo.xp.since(uid, midnight.toISOString());
  const todayXp = todayRows.reduce((s, r) => s + r.amount, 0);
  const todayByTrack: Partial<Record<Track, number>> = {};
  for (const r of todayRows) todayByTrack[r.track as Track] = (todayByTrack[r.track as Track] || 0) + r.amount;
  const todayQuests = new Set(todayRows.filter((r) => r.source_type === "quest").map((r) => r.source_id)).size;
  const todayCaptures = nodes.filter((n) => { const c = (n as { created_at?: string }).created_at; return c && new Date(c).getTime() >= midnight.getTime(); }).length;

  // streak: consecutive UTC days with a grant, ending today or yesterday.
  let streak = 0;
  { const set = new Set(activeDays); const d = new Date();
    for (let i = 0; i < 60; i++) { const key = new Date(d.getTime() - i * 86400000).toISOString().slice(0, 10); if (set.has(key)) streak++; else if (i > 0) break; } }

  // project momentum.
  const days14 = 14 * 86400000;
  const projectMomentum = projects.filter((p) => (p as { status?: string }).status === "active").map((p) => {
    const pid = p.id; const pname = p.name; const ptags = new Set((p.tags || []).map((t: string) => t.toLowerCase()));
    const token = pname.toLowerCase().split(/\s+/)[0] || pname.toLowerCase();
    const related = nodes.filter((n) => (n.tags || []).some((t) => ptags.has((t || "").toLowerCase())) || n.title.toLowerCase().includes(token));
    const recentNodes = related.filter((n) => { const u = (n as { updated_at?: string }).updated_at; return u && now - new Date(u).getTime() <= days14; }).length;
    const pq = questList.filter((q) => q.project_id === pid);
    const activeQuests = pq.filter((q) => q.state === "active" || q.state === "accepted").length;
    const completed = pq.filter((q) => q.state === "completed").length;
    const blocked = pq.some((q) => q.state === "blocked");
    const lastTouch = Math.max(0, ...related.map((n) => new Date((n as { updated_at?: string }).updated_at || 0).getTime()), ...pq.map((q) => new Date(q.updated_at || 0).getTime()));
    const inactivityDays = lastTouch ? Math.round((now - lastTouch) / 86400000) : 999;
    const m = momentumFor({ recentNodes, activeQuests, completedQuests: completed, blocked, inactivityDays, hasHistory: related.length > 0 || pq.length > 0 });
    const st = MOMENTUM_STYLE[m];
    return { id: pid, name: pname, momentum: m, label: st.label, color: st.color, badge: st.badge };
  });

  const summary = progressionSummary({
    tracks, todayXp, todayByTrack, streak,
    totalSignals: completedQuests.length + captureNodes.length, todayCaptures, todayQuests,
  });

  // optional window deltas for the Time Machine.
  let windowOut: unknown = undefined;
  if (days) {
    const rows = await repo.xp.since(uid, new Date(now - days * 86400000).toISOString());
    const byTrack: Partial<Record<Track, number>> = {};
    for (const r of rows) byTrack[r.track as Track] = (byTrack[r.track as Track] || 0) + r.amount;
    const ranked = (Object.entries(byTrack) as [Track, number][]).sort((a, b) => b[1] - a[1]);
    const growing = ranked[0]?.[1] > 0 ? ranked[0][0] : null;
    const faded = (Object.values(tracks).find((t) => t.xp > 0 && !byTrack[t.track])?.track) ?? null;
    const accel = projectMomentum.find((p) => p.momentum === "accelerating" || p.momentum === "compounding") || null;
    const stalled = projectMomentum.find((p) => p.momentum === "dormant" || p.momentum === "at_risk") || null;
    windowOut = { days, byTrack, growing, faded, accelerated: accel, stalled };
  }

  res.json({
    bootstrap: summary.bootstrap, todayXp, streak,
    tracks: TRACKS.map((t) => tracks[t.key]),
    projects: projectMomentum,
    summary,
    window: windowOut,
  });
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

  // G4: completing a quest grants deterministic XP (once per quest), with provenance.
  if (next === "completed" && !(await repo.xp.hasGrant(req.userId!, "quest", q.id))) {
    const projName = q.project_id ? (await repo.projects.get(req.userId!, q.project_id))?.name : undefined;
    const reward = questReward({ kind: q.kind, title: q.title, project_name: projName });
    for (const t of reward.tracks) {
      await repo.xp.log({ id: id("xp"), user_id: req.userId!, track: t, amount: reward.xp, source_type: "quest", source_id: q.id, reason: `quest:${q.kind}` });
    }
    await repo.emitEvent({ user_id: req.userId!, actor: "agent:Radian", event_type: "state_transition", subject_type: "xp", subject_id: q.id, correlation_id: q.id, payload: { xp: reward.xp, tracks: reward.tracks } });
  }
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

// Item management — permanent delete (archive is the soft path via /action {archive}).
radianRouter.delete("/quests/:id", async (req: Authed, res) => {
  await repo.quests.remove(req.userId!, req.params.id);
  await repo.emitEvent({ user_id: req.userId!, actor: "user", event_type: "deleted", subject_type: "quest", subject_id: req.params.id, correlation_id: req.params.id, payload: {} });
  res.json({ ok: true });
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

// ---- Phase 5: Observability (Debug Console). Single authed aggregate — single-user
// app, so the authed owner IS the admin. Everything here is operational status; NEVER a
// secret (provider keys are presence-only via providersStatus). ----
radianRouter.get("/observability", async (req: Authed, res) => {
  const uid = req.userId!;
  const [budget, jobStatus, problems, redisOk, depth, embed] = await Promise.all([
    budgetStatus(uid),
    repo.jobs.countByStatus(uid),
    repo.jobs.recentProblems(uid),
    redisHealthy().catch(() => false),
    queueDepth().catch(() => -1),
    (async () => { const e = getEmbedder(); return { provider: e.provider, model: e.model, dim: e.dim, embedded: await repo.embeddings.count(uid).catch(() => 0), active: e.provider !== "deterministic" }; })(),
  ]);
  let dbOk = true; try { await repo.query("SELECT 1"); } catch { dbOk = false; }
  let pgvector: { available: boolean; version?: string } = { available: false };
  try {
    const r = await repo.query<{ extversion: string }>(`SELECT extversion FROM pg_extension WHERE extname='vector'`);
    if (r.rows[0]) pgvector = { available: true, version: r.rows[0].extversion };
  } catch { /* not available */ }
  res.json({
    queue: { depth, redis: redisOk ? "healthy" : "unreachable" },
    db: dbOk ? "healthy" : "unreachable",
    jobs: jobStatus,
    problems, // recent failed/skipped/queued with their human-readable reason in `error`
    budget: { state: budget.state, month_to_date_cents: budget.month_cost_cents, monthly_budget_cents: budget.budget_cents, by_purpose: budget.by_purpose },
    providers: providersStatus(),
    embeddings: embed,
    pgvector,
    generated_at: new Date().toISOString(),
  });
});

// /radian/llm/status — alias of /llm/status so the AI status lives under the radian
// namespace too (safe metadata only; never the key).
radianRouter.get("/llm/status", async (req: Authed, res) => res.json(await llmStatusPayload(req.userId!)));

// /radian/usage — AI Usage / Token Observatory. Aggregates the cost ledger for the
// PWA: mode/provider/model, today + month-to-date calls/tokens/cost, budget + remaining,
// cost-by-feature, and the last 10 calls (metadata only — never prompt content or keys).
const PURPOSE_FEATURE: Record<string, string> = {
  ingest_classify: "Ingestion", contextualize: "Ingestion",
  ask_explain: "Companion", ask_challenge: "Companion", ask_teach: "Companion", ask_ask: "Companion", assistance: "Companion",
  research: "Research", research_synthesis: "Research", horizon_scan: "Horizon Scan",
  simulation: "Simulation", boardroom: "Boardroom", mentor: "Mentor",
  daily_brief: "Briefs", weekly_review: "Briefs", monthly_review: "Briefs",
  context_pack: "Context Packs", encompass: "Context Packs", embed: "Other", meta_review: "Other",
};
const featureFor = (purpose: string) => PURPOSE_FEATURE[purpose] || (purpose.startsWith("ask") ? "Companion" : purpose.startsWith("research") ? "Research" : "Other");

radianRouter.get("/usage", async (req: Authed, res) => {
  const uid = req.userId!;
  const ps = providersStatus();
  const active = resolveTask("synthesis");
  const [budget, today, month, byPurpose, recent] = await Promise.all([
    budgetStatus(uid),
    repo.aiCalls.windowStats(uid, "day"),
    repo.aiCalls.windowStats(uid, "month"),
    repo.aiCalls.monthByPurpose(uid),
    repo.aiCalls.recent(uid, 10),
  ]);
  // Roll month-by-purpose up into the requested feature buckets.
  const featureMap = new Map<string, { cost_cents: number; calls: number }>();
  for (const p of byPurpose) {
    const f = featureFor(p.purpose);
    const e = featureMap.get(f) || { cost_cents: 0, calls: 0 };
    e.cost_cents += p.cost_cents; e.calls += p.calls; featureMap.set(f, e);
  }
  const by_feature = [...featureMap.entries()].map(([feature, v]) => ({ feature, ...v })).sort((a, b) => b.cost_cents - a.cost_cents);
  res.json({
    mode: ps.mode,
    provider: ps.default_provider,
    key_detected: providerConfigured(ps.default_provider as Provider).configured,
    active_model: active.model,
    today,                 // { calls, input_tokens, output_tokens, cost_cents }
    month,                 // same shape, month-to-date
    budget: {
      monthly_budget_cents: budget.budget_cents,
      month_to_date_cents: budget.month_cost_cents,
      remaining_cents: Math.max(0, budget.budget_cents - budget.month_cost_cents),
      pct: budget.budget_cents > 0 ? Math.min(1, budget.month_cost_cents / budget.budget_cents) : 0,
      state: budget.state,
    },
    by_feature,
    recent: recent.map((r) => ({ ...r, feature: featureFor(r.purpose) })),
    generated_at: new Date().toISOString(),
  });
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

// Shared safe-status payload (used by /llm/status AND /radian/llm/status). The provider
// KEY is NEVER read or returned — only `key_detected` (presence) + the active model.
async function llmStatusPayload(userId: string) {
  const budget = await budgetStatus(userId);
  const ps = providersStatus();
  const active = resolveTask("synthesis"); // the model behind Companion/ask synthesis
  return {
    ...ps,
    key_detected: providerConfigured(ps.default_provider as Provider).configured, // boolean only
    active_provider: ps.default_provider,
    active_model: active.model,
    budget: {
      monthly_budget_cents: budget.budget_cents,
      month_to_date_cents: budget.month_cost_cents,
      state: budget.state,
      // Spend-by-purpose so a live key can't silently drain budget unseen. Purpose +
      // cents + call count only — never any prompt content or secret. Highest-first.
      by_purpose: (budget.by_purpose || []).map((p) => ({ purpose: p.purpose, cents: p.cost_cents, calls: p.calls })),
    },
  };
}

// GET /llm/status — configured providers + default + mode + budget. Token values
// are NEVER read or returned here; only presence (configured true/false) + reason.
llmRouter.get("/status", async (req: Authed, res) => res.json(await llmStatusPayload(req.userId!)));

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
