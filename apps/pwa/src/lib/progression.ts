// Living OS (Wave G4) Progression core — MIRROR of packages/shared/src/progression.ts
// (the PWA is a standalone Vite app and cannot import the @indigold/shared node barrel).
// Pure + deterministic. Keep in sync.

// ---- skill / domain tracks ----
export type Track =
  | "ai_systems" | "music" | "business" | "leadership"
  | "learning" | "health" | "creative" | "technical";

export const TRACKS: { key: Track; label: string; color: string; keywords: string[] }[] = [
  { key: "ai_systems", label: "AI Systems", color: "#6B7DB3", keywords: ["ai", "llm", "model", "agent", "rag", "ml", "neural", "gpt", "claude", "prompt", "embedding", "radian", "inference"] },
  { key: "music", label: "Music Production", color: "#4FA08B", keywords: ["music", "audio", "dsp", "mix", "master", "sound", "plugin", "synth", "bpm", "vst", "sonic", "modulation", "track"] },
  { key: "business", label: "Business Systems", color: "#C9A45C", keywords: ["business", "revenue", "client", "sales", "market", "pricing", "ops", "strategy", "finance", "invoice", "growth", "multibanded"] },
  { key: "leadership", label: "Military / Leadership", color: "#C25450", keywords: ["military", "leadership", "command", "team", "mission", "discipline", "tactical", "operation", "lead", "btz"] },
  { key: "learning", label: "Learning / Research", color: "#8E929C", keywords: ["learn", "research", "study", "read", "course", "paper", "knowledge", "note", "explore", "understand", "review"] },
  { key: "health", label: "Health / Personal Ops", color: "#7FB069", keywords: ["health", "fitness", "sleep", "diet", "workout", "mental", "energy", "recovery", "wellness", "habit"] },
  { key: "creative", label: "Creative Output", color: "#C98BB9", keywords: ["create", "design", "art", "write", "content", "video", "story", "brand", "visual", "creative", "draft"] },
  { key: "technical", label: "Technical Build", color: "#5BA8C4", keywords: ["build", "code", "deploy", "api", "infra", "engineer", "technical", "repo", "software", "architecture", "system"] },
];
const TRACK_KEYS = TRACKS.map((t) => t.key);
export const trackLabel = (t: Track) => TRACKS.find((x) => x.key === t)?.label ?? t;
export const trackColor = (t: Track) => TRACKS.find((x) => x.key === t)?.color ?? "#8E929C";

/** Deterministic keyword match. Returns matched tracks (max 2, ranked by hit count);
 *  defaults to ["learning"] so XP always has an explainable home. */
export function inferTracks(text: string, tags: string[] = []): Track[] {
  const hay = `${text || ""} ${tags.join(" ")}`.toLowerCase();
  const scored = TRACKS.map((t) => ({ key: t.key, hits: t.keywords.reduce((n, k) => n + (hay.includes(k) ? 1 : 0), 0) }))
    .filter((s) => s.hits > 0)
    .sort((a, b) => b.hits - a.hits);
  if (!scored.length) return ["learning"];
  return scored.slice(0, 2).map((s) => s.key);
}

// ---- XP rules (deterministic + explainable) ----
export const QUEST_XP: Record<string, number> = { main: 25, research: 20, side: 15, maintenance: 10 };
export const questXp = (kind: string) => QUEST_XP[kind] ?? 15;
/** Captures grant a small base; high-MVS captures grant more (floor(mvs/20), 0–5). */
export const captureXp = (mvs: number) => 3 + Math.min(5, Math.floor((mvs || 0) / 20));

