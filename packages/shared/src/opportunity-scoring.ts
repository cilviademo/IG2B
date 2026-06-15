// Cognition C4 — Opportunity scoring (deterministic, no LLM). An opportunity is more than a
// confidence number: it's worth pursuing when it's ALIGNED with active work, has REVENUE/leverage
// potential, is URGENT (decaying), and FITS the owner's stated capacity. This composes those into
// one transparent score with a breakdown + honest flags. Proposal-only — it ranks, never auto-acts.

export interface OpportunityScoreInput {
  confidence: number; // 0..100 — model/heuristic confidence in the thesis
  alignment: number;  // 0..1 — overlap with active projects/priorities
  revenue: number;    // 0..100 — revenue/leverage potential signal
  urgency: number;    // 0..100 — proximity to a decay/closing date
  constraintFit: number; // 0..1 — fit with the owner's capacity/risk profile
}

export interface OpportunityScore {
  score: number; // 0..100 composite
  breakdown: { alignment: number; revenue: number; confidence: number; urgency: number; constraintFit: number };
  flags: string[];
}

const clamp = (n: number, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, n));

/** Composite opportunity score. Alignment + revenue dominate; the loudest single input can't win. */
export function scoreOpportunity(i: OpportunityScoreInput): OpportunityScore {
  const alignment = clamp(i.alignment * 100);
  const revenue = clamp(i.revenue);
  const confidence = clamp(i.confidence);
  const urgency = clamp(i.urgency);
  const constraintFit = clamp(i.constraintFit * 100);
  const score = Math.round(clamp(0.30 * alignment + 0.25 * revenue + 0.20 * confidence + 0.15 * urgency + 0.10 * constraintFit));

  const flags: string[] = [];
  if (i.alignment < 0.2) flags.push("Low alignment with your active work");
  if (i.constraintFit < 0.4) flags.push("Strains your stated capacity");
  if (i.revenue >= 70 && i.alignment >= 0.5) flags.push("High-leverage: revenue + aligned");
  if (i.urgency >= 80) flags.push("Closing soon");
  return { score, breakdown: { alignment, revenue, confidence, urgency, constraintFit }, flags };
}

// Deterministic revenue/leverage signal from the opportunity's text. Keyword-weighted (0..100);
// honest — it reflects stated intent, not a prediction.
const REVENUE_TERMS: [RegExp, number][] = [
  [/\b(revenue|monet|paid|pricing|subscription|customer paying|sell|sales|invoice|contract|deal)\b/i, 45],
  [/\b(launch|ship|release|go[- ]?to[- ]?market|gtm|productize)\b/i, 25],
  [/\b(client|customer|audience|users?|market|demand)\b/i, 18],
  [/\b(grant|funding|investment|raise|sponsor)\b/i, 30],
  [/\b(leverage|compounding|scal(e|able)|moat|distribution)\b/i, 15],
];
export function revenueSignal(text: string): number {
  let s = 0;
  for (const [re, w] of REVENUE_TERMS) if (re.test(text)) s += w;
  return Math.min(100, s);
}

/** Capacity fit (0..1) from the owner's weekly hours + risk tolerance. Coarse but honest:
 *  tight capacity dampens fit; a stated high risk tolerance lifts it slightly. */
export function capacityFit(weeklyHours?: number, riskTolerance?: string): number {
  let fit = weeklyHours == null ? 0.7 : weeklyHours >= 20 ? 0.85 : weeklyHours >= 10 ? 0.7 : weeklyHours >= 5 ? 0.55 : 0.4;
  if (riskTolerance === "high" || riskTolerance === "aggressive") fit = Math.min(1, fit + 0.1);
  if (riskTolerance === "low" || riskTolerance === "conservative") fit = Math.max(0.2, fit - 0.1);
  return Number(fit.toFixed(2));
}
