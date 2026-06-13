import * as repo from "@indigold/db";
import { enqueue, id, type Job } from "@indigold/shared";
import { forecast, assemble } from "@indigold/shared/intelligence";
import {
  getPrompt, BudgetExceededError, getTools, isResearchSafe,
  deterministicIngest, parseIngest, kindToNodeType,
  deterministicContextualize, parseContext,
  parseGithubUrl, deterministicAssist, parseAssist,
  deterministicResearch, parseResearch,
  deterministicDailyBrief, parseDailyBrief,
  detectOpportunities, parseOpportunities, consolidate, calibrate,
  deterministicAgentArtifact, parseAgentArtifact,
  deterministicSimulation, parseSimulation,
  deterministicMetaMemo, parseMetaMemo,
  constraintPromptBlock, reconcileAgainstConstraints, DEFAULT_CONSTRAINTS, type ConstraintProfile,
  assignMemoryTier, findResurrectionCandidates, deterministicReview, parseReview, simulationGroundingBlock,
  constitutionBlock, whatMatters, type ActivityShare,
  getEmbedder, deterministicEmbedder, contentHash,
  horizonScan,
  type ReviewTimescale, type ShadowCandidate,
  type IngestResult, type ContextResult, type AssistResult, type ResearchFinding, type AgentKind, type MetaStats,
} from "@indigold/shared";
import { model } from "../lib/model";

type Handler = (job: Job) => Promise<void>;

// ---- Wave 1, Stage 1: Intelligent Ingest (cheap tier, per capture) ----
// All AI goes through governedComplete (governor + ledger). A budget block QUEUES
// (leaves the capture UNPROCESSED for boot catch-up); a model error falls back to
// the deterministic classifier so a capture is NEVER lost.
const ingestCapture: Handler = async (job) => {
  const captureId = String((job.payload as { captureId: string }).captureId);
  const cap = await repo.captures.get(job.user_id, captureId);
  if (!cap) return;
  await repo.captures.setProcessing(captureId, "processing");

  const prompt = getPrompt("ingest_classify");
  let ingest: IngestResult;
  try {
    const r = await repo.governedComplete({
      userId: job.user_id, tier: "cheap", task: "classification", purpose: "ingest_classify",
      json: true, sourceId: captureId, promptVersion: prompt.version,
      ...prompt.build({ title: cap.title, source: cap.source, url: cap.url || "", content: cap.note || "" }),
    });
    ingest = parseIngest(r.text) ?? deterministicIngest(cap);
  } catch (e) {
    if (e instanceof BudgetExceededError) {
      // Governor blocked: requeue by leaving the capture unprocessed (boot catch-up
      // / next pass retries). Never a fake success.
      await repo.captures.setProcessing(captureId, "unprocessed");
      await repo.jobs.finish(job.id, "queued", undefined, "budget_governor");
      return;
    }
    ingest = deterministicIngest(cap);
  }

  const nodeId = id("node");
  await repo.nodes.create({
    id: nodeId, user_id: job.user_id, type: kindToNodeType(ingest.type),
    title: cap.title, summary: ingest.summary,
    truth_layer: "B", truth_label: "Normalized", mvs: ingest.mvs.score,
    tags: ingest.entities, source_capture_id: captureId,
    meta: {
      kind: ingest.type, actionability: ingest.actionability, mvs_why: ingest.mvs.why, prompt_version: prompt.version,
      // B1 epistemic type: a user capture is an observation; a reference/asset is a source.
      epistemic_type: ingest.type === "Reference" || ingest.type === "Asset" ? "source" : "observation",
    },
  });
  // Event Store: node + classification, tied to the capture lifecycle.
  await repo.emitEvent({ user_id: job.user_id, actor: "agent:Atlas", event_type: "node_created", subject_type: "node", subject_id: nodeId, correlation_id: captureId, payload: { from: "ingest" } });
  await repo.emitEvent({ user_id: job.user_id, actor: "agent:Radian", event_type: "classified", subject_type: "capture", subject_id: captureId, correlation_id: captureId, payload: { nodeId } });
  await repo.captures.setProcessing(captureId, "processed");

  // Stage 2 next. (HIGH actionability is the priority signal carried forward.)
  const j = await enqueue("contextualize", job.user_id, { nodeId, actionability: ingest.actionability });
  await repo.jobs.record({ id: j.id, user_id: job.user_id, type: j.type, status: "queued" });
  await repo.jobs.finish(job.id, "done", { nodeId, type: ingest.type, actionability: ingest.actionability });
};

