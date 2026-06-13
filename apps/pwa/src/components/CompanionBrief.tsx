import { useEffect, useRef, useState } from "react";
import { Volume2, Square, Loader2, RefreshCw } from "lucide-react";
import { getBriefing, apiEnabled, type CompanionBriefing } from "@/lib/api";

// G10 Companion — Mission Control becomes a spoken commander's briefing ("Jarvis").
// Deterministic text from the backend; read aloud via the device's speech synthesis
// (voice mode, not chat). Tap "Brief me" — the tap is the gesture iOS needs to speak.
const canSpeak = () => typeof window !== "undefined" && "speechSynthesis" in window;

export default function CompanionBrief() {
  const [brief, setBrief] = useState<CompanionBriefing | null>(null);
  const [loading, setLoading] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const spokenRef = useRef(false);

  useEffect(() => () => { if (canSpeak()) window.speechSynthesis.cancel(); }, []);

  async function load(): Promise<CompanionBriefing | null> {
    setLoading(true);
    const r = await getBriefing();
    setLoading(false);
    setBrief(r?.briefing ?? null);
    return r?.briefing ?? null;
  }

  function speak(text: string) {
    if (!canSpeak() || !text) return;
    const synth = window.speechSynthesis;
    synth.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.rate = 1; u.pitch = 1;
    u.onend = () => setSpeaking(false);
    u.onerror = () => setSpeaking(false);
    synth.speak(u);
    setSpeaking(true);
  }

  async function briefMe() {
    if (speaking) { window.speechSynthesis?.cancel(); setSpeaking(false); return; }
    const b = brief ?? (await load());
    if (b) { spokenRef.current = true; speak(b.speech); }
  }

  if (!apiEnabled()) return null;

  return (
    <div className="mb-1 p-3.5" style={{ borderRadius: 12, border: "1px solid var(--gold-line)", background: "var(--surface)" }}>
      <div className="flex items-center gap-2">
        <Volume2 size={15} strokeWidth={1.5} style={{ color: "var(--gold)" }} />
        <span className="text-sm font-display" style={{ color: "var(--text)" }}>Companion</span>
        <button
          onClick={briefMe}
          className="press ml-auto flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold"
          style={{ borderRadius: 999, border: "1px solid var(--gold-line)", color: "var(--gold)" }}
        >
          {loading ? <Loader2 size={13} strokeWidth={1.5} className="animate-spin" />
            : speaking ? <Square size={12} strokeWidth={1.5} />
            : <Volume2 size={13} strokeWidth={1.5} />}
          {speaking ? "Stop" : "Brief me"}
        </button>
      </div>

      {brief && (
        <div className="mt-2 animate-fade-in-up">
          <p style={{ fontSize: 15, lineHeight: 1.55, color: "var(--text)" }}>
            <b>{brief.greeting}.</b>{" "}
            {brief.lines.join(" ") || (brief.bootstrap ? "Quiet start — nothing pressing yet." : "")}
          </p>
          {brief.focus.length > 0 && (
            <ol className="mt-2">
              {brief.focus.map((f, i) => (
                <li key={i} className="flex items-start gap-2 py-1">
                  <span className="font-data shrink-0" style={{ fontSize: 13, color: "var(--gold)", width: 14 }}>{i + 1}</span>
                  <span style={{ fontSize: 14, color: "var(--text)", lineHeight: 1.4 }}>{f}</span>
                </li>
              ))}
            </ol>
          )}
          <button onClick={() => void load()} className="press inline-flex items-center gap-1 mt-1 cap-data" style={{ color: "var(--text-dim)" }}>
            <RefreshCw size={11} strokeWidth={1.5} /> refresh
          </button>
        </div>
      )}
      {!canSpeak() && brief && <p className="cap-data mt-1" style={{ color: "var(--text-dim)" }}>voice not supported on this device — text only</p>}
    </div>
  );
}
