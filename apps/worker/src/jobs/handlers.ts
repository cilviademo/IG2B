import * as repo from "@indigold/db";
import { enqueue, id, type Job } from "@indigold/shared";
import { forecast } from "@indigold/shared/intelligence";
import { model } from "../lib/model";

type Handler = (job: Job) => Promise<void>;

// Capture -> normalized node -> downstream summarize/tag/graph jobs.
const ingestCapture: Handler = async (job) => {
  const captureId = String((job.payload as { captureId: string }).captureId);
  const cap = await repo.captures.get(job.user_id, captureId);
  if (!cap) return;
  await repo.captures.setProcessing(captureId, "processing");
  const nodeId = id("node");
  await repo.nodes.create({
    id: nodeId, user_id: job.user_id,
    type: "resource",
    title: cap.title,
    summary: cap.note || "",
    truth_layer: "B", truth_label: "Normalized", mvs: 55,
    tags: [], source_capture_id: captureId,
  });
  for (const t of ["summarize", "tag", "graph_update"] as const) {
    const j = await enqueue(t, job.user_id, { nodeId });
    await repo.jobs.record({ id: j.id, user_id: job.user_id, type: j.type, status: "queued" });
  }
  await repo.captures.setProcessing(captureId, "processed");
  await repo.jobs.finish(job.id, "done", { nodeId });
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
  summarize,
  tag,
  graph_update: graphUpdate,
  daily_brief: briefJob("daily"),
  weekly_review: briefJob("weekly"),
  monitor_scan: monitorScan,
  research,
};
