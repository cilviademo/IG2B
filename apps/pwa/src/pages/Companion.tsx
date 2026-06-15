import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useLocation } from "wouter";
import { Sparkles, Loader2, Check, AlertTriangle, RotateCcw, ArrowRight, ArrowUp, Inbox as InboxIcon, Globe2, Clock, Link2, ExternalLink, Search, BookOpen, Users, Mic, Volume2, VolumeX, MessageCircle, ThumbsUp, ThumbsDown, X } from "lucide-react";
import { useTasks, type Task } from "@/contexts/TaskCenter";
import { Dot } from "@/components/primitives";
import { apiEnabled, fetchCaptures, getLiveNodes, getLiveEdges, askRadian, chatRadian, rememberRadian, radianFeedback, getBriefing, type BackendCapture, type ChatMode, type CompanionBriefing } from "@/lib/api";
import { onVaultSynced } from "@/lib/sync";
import { speak, stopSpeaking, canSpeak, canListen, listenOnce } from "@/lib/speech";
import { toast } from "sonner";

// "What I found" — the proactive arrival. Radian surfaces what it learned from your
// recent shares (capture → enriched node), so the front door is "here's what I found,"
// not a database you go dig through.
interface Found { id: string; title: string; platform?: string; status: "reading" | "ready"; summary?: string; nodeId?: string; connectedNodes: { id: string; title: string }[]; note?: string; at: string; url?: string; reasoned?: boolean; feedback?: string }
type NodeRow = { id: string; title?: string; summary?: string; source_capture_id?: string; meta?: { reasoned?: boolean; web?: { url?: string }; media?: { url?: string }; feedback?: { kind?: string } } };
type EdgeRow = { source_id: string; target_id: string; relationship?: string };

const PLATFORM: { test: RegExp; name: string }[] = [
  { test: /instagram\.com/i, name: "Instagram" }, { test: /(youtube\.com|youtu\.be)/i, name: "YouTube" },
  { test: /tiktok\.com/i, name: "TikTok" }, { test: /(twitter\.com|x\.com)/i, name: "X" },
  { test: /reddit\.com/i, name: "Reddit" }, { test: /vimeo\.com/i, name: "Vimeo" },
];
function platformOf(url?: string | null): string | undefined {
  if (!url) return undefined;
  const m = PLATFORM.find((p) => p.test.test(url));
  if (m) return m.name;
  try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return undefined; }
}

// Phase B — the Companion is the front door. One place for everything Radian is doing:
// what's running now, and your recent conversations (the AI work that used to be split
// across "AI Activity", the queue, and Atlas dots). Atlas is now background memory.
function isRunning(s: string) { return s === "queued" || s === "running" || s === "budget-limited"; }
function isOk(s: string) { return s === "completed" || s === "fallback"; }

// Content-aware next questions for a finding → open a grounded conversation. Deterministic
// templates (the title is interpolated so retrieval finds the node) — no per-item LLM cost.
function suggestedPrompts(f: Found): { label: string; prompt: string }[] {
  const t = f.title.slice(0, 70);
  return [
    { label: "Key takeaway", prompt: `What's the key takeaway from "${t}", and why might it matter to me?` },
    { label: "Connect to my work", prompt: `How does "${t}" connect to my current projects and recent notes?` },
    { label: "Skeptic's view", prompt: `What would a sharp skeptic challenge about "${t}"?` },
  ];
}

