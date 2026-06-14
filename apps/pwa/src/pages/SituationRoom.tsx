import { useMemo, useState } from "react";
import { Users, Loader2, Gavel, Check, Target, ShieldAlert, Wrench, Palette, ScrollText, GraduationCap, ArrowLeft } from "lucide-react";
import { Link } from "wouter";
import { conveneBoardroom, createQuest, type BoardroomSynthesis } from "@/lib/api";

// AURORA A5 — the Situation Room. The six-persona council, lifted out of Ask RADIAN into
// its own screen: a radial of personas around a Convene control, then the deliberation
// (each voice), the consensus (Resolved), and a one-tap "Make it a quest". Deterministic
// personas are the floor (works with no provider key). No backend behaviour changed.
type IconType = typeof Target;
const PERSONA_ICON: Record<string, IconType> = {
  strategist: Target, skeptic: ShieldAlert, operator: Wrench, creative: Palette, historian: ScrollText, teacher: GraduationCap,
};
// Static identities so the radial renders before/while convening (names confirmed by API).
const SEATS = ["strategist", "skeptic", "operator", "creative", "historian", "teacher"] as const;
const SEAT_LABEL: Record<string, string> = { strategist: "Strategist", skeptic: "Skeptic", operator: "Operator", creative: "Creative", historian: "Historian", teacher: "Teacher" };

