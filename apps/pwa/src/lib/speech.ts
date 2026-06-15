// Hands-free Radian — browser-native speech (no backend, no cost). Speech synthesis
// for spoken answers/briefings; SpeechRecognition (where supported, incl. iOS Safari)
// for voice questions. All best-effort: callers check can* and degrade silently.

export const canSpeak = () => typeof window !== "undefined" && "speechSynthesis" in window;

export function speak(text: string, onDone?: () => void): void {
  if (!canSpeak() || !text) return;
  const synth = window.speechSynthesis;
  synth.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.rate = 1.02;
  if (onDone) { u.onend = onDone; u.onerror = onDone; }
  synth.speak(u);
}

export function stopSpeaking(): void {
  if (canSpeak()) window.speechSynthesis.cancel();
}

// ---- Voice input (SpeechRecognition) ----
interface SREvent { results: ArrayLike<ArrayLike<{ transcript: string }>> }
interface Recognition {
  lang: string; interimResults: boolean; continuous: boolean; maxAlternatives: number;
  start(): void; stop(): void;
  onresult: ((e: SREvent) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
}
type RecCtor = new () => Recognition;

function recCtor(): RecCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: RecCtor; webkitSpeechRecognition?: RecCtor };
  return w.SpeechRecognition || w.webkitSpeechRecognition || null;
}
export const canListen = () => recCtor() !== null;

/** Listen for one utterance. Calls onFinal with the transcript; onState toggles the
 *  listening indicator. Returns a stop() to cancel. */
export function listenOnce(onFinal: (text: string) => void, onState?: (listening: boolean) => void): () => void {
  const Ctor = recCtor();
  if (!Ctor) return () => {};
  const rec = new Ctor();
  rec.lang = "en-US";
  rec.interimResults = false;
  rec.continuous = false;
  rec.maxAlternatives = 1;
  rec.onresult = (e) => {
    const t = e.results?.[0]?.[0]?.transcript || "";
    if (t.trim()) onFinal(t.trim());
  };
  rec.onerror = () => onState?.(false);
  rec.onend = () => onState?.(false);
  try { rec.start(); onState?.(true); } catch { onState?.(false); }
  return () => { try { rec.stop(); } catch { /* ignore */ } };
}
