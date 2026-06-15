import { useCallback, useEffect, useState } from "react";
import { Link } from "wouter";
import { Radar, RefreshCw, Plus, Trash2, GraduationCap, Rss, Inbox as InboxIcon } from "lucide-react";
import { toast } from "sonner";
import { apiEnabled, listWatchlists, addWatchlist, removeWatchlist, runWatchlist, type Watchlist } from "@/lib/api";

// Watchlists (Phase 3): monitor topics on a cadence. Connectors (Crossref scholarly + RSS) gather
// new evidence into the Research Inbox automatically — nothing is auto-promoted to memory.
const CADENCES = ["weekly", "daily", "manual"] as const;
const relTime = (iso?: string | null) => (iso ? new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : "never");

export default function Watchlists() {
  const [items, setItems] = useState<Watchlist[]>([]);
  const [loading, setLoading] = useState(false);
  const [topic, setTopic] = useState("");
  const [scholarly, setScholarly] = useState(true);
  const [rss, setRss] = useState(false);
  const [cadence, setCadence] = useState<string>("weekly");

  const load = useCallback(async () => {
    if (!apiEnabled()) return;
    setLoading(true); setItems(await listWatchlists()); setLoading(false);
  }, []);
  useEffect(() => { void load(); }, [load]);

  async function add() {
    const t = topic.trim();
    if (!t) { toast.error("Enter a topic to watch"); return; }
    const kinds = [scholarly && "scholarly", rss && "rss"].filter(Boolean) as string[];
    if (!kinds.length) { toast.error("Pick at least one source"); return; }
    if (await addWatchlist(t, kinds, cadence)) { setTopic(""); toast.success("Watching"); void load(); } else toast.error("Couldn't add");
  }
  async function run(id: string) {
    if (await runWatchlist(id)) toast("Gathering…", { description: "New evidence will land in the Research Inbox." });
    else toast.error("Couldn't run");
  }

  return (
    <div className="px-5 pt-6 pb-12">
      <div className="flex items-center gap-2 mb-1">
        <Radar size={18} strokeWidth={1.5} style={{ color: "var(--gold)" }} />
        <h1 className="text-xl font-display">Watchlists</h1>
        <button onClick={() => void load()} className="tap-target ml-auto" aria-label="Refresh" style={{ color: "var(--text-dim)" }}>
          <RefreshCw size={15} strokeWidth={1.5} className={loading ? "animate-spin" : ""} />
        </button>
      </div>
      <p className="cap-data mb-4" style={{ color: "var(--text-dim)" }}>
        Topics Indigold watches for you — new scholarship &amp; feeds flow into the <Link href="/research" className="press" style={{ color: "var(--gold)" }}>Research Inbox</Link>.
      </p>

      {!apiEnabled() ? (
        <p style={{ fontSize: 13, color: "var(--text-dim)" }}>API not configured on this device.</p>
      ) : (
        <>
          {/* Add */}
          <div className="p-3 mb-4" style={{ borderRadius: 12, border: "1px solid var(--line)", background: "var(--surface)" }}>
            <input value={topic} onChange={(e) => setTopic(e.target.value)} onKeyDown={(e) => e.key === "Enter" && void add()} placeholder="e.g. perovskite solar cells" className="w-full bg-transparent outline-none mb-2.5" style={{ fontSize: 14, color: "var(--text)", borderBottom: "1px solid var(--line)", paddingBottom: 5 }} />
            <div className="flex items-center gap-1.5 flex-wrap mb-2.5">
              <Toggle on={scholarly} set={setScholarly} icon={GraduationCap} label="Scholarly" />
              <Toggle on={rss} set={setRss} icon={Rss} label="Your feeds" />
              <span className="mx-1" style={{ color: "var(--line)" }}>·</span>
              {CADENCES.map((c) => (
                <button key={c} onClick={() => setCadence(c)} className="press px-2.5 py-1 text-xs" style={{ borderRadius: 999, border: `1px solid ${cadence === c ? "var(--gold-line)" : "var(--line)"}`, color: cadence === c ? "var(--gold)" : "var(--text-dim)" }}>{c}</button>
              ))}
              <button onClick={() => void add()} className="press ml-auto inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold" style={{ borderRadius: 999, border: "1px solid var(--gold-line)", color: "var(--gold)" }}><Plus size={13} strokeWidth={1.5} /> Watch</button>
            </div>
          </div>

          {/* List */}
          {items.length === 0 ? (
            <div className="flex flex-col items-center justify-center text-center py-12 gap-2">
              <Radar size={22} strokeWidth={1.5} style={{ color: "var(--text-dim)" }} />
              <span style={{ fontSize: 14, color: "var(--text-dim)" }}>No watchlists yet.</span>
              <span className="cap-data" style={{ color: "var(--text-dim)" }}>Add a topic — Indigold checks it on your cadence and gathers evidence.</span>
            </div>
          ) : (
            <div className="space-y-2">
              {items.map((w) => (
                <div key={w.id} className="p-3.5" style={{ borderRadius: 12, border: "1px solid var(--line)", background: "var(--surface)" }}>
                  <div className="flex items-center gap-2">
                    <span className="flex-1 min-w-0">
                      <span className="block truncate" style={{ fontSize: 15, color: "var(--text)" }}>{w.topic}</span>
                      <span className="cap-data inline-flex items-center gap-1.5" style={{ color: "var(--text-dim)" }}>
                        {w.kinds.includes("scholarly") && <span className="inline-flex items-center gap-0.5"><GraduationCap size={10} strokeWidth={1.5} /> scholarly</span>}
                        {w.kinds.includes("rss") && <span className="inline-flex items-center gap-0.5"><Rss size={10} strokeWidth={1.5} /> feeds</span>}
                        · {w.cadence} · ran {relTime(w.last_run)}{w.last_status ? ` (${w.last_status})` : ""}
                      </span>
                    </span>
                    <button onClick={() => void run(w.id)} className="press" aria-label="Run now" style={{ color: "var(--gold)" }}><RefreshCw size={14} strokeWidth={1.5} /></button>
                    <button onClick={() => void removeWatchlist(w.id).then(load)} className="press" aria-label="Remove" style={{ color: "var(--text-dim)" }}><Trash2 size={14} strokeWidth={1.5} /></button>
                  </div>
                </div>
              ))}
            </div>
          )}
          <Link href="/research" className="press inline-flex items-center gap-1 cap-data mt-4" style={{ color: "var(--gold)" }}>
            <InboxIcon size={12} strokeWidth={1.5} /> Open Research Inbox →
          </Link>
        </>
      )}
    </div>
  );
}

function Toggle({ on, set, icon: Icon, label }: { on: boolean; set: (v: boolean) => void; icon: typeof Rss; label: string }) {
  return (
    <button onClick={() => set(!on)} className="press inline-flex items-center gap-1 px-2.5 py-1 text-xs" style={{ borderRadius: 999, border: `1px solid ${on ? "var(--gold-line)" : "var(--line)"}`, color: on ? "var(--gold)" : "var(--text-dim)" }}>
      <Icon size={12} strokeWidth={1.5} /> {label}
    </button>
  );
}
