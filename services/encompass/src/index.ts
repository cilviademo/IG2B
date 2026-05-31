// indigold-encompass — retrieval, context assembly, graph intelligence (PRIVATE).
// Stateless: ranks the supplied graph and assembles a token-budgeted context pack.
import express from "express";
import type { GraphNode, GraphEdge, TruthLayer } from "@indigold/shared/types";

const app = express();
app.use(express.json({ limit: "8mb" }));

app.use((req, res, next) => {
  const expected = process.env.INTERNAL_TOKEN;
  if (expected && req.path !== "/health" && req.header("x-internal") !== expected)
    return res.status(403).json({ error: "forbidden" });
  next();
});

app.get("/health", (_req, res) => res.json({ ok: true, service: "indigold-encompass" }));

const estTokens = (s: string) => Math.ceil((s || "").split(/\s+/).filter(Boolean).length * 1.3) + 8;

// Cross-domain retrieval: lexical score over title/summary/tags.
app.post("/retrieve", (req, res) => {
  const q = String(req.body?.query || "").toLowerCase();
  const nodes: GraphNode[] = req.body?.nodes ?? [];
  const terms = q.match(/[a-z0-9]{3,}/g) ?? [];
  const ranked = nodes
    .map((n) => {
      const hay = `${n.title} ${n.summary} ${(n.tags || []).join(" ")}`.toLowerCase();
      const score = terms.reduce((s, t) => s + (hay.includes(t) ? 1 : 0), 0) + n.mvs / 100;
      return { id: n.id, title: n.title, score };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 10);
  res.json({ results: ranked });
});

// Context assembly: rank by MVS + connectivity, fill until the token budget.
app.post("/assemble", (req, res) => {
  const purpose: string = req.body?.purpose || "Working context";
  const budget: number = Number(req.body?.tokenBudget) || 4000;
  const nodes: GraphNode[] = req.body?.nodes ?? [];
  const edges: GraphEdge[] = req.body?.edges ?? [];

  const degree = new Map<string, number>();
  for (const e of edges) {
    degree.set(e.source_id, (degree.get(e.source_id) || 0) + 1);
    degree.set(e.target_id, (degree.get(e.target_id) || 0) + 1);
  }
  const ranked = [...nodes].sort(
    (a, b) => b.mvs + (degree.get(b.id) || 0) * 4 - (a.mvs + (degree.get(a.id) || 0) * 4),
  );

  const sections: { heading: string; content: string; truth_layer: TruthLayer; provenance: string }[] = [];
  const sourceNodes: string[] = [];
  let used = 0;
  for (const n of ranked) {
    const content = n.summary || n.title;
    const cost = estTokens(content);
    if (used + cost > budget * 0.95) break;
    sections.push({ heading: n.title, content, truth_layer: n.truth_layer, provenance: n.id });
    sourceNodes.push(n.id);
    used += cost;
  }

  res.json({
    title: `Context — ${purpose}`,
    purpose,
    token_budget: { total: budget, used },
    source_nodes: sourceNodes,
    sections,
  });
});

const port = Number(process.env.PORT || 7102);
app.listen(port, () => console.log(`[indigold-encompass] listening on :${port}`));
