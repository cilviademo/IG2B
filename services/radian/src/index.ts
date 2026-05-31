// indigold-radian — strategic intelligence / way-ahead / forecasting (PRIVATE).
// Stateless: receives the graph in the request, returns a directional brief.
// Deterministic v0.1 logic behind a clean seam (swap for a model later).
import express from "express";
import type { GraphNode, GraphEdge } from "@indigold/shared/types";

const app = express();
app.use(express.json({ limit: "8mb" }));

// optional shared-secret gate for internal calls
app.use((req, res, next) => {
  const expected = process.env.INTERNAL_TOKEN;
  if (expected && req.path !== "/health" && req.header("x-internal") !== expected)
    return res.status(403).json({ error: "forbidden" });
  next();
});

app.get("/health", (_req, res) => res.json({ ok: true, service: "indigold-radian" }));

app.post("/forecast", (req, res) => {
  const nodes: GraphNode[] = req.body?.nodes ?? [];
  const edges: GraphEdge[] = req.body?.edges ?? [];
  const horizon: string = req.body?.horizon ?? "week";

  const degree = new Map<string, number>();
  for (const e of edges) {
    degree.set(e.source_id, (degree.get(e.source_id) || 0) + 1);
    degree.set(e.target_id, (degree.get(e.target_id) || 0) + 1);
  }
  const byMvs = [...nodes].sort((a, b) => b.mvs - a.mvs);
  const strongest = [...nodes].sort((a, b) => (degree.get(b.id) || 0) - (degree.get(a.id) || 0))[0];

  const opportunities = byMvs
    .filter((n) => n.mvs >= 80)
    .slice(0, 3)
    .map((n) => ({ type: "Opportunity", title: n.title, detail: `High-value ${n.type} (MVS ${n.mvs}) — advance within this ${horizon}.`, confidence: Math.min(95, n.mvs) }));
  const risks = byMvs
    .filter((n) => n.mvs < 60)
    .slice(0, 2)
    .map((n) => ({ type: "Risk", title: n.title, detail: `Low signal (MVS ${n.mvs}); review or archive.`, confidence: Math.max(20, 80 - n.mvs) }));

  const payload = {
    horizon,
    period: new Date().toISOString().slice(0, 10),
    summary: nodes.length
      ? `Tracking ${nodes.length} nodes / ${edges.length} links. ${opportunities.length} opportunity signal(s) and ${risks.length} risk(s) this ${horizon}.`
      : "No graph yet — capture and triage to begin building signal.",
    forecasts: [...opportunities, ...risks],
    knowledge_evolution: {
      new_nodes: nodes.length,
      new_edges: edges.length,
      strongest_cluster: strongest ? `${strongest.title} (${degree.get(strongest.id) || 0} links)` : "—",
    },
    recommended_actions: opportunities.map((o) => ({ text: `Advance: ${o.title}`, priority: "high" })),
  };
  res.json({ payload });
});

const port = Number(process.env.PORT || 7101);
app.listen(port, () => console.log(`[indigold-radian] listening on :${port}`));
