import { useEffect, useState } from "react";
import { Volume2, Square, Loader2 } from "lucide-react";
import { getBriefing, apiEnabled } from "@/lib/api";

// AURORA A2 — the conversational Companion. A warm time-greeting + one natural-language
// paragraph (assembled from the SAME deterministic dashboard data — no new model call),
// with a single "Brief me" that reads it aloud. Works offline (speaks the local paragraph);
// when the live API is reachable, "Brief me" speaks the richer backend briefing.
const canSpeak = () => typeof window !== "undefined" && "speechSynthesis" in window;
function greeting(): string {
  const h = new Date().getHours();
  return h < 5 ? "Still up" : h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
}

export default function CompanionBrief({ paragraph }: { paragraph: string }) {
  const [speaking, setSpeaking] = useState(false);
  const [loading, setLoading] = useState(false);
  useEffect(() => () => { if (canSpeak()) window.speechSynthesis.cancel(); }, []);

  function speak(text: string) {
    if (!canSpeak() || !text) return;
    const synth = window.speechSynthesis;
    synth.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.onend = () => setSpeaking(false);
    u.onerror = () => setSpeaking(false);
    synth.speak(u); setSpeaking(true);
  }

  async function briefMe() {
    if (speaking) { window.speechSynthesis?.cancel(); setSpeaking(false); return; }
    // Prefer the live spoken briefing; fall back to the on-screen paragraph offline.
    let text = `${greeting()}. ${paragraph}`;
    if (apiEnabled()) {
      setLoading(true);
      const r = await getBriefing();
      setLoading(false);
      if (r?.briefing?.speech) text = r.briefing.speech;
    }
    speak(text);
  }

  return (
    <div>
      <div className="flex items-baseline gap-2">
        <span className="cap-data" style={{ color: "var(--gold)", letterSpacing: "0.06em" }}>{greeting()}</span>
        {canSpeak() && (
          <button onClick={briefMe} className="press ml-auto flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold" style={{ borderRadius: 999, border: "1px solid var(--gold-line)", color: "var(--gold)" }}>
            {loading ? <Loader2 size={13} strokeWidth={1.5} className="animate-spin" /> : speaking ? <Square size={12} strokeWidth={1.5} /> : <Volume2 size={13} strokeWidth={1.5} />}
            {speaking ? "Stop" : "Brief me"}
          </button>
        )}
      </div>
    </div>
  );
}
