// Living OS (Wave G10) — Companion. Mission Control becomes a spoken commander's
// briefing ("Jarvis", voice not chat). DETERMINISTIC + HONEST: the briefing is assembled
// by transparent rules from real signals (project momentum, resurfaced ideas, critical
// quests, recommended focus, streak) — no fabrication, no LLM. The PWA reads `speech`
// aloud via the device's speech synthesis.

export interface CompanionInput {
  now?: number;
  acceleratedProjects?: string[];      // momentum accelerating/compounding
  topMomentum?: string | null;         // strongest-momentum project
  resurfaced?: string[];               // resurfaced themes / forgotten gems
  criticalQuests?: number;             // blocked / at-risk quests needing attention
  activeQuests?: number;               // in-play quests
  recommendedFocus?: string[];         // top 1–3 next moves
  todayXp?: number;
  streak?: number;
  dormantTrack?: string | null;        // a stalled skill track
}

export interface CompanionBriefing {
  greeting: string;
  lines: string[];   // situation lines (display)
  focus: string[];   // recommended focus (numbered in speech)
  speech: string;    // the full spoken text
  bootstrap: boolean;
}

export function timeGreeting(now = Date.now()): string {
  const h = new Date(now).getHours();
  return h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
}

const plural = (n: number, s: string) => `${n} ${s}${n === 1 ? "" : "s"}`;

export function morningBriefing(input: CompanionInput): CompanionBriefing {
  const greeting = timeGreeting(input.now);
  const lines: string[] = [];

  const accel = input.acceleratedProjects || [];
  if (accel.length) lines.push(`${plural(accel.length, "project")} accelerated.`);
  if (input.topMomentum) lines.push(`${input.topMomentum} gained momentum.`);
  const res = input.resurfaced || [];
  if (res.length) lines.push(`${res[0]} resurfaced from the vault.`);
  if (input.criticalQuests && input.criticalQuests > 0) lines.push(`You have ${plural(input.criticalQuests, "critical quest")}.`);
  else if (input.activeQuests && input.activeQuests > 0) lines.push(`${plural(input.activeQuests, "active quest")} in play.`);
  if (input.dormantTrack) lines.push(`${input.dormantTrack} has gone quiet.`);
  if (input.streak && input.streak > 1) lines.push(`${input.streak}-day streak.`);

  const focus = (input.recommendedFocus || []).slice(0, 3);
  const bootstrap = lines.length === 0 && focus.length === 0;

  const focusSpeech = focus.length ? ` Recommended focus: ${focus.map((f, i) => `${i + 1}. ${stripPeriod(f)}.`).join(" ")}` : "";
  const speech = bootstrap
    ? `${greeting}. Quiet start — nothing pressing yet. Capture something or accept a quest to get going.`
    : `${greeting}.${input.todayXp ? ` ${input.todayXp} XP earned today.` : ""} ${lines.join(" ")}${focusSpeech}`.replace(/\s+/g, " ").trim();

  return { greeting, lines, focus, speech, bootstrap };
}

function stripPeriod(s: string) { return s.replace(/\.+$/, "").trim(); }
