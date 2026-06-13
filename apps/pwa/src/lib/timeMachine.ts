// Living OS (Wave G2) Time Machine core — MIRROR of packages/shared/src/time-machine.ts
// (the PWA is a standalone Vite app and cannot import the @indigold/shared node barrel).
// Pure + deterministic: computes from data the client already holds. Keep in sync.

// ---- time windows ----
export type RangeKey = "7d" | "30d" | "90d" | "180d" | "365d" | "custom";
export const RANGES: { key: RangeKey; label: string; days: number }[] = [
  { key: "7d", label: "Last week", days: 7 },
  { key: "30d", label: "Last month", days: 30 },
  { key: "90d", label: "Last quarter", days: 90 },
  { key: "180d", label: "Six months ago", days: 180 },
  { key: "365d", label: "Last year", days: 365 },
];

export interface TimeWindow { fromISO: string; toISO: string; days: number; label: string }

const DAY = 86400000;
const at = (iso?: string) => (iso ? new Date(iso).getTime() : NaN);
const daysBetween = (a: number, b: number) => Math.round((a - b) / DAY);

/** The window ending "now", going back `days` (or a custom span). */
export function windowFor(range: RangeKey, now = Date.now(), customDays?: number): TimeWindow {
  const days = range === "custom" ? Math.max(1, customDays || 30) : (RANGES.find((r) => r.key === range)?.days ?? 30);
  const label = range === "custom" ? `Last ${days} days` : (RANGES.find((r) => r.key === range)?.label ?? `Last ${days} days`);
  return { fromISO: new Date(now - days * DAY).toISOString(), toISO: new Date(now).toISOString(), days, label };
}
/** The equally-sized window immediately BEFORE `w` — used for change detection. */
export function priorWindow(w: TimeWindow): TimeWindow {
  const to = at(w.fromISO);
  const from = to - w.days * DAY;
  return { fromISO: new Date(from).toISOString(), toISO: new Date(to).toISOString(), days: w.days, label: `Prior ${w.days} days` };
}
const inWindow = (iso: string | undefined, w: TimeWindow) => {
  const t = at(iso);
  return !isNaN(t) && t >= at(w.fromISO) && t <= at(w.toISO);
};

// ---- generic shapes (the API hydrates these from repos; the PWA from sample data) ----
export interface TMNode { id: string; title: string; mvs: number; type?: string; tags?: string[]; created_at?: string; updated_at?: string }
export interface TMEdge { source_id: string; target_id: string; relationship: string; valid_from?: string }
export interface TMEvent { event_type: string; created_at?: string; actor?: string }
export interface TMTimeline { id: string; date: string; type: string; significance?: string; title: string; description?: string }
export interface TMBrief { id: string; kind: string; period?: string; created_at?: string }
export interface TMDecision { id: string; decision: string; confidence?: number; expected_outcome?: string; outcome?: string; outcome_success?: boolean | null; status?: string; created_at?: string; review_by?: string | null }
export interface TMCapture { id: string; title?: string; captured_at?: string; source?: string }

export interface TimeMachineInput {
  nodes: TMNode[];
  edges: TMEdge[];
  events?: TMEvent[];
  timeline?: TMTimeline[];
  briefs?: TMBrief[];
  decisions?: TMDecision[];
  captures?: TMCapture[];
}

// ---- "What was I thinking then?" — Memory Replay ----
export interface MemoryReplay {
  window: TimeWindow;
  counts: { captures: number; nodes: number; edges: number; events: number; briefs: number };
  topNodes: { id: string; title: string; mvs: number }[];
  highlights: TMTimeline[];
  themes: { tag: string; count: number }[];
}
// A node "belongs" to a window if it was created OR last touched within it.
const nodeActiveIn = (n: TMNode, w: TimeWindow) => inWindow(n.created_at, w) || inWindow(n.updated_at, w);

