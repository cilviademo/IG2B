import { Router } from "express";
import * as repo from "@indigold/db";
import { contracts, enqueue, id, planIntake } from "@indigold/shared";
import type { Authed } from "../middleware/auth";
import { validate } from "../lib/validate";

// ---- captures ----
export const capturesRouter = Router();
capturesRouter.get("/", async (req: Authed, res) => {
  const status = typeof req.query.status === "string" ? req.query.status : undefined;
  res.json({ items: await repo.captures.list(req.userId!, status) });
});
capturesRouter.post("/", validate(contracts.captureCreate), async (req: Authed, res) => {
  const body = req.body as contracts.CaptureCreate;
  const capture = {
    id: id("cap"),
    user_id: req.userId!,
    type: body.type,
    source: body.source,
    captured_at: body.captured_at || new Date().toISOString(),
    truth_layer: "A" as const,
    status: "inbox" as const,
    sensitivity: body.sensitivity,
    processing_status: "unprocessed" as const,
    title: body.title,
    note: body.note,
    url: body.url || null,
    screenshot_ref: body.screenshot_ref || null,
  };
  await repo.captures.create(capture);
  // Event Store: capture is the lifecycle root (correlation_id = capture.id).
  await repo.emitEvent({ user_id: req.userId!, actor: "user", event_type: "capture_created", subject_type: "capture", subject_id: capture.id, correlation_id: capture.id, payload: { type: capture.type, source: capture.source } });
  // hand off to the worker for ingestion (normalize -> node -> graph)
  const job = await enqueue("ingest_capture", req.userId!, { captureId: capture.id });
  await repo.jobs.record({ id: job.id, user_id: req.userId!, type: job.type, status: "queued", payload: job.payload });
  await repo.captures.setProcessing(capture.id, "queued");
  // Wave 6 — Universal Intake Router: if what was shared is MEDIA (video/audio/podcast/
  // YouTube/reel/etc.), also enqueue the media pipeline. Capture stays instant; media work is
  // async + best-effort and surfaces via the Task Center. Indigold decides — the Shortcut just delivers.
  const plan = planIntake({ url: capture.url, captureType: capture.type, text: capture.note, source: capture.source });
  if (["captions", "transcribe"].includes(plan.pipeline) || (plan.pipeline === "metadata_only" && plan.advancedOnly)) {
    const mj = await enqueue("media_ingest", req.userId!, { captureId: capture.id });
    await repo.jobs.record({ id: mj.id, user_id: req.userId!, type: mj.type, status: "queued", payload: mj.payload });
  }
  await repo.audit.log({ user_id: req.userId!, actor: "api", action: "capture.create", target: capture.id });
  res.status(201).json({ capture, job: job.id });
});
capturesRouter.post("/:id/triage", async (req: Authed, res) => {
  await repo.captures.triage(req.userId!, req.params.id);
  res.json({ ok: true });
});
// Item management — soft-archive (reversible) + permanent delete, both event-backed.
capturesRouter.post("/:id/archive", async (req: Authed, res) => {
  await repo.captures.archive(req.userId!, req.params.id);
  await repo.emitEvent({ user_id: req.userId!, actor: "user", event_type: "archived", subject_type: "capture", subject_id: req.params.id, correlation_id: req.params.id, payload: {} });
  res.json({ ok: true });
});
capturesRouter.post("/:id/unarchive", async (req: Authed, res) => {
  await repo.captures.unarchive(req.userId!, req.params.id);
  res.json({ ok: true });
});
capturesRouter.delete("/:id", async (req: Authed, res) => {
  await repo.captures.remove(req.userId!, req.params.id);
  await repo.emitEvent({ user_id: req.userId!, actor: "user", event_type: "deleted", subject_type: "capture", subject_id: req.params.id, correlation_id: req.params.id, payload: {} });
  res.json({ ok: true });
});

// ---- nodes ----
export const nodesRouter = Router();
nodesRouter.get("/", async (req: Authed, res) => res.json({ nodes: await repo.nodes.list(req.userId!) }));
nodesRouter.get("/:id", async (req: Authed, res) => {
  const n = await repo.nodes.get(req.userId!, req.params.id);
  return n ? res.json(n) : res.status(404).json({ error: "not_found" });
});
nodesRouter.post("/", validate(contracts.nodeCreate), async (req: Authed, res) => {
  const b = req.body as contracts.NodeCreate;
  const node = { id: id("node"), user_id: req.userId!, ...b };
  await repo.nodes.create(node);
  res.status(201).json(node);
});
nodesRouter.patch("/:id", async (req: Authed, res) => {
  await repo.nodes.update(req.userId!, req.params.id, req.body || {});
  res.json({ ok: true });
});
nodesRouter.delete("/:id", async (req: Authed, res) => {
  await repo.nodes.remove(req.userId!, req.params.id);
  await repo.emitEvent({ user_id: req.userId!, actor: "user", event_type: "deleted", subject_type: "node", subject_id: req.params.id, correlation_id: req.params.id, payload: {} });
  res.json({ ok: true });
});

// ---- edges ----
export const edgesRouter = Router();
edgesRouter.get("/", async (req: Authed, res) => res.json({ edges: await repo.edges.list(req.userId!) }));
edgesRouter.post("/", validate(contracts.edgeCreate), async (req: Authed, res) => {
  const b = req.body as contracts.EdgeCreate;
  const edge = {
    id: id("edge"),
    user_id: req.userId!,
    source_id: b.source_id,
    target_id: b.target_id,
    relationship: b.relationship,
    weight: b.weight ?? 0.5,
    valid_from: b.valid_from || new Date().toISOString(),
    label: b.label,
  };
  await repo.edges.create(edge);
  res.status(201).json(edge);
});

// ---- timeline ----
export const timelineRouter = Router();
timelineRouter.get("/", async (req: Authed, res) => res.json({ events: await repo.timeline.list(req.userId!) }));
timelineRouter.delete("/:id", async (req: Authed, res) => {
  await repo.timeline.remove(req.userId!, req.params.id);
  await repo.emitEvent({ user_id: req.userId!, actor: "user", event_type: "deleted", subject_type: "timeline_event", subject_id: req.params.id, correlation_id: req.params.id, payload: {} });
  res.json({ ok: true });
});