function resultHref(t: Task): string {
  // Results live as a thread inside their source node now → focus the parent.
  if (t.subjectType === "node" && t.subjectId) return `/atlas?focus=${encodeURIComponent(t.subjectId)}`;
  if (t.subjectType === "capture" && t.subjectId) return "/inbox";
  return t.tab || "/atlas";
}
function relTime(ms: number): string {
  const s = Math.round((Date.now() - ms) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.round(s / 60)}m ago`;
  if (s < 86400) return `${Math.round(s / 3600)}h ago`;
  return `${Math.round(s / 86400)}d ago`;
}

// Progressive reveal — gives answers a "live, thinking" feel. (A client-side reveal of
// the full answer; true token-by-token SSE streaming is a deeper backend follow-up.)
function Typewriter({ text }: { text: string }) {
  const [n, setN] = useState(0);
  useEffect(() => {
    setN(0);
    const step = Math.max(2, Math.round(text.length / 90));
    const id = window.setInterval(() => setN((x) => {
      const nx = x + step;
      if (nx >= text.length) { clearInterval(id); return text.length; }
      return nx;
    }), 18);
    return () => clearInterval(id);
  }, [text]);
  return (
    <p style={{ fontSize: 14, lineHeight: 1.5, color: "var(--text)", whiteSpace: "pre-wrap" }}>
      {text.slice(0, n)}{n < text.length ? <span style={{ opacity: 0.5 }}>▍</span> : null}
    </p>
  );
}

export default function Companion() {
  const { tasks, retry, trackJob } = useTasks();
  const [, navigate] = useLocation();
  const [found, setFound] = useState<Found[]>([]);
  const [asking, setAsking] = useState<string | null>(null);
  // Free-form conversation with Radian (this-session transcript, multi-turn).
  type Msg = { role: "you" | "radian"; text: string; q?: string; sources?: { id?: string; title: string; url?: string }[]; deterministic?: boolean; mode?: string; grounding?: string; webNote?: string; usedWeb?: boolean; saved?: boolean };
  const [chat, setChat] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [chatBusy, setChatBusy] = useState(false);
  const [listening, setListening] = useState(false);
  const [voice, setVoice] = useState(false); // speak Radian's replies aloud
  const [briefing, setBriefing] = useState(false);
  const [mode, setMode] = useState<ChatMode>("auto"); // brain mode

  async function sendChat(override?: string, speakBack?: boolean) {
    const q = (override ?? input).trim();
    if (!q || chatBusy) return;
    setInput("");
    const history = chat.slice(-6).map((m) => ({ role: m.role, text: m.text }));
    setChat((c) => [...c, { role: "you", text: q }]);
    setChatBusy(true);
    try {
      const r = await chatRadian(q, mode, history);
      const text = r ? r.answer : "I couldn't reach the model (offline, or the API is waking — try again in ~30s).";
      setChat((c) => [...c, r
        ? { role: "radian", text, q, sources: r.sources, deterministic: r.deterministic, mode: r.mode, grounding: r.grounding, webNote: r.webNote, usedWeb: r.usedWeb }
        : { role: "radian", text, q }]);
      if ((speakBack || voice) && canSpeak()) speak(text);
    } finally {
      setChatBusy(false);
    }
  }

  async function saveMsg(idx: number) {
    const m = chat[idx];
    if (!m || m.role !== "radian" || m.saved) return;
    const ok = await rememberRadian(m.q || "Radian answer", m.text);
    if (ok) { setChat((c) => c.map((x, i) => (i === idx ? { ...x, saved: true } : x))); toast.success("Saved to vault"); }
    else toast.error("Couldn't save");
  }

  const MODE_LABEL: Record<string, string> = { auto: "Auto", vault: "Vault", general: "General", web: "Vault + Web", research: "Research" };
  const GROUND_LABEL: Record<string, string> = { vault: "Vault-grounded", mixed: "General + your vault", general: "General reasoning — not live web-verified" };

  // Voice question → transcribe → ask → speak the answer back (hands-free).
  function micTap() {
    if (listening) { stopSpeaking(); setListening(false); return; }
    listenOnce((t) => { setInput(t); void sendChat(t, true); }, setListening);
  }

  // JARVIS morning briefing — speak the live (or local) commander's brief.
  async function briefMe() {
    if (!canSpeak()) return;
    if (briefing) { stopSpeaking(); setBriefing(false); return; }
    setBriefing(true);
    let text = "";
    try { const r = await getBriefing(); text = r?.briefing?.speech || ""; } catch { /* offline */ }
    if (!text) { setBriefing(false); toast("Briefing unavailable", { description: "offline or API asleep" }); return; }
    speak(text, () => setBriefing(false));
  }

  // One-tap deepen from the arrival feed: fire a Radian verb on the node and hand it
  // to the Task Center (shows under "Running now", result lands in the node thread).
  async function deepen(f: Found, verb: string) {
    if (!f.nodeId || asking) return;
    setAsking(f.id + verb);
    try {
      const r = await askRadian("node", f.nodeId, verb);
      if (!r) { toast.error("Couldn't reach Radian", { description: "offline or API asleep" }); return; }
      if (r.job) {
        trackJob({ kind: "companion", feature: verb === "research" ? "Research" : "Companion", tab: "/atlas", label: `${verb.replace("_", " ")} — ${f.title}`, jobId: r.job, subjectType: "node", subjectId: f.nodeId, verb });
        toast.success(`Radian is ${verb === "research" ? "researching" : "working on"} this`, { description: "Watch it under Running now." });
      } else {
        toast.success("Done", { description: "task created in your vault" });
      }
    } finally {
      setAsking(null);
    }
  }

  // Owner feedback on a finding → records a ranking signal. Dismiss removes it from the
  // feed (persisted, so it won't resurface); others mark it. Optimistic.
  async function giveFeedback(f: Found, kind: string) {
    if (!f.nodeId) return;
    setFound((prev) => kind === "dismiss" ? prev.filter((x) => x.id !== f.id) : prev.map((x) => (x.id === f.id ? { ...x, feedback: kind } : x)));
    const ok = await radianFeedback(f.nodeId, kind);
    if (!ok) toast.error("Couldn't save feedback");
    else if (kind === "dismiss") toast("Dismissed", { description: "It won't resurface here." });
  }

  // Pull recent shares + their enriched nodes → "what I found".
  const loadFound = useCallback(async () => {
    if (!apiEnabled()) return;
    const [caps, nr, er] = await Promise.all([fetchCaptures(), getLiveNodes(), getLiveEdges()]);
    if (caps === null) return;
    const nodes = (nr?.nodes ?? []) as NodeRow[];
    const edges = (er?.edges ?? []) as EdgeRow[];
    const nodeByCapture = new Map<string, NodeRow>();
    for (const n of nodes) if (n.source_capture_id) nodeByCapture.set(n.source_capture_id, n);
    const titleById = new Map(nodes.map((n) => [n.id, n.title || "Untitled"]));
    // Named neighbors (real graph links, not AI-derived) → "where it connects", openable.
    const neighbors = (nid: string) => {
      const ids: string[] = [];
      for (const e of edges) {
        if (e.relationship === "derived_from") continue;
        if (e.source_id === nid) ids.push(e.target_id);
        else if (e.target_id === nid) ids.push(e.source_id);
      }
      return [...new Set(ids)].slice(0, 4).map((id) => ({ id, title: titleById.get(id) || "Untitled" }));
    };
    const items: Found[] = (caps as BackendCapture[]).slice(0, 8).map((c) => {
      const node = nodeByCapture.get(c.id);
      const ready = c.processing_status === "processed" && !!node;
      return {
        id: c.id, title: c.title, platform: platformOf(c.url),
        status: ready ? "ready" : "reading",
        summary: node?.summary, nodeId: node?.id,
        connectedNodes: node ? neighbors(node.id) : [],
        note: (c.note || "").trim() || undefined,
        at: c.captured_at, url: c.url ?? undefined, reasoned: node?.meta?.reasoned,
        feedback: node?.meta?.feedback?.kind,
      };
    });
    // Dismissed findings stay dismissed across reloads (persisted on the node).
    setFound(items.filter((f) => f.feedback !== "dismiss"));
  }, []);

  useEffect(() => {
    void loadFound();
    const off = onVaultSynced(() => void loadFound());
    return off;
  }, [loadFound]);

  useEffect(() => () => stopSpeaking(), []); // stop any speech when leaving Radian

  // Daily orientation — a deterministic "Chief of Staff" opener (momentum, resurfaced,
  // overdue, focus) from /radian/briefing. Falls back to the simple greeting if absent.
  const [orient, setOrient] = useState<CompanionBriefing | null>(null);
  useEffect(() => {
    if (apiEnabled()) getBriefing().then((r) => setOrient(r?.briefing ?? null)).catch(() => {});
  }, []);

  const running = useMemo(() => tasks.filter((t) => isRunning(t.status)).sort((a, b) => b.updatedAt - a.updatedAt), [tasks]);
  const recent = useMemo(() => tasks.filter((t) => !isRunning(t.status)).sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 30), [tasks]);

  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";

  return (
    <div className="px-5 pt-6 pb-6">
      <div className="flex items-center gap-2 mb-1">
        <Sparkles size={18} strokeWidth={1.5} style={{ color: "var(--gold)" }} />
        <h1 className="text-xl font-display">Radian</h1>
        {canSpeak() && (
          <button onClick={() => void briefMe()} className="press ml-auto inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold" style={{ borderRadius: 999, border: "1px solid var(--gold-line)", color: "var(--gold)" }}>
            {briefing ? <VolumeX size={13} strokeWidth={1.5} /> : <Volume2 size={13} strokeWidth={1.5} />} {briefing ? "Stop" : "Brief me"}
          </button>
        )}
      </div>
      {orient && !orient.bootstrap ? (
        <div className="mb-5">
          <p style={{ fontSize: 15, color: "var(--text)", lineHeight: 1.5 }}>{orient.greeting}</p>
          {orient.lines.slice(0, 3).map((l, i) => (
            <p key={i} className="mt-1" style={{ fontSize: 13.5, color: "var(--text-dim)", lineHeight: 1.5 }}>{l}</p>
          ))}
          {running.length > 0 && (
            <p className="mt-1 cap-data" style={{ color: "var(--gold)" }}>Working on {running.length} thing{running.length > 1 ? "s" : ""} now.</p>
          )}
        </div>
      ) : (
        <p className="mb-5" style={{ fontSize: 14, color: "var(--text-dim)" }}>
          {greeting}. {running.length ? `I'm working on ${running.length} thing${running.length > 1 ? "s" : ""}.` : "Share or ask, and I'll dig in."}
        </p>
      )}

      {/* Ask Radian anything — by text or voice, grounded in your vault. */}
      <div className="flex gap-2 items-end mb-2">
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void sendChat(); } }}
          placeholder={listening ? "Listening…" : "Ask Radian anything — “what have I been thinking about BTZ?”, “summarize this week”"}
          rows={2}
          className="flex-1 px-3 py-2.5 text-sm min-w-0 resize-none"
          style={{ background: "var(--bg)", border: `1px solid ${listening ? "var(--gold)" : "var(--line)"}`, color: "var(--text)", borderRadius: 8 }}
        />
        {canListen() && (
          <button onClick={micTap} aria-label="Speak" className="press flex items-center justify-center shrink-0" style={{ width: 44, height: 44, borderRadius: 999, background: listening ? "var(--gold)" : "var(--surface-2)", color: listening ? "#161118" : "var(--text-dim)", border: "1px solid var(--line)" }}>
            <Mic size={18} strokeWidth={1.5} className={listening ? "animate-pulse" : ""} />
          </button>
        )}
        <button onClick={() => void sendChat()} disabled={chatBusy || !input.trim()} aria-label="Ask" className="press flex items-center justify-center shrink-0" style={{ width: 44, height: 44, borderRadius: 999, background: input.trim() && !chatBusy ? "var(--gold)" : "var(--surface-2)", color: input.trim() && !chatBusy ? "#161118" : "var(--text-dim)", border: "1px solid var(--gold-line)" }}>
          {chatBusy ? <Loader2 size={16} strokeWidth={1.5} className="animate-spin" /> : <ArrowUp size={18} strokeWidth={2} />}
        </button>
      </div>
      {/* Brain mode — how Radian should answer (Auto infers from the question). */}
      <div className="flex items-center gap-2 mb-4 flex-wrap">
        <div className="flex gap-1.5 overflow-x-auto">
          {(["auto", "vault", "general", "web", "research"] as ChatMode[]).map((mk) => (
            <button key={mk} onClick={() => setMode(mk)} className="press shrink-0 px-2.5 py-1 text-[11px] font-semibold" style={{ borderRadius: 999, border: `1px solid ${mode === mk ? "var(--gold-line)" : "var(--line)"}`, color: mode === mk ? "var(--gold)" : "var(--text-dim)" }}>
              {MODE_LABEL[mk]}
            </button>
          ))}
        </div>
        {canSpeak() && (
          <button onClick={() => { setVoice((v) => { if (v) stopSpeaking(); return !v; }); }} className="press inline-flex items-center gap-1.5 ml-auto cap-data" style={{ color: voice ? "var(--gold)" : "var(--text-dim)" }}>
            {voice ? <Volume2 size={12} strokeWidth={1.5} /> : <VolumeX size={12} strokeWidth={1.5} />} {voice ? "Speaks" : "Silent"}
          </button>
        )}
      </div>

      {chat.length > 0 && (
        <div className="space-y-2 mb-5">
          {chat.map((m, i) => (
            <div key={i} className={m.role === "you" ? "flex justify-end" : ""}>
              <div className="p-3" style={{ borderRadius: 12, maxWidth: "92%", background: m.role === "you" ? "var(--surface-2)" : "var(--surface)", border: `1px solid ${m.role === "you" ? "var(--line)" : "var(--gold-line)"}` }}>
                {m.role === "radian" && (
                  <div className="flex items-center gap-1.5 mb-1 flex-wrap">
                    <span className="cap-data inline-flex items-center gap-1" style={{ color: "var(--gold)" }}><Sparkles size={10} strokeWidth={1.5} /> Radian</span>
                    {m.mode && <span className="cap-data px-1.5 py-0.5" style={{ borderRadius: 5, border: "1px solid var(--line)", color: "var(--text-dim)" }}>{MODE_LABEL[m.mode] || m.mode}</span>}
                    {m.usedWeb && <span className="cap-data" style={{ color: "var(--good)" }}>web</span>}
                    {m.deterministic && <span className="cap-data" style={{ color: "var(--gold)" }}>deterministic</span>}
                  </div>
                )}
                {m.role === "radian"
                  ? <Typewriter text={m.text} />
                  : <p style={{ fontSize: 14, lineHeight: 1.5, color: "var(--text)", whiteSpace: "pre-wrap" }}>{m.text}</p>}
                {m.role === "radian" && m.grounding && (
                  <p className="cap-data mt-1.5" style={{ color: "var(--text-dim)" }}>{GROUND_LABEL[m.grounding] || m.grounding}{m.webNote ? ` · ${m.webNote}` : ""}</p>
                )}
                {m.sources && m.sources.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {m.sources.map((s, si) => (
                      s.url
                        ? <a key={si} href={s.url} target="_blank" rel="noopener noreferrer" className="press inline-flex items-center gap-1 text-[11px] px-2 py-0.5 truncate" style={{ borderRadius: 6, border: "1px solid var(--line)", color: "var(--info)", maxWidth: 200 }}><ExternalLink size={9} strokeWidth={1.5} /> {s.title}</a>
                        : <Link key={si} href={`/atlas?focus=${encodeURIComponent(s.id || "")}`} className="press text-[11px] px-2 py-0.5 truncate" style={{ borderRadius: 6, border: "1px solid var(--line)", color: "var(--text-dim)", maxWidth: 180 }}>{s.title}</Link>
                    ))}
                  </div>
                )}
                {m.role === "radian" && (
                  <button onClick={() => void saveMsg(i)} disabled={m.saved} className="press inline-flex items-center gap-1 mt-2 cap-data" style={{ color: m.saved ? "var(--good)" : "var(--text-dim)" }}>
                    {m.saved ? <Check size={11} strokeWidth={1.5} /> : <BookOpen size={11} strokeWidth={1.5} />} {m.saved ? "Saved to vault" : "Save to vault"}
                  </button>
                )}
              </div>
            </div>
          ))}
          {chatBusy && <div className="flex items-center gap-2 cap-data" style={{ color: "var(--text-dim)" }}><Loader2 size={12} strokeWidth={1.5} className="animate-spin" /> Radian is thinking…</div>}
        </div>
      )}

      {/* Entry points — capture, or open the memory graph. */}
      <div className="flex gap-2 mb-6">
        <button onClick={() => navigate("/inbox")} className="press flex-1 inline-flex items-center justify-center gap-1.5 py-2.5 text-xs font-semibold" style={{ borderRadius: 8, border: "1px solid var(--gold-line)", color: "var(--gold)" }}>
          <InboxIcon size={14} strokeWidth={1.5} /> Capture
        </button>
        <button onClick={() => navigate("/atlas")} className="press flex-1 inline-flex items-center justify-center gap-1.5 py-2.5 text-xs font-semibold" style={{ borderRadius: 8, border: "1px solid var(--line)", color: "var(--text-dim)" }}>
          <Globe2 size={14} strokeWidth={1.5} /> Memory
        </button>
      </div>

      {found.length > 0 && (
        <section className="mb-6">
          <div className="cap-data mb-2" style={{ color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: "0.06em" }}>What I found</div>
          <div className="space-y-2">
            {found.map((f) => (
              <div key={f.id} className="p-3.5" style={{ borderRadius: 12, border: `1px solid ${f.status === "ready" ? "var(--gold-line)" : "var(--line)"}`, background: "var(--surface)" }}>
                <div className="flex items-center gap-2 mb-1">
                  {f.status === "reading"
                    ? <Loader2 size={14} strokeWidth={1.5} className="animate-spin" style={{ color: "var(--gold)", flexShrink: 0 }} />
                    : <Sparkles size={14} strokeWidth={1.5} style={{ color: "var(--gold)", flexShrink: 0 }} />}
                  <span className="flex-1 min-w-0 truncate" style={{ fontSize: 14.5, color: "var(--text)" }}>{f.title}</span>
                  {f.platform && <span className="cap-data" style={{ color: "var(--text-dim)" }}>{f.platform}</span>}
                </div>
                {f.status === "reading" ? (
                  <p className="cap-data" style={{ color: "var(--text-dim)" }}>Radian is reading this…</p>
                ) : (
                  <>
                    {f.note && <p className="cap-data mb-1" style={{ color: "var(--text-dim)" }}>Your note: <span style={{ color: "var(--text)" }}>{f.note}</span></p>}
                    {f.summary && <p className="line-clamp-3" style={{ fontSize: 13.5, lineHeight: 1.5, color: "var(--text-dim)" }}>{f.summary}</p>}
                    {/* Honest AI status — softened copy; setup lives in Settings/Diagnostics. */}
                    <div className="cap-data mt-1.5 inline-flex items-center gap-1" style={{ color: f.reasoned ? "var(--good)" : "var(--text-dim)" }}>
                      <Sparkles size={10} strokeWidth={1.5} /> {f.reasoned ? "Analyzed by Radian" : "Quick analysis · deeper reasoning unavailable"}
                    </div>
                    {/* Where it connects — named + openable (not just a count) */}
                    {f.connectedNodes.length > 0 && (
                      <div className="mt-2">
                        <span className="cap-data inline-flex items-center gap-1" style={{ color: "var(--text-dim)" }}><Link2 size={11} strokeWidth={1.5} /> connects to</span>
                        <div className="flex flex-wrap gap-1.5 mt-1">
                          {f.connectedNodes.map((cn) => (
                            <Link key={cn.id} href={`/atlas?focus=${encodeURIComponent(cn.id)}`} className="press text-[11px] px-2 py-0.5 truncate" style={{ borderRadius: 6, border: "1px solid var(--line)", color: "var(--text-dim)", maxWidth: 160 }}>{cn.title}</Link>
                          ))}
                        </div>
                      </div>
                    )}
                    {/* Content-aware next questions → open a conversation */}
                    {f.nodeId && (
                      <div className="flex flex-wrap gap-1.5 mt-2">
                        {suggestedPrompts(f).map((sp, i) => (
                          <button key={i} onClick={() => void sendChat(sp.prompt)} disabled={chatBusy} className="press inline-flex items-center gap-1 px-2.5 py-1.5 text-xs" style={{ borderRadius: 999, border: "1px solid var(--gold-line)", color: "var(--gold)" }}>
                            <MessageCircle size={11} strokeWidth={1.5} /> {sp.label}
                          </button>
                        ))}
                      </div>
                    )}
                    <div className="flex items-center gap-3 mt-2 flex-wrap">
                      {f.url && (
                        <a href={f.url} target="_blank" rel="noopener noreferrer" className="press inline-flex items-center gap-1 px-2.5 py-1.5 text-xs" style={{ borderRadius: 6, border: "1px solid var(--line)", color: "var(--text-dim)" }}>
                          <ExternalLink size={12} strokeWidth={1.5} /> Open link
                        </a>
                      )}
                      <Link href={f.nodeId ? `/atlas?focus=${encodeURIComponent(f.nodeId)}` : "/inbox"} className="press inline-flex items-center gap-1 px-2.5 py-1.5 text-xs ml-auto" style={{ borderRadius: 6, border: "1px solid var(--gold-line)", color: "var(--gold)" }}>
                        See what I found <ArrowRight size={12} strokeWidth={1.5} />
                      </Link>
                    </div>
                    {/* Secondary deepen actions (precise verbs) */}
                    {f.nodeId && (
                      <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                        {([["research", "Research", Search], ["explain", "Explain", BookOpen]] as const).map(([verb, label, Icon]) => (
                          <button key={verb} onClick={() => void deepen(f, verb)} disabled={!!asking} className="press inline-flex items-center gap-1 px-2.5 py-1.5 text-xs" style={{ borderRadius: 999, border: "1px solid var(--line)", color: "var(--text-dim)" }}>
                            {asking === f.id + verb ? <Loader2 size={11} strokeWidth={1.5} className="animate-spin" /> : <Icon size={11} strokeWidth={1.5} />} {label}
                          </button>
                        ))}
                        <button onClick={() => navigate(`/situation-room?subject_type=node&subject_id=${encodeURIComponent(f.nodeId as string)}&title=${encodeURIComponent(f.title)}`)} className="press inline-flex items-center gap-1 px-2.5 py-1.5 text-xs" style={{ borderRadius: 999, border: "1px solid var(--line)", color: "var(--text-dim)" }}>
                          <Users size={11} strokeWidth={1.5} /> Convene
                        </button>
                      </div>
                    )}
                    {/* Feedback — a ranking signal; dismiss won't resurface. */}
                    {f.nodeId && (
                      f.feedback && f.feedback !== "dismiss" ? (
                        <div className="cap-data mt-2 inline-flex items-center gap-1" style={{ color: "var(--text-dim)" }}>
                          <Check size={11} strokeWidth={1.5} /> {f.feedback === "useful" ? "Marked useful" : f.feedback === "not_useful" ? "Marked not useful" : "Noted"}
                        </div>
                      ) : (
                        <div className="flex items-center gap-3 mt-2 pt-2" style={{ borderTop: "1px solid var(--line)" }}>
                          <span className="cap-data" style={{ color: "var(--text-dim)" }}>helpful?</span>
                          <button onClick={() => void giveFeedback(f, "useful")} className="press inline-flex items-center gap-1 cap-data" style={{ color: "var(--text-dim)" }}><ThumbsUp size={12} strokeWidth={1.5} /> Useful</button>
                          <button onClick={() => void giveFeedback(f, "not_useful")} className="press inline-flex items-center gap-1 cap-data" style={{ color: "var(--text-dim)" }}><ThumbsDown size={12} strokeWidth={1.5} /> Not useful</button>
                          <button onClick={() => void giveFeedback(f, "dismiss")} className="press inline-flex items-center gap-1 cap-data ml-auto" style={{ color: "var(--text-dim)" }}><X size={12} strokeWidth={1.5} /> Dismiss</button>
                        </div>
                      )
                    )}
                  </>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {running.length > 0 && (
        <section className="mb-6">
          <div className="cap-data mb-2" style={{ color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: "0.06em" }}>Running now</div>
          <div className="space-y-2">
            {running.map((t) => (
              <div key={t.id} className="flex items-center gap-2.5 p-3" style={{ borderRadius: 10, border: "1px solid var(--line)", background: "var(--surface)" }}>
                <Loader2 size={15} strokeWidth={1.5} className="animate-spin" style={{ color: "var(--gold)", flexShrink: 0 }} />
                <span className="flex-1 min-w-0 truncate" style={{ fontSize: 14, color: "var(--text)" }}>{t.label}</span>
                <span className="cap-data" style={{ color: t.status === "budget-limited" ? "var(--gold)" : "var(--text-dim)" }}>{t.status === "budget-limited" ? "queued" : t.feature || "Radian"}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      <section>
        <div className="cap-data mb-2" style={{ color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: "0.06em" }}>Recent conversations</div>
        {recent.length === 0 ? (
          <div className="flex flex-col items-center justify-center text-center py-12 gap-2">
            <Sparkles size={22} strokeWidth={1.5} style={{ color: "var(--text-dim)" }} />
            <span style={{ fontSize: 14, color: "var(--text-dim)" }}>No conversations yet.</span>
            <span style={{ fontSize: 12.5, color: "var(--text-dim)" }}>Open a node or capture and Ask Radian — it'll show up here.</span>
          </div>
        ) : (
          <div className="space-y-2">
            {recent.map((t) => (
              <div key={t.id} className="p-3" style={{ borderRadius: 10, border: "1px solid var(--line)", background: "var(--surface)" }}>
                <div className="flex items-center gap-2 mb-1">
                  {isOk(t.status) ? <Check size={14} strokeWidth={1.5} style={{ color: "var(--good)" }} />
                    : t.status === "failed" ? <AlertTriangle size={14} strokeWidth={1.5} style={{ color: "var(--risk)" }} />
                    : <Dot color="var(--text-dim)" />}
                  <span className="flex-1 min-w-0 truncate" style={{ fontSize: 14, color: "var(--text)" }}>{t.label}</span>
                  <span className="cap-data flex items-center gap-1" style={{ color: "var(--text-dim)" }}><Clock size={10} strokeWidth={1.5} /> {relTime(t.updatedAt)}</span>
                </div>
                {t.status === "fallback" && <p className="cap-data mb-1" style={{ color: "var(--gold)" }}>Answered from your vault (deterministic).</p>}
                {t.error && <p className="cap-data mb-1" style={{ color: "var(--risk)" }}>{t.error}</p>}
                <div className="flex gap-2 mt-1">
                  {isOk(t.status) && (
                    <Link href={resultHref(t)} className="press inline-flex items-center gap-1 px-2.5 py-1.5 text-xs" style={{ borderRadius: 6, border: "1px solid var(--gold-line)", color: "var(--gold)" }}>
                      Open <ArrowRight size={12} strokeWidth={1.5} />
                    </Link>
                  )}
                  {t.status === "failed" && (
                    <button onClick={() => retry(t.id)} className="press inline-flex items-center gap-1 px-2.5 py-1.5 text-xs" style={{ borderRadius: 6, border: "1px solid var(--line)", color: "var(--text-dim)" }}>
                      <RotateCcw size={12} strokeWidth={1.5} /> Retry
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