// ---- Wave 1, Stage 2: Contextualization (cheap tier) ----
// Typed edges (confidence) + project_relevance vs the Project Registry. Non-obvious
// high relevance becomes a Timeline insight.
const contextualize: Handler = async (job) => {
  const nodeId = String((job.payload as { nodeId: string }).nodeId);
  const node = await repo.nodes.get(job.user_id, nodeId);
  if (!node) return;
  await repo.seedProjectsIfEmpty(job.user_id);
  const projects = await repo.projects.list(job.user_id);
  const neighbors = await repo.nodes.list(job.user_id); // small single-user graph

  const prompt = getPrompt("contextualize");
  const subject = { id: node.id, tags: node.tags || [], title: node.title, summary: node.summary };
  const projForFn = projects.map((p) => ({ id: p.id, name: p.name, tags: p.tags || [], objectives: p.objectives }));
  let ctx: ContextResult;
  try {
    const r = await repo.governedComplete({
      userId: job.user_id, tier: "cheap", task: "classification", purpose: "contextualize",
      json: true, sourceId: nodeId, promptVersion: prompt.version,
      ...prompt.build({
        item: `${node.title}\n${node.summary}`,
        neighbors: neighbors.filter((n) => n.id !== nodeId).slice(0, 20).map((n) => `${n.id}: ${n.title}`).join("\n"),
        registry: projects.map((p) => `${p.id}: ${p.name} [${(p.tags || []).join(", ")}]`).join("\n"),
      }),
    });
    ctx = parseContext(r.text, new Set(neighbors.map((n) => n.id)), new Set(projects.map((p) => p.id)))
      ?? deterministicContextualize(subject, neighbors, projForFn);
  } catch (e) {
    if (e instanceof BudgetExceededError) {
      await repo.jobs.finish(job.id, "queued", undefined, "budget_governor");
      return;
    }
    ctx = deterministicContextualize(subject, neighbors, projForFn);
  }

  for (const e of ctx.edges.slice(0, 6)) {
    const edgeId = id("edge");
    await repo.edges.create({
      id: edgeId, user_id: job.user_id, source_id: nodeId, target_id: e.target_id,
      relationship: e.relationship, weight: e.confidence, valid_from: new Date().toISOString(), label: e.why,
    });
    await repo.emitEvent({ user_id: job.user_id, actor: "agent:Atlas", event_type: "edge_created", subject_type: "edge", subject_id: edgeId, correlation_id: (node as { source_capture_id?: string }).source_capture_id ?? nodeId, payload: { relationship: e.relationship, source: nodeId, target: e.target_id } });
  }
  const prevMeta = (node as { meta?: object }).meta || {};
  await repo.nodes.setMeta(job.user_id, nodeId, { ...prevMeta, project_relevance: ctx.project_relevance });

  const top = ctx.project_relevance[0];
  if (top && top.relevance >= 0.6) {
    await repo.timeline.create({
      id: id("tl"), user_id: job.user_id, date: new Date().toISOString().slice(0, 10),
      type: "connection", significance: "medium",
      title: `${node.title} — relevant to a project`, description: top.why, node_id: nodeId,
    });
  }

  // Semantic memory: embed the node (cheap; deterministic fallback). Compounds.
  const ej = await enqueue("embed", job.user_id, { nodeId });
  await repo.jobs.record({ id: ej.id, user_id: job.user_id, type: ej.type, status: "queued" });

  // Stage 3 gate: actionability >= MEDIUM qualifies for the Assistance Engine.
  const actionability = String((job.payload as { actionability?: string }).actionability || "LOW");
  if (actionability === "MEDIUM" || actionability === "HIGH") {
    const aj = await enqueue("assist", job.user_id, { nodeId });
    await repo.jobs.record({ id: aj.id, user_id: job.user_id, type: aj.type, status: "queued" });
  }
  await repo.jobs.finish(job.id, "done", { edges: ctx.edges.length, relevance: ctx.project_relevance.length });
};

// ---- Living OS G1: Companion Panel "ask" (explain/challenge/freeform). Strong tier,
// governed; produces a child node with provenance + an event. Reuses existing systems. ----
const askJob: Handler = async (job) => {
  const p = job.payload as { subjectType: string; subjectId: string; verb: string; question?: string };
  let title = "item";
  let context = "";
  let srcCap: string | undefined;
  if (p.subjectType === "node") {
    const n = await repo.nodes.get(job.user_id, p.subjectId);
    if (!n) { await repo.jobs.finish(job.id, "skipped", undefined, "subject_not_found"); return; }
    title = n.title; context = `${n.title}\n${n.summary}\nTags: ${(n.tags || []).join(", ")}`;
  } else if (p.subjectType === "capture") {
    const c = await repo.captures.get(job.user_id, p.subjectId);
    if (!c) { await repo.jobs.finish(job.id, "skipped", undefined, "subject_not_found"); return; }
    title = c.title; context = `${c.title}\n${c.note}\n${c.url || ""}`; srcCap = c.id;
  } else if (p.subjectType === "project") {
    const proj = (await repo.projects.list(job.user_id)).find((x) => x.id === p.subjectId);
    if (!proj) { await repo.jobs.finish(job.id, "skipped", undefined, "subject_not_found"); return; }
    title = proj.name; context = `${proj.name}\n${proj.description}\nObjectives: ${proj.objectives}`;
  } else {
    const b = (await repo.briefs.list(job.user_id)).find((x) => x.id === p.subjectId);
    title = b ? `${b.kind} brief` : "brief"; context = b ? JSON.stringify(b.payload).slice(0, 1000) : "";
  }
  const framing = p.verb === "challenge"
    ? "Play skeptic: surface the strongest risks and objections to this, specifically."
    : p.verb === "ask" ? (p.question || "Answer the owner's question about this.")
    : "Explain what this is and why it matters to the owner, concisely.";
  let answer: string;
  let deterministic = false;
  try {
    const r = await repo.governedComplete({
      userId: job.user_id, tier: "strong", task: "synthesis", purpose: `ask_${p.verb}`, sourceId: p.subjectId,
      system: "You are RADIAN answering about ONE specific item the owner asked about. Be concise and specific, cite the item, never invent facts.",
      prompt: `${framing}\n\nITEM:\n${context}`,
    });
    // Stub/no-provider mode returns generic adapter text — use our grounded deterministic
    // answer instead. A real provider's output is used as-is. Upgrades automatically.
    if (r.provider === "deterministic" || !r.text) { answer = deterministicAnswer(p.verb, title, context, p.question); deterministic = true; }
    else answer = r.text;
  } catch (e) {
    if (e instanceof BudgetExceededError) { await repo.jobs.finish(job.id, "queued", undefined, "budget_governor"); return; }
    // No provider / model error → a USEFUL deterministic answer from the item's own data
    // (not a "paused" placeholder), so the child node always has real content. Upgrades
    // automatically once a provider key is set (governedComplete returns model text).
    answer = deterministicAnswer(p.verb, title, context, p.question); deterministic = true;
  }
  const childId = id("node");
  const heading = p.verb === "challenge" ? "Challenge" : p.verb === "ask" ? "Answer" : "Explanation";
  await repo.nodes.create({
    id: childId, user_id: job.user_id, type: "concept", title: `${heading} — ${title}`.slice(0, 80),
    summary: answer.slice(0, 400), truth_layer: "C", truth_label: "Answer", mvs: 50, tags: [],
    source_capture_id: srcCap, meta: { ask: { verb: p.verb, question: p.question, answer, subject_type: p.subjectType, subject_id: p.subjectId, deterministic }, epistemic_type: "inference" },
  });
  if (p.subjectType === "node") {
    await repo.edges.create({ id: id("edge"), user_id: job.user_id, source_id: p.subjectId, target_id: childId, relationship: "extends", weight: 0.8, valid_from: new Date().toISOString(), label: `ask:${p.verb}` });
  }
  await repo.emitEvent({ user_id: job.user_id, actor: "agent:Radian", event_type: "review_generated", subject_type: "node", subject_id: childId, correlation_id: p.subjectId, payload: { ask: p.verb } });
  await repo.jobs.finish(job.id, "done", { child: childId, verb: p.verb, deterministic });
};

