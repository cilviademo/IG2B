import * as repo from "@indigold/db";
import { enqueue, id, type Job } from "@indigold/shared";
import { forecast } from "@indigold/shared/intelligence";
import {
  getPrompt, BudgetExceededError, getTools, isResearchSafe,
  deterministicIngest, parseIngest, kindToNodeType,
  deterministicContextualize, parseContext,
  parseGithubUrl, deterministicAssist, parseAssist,
  deterministicResearch, parseResearch,
  deterministicDailyBrief, parseDailyBrief,
  type IngestResult, type ContextResult, type AssistResult, type ResearchFinding,
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
    meta: { kind: ingest.type, actionability: ingest.actionability, mvs_why: ingest.mvs.why, prompt_version: prompt.version },
  });
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
    await repo.edges.create({
      id: id("edge"), user_id: job.user_id, source_id: nodeId, target_id: e.target_id,
      relationship: e.relationship, weight: e.confidence, valid_from: new Date().toISOString(), label: e.why,
    });
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

  // Stage 3 gate: actionability >= MEDIUM qualifies for the Assistance Engine.
  const actionability = String((job.payload as { actionability?: string }).actionability || "LOW");
  if (actionability === "MEDIUM" || actionability === "HIGH") {
    const aj = await enqueue("assist", job.user_id, { nodeId });
    await repo.jobs.record({ id: aj.id, user_id: job.user_id, type: aj.type, status: "queued" });
  }
  await repo.jobs.finish(job.id, "done", { edges: ctx.edges.length, relevance: ctx.project_relevance.length });
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

  const prompt = getPrompt("assistance");
  const fallback = () => deterministicAssist({ title: node.title, summary: node.summary, tags: node.tags || [], url }, projects, repoRef);
  let res: AssistResult;
  try {
    const r = await repo.governedComplete({
      userId: job.user_id, tier: "strong", task: "planning", purpose: "assistance",
      json: true, sourceId: nodeId, promptVersion: prompt.version,
      ...prompt.build({ capture: `${node.title}\n${node.summary}\n${gathered}`, objectives: projects.map((p) => `${p.name}: ${p.objectives}`).join("\n") }),
    });
    res = parseAssist(r.text) ?? fallback();
  } catch (e) {
    if (e instanceof BudgetExceededError) { await repo.jobs.finish(job.id, "queued", undefined, "budget_governor"); return; }
    res = fallback();
  }

  const childId = id("node");
  await repo.nodes.create({
    id: childId, user_id: job.user_id, type: "concept",
    title: `Playbook — ${node.title}`,
    summary: (res.playbook[0] || res.suggestions[0]?.text || "Suggested actions").slice(0, 400),
    truth_layer: "C", truth_label: "Assistance", mvs: node.mvs, tags: node.tags || [],
    source_capture_id: srcCapId, meta: { assist: res, parent_node: nodeId, prompt_version: prompt.version, traced: !!gathered },
  });
  await repo.edges.create({
    id: id("edge"), user_id: job.user_id, source_id: nodeId, target_id: childId,
    relationship: "extends", weight: 0.9, valid_from: new Date().toISOString(), label: "assistance",
  });
  await repo.jobs.finish(job.id, "done", { actions: res.next_actions.length, playbook: res.playbook.length });
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
      await repo.edges.create({
        id: id("edge"), user_id: job.user_id,
        source_id: nodeId, target_id: other.id,
        relationship: "relates_to", weight: 0.5,
        valid_from: new Date().toISOString(), label: "shared tag",
      });
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
  }
  await repo.briefs.create({ id: id("brief"), user_id: job.user_id, kind, period: new Date().toISOString().slice(0, 10), payload });
  await repo.jobs.finish(job.id, "done");
};

const monitorScan: Handler = async (job) => {
  await repo.audit.log({ user_id: job.user_id, actor: "worker", action: "monitor_scan" });
  await repo.jobs.finish(job.id, "done");
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
  await repo.jobs.finish(job.id, "done", { findings: findings.length });
};

export const handlers: Partial<Record<Job["type"], Handler>> = {
  ingest_capture: ingestCapture,
  contextualize,
  assist,
  summarize,
  tag,
  graph_update: graphUpdate,
  daily_brief: briefJob("daily"),
  weekly_review: briefJob("weekly"),
  monitor_scan: monitorScan,
  research,
};
