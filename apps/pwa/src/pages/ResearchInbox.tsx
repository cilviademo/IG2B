import { useCallback, useEffect, useState } from "react";
import { Rss, ExternalLink, RefreshCw, Plus, Trash2, ThumbsUp, X, Check, AlertTriangle, Inbox as InboxIcon } from "lucide-react";
import { toast } from "sonner";
import { apiEnabled, listEvidence, setEvidenceStatus, listFeeds, addFeed, removeFeed, pollFeed, type Evidence, type Feed } from "@/lib/api";

// Research Inbox (Intelligence Phase 1–2): public-world facts as untrusted, provenance-carrying
// evidence — triaged here, never auto-promoted to memory. Feeds (RSS/Atom) populate it.
const STATUSES = ["new", "relevant", "contradictory", "accepted", "dismissed"] as const;
const STATUS_LABEL: Record<string, string> = { new: "New", relevant: "Relevant", contradictory: "Contradictory", accepted: "Accepted", dismissed: "Dismissed" };
const relTime = (iso?: string | null) => (iso ? new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "—");

export default function ResearchInbox() {
  const [tab, setTab] = useState<string>("new");
  const [items, setItems] = useState<Evidence[]>([]);
  const [feeds, setFeeds] = useState<Feed[]>([]);
  const [loading, setLoading] = useState(false);
  const [feedUrl, setFeedUrl] = useState("");
  const [showFeeds, setShowFeeds] = useState(false);

  const load = useCallback(async () => {
    if (!apiEnabled()) return;
    setLoading(true);
    const [ev, fl] = await Promise.all([listEvidence(tab), listFeeds()]);
    setItems(ev); setFeeds(fl); setLoading(false);
  }, [tab]);
  useEffect(() => { void load(); }, [load]);

  async function triage(id: string, status: string) {
    setItems((xs) => xs.filter((x) => x.id !== id)); // optimistic — it leaves the current filter
    if (!(await setEvidenceStatus(id, status))) { toast.error("Couldn't update"); void load(); }
  }
  async function addNewFeed() {
    const url = feedUrl.trim();
    if (!/^https?:\/\/.+/i.test(url)) { toast.error("Enter a valid feed URL"); return; }
    if (await addFeed(url)) { setFeedUrl(""); toast.success("Feed added"); void load(); } else toast.error("Couldn't add feed");
  }
  async function poll(id: string) {
    if (await pollFeed(id)) toast("Polling…", { description: "New entries will appear shortly." });
    else toast.error("Couldn't poll");
  }

  return (
    <div className="px-5 pt-6 pb-12">
      <div className="flex items-center gap-2 mb-1">
        <InboxIcon size={18} strokeWidth={1.5} style={{ color: "var(--gold)" }} />
        <h1 className="text-xl font-display">Research Inbox</h1>
        <button onClick={() => void load()} className="tap-target ml-auto" aria-label="Refresh" style={{ color: "var(--text-dim)" }}>
          <RefreshCw size={15} strokeWidth={1.5} className={loading ? "animate-spin" : ""} />
        </button>
      </div>
      <p className="cap-data mb-4" style={{ color: "var(--text-dim)" }}>Public-world evidence — triage it; it never auto-enters your vault.</p>

      {/* Feeds */}
      <button onClick={() => setShowFeeds((s) => !s)} className="press flex items-center gap-2 mb-2 cap-data" style={{ color: "var(--gold)" }}>
        <Rss size={13} strokeWidth={1.5} /> Sources ({feeds.length}) {showFeeds ? "▾" : "▸"}
      </button>
      {showFeeds && (
        <div className="mb-4 p-3" style={{ borderRadius: 10, border: "1px solid var(--line)", background: "var(--surface)" }}>
          <div className="flex items-center gap-2 mb-2">
            <input value={feedUrl} onChange={(e) => setFeedUrl(e.target.value)} placeholder="https://blog.example.com/feed.xml" className="flex-1 bg-transparent outline-none" style={{ fontSize: 13, color: "var(--text)", borderBottom: "1px solid var(--line)", paddingBottom: 4 }} />
            <button onClick={() => void addNewFeed()} className="press inline-flex items-center gap-1 cap-data" style={{ color: "var(--gold)" }}><Plus size={13} strokeWidth={1.5} /> Add</button>
          </div>
          {feeds.length === 0 ? (
            <p className="cap-data" style={{ color: "var(--text-dim)" }}>No feeds yet. Add an RSS/Atom URL to start monitoring.</p>
          ) : feeds.map((f) => (
            <div key={f.id} className="flex items-center gap-2 py-1.5" style={{ borderTop: "1px solid var(--line)" }}>
              <span className="flex-1 min-w-0">
                <span className="block truncate" style={{ fontSize: 13, color: "var(--text)" }}>{f.title || f.url}</span>
                <span className="cap-data" style={{ color: "var(--text-dim)" }}>{f.last_polled ? `polled ${relTime(f.last_polled)} · ${f.last_status || ""}` : "never polled"}</span>
              </span>
              <button onClick={() => void poll(f.id)} className="press" aria-label="Poll" style={{ color: "var(--text-dim)" }}><RefreshCw size={13} strokeWidth={1.5} /></button>
              <button onClick={() => void removeFeed(f.id).then(load)} className="press" aria-label="Remove" style={{ color: "var(--text-dim)" }}><Trash2 size={13} strokeWidth={1.5} /></button>
            </div>
          ))}
        </div>
      )}

      {/* Status filter */}
      <div className="flex flex-wrap gap-1.5 mb-3">
        {STATUSES.map((s) => (
          <button key={s} onClick={() => setTab(s)} className="press px-2.5 py-1 text-xs" style={{ borderRadius: 999, border: `1px solid ${tab === s ? "var(--gold-line)" : "var(--line)"}`, color: tab === s ? "var(--gold)" : "var(--text-dim)" }}>{STATUS_LABEL[s]}</button>
        ))}
      </div>

      {/* Evidence list */}
      {!apiEnabled() ? (
        <p style={{ fontSize: 13, color: "var(--text-dim)" }}>API not configured on this device.</p>
      ) : items.length === 0 ? (
        <div className="flex flex-col items-center justify-center text-center py-14 gap-2">
          <Rss size={22} strokeWidth={1.5} style={{ color: "var(--text-dim)" }} />
          <span style={{ fontSize: 14, color: "var(--text-dim)" }}>Nothing {STATUS_LABEL[tab].toLowerCase()}.</span>
          <span className="cap-data" style={{ color: "var(--text-dim)" }}>Add a feed above and poll it to gather evidence.</span>
        </div>
      ) : (
        <div className="space-y-2">
          {items.map((e) => (
            <div key={e.id} className="p-3.5" style={{ borderRadius: 12, border: "1px solid var(--line)", background: "var(--surface)" }}>
              <div className="cap-data mb-1 inline-flex items-center gap-1.5" style={{ color: "var(--text-dim)" }}>
                <Rss size={10} strokeWidth={1.5} /> {e.source_name || e.connector} · {e.source_kind} · {relTime(e.retrieved_at)}
              </div>
              <a href={e.canonical_url} target="_blank" rel="noopener noreferrer" className="press inline-flex items-start gap-1.5" style={{ fontSize: 15, fontWeight: 600, color: "var(--text)" }}>
                {e.title} <ExternalLink size={12} strokeWidth={1.5} style={{ color: "var(--text-dim)", flexShrink: 0, marginTop: 4 }} />
              </a>
              {e.summary && <p className="line-clamp-3 mt-1" style={{ fontSize: 13.5, lineHeight: 1.5, color: "var(--text-dim)" }}>{e.summary}</p>}
              <div className="flex items-center gap-3 mt-2.5 pt-2 flex-wrap" style={{ borderTop: "1px solid var(--line)" }}>
                <button onClick={() => void triage(e.id, "relevant")} className="press inline-flex items-center gap-1 cap-data" style={{ color: "var(--good)" }}><ThumbsUp size={12} strokeWidth={1.5} /> Relevant</button>
                <button onClick={() => void triage(e.id, "contradictory")} className="press inline-flex items-center gap-1 cap-data" style={{ color: "var(--gold)" }}><AlertTriangle size={12} strokeWidth={1.5} /> Contradicts</button>
                <button onClick={() => void triage(e.id, "accepted")} className="press inline-flex items-center gap-1 cap-data" style={{ color: "var(--info)" }}><Check size={12} strokeWidth={1.5} /> Accept</button>
                <button onClick={() => void triage(e.id, "dismissed")} className="press inline-flex items-center gap-1 cap-data ml-auto" style={{ color: "var(--text-dim)" }}><X size={12} strokeWidth={1.5} /> Dismiss</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