// Deterministic, grounded answer from the item's own captured data (no model). Honest:
// it's a synthesis of what's there, and says so for the freeform/explain cases.
function deterministicAnswer(verb: string, title: string, context: string, question?: string): string {
  const body = context.split("\n").slice(1).join(" ").replace(/\s+/g, " ").trim().slice(0, 220);
  if (verb === "challenge") {
    return `Pressure-test "${title}": is its value proven or assumed? Watch for thin validation, competing priorities, and whether it still ladders to an active goal.${body ? ` What's captured: ${body}` : ""}`;
  }
  if (verb === "ask") {
    return `On "${question || "your question"}": from what's captured about ${title}${body ? ` — ${body}` : ""}. Connect a model provider for deeper synthesis; this is grounded in your vault only.`;
  }
  return `${title}${body ? ` — ${body}` : ""}.${body ? "" : " (No summary captured yet.)"}`;
}

// ---- Living OS G1: Generate Context Pack (Encompass, deterministic, no model). ----
const contextPackJob: Handler = async (job) => {
  const p = job.payload as { purpose?: string; subjectId?: string };
  const nodes = await repo.nodes.list(job.user_id);
  const edges = await repo.edges.list(job.user_id);
  const pack = assemble({ purpose: p.purpose || "Companion context pack", tokenBudget: 4000, nodes, edges });
  const cid = id("ctx");
  await repo.contextPacks.create({ id: cid, user_id: job.user_id, title: pack.title, purpose: pack.purpose, token_budget: pack.token_budget, source_nodes: pack.source_nodes, sections: pack.sections as never });
  await repo.emitEvent({ user_id: job.user_id, actor: "agent:Encompass", event_type: "review_generated", subject_type: "context_pack", subject_id: cid, correlation_id: p.subjectId || cid, payload: {} });
  await repo.jobs.finish(job.id, "done", { pack: cid });
};

// ---- Semantic memory: embed a node into the vector store (cheap, content-hashed). ----
const embedJob: Handler = async (job) => {
  const nodeId = String((job.payload as { nodeId: string }).nodeId);
  const node = await repo.nodes.get(job.user_id, nodeId);
  if (!node) return;
  const text = `${node.title}\n${node.summary}\n${(node.tags || []).join(" ")}`.trim();
  const hash = contentHash(text);
  if ((await repo.embeddings.hash("node", nodeId)) === hash) { await repo.jobs.finish(job.id, "done", { skipped: "unchanged" }); return; }
  let embedder = getEmbedder();
  let vec;
  try {
    vec = await embedder.embed(text);
  } catch {
    embedder = deterministicEmbedder(); // provider error -> never fail; deterministic
    vec = await embedder.embed(text);
  }
  await repo.embeddings.upsert({ subject_type: "node", subject_id: nodeId, user_id: job.user_id, model: embedder.model, dim: embedder.dim, vector: vec.vector, content_hash: hash });
  // Sentinel cost ledger (embeddings are cheap-tier; deterministic = $0).
  await repo.aiCalls.log({ id: id("aicall"), user_id: job.user_id, purpose: "embed", provider: embedder.provider, model: embedder.model, tier: "cheap", input_tokens: vec.tokens, output_tokens: 0, cost_cents: 0, source_id: nodeId, status: "ok" });
  await repo.jobs.finish(job.id, "done", { provider: embedder.provider, dim: embedder.dim });
};

