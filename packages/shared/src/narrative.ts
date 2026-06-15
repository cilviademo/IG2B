// Sprint 5 — Narrative Timeline: the vault's history as a readable story, not a raw log.
// PURE + deterministic (no LLM, no I/O): buckets dated "moments" (captures, ideas, decisions,
// connections, milestones, research) into chapters (This week / Last week / by month) and
// writes a plain-language summary per chapter from real counts + dominant themes. An AI
// narration layer can ride on top later; this floor is honest-by-construction.

export type MomentKind = "capture" | "idea" | "decision" | "connection" | "milestone" | "research";
export type Significance = "critical" | "high" | "medium";

export interface Moment {
  id: string;
  date: string; // ISO
  kind: MomentKind;
  title: string;
}

export interface NarrativeChapter {
  key: string; // stable bucket key (e.g. "this-week", "2026-03")
  label: string; // "This week", "Last week", "March 2026"
  startISO: string;
  endISO: string;
  summary: string;
  counts: Record<MomentKind, number>;
  moments: (Moment & { significance: Significance })[]; // notable, newest-first, capped
}

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const SIGNIFICANCE: Record<MomentKind, Significance> = {
  decision: "critical", milestone: "critical", idea: "high", research: "high", connection: "medium", capture: "medium",
};
const KIND_ORDER: MomentKind[] = ["capture", "idea", "decision", "connection", "research", "milestone"];

const daysAgo = (iso: string, now: number) => Math.floor((now - new Date(iso).getTime()) / 86400000);

function bucketOf(iso: string, now: number): { key: string; label: string } {
  const d = daysAgo(iso, now);
  if (d <= 6) return { key: "this-week", label: "This week" };
  if (d <= 13) return { key: "last-week", label: "Last week" };
  const dt = new Date(iso);
  return { key: `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, "0")}`, label: `${MONTHS[dt.getUTCMonth()]} ${dt.getUTCFullYear()}` };
}

const plural = (n: number, one: string, many = one + "s") => `${n} ${n === 1 ? one : many}`;

function summarize(counts: Record<MomentKind, number>, themes: string[], isRecent: boolean, resurfaced: string[]): string {
  const clauses: string[] = [];
  if (counts.capture) clauses.push(`captured ${plural(counts.capture, "item")}`);
  if (counts.idea) clauses.push(`formed ${plural(counts.idea, "idea")}`);
  if (counts.decision) clauses.push(`made ${plural(counts.decision, "decision")}`);
  if (counts.connection) clauses.push(`drew ${plural(counts.connection, "connection")}`);
  if (counts.research) clauses.push(`ran ${plural(counts.research, "research thread")}`);
  if (counts.milestone) clauses.push(`hit ${plural(counts.milestone, "milestone")}`);
  let sentence = clauses.length ? `You ${joinClauses(clauses)}.` : "A quiet stretch — nothing logged.";
  if (isRecent && themes.length) sentence += ` Focus: ${themes.slice(0, 3).join(", ")}.`;
  if (isRecent && resurfaced.length) sentence += ` Resurfaced: ${resurfaced.slice(0, 2).join(", ")}.`;
  return sentence;
}

function joinClauses(c: string[]): string {
  if (c.length === 1) return c[0];
  if (c.length === 2) return `${c[0]} and ${c[1]}`;
  return `${c.slice(0, -1).join(", ")}, and ${c[c.length - 1]}`;
}

export interface NarrateOptions { now?: number; themes?: string[]; resurfaced?: string[]; momentsPerChapter?: number }

/** Compose moments into newest-first narrative chapters. Deterministic. */
export function narrate(moments: Moment[], opts: NarrateOptions = {}): { chapters: NarrativeChapter[] } {
  const now = opts.now ?? Date.now();
  const cap = opts.momentsPerChapter ?? 8;
  const themes = opts.themes ?? [];
  const resurfaced = opts.resurfaced ?? [];

  // Group by bucket; ignore undated/future moments (daysAgo < 0 treated as "this week").
  const groups = new Map<string, { label: string; items: Moment[] }>();
  for (const m of moments) {
    if (!m.date || Number.isNaN(new Date(m.date).getTime())) continue;
    const b = bucketOf(m.date, now);
    const g = groups.get(b.key) ?? { label: b.label, items: [] };
    g.items.push(m);
    groups.set(b.key, g);
  }

  // Order chapters newest-first by each group's most-recent moment.
  const ordered = [...groups.entries()].sort((a, b) => {
    const am = Math.max(...a[1].items.map((x) => new Date(x.date).getTime()));
    const bm = Math.max(...b[1].items.map((x) => new Date(x.date).getTime()));
    return bm - am;
  });

  const chapters: NarrativeChapter[] = ordered.map(([key, g], idx) => {
    const counts = { capture: 0, idea: 0, decision: 0, connection: 0, research: 0, milestone: 0 } as Record<MomentKind, number>;
    for (const m of g.items) counts[m.kind] = (counts[m.kind] ?? 0) + 1;
    const sorted = [...g.items].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    const times = g.items.map((x) => new Date(x.date).getTime());
    const notable = sorted
      .sort((a, b) => KIND_ORDER.indexOf(b.kind) - KIND_ORDER.indexOf(a.kind) || new Date(b.date).getTime() - new Date(a.date).getTime())
      .slice(0, cap)
      .map((m) => ({ ...m, significance: SIGNIFICANCE[m.kind] }));
    return {
      key, label: g.label,
      startISO: new Date(Math.min(...times)).toISOString(),
      endISO: new Date(Math.max(...times)).toISOString(),
      summary: summarize(counts, themes, idx === 0, resurfaced),
      counts,
      moments: notable,
    };
  });

  return { chapters };
}
