import { Router } from "express";
import * as repo from "@indigold/db";
import { contracts, id } from "@indigold/shared";
import { validate } from "../lib/validate";
import type { Authed } from "../middleware/auth";

export const ioRouter = Router();

// Full export of the user's vault as a portable JSON bundle.
ioRouter.get("/export", async (req: Authed, res) => {
  const uid = req.userId!;
  const [captures, nodes, edges, timeline, contextPacks, briefs] = await Promise.all([
    repo.captures.list(uid),
    repo.nodes.list(uid),
    repo.edges.list(uid),
    repo.timeline.list(uid),
    repo.contextPacks.list(uid),
    repo.briefs.list(uid),
  ]);
  await repo.audit.log({ user_id: uid, actor: "api", action: "export" });
  res.setHeader("Content-Disposition", 'attachment; filename="indigold_export.json"');
  res.json({ app: "Indigold", version: "0.1.0", exported_at: new Date().toISOString(), data: { captures, nodes, edges, timeline, contextPacks, briefs } });
});

// Import nodes/edges/captures/timeline (best-effort, scoped to the user).
ioRouter.post("/import", validate(contracts.importBody), async (req: Authed, res) => {
  const uid = req.userId!;
  const body = req.body as {
    nodes?: Record<string, unknown>[];
    edges?: Record<string, unknown>[];
    captures?: Record<string, unknown>[];
    timeline?: Record<string, unknown>[];
  };
  let counts = { nodes: 0, edges: 0, captures: 0, timeline: 0 };
  const idMap = new Map<string, string>();

  for (const n of body.nodes ?? []) {
    const newId = id("node");
    if (n.id) idMap.set(String(n.id), newId);
    await repo.nodes.create({
      id: newId, user_id: uid,
      type: (n.type as never) ?? "concept",
      title: String(n.title ?? "Untitled"),
      summary: String(n.summary ?? ""),
      truth_layer: (n.truth_layer as never) ?? "C",
      truth_label: String(n.truth_label ?? "Knowledge"),
      mvs: Number(n.mvs ?? 50),
      tags: Array.isArray(n.tags) ? (n.tags as string[]) : [],
    });
    counts.nodes++;
  }
  for (const e of body.edges ?? []) {
    const src = idMap.get(String(e.source_id)) ?? String(e.source_id);
    const tgt = idMap.get(String(e.target_id)) ?? String(e.target_id);
    try {
      await repo.edges.create({
        id: id("edge"), user_id: uid, source_id: src, target_id: tgt,
        relationship: String(e.relationship ?? "relates_to"),
        weight: Number(e.weight ?? 0.5),
        valid_from: String(e.valid_from ?? new Date().toISOString()),
        label: String(e.label ?? ""),
      });
      counts.edges++;
    } catch {
      /* skip edges that reference unknown nodes */
    }
  }
  await repo.audit.log({ user_id: uid, actor: "api", action: "import", meta: counts });
  res.json({ ok: true, counts });
});