// ---- Wave 2, Stage 3: Assistance Engine (strong tier) ----
// Project-anchored playbook + NEXT ACTIONS. For a GitHub repo it traces the source
// (Stage 4 mini) to ground the plan. Stored as a child node w/ provenance.
const assist: Handler = async (job) => {
  const nodeId = String((job.payload as { nodeId: string }).nodeId);
  const node = await repo.nodes.get(job.user_id, nodeId);
  if (!node) return;
  await repo.seedProjectsIfEmpty(job.user_id);
  const projects = (await repo.projects.list(job.user_id)).map((p) => ({ id: p.id, name: p.name, tags: p.tags || [], objectives: p.objectives }));
  const srcCapId = (node as { source_capture_id?: string }).source_capture_id || null;
  const cap = srcCapId ? await repo.captures.get(job.user_id, srcCapId) : null;
  const url = cap?.url || null;
  const repoRef = url ? parseGithubUrl(url) : null;

  // Source-trace a repo to ground the playbook (only if not secret/internal).
  let gathered = "";
  if (repoRef && (!cap || isResearchSafe(cap.sensitivity))) {
    const gh = getTools().github;
    const meta = await gh.run({ action: "repo", owner: repoRef.owner, repo: repoRef.repo });
    if (meta.ok) gathered += JSON.stringify(meta.data);
    const readme = await gh.run({ action: "readme", owner: repoRef.owner, repo: repoRef.repo });
    if (readme.ok) gathered += "\n" + JSON.stringify(readme.data).slice(0, 1500);
  }

  // B4: inject the owner's constraint profile so the plan is reconciled, not aspirational.
  const profile = { ...DEFAULT_CONSTRAINTS, ...((await repo.constraints.get(job.user_id)) || {}) } as ConstraintProfile;
  const prompt = getPrompt("assistance");
  const fallback = () => deterministicAssist({ title: node.title, summary: node.summary, tags: node.tags || [], url }, projects, repoRef);
  let res: AssistResult;
  try {
    const built = prompt.build({ capture: `${node.title}\n${node.summary}\n${gathered}`, objectives: projects.map((p) => `${p.name}: ${p.objectives}`).join("\n") });
    const r = await repo.governedComplete({
      userId: job.user_id, tier: "strong", task: "planning", purpose: "assistance",
      json: true, sourceId: nodeId, promptVersion: prompt.version,
      system: `${built.system}\n\n${constitutionBlock()}`, prompt: `${built.prompt}\n\nCONSTRAINTS:\n${constraintPromptBlock(profile)}`,
    });
    res = parseAssist(r.text) ?? fallback();
  } catch (e) {
    if (e instanceof BudgetExceededError) { await repo.jobs.finish(job.id, "queued", undefined, "budget_governor"); return; }
    res = fallback();
  }

  // B4: flag any constraint violations explicitly (kept honest, not aspirational).
  const constraintCheck = reconcileAgainstConstraints(res.next_actions.map((a) => ({ action: a.action, effort: a.effort, project: a.project })), profile);

  const childId = id("node");
  await repo.nodes.create({
    id: childId, user_id: job.user_id, type: "concept",
    title: `Playbook — ${node.title}`,
    summary: (res.playbook[0] || res.suggestions[0]?.text || "Suggested actions").slice(0, 400),
    truth_layer: "C", truth_label: "Assistance", mvs: node.mvs, tags: node.tags || [],
    source_capture_id: srcCapId, meta: { assist: res, constraint_check: constraintCheck, parent_node: nodeId, prompt_version: prompt.version, traced: !!gathered, epistemic_type: "inference" },
  });
  await repo.edges.create({
    id: id("edge"), user_id: job.user_id, source_id: nodeId, target_id: childId,
    relationship: "extends", weight: 0.9, valid_from: new Date().toISOString(), label: "assistance",
  });
  await repo.jobs.finish(job.id, "done", { actions: res.next_actions.length, playbook: res.playbook.length, constraint_violations: constraintCheck.violations.length });
};

const summarize: Handler = async (job) => {
  const nodeId = String((job.payload as { nodeId: string }).nodeId);
  const n = await repo.nodes.get(job.user_id, nodeId);
  if (!n) return;
  const summary = await model.summarize(n.summary || n.title);
  // verified synthesis -> promote toward Knowledge (Truth Layer C)
  await repo.nodes.update(job.user_id, nodeId, { summary, truth_layer: "C", truth_label: "Knowledge" });
  await repo.jobs.finish(job.id, "done");
};

const tag: Handler = async (job) => {
  const nodeId = String((job.payload as { nodeId: string }).nodeId);
  const n = await repo.nodes.get(job.user_id, nodeId);
  if (!n) return;
  const tags = await model.tags(`${n.title} ${n.summary}`);
  const mvs = Math.min(100, 50 + tags.length * 6);
  await repo.nodes.update(job.user_id, nodeId, { tags, mvs });
  await repo.jobs.finish(job.id, "done", { tags });
};

// Link the new node to existing nodes that share a tag.
const graphUpdate: Handler = async (job) => {
  const nodeId = String((job.payload as { nodeId: string }).nodeId);
  const target = await repo.nodes.get(job.user_id, nodeId);
  if (!target) return;
  const all = await repo.nodes.list(job.user_id);
  const tset = new Set(target.tags || []);
  let made = 0;
  for (const other of all) {
    if (other.id === nodeId) continue;
    if ((other.tags || []).some((t) => tset.has(t))) {
      const edgeId = id("edge");
      await repo.edges.create({
        id: edgeId, user_id: job.user_id,
        source_id: nodeId, target_id: other.id,
        relationship: "relates_to", weight: 0.5,
        valid_from: new Date().toISOString(), label: "shared tag",
      });
      await repo.emitEvent({ user_id: job.user_id, actor: "agent:Atlas", event_type: "edge_created", subject_type: "edge", subject_id: edgeId, correlation_id: (target as { source_capture_id?: string }).source_capture_id ?? nodeId, payload: { relationship: "relates_to", source: nodeId, target: other.id } });
      if (++made >= 5) break;
    }
  }
  await repo.jobs.finish(job.id, "done", { edges: made });
};

// ---- Wave 2, Stage 5: Briefs (registry-aware synthesis, strong tier) ----
const briefJob = (kind: "daily" | "weekly"): Handler => async (job) => {
  const nodes = await repo.nodes.list(job.user_id);
  const edges = await repo.edges.list(job.user_id);
  const base = forecast(nodes, edges, kind === "daily" ? "day" : "week") as unknown as Record<string, unknown>;
  let payload = base;
  if (kind === "daily") {
    await repo.seedProjectsIfEmpty(job.user_id);
    const projects = (await repo.projects.list(job.user_id)).map((p) => ({ id: p.id, name: p.name, tags: p.tags || [], objectives: p.objectives }));
    const recent = nodes.slice(0, 20);
    const prompt = getPrompt("daily_brief");
    try {
      const r = await repo.governedComplete({
        userId: job.user_id, tier: "strong", task: "synthesis", purpose: "daily_brief", json: true, promptVersion: prompt.version,
        ...prompt.build({ recent: recent.map((n) => `${n.title} (mvs ${n.mvs})`).join("\n"), reviews: "" }),
      });
      const b = parseDailyBrief(r.text) ?? deterministicDailyBrief(recent, projects);
      payload = { ...base, summary: b.summary, recommended_actions: b.urgent_actions };
    } catch (e) {
      if (e instanceof BudgetExceededError) { await repo.jobs.finish(job.id, "queued", undefined, "budget_governor"); return; }
      const b = deterministicDailyBrief(recent, projects);
      payload = { ...base, summary: b.summary, recommended_actions: b.urgent_actions };
    }
    // Stage 8: surface decisions whose review date has arrived.
    const due = await repo.decisions.due(job.user_id);
    if (due.length) payload = { ...payload, decisions_due: due.map((d) => ({ id: (d as { id: string }).id, decision: (d as { decision: string }).decision, review_by: (d as { review_by: string }).review_by })) };
  }
  const briefId = id("brief");
  await repo.briefs.create({ id: briefId, user_id: job.user_id, kind, period: new Date().toISOString().slice(0, 10), payload });
  // Event Store: brief generated (Radian agent).
  await repo.emitEvent({ user_id: job.user_id, actor: "agent:Radian", event_type: "brief_generated", subject_type: "brief", subject_id: briefId, correlation_id: briefId, payload: { kind } });
  await repo.jobs.finish(job.id, "done");
};