function param(k: string): string {
  const qs = typeof window !== "undefined" ? window.location.search || window.location.hash.replace(/^#[^?]*\??/, "?") : "";
  return new URLSearchParams(qs).get(k) || "";
}

export default function SituationRoom() {
  const subjectType = param("subject_type") || "node";
  const subjectId = param("subject_id");
  const title = param("title") || "this";
  const [synth, setSynth] = useState<BoardroomSynthesis | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [questMade, setQuestMade] = useState(false);

  // Map API lines (if convened) onto the fixed seats so each seat shows its real voice.
  const seatLine = useMemo(() => {
    const m: Record<string, { name: string; color: string; line: string }> = {};
    synth?.lines.forEach((l) => { m[l.persona] = { name: l.name, color: l.color, line: l.line }; });
    return m;
  }, [synth]);

  async function convene() {
    if (busy || !subjectId) { if (!subjectId) setErr("No subject — open the Situation Room from a node or capture."); return; }
    setBusy(true); setErr(null);
    const r = await conveneBoardroom(subjectType, subjectId, undefined);
    setBusy(false);
    if (!r) { setErr("Couldn't reach the council (offline or API asleep)."); return; }
    setSynth(r.synthesis);
  }

  const R = 112; // radial radius (px)
  return (
    <div className="px-5 pt-6 pb-12">
      <div className="flex items-center gap-2 mb-1">
        <Users size={18} strokeWidth={1.5} style={{ color: "var(--gold)" }} />
        <h1 className="text-xl font-display">Situation Room</h1>
      </div>
      <p className="cap-data mb-5" style={{ color: "var(--text-dim)" }}>six advisors on <span style={{ color: "var(--text)" }}>{title}</span></p>

      {/* Radial of advisors around a Convene control. */}
      <div className="relative mx-auto" style={{ width: 300, height: 320, marginBottom: 12 }}>
        {SEATS.map((seat, i) => {
          const angle = (i / SEATS.length) * Math.PI * 2 - Math.PI / 2;
          const x = 150 + R * Math.cos(angle);
          const y = 160 + R * Math.sin(angle);
          const Icon = PERSONA_ICON[seat];
          const voiced = seatLine[seat];
          return (
            <div key={seat} className="absolute flex flex-col items-center animate-pop" style={{ left: x, top: y, transform: "translate(-50%, -50%)", width: 72, animationDelay: `${i * 60}ms` }}>
              <span className="flex items-center justify-center" style={{ width: 44, height: 44, borderRadius: 999, background: voiced ? "var(--gold-soft)" : "var(--surface-2)", border: `1px solid ${voiced ? (voiced.color || "var(--gold-line)") : "var(--line)"}`, color: voiced?.color || "var(--text-dim)" }}>
                <Icon size={19} strokeWidth={1.5} />
              </span>
              <span className="cap-data mt-1 text-center" style={{ color: voiced ? "var(--text)" : "var(--text-dim)" }}>{SEAT_LABEL[seat]}</span>
            </div>
          );
        })}
        {/* Center convene */}
        <button onClick={convene} disabled={busy} className="press absolute flex flex-col items-center justify-center" style={{ left: 150, top: 160, transform: "translate(-50%, -50%)", width: 92, height: 92, borderRadius: 999, background: "var(--gold)", color: "#161118", border: "2px solid var(--gold-line)" }}>
          {busy ? <Loader2 size={22} strokeWidth={1.5} className="animate-spin" /> : <Gavel size={22} strokeWidth={1.5} />}
          <span style={{ fontSize: 11, fontWeight: 700, marginTop: 2 }}>{synth ? "Re-convene" : "Convene"}</span>
        </button>
      </div>

      {err && <p className="mt-3 text-center" style={{ fontSize: 13, color: "var(--risk)" }}>{err}</p>}

      {/* Deliberation — each voice. */}
      {synth && (
        <div className="mt-6 animate-fade-in-up">
          <div className="cap-data mb-2" style={{ color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: "0.06em" }}>Deliberation</div>
          {synth.lines.map((l, i) => {
            const Icon = PERSONA_ICON[l.persona] || Users;
            return (
              <div key={l.persona} className="flex gap-3 py-3" style={{ borderBottom: i === synth.lines.length - 1 ? "none" : "1px solid var(--line)" }}>
                <Icon size={16} strokeWidth={1.5} style={{ color: l.color, flexShrink: 0, marginTop: 2 }} />
                <div>
                  <div className="text-sm font-semibold" style={{ color: l.color }}>{l.name} <span className="cap-data" style={{ color: "var(--text-dim)" }}>· {l.role}</span></div>
                  <p className="mt-0.5" style={{ fontSize: 14.5, lineHeight: 1.5, color: "var(--text)" }}>{l.line}</p>
                </div>
              </div>
            );
          })}

          {/* Consensus */}
          <div className="mt-4 p-3.5" style={{ borderRadius: 12, border: "1px solid var(--gold-line)", background: "var(--surface-2)" }}>
            <div className="flex items-center gap-2 mb-1"><Gavel size={14} strokeWidth={1.5} style={{ color: "var(--gold)" }} /><span className="cap-data" style={{ color: "var(--gold)" }}>Resolved</span></div>
            <p style={{ fontSize: 15.5, lineHeight: 1.55, color: "var(--text)" }}>{synth.resolved}</p>
            {!synth.bootstrap && (questMade ? (
              <span className="inline-flex items-center gap-1 mt-2 cap-data" style={{ color: "var(--good)" }}><Check size={12} strokeWidth={1.5} /> quest created</span>
            ) : (
              <button onClick={async () => { await createQuest({ title: synth.resolvedAction, summary: synth.resolved, kind: "main", source_type: "companion", ...(subjectType === "node" ? { node_id: subjectId } : {}), state: "suggested" }); setQuestMade(true); }} className="press inline-flex items-center gap-1.5 mt-2.5 px-3 py-1.5 text-xs font-semibold" style={{ borderRadius: 6, border: "1px solid var(--gold-line)", color: "var(--gold)" }}>
                <Check size={12} strokeWidth={1.5} /> Make it a quest
              </button>
            ))}
          </div>
        </div>
      )}

      {!synth && !busy && (
        <p className="mt-5 text-center" style={{ fontSize: 14, color: "var(--text-dim)", lineHeight: 1.55 }}>
          Tap <span style={{ color: "var(--gold)" }}>Convene</span> to hear all six advisors weigh in and converge on a single move.
        </p>
      )}

      <Link href="/atlas" className="tap-row inline-flex items-center gap-1.5 mt-8 cap-data" style={{ color: "var(--text-dim)" }}>
        <ArrowLeft size={13} strokeWidth={1.5} /> Back to Atlas
      </Link>
    </div>
  );
}
