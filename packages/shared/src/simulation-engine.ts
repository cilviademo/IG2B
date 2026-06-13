// Living OS (Wave G7) — Simulation Engine. "What happens if…?" → best / likely / worst
// with probability estimates. DETERMINISTIC + EXPLAINABLE + HONEST: probabilities are
// model ESTIMATES computed by transparent rules from real signals (momentum, value,
// constraint-fit, recency), never claimed as predictions of truth. Works in stub mode
// (no LLM); the async `simulation` job remains the deeper live-reasoning path.

export type OutcomeBand = "best" | "likely" | "worst";
export interface Outcome { band: OutcomeBand; probability: number; summary: string }

export interface SimSignals {
  momentum?: string;       // project momentum label (dormant…compounding)
  mvs?: number;            // 0..100 value of the subject
  constraintFit?: number;  // 0..1 fit against time/energy/risk
  recencyDays?: number;    // days since last activity
  degree?: number;         // graph connectedness
  hasData?: boolean;       // backed by a real project/node (vs. a bare name)
}

export interface SimOption { name: string; score: number; feasibility: number; outcomes: Outcome[]; rationale: string }

export interface SimulationResult {
  question: string;
  kind: "scenario" | "comparison";
  outcomes?: Outcome[];       // scenario
  options?: SimOption[];      // comparison (ranked best-first)
  recommendation: string;
  assumptions: string[];
  confidence: number;         // 0..1 — how much real signal backed this
  estimate: true;             // ALWAYS — never presented as fact
  bootstrap: boolean;         // true when there isn't enough data to be confident
}

const MOMENTUM_F: Record<string, number> = {
  compounding: 0.9, accelerating: 0.8, active: 0.65, warming: 0.5, at_risk: 0.35, dormant: 0.3, blocked: 0.2,
};
const clamp01 = (x: number) => Math.max(0, Math.min(1, x));

/** Feasibility (0..1) — the spine of every estimate. Weighted, transparent. */
export function feasibilityFrom(sig: SimSignals): number {
  const m = sig.momentum && MOMENTUM_F[sig.momentum] != null ? MOMENTUM_F[sig.momentum] : 0.5;
  const v = sig.mvs != null ? clamp01(sig.mvs / 100) : 0.5;
  const c = sig.constraintFit != null ? clamp01(sig.constraintFit) : 0.6;
  const r = sig.recencyDays == null ? 0.5 : sig.recencyDays <= 14 ? 0.75 : sig.recencyDays <= 45 ? 0.5 : 0.3;
  const d = sig.degree != null ? clamp01(0.4 + sig.degree * 0.08) : 0.5;
  return clamp01(0.34 * m + 0.24 * v + 0.18 * c + 0.14 * r + 0.10 * d);
}

/** Three outcome bands whose probabilities sum to 100. `likely` keeps the most mass;
 *  higher feasibility shifts mass toward `best`, lower toward `worst`. */
export function outcomesFor(f: number, label: string): Outcome[] {
  const best = Math.round(15 + f * 30);
  const worst = Math.round(15 + (1 - f) * 30);
  const likely = 100 - best - worst;
  return [
    { band: "best", probability: best, summary: `${label} compounds — momentum carries it further/faster than planned.` },
    { band: "likely", probability: likely, summary: `Steady progress with normal friction; meaningful but not dramatic movement on ${label}.` },
    { band: "worst", probability: worst, summary: `${label} stalls — competing demands or an unresolved blocker eat the time with little gain.` },
  ];
}

function scenarioRecommendation(f: number): string {
  return f >= 0.66 ? "Proceed — the odds favor it."
    : f >= 0.45 ? "Proceed with caution — pre-mitigate the worst case before committing."
    : "Reconsider or de-risk first — feasibility is low as framed.";
}

const BASE_ASSUMPTIONS = (bootstrap: boolean) => [
  "Current momentum and constraints hold roughly steady.",
  "No major external shock intervenes.",
  bootstrap ? "Sparse data — bands are wide placeholders; add notes/decisions to sharpen." : "Estimates derive from your current graph signals.",
  "These are ESTIMATES, not predictions.",
];

/** Single "what happens if X?" scenario. */
export function simulateScenario(question: string, sig: SimSignals = {}): SimulationResult {
  const f = feasibilityFrom(sig);
  const bootstrap = sig.hasData === false || (sig.momentum == null && sig.mvs == null && sig.degree == null);
  const label = subjectLabel(question);
  return {
    question, kind: "scenario",
    outcomes: outcomesFor(f, label),
    recommendation: bootstrap ? "Not enough signal yet — capture more on this, then re-run." : scenarioRecommendation(f),
    assumptions: BASE_ASSUMPTIONS(bootstrap),
    confidence: bootstrap ? 0.2 : clamp01(0.4 + Math.abs(f - 0.5)),
    estimate: true, bootstrap,
  };
}

/** "A vs B vs C" comparison — scores each option, ranks best-first. */
export function simulateComparison(question: string, options: { name: string; sig?: SimSignals }[]): SimulationResult {
  const scored: SimOption[] = options.map((o) => {
    const f = feasibilityFrom(o.sig || {});
    return {
      name: o.name, feasibility: f, score: Math.round(f * 100),
      outcomes: outcomesFor(f, o.name),
      rationale: (o.sig?.hasData ? `${o.sig?.momentum || "tracked"}, MVS ${o.sig?.mvs ?? "—"}` : "no backing data — neutral estimate"),
    };
  }).sort((a, b) => b.score - a.score);
  const anyData = options.some((o) => o.sig?.hasData);
  const top = scored[0];
  const bottom = scored[scored.length - 1];
  return {
    question, kind: "comparison", options: scored,
    recommendation: !anyData
      ? "Insufficient data to separate these — log a decision or capture context for each, then re-run."
      : `Lead with ${top.name} (highest feasibility ${top.score}); hold or stage ${bottom.name}.`,
    assumptions: BASE_ASSUMPTIONS(!anyData),
    confidence: anyData ? clamp01(0.35 + (top.feasibility - (bottom?.feasibility ?? 0))) : 0.2,
    estimate: true, bootstrap: !anyData,
  };
}

// Pull a short label from the question for outcome copy.
function subjectLabel(q: string): string {
  const m = q.replace(/^\s*(what happens )?if\s+(i\s+)?/i, "").replace(/\?+$/, "").trim();
  return m.length > 48 ? m.slice(0, 47) + "…" : (m || "this path");
}

/** Parse options out of a comparison question ("A vs B vs C", "A or B"). */
export function parseOptions(question: string): string[] {
  const parts = question
    .replace(/\?+$/, "")
    .split(/\s+vs\.?\s+|\s+versus\s+|\s+or\s+|,\s*/i)
    .map((s) => s.replace(/^\s*(what happens )?if\s+(i\s+)?/i, "").trim())
    .filter((s) => s.length > 0);
  return parts.length >= 2 ? parts.slice(0, 4) : [];
}

/** Top-level dispatch. `options` (with signals) wins; else parse the question. */
export function simulate(input: { question: string; signals?: SimSignals; options?: { name: string; sig?: SimSignals }[] }): SimulationResult {
  if (input.options && input.options.length >= 2) return simulateComparison(input.question, input.options);
  const parsed = parseOptions(input.question);
  if (parsed.length >= 2) return simulateComparison(input.question, parsed.map((name) => ({ name })));
  return simulateScenario(input.question, input.signals || {});
}