// ---- Wave G6: Horizon scan (weekly). Deterministic research planner — proposes the
// next research directions per active domain (no fabricated findings, no network), files
// them as a `horizon` brief, and seeds up to 3 research quests so the loop closes
// (Research direction → Quest → on completion, Research-track XP). ----
const horizonScanJob: Handler = async (job) => {
  await repo.seedProjectsIfEmpty(job.user_id);
  const projects = await repo.projects.list(job.user_id);
  const nodes = await repo.nodes.list(job.user_id);
  const directions = horizonScan({
    projects: projects.map((p) => ({ id: p.id, name: p.name, tags: p.tags || [], status: p.status })),
    nodes: nodes.map((n) => ({ title: n.title, tags: n.tags || [], mvs: n.mvs, updated_at: (n as { updated_at?: string }).updated_at, source: (n as { source?: string }).source })),
  });
  const briefId = id("brief");
  await repo.briefs.create({ id: briefId, user_id: job.user_id, kind: "horizon", period: new Date().toISOString().slice(0, 10), payload: { directions, scanned_at: new Date().toISOString(), chain: ["Research", "Capture", "Classify", "Graph", "Context Pack", "Brief", "Quest"] } });
  await repo.emitEvent({ user_id: job.user_id, actor: "agent:Radian", event_type: "brief_generated", subject_type: "brief", subject_id: briefId, correlation_id: briefId, payload: { kind: "horizon", directions: directions.length } });

  // Seed research quests from the top directions (dedup by title; honest "Research:" tasks).
  const existing = new Set((await repo.quests.list(job.user_id)).map((q) => q.title));
  let made = 0;
  for (const d of directions.filter((x) => x.priority !== "low").slice(0, 3)) {
    const title = `Research: ${d.topic}`;
    if (existing.has(title)) continue;
    const qid = id("quest");
    await repo.quests.create({ id: qid, user_id: job.user_id, title, summary: d.rationale, kind: "research", state: "suggested", source_type: "research", meta: { horizon: true, project_id: d.project_id, source_type: d.sourceType } });
    await repo.emitEvent({ user_id: job.user_id, actor: "agent:Radian", event_type: "state_transition", subject_type: "quest", subject_id: qid, correlation_id: d.project_id || qid, payload: { suggested: true, source: "research" } });
    made++;
  }
  await repo.jobs.finish(job.id, "done", { directions: directions.length, quests: made });
};

const monitorScan: Handler = async (job) => {
  await repo.audit.log({ user_id: job.user_id, actor: "worker", action: "monitor_scan" });
  await repo.jobs.finish(job.id, "done");
};

// ---- Wave 3, Stage 7: Opportunity Detection (strong tier, weekly/graph-change) ----
// Cross-domain intersections -> Opportunity proposals into the REVIEW queue (never
// auto-promoted). Expired (decayed) opportunities are re-evaluated.
const opportunityScan: Handler = async (job) => {
  await repo.opportunities.expireStale(job.user_id);
  await repo.seedProjectsIfEmpty(job.user_id);
  const projects = await repo.projects.list(job.user_id);
  const nodes = await repo.nodes.list(job.user_id);
  const prompt = getPrompt("opportunity");
  const fallback = () => detectOpportunities(nodes as never[], projects.map((p) => ({ id: p.id, name: p.name })));
  let opps;
  try {
    const r = await repo.governedComplete({
      userId: job.user_id, tier: "strong", task: "synthesis", purpose: "opportunity", json: true, promptVersion: prompt.version,
      ...prompt.build({
        graph: nodes.slice(0, 40).map((n) => `${n.id}: ${n.title} [${(n.tags || []).join(", ")}]`).join("\n"),
        projects: projects.map((p) => `${p.id}: ${p.name}`).join("\n"),
      }),
    });
    opps = parseOpportunities(r.text, new Set(nodes.map((n) => n.id))) ?? fallback();
  } catch (e) {
    if (e instanceof BudgetExceededError) { await repo.jobs.finish(job.id, "queued", undefined, "budget_governor"); return; }
    opps = fallback();
  }
  const recent = new Set((await repo.opportunities.recentTheses(job.user_id)).map((t) => t.toLowerCase()));
  let added = 0;
  for (const o of opps) {
    if (recent.has(o.thesis.toLowerCase())) continue;
    const decay = new Date(Date.now() + o.decay_days * 86400000).toISOString().slice(0, 10);
    await repo.opportunities.create({ id: id("opp"), user_id: job.user_id, thesis: o.thesis, contributing_nodes: o.contributing_nodes, confidence: o.confidence, leverage: o.leverage, first_move: o.first_move, decay_date: decay });
    added++;
  }
  await repo.jobs.finish(job.id, "done", { opportunities: added });
};