export function memoryReplay(input: TimeMachineInput, w: TimeWindow): MemoryReplay {
  const nodes = input.nodes.filter((n) => nodeActiveIn(n, w));
  const edges = (input.edges || []).filter((e) => inWindow(e.valid_from, w));
  const captures = (input.captures || []).filter((c) => inWindow(c.captured_at, w));
  const events = (input.events || []).filter((e) => inWindow(e.created_at, w));
  const briefs = (input.briefs || []).filter((b) => inWindow(b.created_at || (b.period ? b.period : undefined), w));
  const highlights = (input.timeline || [])
    .filter((t) => inWindow(t.date, w))
    .sort((a, b) => sigRank(b.significance) - sigRank(a.significance) || b.date.localeCompare(a.date));
  const tagCount: Record<string, number> = {};
  for (const n of nodes) for (const t of n.tags || []) tagCount[t] = (tagCount[t] || 0) + 1;
  return {
    window: w,
    counts: { captures: captures.length, nodes: nodes.length, edges: edges.length, events: events.length, briefs: briefs.length },
    topNodes: [...nodes].sort((a, b) => b.mvs - a.mvs).slice(0, 5).map((n) => ({ id: n.id, title: n.title, mvs: n.mvs })),
    highlights: highlights.slice(0, 6),
    themes: Object.entries(tagCount).map(([tag, count]) => ({ tag, count })).sort((a, b) => b.count - a.count).slice(0, 8),
  };
}
const sigRank = (s?: string) => (s === "critical" ? 3 : s === "high" ? 2 : s === "medium" ? 1 : 0);

// ---- "What changed?" — Change Detection (current window vs the prior equal window) ----
export interface ChangeReport {
  newThemes: string[];
  decayedThemes: string[];
  strengthenedProjects: { id: string; title: string; mvs: number }[];
  abandonedThreads: { id: string; title: string; silentDays: number }[];
  contradictions: { source: string; target: string; relationship: string }[];
  missedFollowups: { id: string; label: string; due: string }[];
}
const themeSet = (nodes: TMNode[], w: TimeWindow) => {
  const s = new Set<string>();
  for (const n of nodes) if (nodeActiveIn(n, w)) for (const t of n.tags || []) s.add(t);
  return s;
};

export function changeDetection(input: TimeMachineInput, now = Date.now(), w: TimeWindow = windowFor("30d", now)): ChangeReport {
  const prior = priorWindow(w);
  const nowThemes = themeSet(input.nodes, w);
  const priorThemes = themeSet(input.nodes, prior);
  const newThemes = [...nowThemes].filter((t) => !priorThemes.has(t)).sort();
  const decayedThemes = [...priorThemes].filter((t) => !nowThemes.has(t)).sort();

  // Strengthened: high-value nodes touched in the current window.
  const strengthenedProjects = input.nodes
    .filter((n) => inWindow(n.updated_at, w) && n.mvs >= 60)
    .sort((a, b) => b.mvs - a.mvs).slice(0, 5)
    .map((n) => ({ id: n.id, title: n.title, mvs: n.mvs }));

  // Abandoned: active in the prior window, silent since (no update in the current window).
  const abandonedThreads = input.nodes
    .filter((n) => nodeActiveIn(n, prior) && !inWindow(n.updated_at, w) && !inWindow(n.created_at, w))
    .map((n) => ({ id: n.id, title: n.title, silentDays: Math.max(0, daysBetween(now, at(n.updated_at || n.created_at))) }))
    .filter((x) => !isNaN(x.silentDays))
    .sort((a, b) => b.silentDays - a.silentDays).slice(0, 5);

  // Contradictions: edges whose relationship signals tension (created any time).
  const contradictions = (input.edges || [])
    .filter((e) => /contradict|conflict|block|tension|refut/i.test(e.relationship))
    .slice(0, 8)
    .map((e) => ({ source: e.source_id, target: e.target_id, relationship: e.relationship }));

  // Missed follow-ups: decisions past their review date with no outcome, + open task
  // nodes (truth_label/tags "task") whose review_by has passed. Decisions are primary.
  const missed: { id: string; label: string; due: string }[] = [];
  for (const d of input.decisions || []) {
    if (d.review_by && at(d.review_by) < now && d.status !== "reviewed" && !d.outcome) {
      missed.push({ id: d.id, label: d.decision, due: d.review_by });
    }
  }
  return { newThemes, decayedThemes, strengthenedProjects, abandonedThreads, contradictions, missedFollowups: missed.slice(0, 8) };
}

