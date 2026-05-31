// Shared intelligence core — the SAME logic powers the private services
// (services/radian, services/encompass) and the in-process embedded mode in the
// API. Pure + deterministic (no node-only deps), so it bundles anywhere.
import type { GraphNode, GraphEdge, TruthLayer } from "./types";

const estTokens = (s: string) => Math.ceil((s || "").split(/\s+/).filter(Boolean).length * 1.3) + 8;

function degreeMap(edges: GraphEdge[]) {
  const d = new Map<string, number>();
  for (const e of edges) {
    d.set(e.source_id, (d.get(e.source_id) || 0) + 1);
    d.set(e.target_id, (d.get(e.target_id) || 0) + 1);
  }
  return d;
}

// ---- Radian: forecasting / way-ahead ----
export function forecast(nodes: GraphNode[], edges: GraphEdge[], horizon = "week") {
  const degree = degreeMap(edges);
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

  return {
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
}

// ---- Encompass: retrieval + context assembly ----
export function retrieve(query: string, nodes: GraphNode[]) {
  const terms = query.toLowerCase().match(/[a-z0-9]{3,}/g) ?? [];
  return nodes
    .map((n) => {
      const hay = `${n.title} ${n.summary} ${(n.tags || []).join(" ")}`.toLowerCase();
      const score = terms.reduce((s, t) => s + (hay.includes(t) ? 1 : 0), 0) + n.mvs / 100;
      return { id: n.id, title: n.title, score };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 10);
}

export function assemble(opts: { purpose?: string; tokenBudget?: number; nodes: GraphNode[]; edges: GraphEdge[] }) {
  const purpose = opts.purpose || "Working context";
  const budget = opts.tokenBudget || 4000;
  const degree = degreeMap(opts.edges);
  const ranked = [...opts.nodes].sort(
    (a, b) => b.mvs + (degree.get(b.id) || 0) * 4 - (a.mvs + (degree.get(a.id) || 0) * 4),
  );
  const sections: { heading: string; content: string; truth_layer: TruthLayer; provenance: string }[] = [];
  const source_nodes: string[] = [];
  let used = 0;
  for (const n of ranked) {
    const content = n.summary || n.title;
    const cost = estTokens(content);
    if (used + cost > budget * 0.95) break;
    sections.push({ heading: n.title, content, truth_layer: n.truth_layer, provenance: n.id });
    source_nodes.push(n.id);
    used += cost;
  }
  return { title: `Context — ${purpose}`, purpose, token_budget: { total: budget, used }, source_nodes, sections };
}