// ---- Wave 3, Stage 9: Memory Consolidation (nightly, cheap) ----
// Strengthen referenced nodes, decay the rest (floor, never delete), refresh theme
// nodes. All adjustments logged with totals (before/after on each node update).
const consolidateJob: Handler = async (job) => {
  const nodes = await repo.nodes.list(job.user_id);
  const weekAgo = Date.now() - 7 * 86400000;
  const referenced = new Set(
    nodes.filter((n) => { const u = (n as { updated_at?: string }).updated_at; return u ? new Date(u).getTime() > weekAgo : false; }).map((n) => n.id),
  );
  const { adjustments, themes } = consolidate(nodes, referenced);
  for (const a of adjustments) await repo.nodes.update(job.user_id, a.id, { mvs: a.after });
  for (const t of themes) await repo.nodes.upsertTheme(job.user_id, t.tag, t.node_ids);
  // C1: assign memory tiers (working/long_term). Core is owner-confirmed only and sticky.
  let tiered = 0;
  for (const n of nodes) {
    const meta = (n as { meta?: Record<string, unknown> }).meta || {};
    const tier = assignMemoryTier({ mvs: n.mvs, current_tier: meta.memory_tier as string }, referenced.has(n.id));
    if (meta.memory_tier !== tier) { await repo.nodes.setMeta(job.user_id, n.id, { ...meta, memory_tier: tier }); tiered++; }
  }
  await repo.audit.log({ user_id: job.user_id, actor: "agent:Archivist", action: "consolidate", meta: { adjusted: adjustments.length, themes: themes.length, tiered } });
  await repo.jobs.finish(job.id, "done", { adjusted: adjustments.length, themes: themes.length, tiered });
};

// ---- Wave C2: Multi-timescale reviews (strong tier; each compounds on the prior). ----
const reviewJob = (timescale: ReviewTimescale): Handler => async (job) => {
  const nodes = await repo.nodes.list(job.user_id);
  const counts = await repo.events.countByType(job.user_id);
  const priorBriefs = await repo.briefs.list(job.user_id);
  const prior = priorBriefs.find((b) => b.kind === `${timescale}_review`);
  const priorSummary = (prior?.payload as { summary?: string } | undefined)?.summary;
  const cal = calibrate(await repo.decisions.forCalibration(job.user_id));
  // C3 Shadow Memory — monthly "From the vault" resurrection.
  let shadow: ShadowCandidate[] = [];
  if (timescale === "monthly") {
    const recent = nodes.slice(0, 12);
    const recentContext = { text: recent.map((n) => `${n.title} ${n.summary}`).join(" "), tags: [...new Set(recent.flatMap((n) => n.tags || []))] };
    shadow = findResurrectionCandidates(nodes as never[], recentContext);
  }
  const inputs = { timescale, topNodes: nodes.slice(0, 5).map((n) => ({ title: n.title, mvs: n.mvs })), eventCounts: counts, priorSummary, calibrationNote: cal.note, shadow };
  let review;
  try {
    const r = await repo.governedComplete({
      userId: job.user_id, tier: "strong", task: "synthesis", purpose: `${timescale}_review`, json: true,
      system: `You are RADIAN's ${timescale} reviewer (agent:Chronos). Compound on the prior ${timescale} review; surface themes + blind spots. Return JSON {summary,themes,blind_spots}.`,
      prompt: JSON.stringify({ top: inputs.topNodes, counts, prior: priorSummary, calibration: cal.note }),
    });
    const parsed = parseReview(r.text, timescale);
    review = parsed ? { ...parsed, from_the_vault: shadow } : deterministicReview(inputs);
  } catch (e) {
    if (e instanceof BudgetExceededError) { await repo.jobs.finish(job.id, "queued", undefined, "budget_governor"); return; }
    review = deterministicReview(inputs);
  }
  // D3 Wisdom: the quarterly review reconciles activity vs stated priorities ("what matters").
  let payload: Record<string, unknown> = review as unknown as Record<string, unknown>;
  if (timescale === "quarterly") {
    const tagCounts: Record<string, number> = {};
    for (const n of nodes) for (const t of n.tags || []) tagCounts[t] = (tagCounts[t] || 0) + 1;
    const total = Object.values(tagCounts).reduce((a, b) => a + b, 0) || 1;
    const activity: ActivityShare[] = Object.entries(tagCounts).map(([area, c]) => ({ area, share: c / total })).sort((a, b) => b.share - a.share).slice(0, 5);
    const priorities = (await repo.projects.list(job.user_id)).filter((p) => p.status === "active").map((p) => p.name);
    const wm = whatMatters(activity, priorities);
    payload = { ...payload, what_matters: wm, blind_spots: [...review.blind_spots, ...wm.drift] };
  }
  const briefId = id("brief");
  await repo.briefs.create({ id: briefId, user_id: job.user_id, kind: `${timescale}_review`, period: new Date().toISOString().slice(0, 10), payload });
  await repo.emitEvent({ user_id: job.user_id, actor: "agent:Chronos", event_type: "review_generated", subject_type: "brief", subject_id: briefId, correlation_id: briefId, payload: { timescale, shadow: shadow.length } });
  await repo.jobs.finish(job.id, "done", { timescale, themes: review.themes.length, shadow: shadow.length });
};

// ---- Wave D4: Export bundle (weekly). Assembles the full vault JSON (reconstructable
// from this + R2 objects). Available live at GET /radian/export-bundle. ----
const exportBundleJob: Handler = async (job) => {
  const bundle = await repo.buildExportBundle(job.user_id);
  await repo.emitEvent({ user_id: job.user_id, actor: "agent:Archivist", event_type: "system_improvement_generated", subject_type: "export", subject_id: job.user_id, correlation_id: job.user_id, payload: { counts: bundle.counts } });
  await repo.jobs.finish(job.id, "done", { counts: bundle.counts });
};