// ---- "Where was I wrong?" — Decision Reflection (calibration over the journal) ----
export interface DecisionReflection {
  total: number;
  resolved: number;
  hits: number;
  misses: number;
  calibration: { stated: number; actual: number; gap: number; note: string };
  lessons: { id: string; decision: string; confidence: number; expected: string; outcome: string; success: boolean; lesson: string }[];
}
export function decisionReflection(decisions: TMDecision[] = []): DecisionReflection {
  const resolved = decisions.filter((d) => d.outcome_success === true || d.outcome_success === false || (d.status === "reviewed"));
  const withResult = resolved.filter((d) => d.outcome_success === true || d.outcome_success === false);
  const hits = withResult.filter((d) => d.outcome_success === true).length;
  const misses = withResult.filter((d) => d.outcome_success === false).length;
  const stated = withResult.length ? withResult.reduce((s, d) => s + (d.confidence ?? 0.5), 0) / withResult.length : 0;
  const actual = withResult.length ? hits / withResult.length : 0;
  const gap = Number((stated - actual).toFixed(2));
  const note = !withResult.length
    ? "No decisions have recorded outcomes yet — log outcomes to calibrate."
    : gap > 0.15 ? `Overconfident by ${Math.round(gap * 100)} pts: stated ${Math.round(stated * 100)}% vs ${Math.round(actual * 100)}% actual.`
    : gap < -0.15 ? `Underconfident by ${Math.round(-gap * 100)} pts: outcomes beat your stated confidence.`
    : "Well-calibrated — stated confidence tracks actual outcomes.";
  const lessons = withResult.map((d) => {
    const c = d.confidence ?? 0.5;
    const success = d.outcome_success === true;
    const lesson = success
      ? (c < 0.4 ? "Worked out despite low confidence — trust this pattern more." : "Confident and correct.")
      : (c > 0.6 ? "High confidence, wrong outcome — a blind spot to revisit." : "Low-confidence miss — acceptable risk.");
    return { id: d.id, decision: d.decision, confidence: c, expected: d.expected_outcome || "", outcome: d.outcome || "", success, lesson };
  });
  return { total: decisions.length, resolved: resolved.length, hits, misses, calibration: { stated: Number(stated.toFixed(2)), actual: Number(actual.toFixed(2)), gap, note }, lessons: lessons.slice(0, 8) };
}

// ---- "What resurfaced?" — themes that returned + forgotten high-value nodes ----
export interface ResurfacedReport {
  resurfacedThemes: string[];
  forgottenGems: { id: string; title: string; mvs: number; dormantDays: number }[];
}
export function resurfaced(input: TimeMachineInput, now = Date.now(), w: TimeWindow = windowFor("30d", now)): ResurfacedReport {
  // A theme "resurfaced" if it's active now, was active in an OLDER window, but absent
  // from the in-between gap (i.e. it came back after a dormancy).
  const recent = themeSet(input.nodes, w);
  const gap = priorWindow(w);
  const older = themeSet(input.nodes, { fromISO: new Date(at(gap.fromISO) - 365 * DAY).toISOString(), toISO: gap.fromISO, days: 365, label: "older" });
  const gapThemes = themeSet(input.nodes, gap);
  const resurfacedThemes = [...recent].filter((t) => older.has(t) && !gapThemes.has(t)).sort();

  // Forgotten gems: high-MVS nodes untouched for longer than the window (dormant value).
  const forgottenGems = input.nodes
    .filter((n) => n.mvs >= 70 && !isNaN(at(n.updated_at)) && daysBetween(now, at(n.updated_at)) > w.days)
    .map((n) => ({ id: n.id, title: n.title, mvs: n.mvs, dormantDays: daysBetween(now, at(n.updated_at)) }))
    .sort((a, b) => b.dormantDays - a.dormantDays).slice(0, 5);
  return { resurfacedThemes, forgottenGems };
}

// ---- the full assembled report ----
export interface TimeMachineReport {
  window: TimeWindow;
  replay: MemoryReplay;
  changes: ChangeReport;
  reflection: DecisionReflection;
  resurfaced: ResurfacedReport;
}
export function timeMachine(input: TimeMachineInput, range: RangeKey = "30d", now = Date.now(), customDays?: number): TimeMachineReport {
  const w = windowFor(range, now, customDays);
  return {
    window: w,
    replay: memoryReplay(input, w),
    changes: changeDetection(input, now, w),
    reflection: decisionReflection(input.decisions || []),
    resurfaced: resurfaced(input, now, w),
  };
}