// ---- levels ----
export interface Level { level: number; name: string; floor: number }
export const LEVELS: Level[] = [
  { level: 0, name: "Dormant", floor: 0 },
  { level: 1, name: "Initiated", floor: 1 },
  { level: 2, name: "Building", floor: 50 },
  { level: 3, name: "Compounding", floor: 150 },
  { level: 4, name: "Mastery Signal", floor: 350 },
  { level: 5, name: "Core Identity", floor: 700 },
];
export interface LevelState { level: number; name: string; floor: number; next: number | null; into: number; span: number; progress: number; toNext: number }
export function levelFor(xp: number): LevelState {
  let i = 0;
  for (let k = LEVELS.length - 1; k >= 0; k--) if (xp >= LEVELS[k].floor) { i = k; break; }
  const cur = LEVELS[i];
  const next = LEVELS[i + 1] ?? null;
  const into = xp - cur.floor;
  const span = next ? next.floor - cur.floor : 0;
  return {
    level: cur.level, name: cur.name, floor: cur.floor,
    next: next ? next.floor : null,
    into, span,
    progress: next ? Math.max(0, Math.min(1, into / span)) : 1,
    toNext: next ? Math.max(0, next.floor - xp) : 0,
  };
}

// ---- compute per-track XP from current data ----
export interface XPItem { kind: "quest" | "capture"; tracks: Track[]; xp: number; reason: string }
export interface CompletedQuest { kind: string; title: string; node_tags?: string[]; tracks?: Track[] }
export interface CaptureNode { mvs: number; title: string; tags?: string[] }

export interface TrackProgress { track: Track; label: string; color: string; xp: number; level: LevelState; fromQuests: number; fromCaptures: number }

export function computeTracks(input: { completedQuests?: CompletedQuest[]; nodes?: CaptureNode[] }): Record<Track, TrackProgress> {
  const xp: Record<Track, number> = blankTracks(0);
  const fromQ: Record<Track, number> = blankTracks(0);
  const fromC: Record<Track, number> = blankTracks(0);
  for (const q of input.completedQuests || []) {
    const tracks = (q.tracks && q.tracks.length ? q.tracks : inferTracks(q.title, q.node_tags || []));
    const amt = questXp(q.kind);
    for (const t of tracks) { xp[t] += amt; fromQ[t] += amt; }
  }
  for (const n of input.nodes || []) {
    const tracks = inferTracks(n.title, n.tags || []);
    const amt = captureXp(n.mvs);
    for (const t of tracks) { xp[t] += amt; fromC[t] += amt; }
  }
  const out = {} as Record<Track, TrackProgress>;
  for (const t of TRACK_KEYS) {
    out[t] = { track: t, label: trackLabel(t), color: trackColor(t), xp: xp[t], level: levelFor(xp[t]), fromQuests: fromQ[t], fromCaptures: fromC[t] };
  }
  return out;
}
function blankTracks(v: number): Record<Track, number> {
  return TRACK_KEYS.reduce((o, k) => { o[k] = v; return o; }, {} as Record<Track, number>);
}

// ---- project momentum ----
export type Momentum = "dormant" | "warming" | "active" | "accelerating" | "blocked" | "at_risk" | "compounding";
export const MOMENTUM_STYLE: Record<Momentum, { label: string; color: string; badge: string }> = {
  dormant: { label: "Dormant", color: "#8E929C", badge: "·" },
  warming: { label: "Warming", color: "#C9A45C", badge: "◦" },
  active: { label: "Active", color: "#4FA08B", badge: "▲" },
  accelerating: { label: "Accelerating", color: "#7FB069", badge: "⟫" },
  blocked: { label: "Blocked", color: "#C25450", badge: "⊘" },
  at_risk: { label: "At Risk", color: "#C25450", badge: "!" },
  compounding: { label: "Compounding", color: "#C9A45C", badge: "✦" },
};
export interface MomentumInput {
  recentNodes: number;     // related nodes touched in the last ~14d
  activeQuests: number;    // accepted/active quests on the project
  completedQuests: number; // recently completed quests on the project
  blocked: boolean;        // a blocked quest or inbound block edge
  inactivityDays: number;  // days since the most recent related activity
  hasHistory: boolean;     // any related node/quest ever
}
export function momentumFor(i: MomentumInput): Momentum {
  if (i.blocked) return "blocked";
  if (!i.hasHistory) return "dormant";
  if (i.inactivityDays >= 45) return "dormant";
  if (i.inactivityDays >= 21) return "at_risk";
  if (i.completedQuests >= 2 && i.recentNodes >= 1) return "compounding";
  if ((i.activeQuests >= 1 && i.recentNodes >= 1) || i.recentNodes >= 3) return "accelerating";
  if (i.recentNodes >= 1 || i.activeQuests >= 1) return "active";
  return "warming";
}

