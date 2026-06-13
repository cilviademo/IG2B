// Living OS (Wave G9) — Mentor Mode. "Talk with past you." DETERMINISTIC + HONEST: every
// reply is voiced from the owner's real history (Time Machine windows, the decision
// journal + calibration, briefs, active focus) — never fabricated. No LLM; the async
// reasoning path can enrich the voice later, but the substance is rule-derived here.

export type MentorIntent = "then" | "changed" | "wrong" | "advice" | "best_self";

export const MENTOR_QUESTIONS: { intent: MentorIntent; label: string }[] = [
  { intent: "then", label: "What was I thinking then?" },
  { intent: "changed", label: "What changed?" },
  { intent: "wrong", label: "Where was I wrong?" },
  { intent: "advice", label: "What advice would past-me give?" },
  { intent: "best_self", label: "What would my best self do?" },
];

export interface MentorDecision { decision: string; confidence?: number; success?: boolean | null; outcome?: string }
export interface MentorInput {
  windowLabel?: string;                 // e.g. "last quarter", "January"
  topNodes?: { title: string; mvs: number }[];
  themes?: string[];
  newThemes?: string[];
  decayedThemes?: string[];
  resurfacedThemes?: string[];
  decisions?: MentorDecision[];         // resolved (with outcome) preferred
  calibrationNote?: string;
  activeFocus?: { title: string; mvs: number }[];
  constraints?: { weekly_hours?: number; risk_tolerance?: string };
}

export interface MentorReply {
  intent: MentorIntent;
  voice: string;        // who is speaking ("Past you" / "Your best self" / "The record")
  answer: string;       // the first-person / advisory narrative
  points: string[];     // grounded supporting facts (each traceable to data)
  suggestion?: string;  // one concrete next move
  bootstrap: boolean;   // true when there isn't enough history to answer well
}

const titles = (xs?: { title: string }[], n = 3) => (xs || []).slice(0, n).map((x) => x.title);
const list = (xs: string[]) => (xs.length > 2 ? `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}` : xs.join(" and "));
const BOOT = "There isn't enough history yet — keep capturing, deciding and reviewing, and past-you will have more to say.";

export function mentor(intent: MentorIntent, input: MentorInput): MentorReply {
  const win = input.windowLabel || "back then";
  switch (intent) {
    case "then": {
      const top = titles(input.topNodes);
      const themes = (input.themes || []).slice(0, 3);
      const boot = top.length === 0 && themes.length === 0;
      return {
        intent, voice: "Past you", bootstrap: boot,
        answer: boot ? BOOT
          : `${cap(win)}, your attention was on ${list(top.length ? top : themes)}${themes.length && top.length ? ` — circling the theme${themes.length > 1 ? "s" : ""} of ${list(themes)}` : ""}.`,
        points: (input.topNodes || []).slice(0, 4).map((n) => `${n.title} (MVS ${n.mvs})`),
        suggestion: top[0] ? `Ask whether ${top[0]} still deserves that weight today.` : undefined,
      };
    }
    case "changed": {
      const nw = input.newThemes || [], gone = input.decayedThemes || [], back = input.resurfacedThemes || [];
      const boot = nw.length === 0 && gone.length === 0 && back.length === 0;
      return {
        intent, voice: "The record", bootstrap: boot,
        answer: boot ? BOOT
          : `Since ${win}: ${nw.length ? `${list(nw)} emerged` : "no new themes"}${gone.length ? `, ${list(gone)} faded` : ""}${back.length ? `, and ${list(back)} resurfaced` : ""}.`,
        points: [
          ...nw.map((t) => `new: ${t}`),
          ...gone.map((t) => `faded: ${t}`),
          ...back.map((t) => `resurfaced: ${t}`),
        ].slice(0, 6),
        suggestion: gone[0] ? `Decide deliberately whether dropping ${gone[0]} was right.` : undefined,
      };
    }
    case "wrong": {
      const resolved = (input.decisions || []).filter((d) => d.success === true || d.success === false);
      const misses = resolved.filter((d) => d.success === false);
      const overconfident = misses.filter((d) => (d.confidence ?? 0) >= 0.6);
      const boot = resolved.length === 0;
      return {
        intent, voice: "Past you", bootstrap: boot,
        answer: boot ? "No decisions have resolved yet — log outcomes on your decisions and I'll show you honestly where you were wrong."
          : misses.length === 0 ? `Of ${resolved.length} resolved decision${resolved.length > 1 ? "s" : ""}, none went wrong — but don't mistake a small sample for being right.`
          : `You were wrong on ${misses.length} of ${resolved.length} resolved decision${resolved.length > 1 ? "s" : ""}${overconfident.length ? `, and ${overconfident.length} of those you were confident about` : ""}.${input.calibrationNote ? ` ${input.calibrationNote}` : ""}`,
        points: misses.slice(0, 4).map((d) => `${d.decision}${d.confidence != null ? ` (was ${Math.round(d.confidence * 100)}% sure)` : ""} → ${d.outcome || "missed"}`),
        suggestion: overconfident[0] ? `Before your next confident call, recall "${clip(overconfident[0].decision)}".` : undefined,
      };
    }
    case "advice": {
      const resolved = (input.decisions || []).filter((d) => d.success === true || d.success === false);
      const note = input.calibrationNote || "";
      const boot = resolved.length === 0 && !note;
      const tendency = /overconfid/i.test(note) ? "You tend to overrate your certainty — discount your confidence a notch."
        : /underconfid/i.test(note) ? "You undersell yourself — when you're 50/50, lean in."
        : "Your calls track your confidence — keep journaling to hold that.";
      return {
        intent, voice: "Past you", bootstrap: boot,
        answer: boot ? BOOT
          : `If I could whisper one thing forward: ${tendency} And protect the few things that compounded, not the many that merely felt urgent.`,
        points: [note && `calibration: ${note}`, `${resolved.length} decision${resolved.length === 1 ? "" : "s"} reviewed`].filter(Boolean) as string[],
        suggestion: "Write today's biggest decision down — with a confidence and a review date.",
      };
    }
    case "best_self": {
      const focus = titles(input.activeFocus, 2);
      const boot = focus.length === 0;
      const hrs = input.constraints?.weekly_hours;
      return {
        intent, voice: "Your best self", bootstrap: boot,
        answer: boot ? "Point me at an active project or two and I'll tell you what your best self would do."
          : `Your best self would protect deep time for ${list(focus)}, say no to everything that isn't ${focus[0]}-adjacent${hrs ? `, and spend your ~${hrs} weekly hours on the highest-leverage move, not the loudest` : ""}.`,
        points: (input.activeFocus || []).slice(0, 4).map((n) => `${n.title} (MVS ${n.mvs})`),
        suggestion: focus[0] ? `Block your next session on ${focus[0]} — before anything reactive.` : undefined,
      };
    }
  }
}

function cap(s: string) { return s.charAt(0).toUpperCase() + s.slice(1); }
function clip(s: string, n = 40) { return s.length > n ? s.slice(0, n - 1) + "…" : s; }