// ---- Wave 3, Stage 8: Decision calibration (monthly, cheap) ----
const calibrationJob: Handler = async (job) => {
  const rows = await repo.decisions.forCalibration(job.user_id);
  const summary = calibrate(rows);
  await repo.audit.log({ user_id: job.user_id, actor: "worker", action: "calibration", meta: summary as unknown as object });
  await repo.jobs.finish(job.id, "done", summary as unknown as object);
};

// ---- Wave 4, Stage 6: Execution Agents (PROPOSAL-ONLY) ----
// Produces a DRAFT artifact stored as a node. RADIAN never pushes code, opens PRs,
// or calls external write-APIs in this build — executors are off by default.
const agentTask: Handler = async (job) => {
  const p = job.payload as { nodeId: string; kind: AgentKind };
  const node = await repo.nodes.get(job.user_id, p.nodeId);
  if (!node) return;
  const prompt = getPrompt("assistance");
  const fallback = () => deterministicAgentArtifact(p.kind, { title: node.title, summary: node.summary });
  let artifact;
  try {
    const r = await repo.governedComplete({
      userId: job.user_id, tier: "strong", task: "planning", purpose: `agent_${p.kind}`, json: true, sourceId: p.nodeId, promptVersion: prompt.version,
      system: `You are RADIAN's ${p.kind} agent. Draft an artifact ONLY (no execution). Return JSON {title, body}.`,
      prompt: `${node.title}\n${node.summary}`,
    });
    artifact = parseAgentArtifact(r.text, p.kind) ?? fallback();
  } catch (e) {
    if (e instanceof BudgetExceededError) { await repo.jobs.finish(job.id, "queued", undefined, "budget_governor"); return; }
    artifact = fallback();
  }
  const aid = id("node");
  await repo.nodes.create({
    id: aid, user_id: job.user_id, type: "concept", title: artifact.title,
    summary: artifact.body.slice(0, 400), truth_layer: "C", truth_label: "Artifact", mvs: node.mvs, tags: node.tags || [],
    source_capture_id: (node as { source_capture_id?: string }).source_capture_id || null,
    meta: { agent_task: { kind: p.kind, body: artifact.body, parent_node: p.nodeId, proposal_only: true }, prompt_version: prompt.version },
  });
  await repo.jobs.finish(job.id, "done", { kind: p.kind, artifact: aid });
};

// ---- Wave 4, Stage 10: Strategic Simulation (on-demand, most expensive) ----
const simulation: Handler = async (job) => {
  const p = job.payload as { question: string; contextNodeIds?: string[] };
  const ctxNodes = p.contextNodeIds?.length ? await repo.nodes.byIds(job.user_id, p.contextNodeIds) : [];
  const context = ctxNodes.map((n) => `${n.title}: ${n.summary}`).join("\n");
  const fallback = () => deterministicSimulation(p.question, context);
  // C6: ground the simulation in the owner's real constraints + calibration.
  const profile = { ...DEFAULT_CONSTRAINTS, ...((await repo.constraints.get(job.user_id)) || {}) } as ConstraintProfile;
  const cal = calibrate(await repo.decisions.forCalibration(job.user_id));
  const grounding = simulationGroundingBlock({ constraints: constraintPromptBlock(profile), calibrationNote: cal.note });
  let sim;
  try {
    const r = await repo.governedComplete({
      userId: job.user_id, tier: "strong", task: "planning", purpose: "simulation", json: true,
      system: "You are RADIAN's systems thinker. Compare 2-4 paths grounded in the owner's constraints + calibration. Output is an ESTIMATE, not fact. Return JSON {question,paths:[{name,effort,risk,dependencies,expected_leverage,tradeoffs}],assumptions,confidence,recommendation}.",
      prompt: `WHAT IF: ${p.question}\n\nCONTEXT:\n${context}\n\n${grounding}`,
    });
    sim = parseSimulation(r.text, p.question) ?? fallback();
  } catch (e) {
    if (e instanceof BudgetExceededError) { await repo.jobs.finish(job.id, "queued", undefined, "budget_governor"); return; }
    sim = fallback();
  }
  const sid = id("node");
  await repo.nodes.create({
    id: sid, user_id: job.user_id, type: "concept", title: `Simulation — ${p.question.slice(0, 60)}`,
    summary: sim.recommendation.slice(0, 400), truth_layer: "C", truth_label: "Analysis", mvs: 60, tags: ["simulation"],
    meta: { simulation: sim, estimate: true },
  });
  await repo.jobs.finish(job.id, "done", { analysis: sid, paths: sim.paths.length });
};

// ---- Wave 4, Stage 11: Meta-Radian (monthly). System Improvement Memo as a
// capture with prompt-diff recommendations. Human approves; no autonomous changes. ----
const metaReview: Handler = async (job) => {
  const opps = (await repo.opportunities.list(job.user_id)) as { status?: string }[];
  const cal = calibrate(await repo.decisions.forCalibration(job.user_id));
  const stats: MetaStats = {
    by_purpose: await repo.aiCalls.monthByPurpose(job.user_id),
    accepted_opportunities: opps.filter((o) => o.status === "accepted").length,
    rejected_opportunities: opps.filter((o) => o.status === "rejected").length,
    reverted_edges: 0,
    decision_calibration_gap: cal.gap,
  };
  const fallback = () => deterministicMetaMemo(stats);
  let memo;
  try {
    const r = await repo.governedComplete({
      userId: job.user_id, tier: "strong", task: "synthesis", purpose: "meta_review", json: true,
      system: "You are Meta-RADIAN. Review system stats and propose prompt/threshold/budget changes with proposed version bumps. Human approves. Return JSON {summary,recommendations:[{area,change,prompt_key,proposed_version}]}.",
      prompt: JSON.stringify(stats),
    });
    memo = parseMetaMemo(r.text) ?? fallback();
  } catch (e) {
    if (e instanceof BudgetExceededError) { await repo.jobs.finish(job.id, "queued", undefined, "budget_governor"); return; }
    memo = fallback();
  }
  // Stored as a capture (reviewable in the vault); not re-ingested (processed).
  const capId = id("cap");
  await repo.captures.create({
    id: capId, user_id: job.user_id, type: "manual_text", source: "radian_meta",
    captured_at: new Date().toISOString(), truth_layer: "A", status: "inbox", sensitivity: "internal",
    processing_status: "processed", title: "System Improvement Memo", note: `${memo.summary}\n\n${JSON.stringify(memo.recommendations, null, 2)}`,
    url: null, screenshot_ref: null, raw: { meta_memo: memo, stats },
  });
  await repo.jobs.finish(job.id, "done", { memo: capId, recommendations: memo.recommendations.length });
};

