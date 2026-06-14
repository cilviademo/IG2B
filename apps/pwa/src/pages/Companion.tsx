import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useLocation } from "wouter";
import { Sparkles, Loader2, Check, AlertTriangle, RotateCcw, ArrowRight, Inbox as InboxIcon, Globe2, Clock, Link2, ExternalLink } from "lucide-react";
import { useTasks, type Task } from "@/contexts/TaskCenter";
import { Dot } from "@/components/primitives";
import { apiEnabled, fetchCaptures, getLiveNodes, getLiveEdges, type BackendCapture } from "@/lib/api";
import { onVaultSynced } from "@/lib/sync";

// "What I found" — the proactive arrival. Radian surfaces what it learned from your
// recent shares (capture → enriched node), so the front door is "here's what I found,"
// not a database you go dig through.
interface Found { id: string; title: string; platform?: string; status: "reading" | "ready"; summary?: string; nodeId?: string; connections: number; at: string; url?: string; reasoned?: boolean }
type NodeRow = { id: string; summary?: string; source_capture_id?: string; meta?: { reasoned?: boolean; web?: { url?: string }; media?: { url?: string } } };
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

export default function Companion() {
  const { tasks, retry } = useTasks();
  const [, navigate] = useLocation();
  const [found, setFound] = useState<Found[]>([]);

  // Pull recent shares + their enriched nodes → "what I found".
  const loadFound = useCallback(async () => {
    if (!apiEnabled()) return;
    const [caps, nr, er] = await Promise.all([fetchCaptures(), getLiveNodes(), getLiveEdges()]);
    if (caps === null) return;
    const nodes = (nr?.nodes ?? []) as NodeRow[];
    const edges = (er?.edges ?? []) as EdgeRow[];
    const nodeByCapture = new Map<string, NodeRow>();
    for (const n of nodes) if (n.source_capture_id) nodeByCapture.set(n.source_capture_id, n);
    const realDegree = (nid: string) => edges.filter((e) => e.relationship !== "derived_from" && (e.source_id === nid || e.target_id === nid)).length;
    const items: Found[] = (caps as BackendCapture[]).slice(0, 8).map((c) => {
      const node = nodeByCapture.get(c.id);
      const ready = c.processing_status === "processed" && !!node;
      return {
        id: c.id, title: c.title, platform: platformOf(c.url),
        status: ready ? "ready" : "reading",
        summary: node?.summary, nodeId: node?.id,
        connections: node ? realDegree(node.id) : 0,
        at: c.captured_at, url: c.url ?? undefined, reasoned: node?.meta?.reasoned,
      };
    });
    setFound(items);
  }, []);

  useEffect(() => {
    void loadFound();
    const off = onVaultSynced(() => void loadFound());
    return off;
  }, [loadFound]);

  const running = useMemo(() => tasks.filter((t) => isRunning(t.status)).sort((a, b) => b.updatedAt - a.updatedAt), [tasks]);
  const recent = useMemo(() => tasks.filter((t) => !isRunning(t.status)).sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 30), [tasks]);

  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";

  return (
    <div className="px-5 pt-6 pb-6">
      <div className="flex items-center gap-2 mb-1">
        <Sparkles size={18} strokeWidth={1.5} style={{ color: "var(--gold)" }} />
        <h1 className="text-xl font-display">Radian</h1>
      </div>
      <p className="mb-5" style={{ fontSize: 14, color: "var(--text-dim)" }}>
        {greeting}. {running.length ? `I'm working on ${running.length} thing${running.length > 1 ? "s" : ""}.` : "Share or ask, and I'll dig in."}
      </p>

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
                    {f.summary && <p className="line-clamp-3" style={{ fontSize: 13.5, lineHeight: 1.5, color: "var(--text-dim)" }}>{f.summary}</p>}
                    {/* Honest AI status — real reasoning vs the deterministic floor. */}
                    <div className="cap-data mt-1.5 inline-flex items-center gap-1" style={{ color: f.reasoned ? "var(--good)" : "var(--gold)" }}>
                      <Sparkles size={10} strokeWidth={1.5} /> {f.reasoned ? "Analyzed by Radian" : "Deterministic — add a model key in Settings → API for deep reasoning"}
                    </div>
                    <div className="flex items-center gap-3 mt-2 flex-wrap">
                      {f.connections > 0 && (
                        <span className="cap-data inline-flex items-center gap-1" style={{ color: "var(--text-dim)" }}>
                          <Link2 size={11} strokeWidth={1.5} /> {f.connections} connection{f.connections > 1 ? "s" : ""}
                        </span>
                      )}
                      {f.url && (
                        <a href={f.url} target="_blank" rel="noopener noreferrer" className="press inline-flex items-center gap-1 px-2.5 py-1.5 text-xs" style={{ borderRadius: 6, border: "1px solid var(--line)", color: "var(--text-dim)" }}>
                          <ExternalLink size={12} strokeWidth={1.5} /> Open link
                        </a>
                      )}
                      <Link href={f.nodeId ? `/atlas?focus=${encodeURIComponent(f.nodeId)}` : "/inbox"} className="press inline-flex items-center gap-1 px-2.5 py-1.5 text-xs ml-auto" style={{ borderRadius: 6, border: "1px solid var(--gold-line)", color: "var(--gold)" }}>
                        See what I found <ArrowRight size={12} strokeWidth={1.5} />
                      </Link>
                    </div>
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
