import * as repo from "@indigold/db";
import { enqueue, id, type Job } from "@indigold/shared";
import { forecast } from "@indigold/shared/intelligence";
import {
  getPrompt, BudgetExceededError,
  deterministicIngest, parseIngest, kindToNodeType,
  deterministicContextualize, parseContext,
  type IngestResult, type ContextResult,
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
  await repo.jobs.finish(job.id, "done", { edges: ctx.edges.length, relevance: ctx.project_relevance.length });
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

// Daily/weekly briefs use the shared Radian core directly.
const briefJob = (kind: "daily" | "weekly"): Handler => async (job) => {
  const nodes = await repo.nodes.list(job.user_id);
  const edges = await repo.edges.list(job.user_id);
  const payload = forecast(nodes, edges, kind === "daily" ? "day" : "week") as unknown as Record<string, unknown>;
  await repo.briefs.create({ id: id("brief"), user_id: job.user_id, kind, period: new Date().toISOString().slice(0, 10), payload });
  await repo.jobs.finish(job.id, "done");
};

const monitorScan: Handler = async (job) => {
  await repo.audit.log({ user_id: job.user_id, actor: "worker", action: "monitor_scan" });
  await repo.jobs.finish(job.id, "done");
};
const research: Handler = async (job) => {
  await repo.audit.log({ user_id: job.user_id, actor: "worker", action: "research" });
  await repo.jobs.finish(job.id, "done");
};

export const handlers: Partial<Record<Job["type"], Handler>> = {
  ingest_capture: ingestCapture,
  contextualize,
  summarize,
  tag,
  graph_update: graphUpdate,
  daily_brief: briefJob("daily"),
  weekly_review: briefJob("weekly"),
  monitor_scan: monitorScan,
  research,
};