// ---- Wave 2, Stage 4: Research Agent (strong tier). Findings ALWAYS become
// captures (source "radian_research") that re-enter Stages 1-2 — research compounds,
// never injects directly. Secret/internal sources are excluded from any tool call. ----
const research: Handler = async (job) => {
  const p = job.payload as { nodeId?: string; captureId?: string; url?: string };
  let url = p.url || null;
  let title = "Research";
  if (p.captureId) {
    const c = await repo.captures.get(job.user_id, p.captureId);
    if (c) {
      if (!isResearchSafe(c.sensitivity)) { await repo.jobs.finish(job.id, "skipped", undefined, "privacy_excluded"); return; }
      url = url || c.url || null; title = c.title;
    }
  }
  // Node subject (Companion "Research this") — use its title + we'll link a child to it.
  if (p.nodeId) {
    const sn = await repo.nodes.get(job.user_id, p.nodeId);
    if (sn) { title = sn.title; url = url || (sn as { url?: string }).url || null; }
  }
  const repoRef = url ? parseGithubUrl(url) : null;
  let gathered = "";
  if (repoRef) {
    const gh = getTools().github;
    const m = await gh.run({ action: "repo", owner: repoRef.owner, repo: repoRef.repo });
    if (m.ok) gathered = JSON.stringify(m.data);
    const tree = await gh.run({ action: "tree", owner: repoRef.owner, repo: repoRef.repo });
    if (tree.ok) gathered += "\n" + JSON.stringify(tree.data).slice(0, 1200);
  }

  let findings: ResearchFinding[];
  try {
    const r = await repo.governedComplete({
      userId: job.user_id, tier: "strong", task: "research", purpose: "research", json: true, sourceId: p.nodeId || p.captureId,
      system: "You are RADIAN's research analyst. Trace sources and synthesize concrete findings.",
      prompt: `Return JSON {"findings":[{"title","summary","url"}]} for: ${title}\n${gathered}`,
    });
    findings = parseResearch(r.text) ?? deterministicResearch({ title, url }, gathered);
  } catch (e) {
    if (e instanceof BudgetExceededError) { await repo.jobs.finish(job.id, "queued", undefined, "budget_governor"); return; }
    findings = deterministicResearch({ title, url }, gathered);
  }

  for (const f of findings.slice(0, 5)) {
    const capId = id("cap");
    await repo.captures.create({
      id: capId, user_id: job.user_id, type: "web_link", source: "radian_research",
      captured_at: new Date().toISOString(), truth_layer: "A", status: "inbox",
      sensitivity: "internal", processing_status: "unprocessed", title: f.title, note: f.summary,
      url: f.url ?? null, screenshot_ref: null, raw: { research: true, of: p.nodeId || p.captureId },
    });
    const ij = await enqueue("ingest_capture", job.user_id, { captureId: capId });
    await repo.jobs.record({ id: ij.id, user_id: job.user_id, type: ij.type, status: "queued" });
  }

  // G1 completion gate: ALSO land a single "Research" child node linked to the subject
  // node with provenance, so "Research this" visibly produces a connected child (not just
  // loose re-ingested captures). Findings compound separately via the captures above.
  let child: string | undefined;
  if (p.nodeId) {
    child = id("node");
    const summary = findings.slice(0, 3).map((f) => `• ${f.title}`).join("\n") || "Research initiated.";
    await repo.nodes.create({
      id: child, user_id: job.user_id, type: "concept", title: `Research — ${title}`.slice(0, 80),
      summary: summary.slice(0, 400), truth_layer: "C", truth_label: "Research", mvs: 50, tags: ["research"],
      meta: { research: { of: p.nodeId, findings, count: findings.length, gathered: !!gathered }, epistemic_type: "inference" },
    });
    await repo.edges.create({ id: id("edge"), user_id: job.user_id, source_id: p.nodeId, target_id: child, relationship: "derived_from", weight: 0.8, valid_from: new Date().toISOString(), label: "research" });
    await repo.emitEvent({ user_id: job.user_id, actor: "agent:Radian", event_type: "review_generated", subject_type: "node", subject_id: child, correlation_id: p.nodeId, payload: { research: true, findings: findings.length } });
  }
  await repo.jobs.finish(job.id, "done", { findings: findings.length, child });
};

export const handlers: Partial<Record<Job["type"], Handler>> = {
  ingest_capture: ingestCapture,
  contextualize,
  embed: embedJob,
  ask: askJob,
  context_pack: contextPackJob,
  assist,
  summarize,
  tag,
  graph_update: graphUpdate,
  daily_brief: briefJob("daily"),
  weekly_review: briefJob("weekly"),
  monthly_review: reviewJob("monthly"),
  quarterly_review: reviewJob("quarterly"),
  annual_review: reviewJob("annual"),
  export_bundle: exportBundleJob,
  horizon_scan: horizonScanJob,
  monitor_scan: monitorScan,
  research,
  opportunity_scan: opportunityScan,
  consolidate: consolidateJob,
  calibration: calibrationJob,
  agent_task: agentTask,
  simulation,
  meta_review: metaReview,
};
