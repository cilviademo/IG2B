// Watchlists (Intelligence review, Phase 3) — owner-chosen topics monitored on a cadence. The
// connectors (Crossref scholarly, the owner's RSS feeds) gather new evidence into the Research
// Inbox automatically. PURE cadence math here; scheduling/fetch live in the api/worker.

export type Cadence = "daily" | "weekly" | "manual";
export const CADENCES: Cadence[] = ["daily", "weekly", "manual"];
const CADENCE_MS: Record<Cadence, number> = { daily: 24 * 3600e3, weekly: 7 * 24 * 3600e3, manual: Infinity };

export const isCadence = (s: string): s is Cadence => (CADENCES as string[]).includes(s);
export function normalizeCadence(s?: unknown): Cadence {
  const v = String(s ?? "weekly");
  return isCadence(v) ? v : "weekly";
}

/** Is a watchlist due to run? Manual never auto-runs; otherwise when its cadence window has
 *  elapsed since last_run (never-run → due). Deterministic. */
export function watchlistDue(cadence: string, lastRun: string | null | undefined, now = Date.now()): boolean {
  const c = normalizeCadence(cadence);
  if (c === "manual") return false;
  if (!lastRun) return true;
  const last = new Date(lastRun).getTime();
  if (Number.isNaN(last)) return true;
  return now - last >= CADENCE_MS[c];
}