// ---- Mission Control progression summary (deterministic narrative) ----
export interface ProgressionSummary {
  todayXp: number;
  streak: number;
  gaining: { track: Track; label: string } | null;
  stalled: { track: Track; label: string } | null;
  recommendation: string;
  narrative: string;
  bootstrap: boolean;
}
export function progressionSummary(args: {
  tracks: Record<Track, TrackProgress>;
  todayXp: number;
  todayByTrack?: Partial<Record<Track, number>>;
  streak?: number;
  totalSignals: number; // quests+captures seen — for bootstrap detection
  todayCaptures?: number;
  todayQuests?: number;
}): ProgressionSummary {
  const { tracks, todayXp, todayByTrack = {}, streak = 0, totalSignals } = args;
  const bootstrap = totalSignals < 5;
  // gaining = most XP gained today; fall back to highest-XP track.
  const byTodayDesc = (Object.entries(todayByTrack) as [Track, number][]).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);
  const gainingKey = byTodayDesc[0]?.[0] ?? (Object.values(tracks).sort((a, b) => b.xp - a.xp)[0]?.xp > 0 ? Object.values(tracks).sort((a, b) => b.xp - a.xp)[0].track : null);
  const gaining = gainingKey ? { track: gainingKey, label: trackLabel(gainingKey) } : null;
  // stalled = the least-XP track, EXCLUDING whatever's gaining today (never name the
  // same track as both gaining and stalled).
  const stalledTrack = Object.values(tracks).filter((t) => t.track !== gainingKey).sort((a, b) => a.xp - b.xp)[0];
  const stalled = stalledTrack ? { track: stalledTrack.track, label: stalledTrack.label } : null;
  const recTrack = stalled?.label ?? "any";
  const recommendation = bootstrap
    ? "Complete a quest or capture something to start a track."
    : `Complete one ${recTrack} quest to wake that track up.`;
  const narrative = bootstrap
    ? "Progression will become more accurate as quests, captures, and reviews accumulate."
    : gaining
      ? `${gaining.label} gained momentum today${args.todayCaptures || args.todayQuests ? ` from ${args.todayCaptures || 0} capture${(args.todayCaptures || 0) === 1 ? "" : "s"} and ${args.todayQuests || 0} completed quest${(args.todayQuests || 0) === 1 ? "" : "s"}` : ""}.${stalled ? ` ${stalled.label} is dormant.` : ""} Recommended: ${recommendation}`
      : `No XP yet today.${stalled ? ` ${stalled.label} is dormant.` : ""} Recommended: ${recommendation}`;
  return { todayXp, streak, gaining, stalled, recommendation, narrative, bootstrap };
}

// ---- quest reward preview (for quest cards) ----
export interface QuestReward { xp: number; tracks: Track[]; trackLabels: string[]; why: string }
export function questReward(q: { kind: string; title: string; node_tags?: string[]; project_name?: string }): QuestReward {
  const tracks = inferTracks(`${q.title} ${q.project_name || ""}`, q.node_tags || []);
  const xp = questXp(q.kind);
  const labels = tracks.map(trackLabel);
  const why = `Complete to gain +${xp} ${labels.join(" + ")} XP${q.project_name ? ` and strengthen ${q.project_name} momentum` : ""}.`;
  return { xp, tracks, trackLabels: labels, why };
}
