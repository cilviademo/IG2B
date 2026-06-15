import { useCallback, useEffect, useState } from "react";
import { useLocation } from "wouter";
import { MessageSquare, RefreshCw, Search, Archive, ArchiveRestore, ChevronRight } from "lucide-react";
import { toast } from "sonner";
import { apiEnabled, listConversations, unarchiveConversation, archiveConversation, type Conversation } from "@/lib/api";

// Chat History — the ChatGPT/Claude-style record of every Radian conversation, so the owner can
// reference and revisit any past Q&A. Tapping a thread opens it (full transcript) in the Companion
// via the ?conversation= deep-link. Archived threads are shown (toggle) and can be restored.
const when = (iso?: string) => (iso ? new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : "");

export default function History() {
  const [, navigate] = useLocation();
  const [items, setItems] = useState<Conversation[]>([]);
  const [q, setQ] = useState("");
  const [showArchived, setShowArchived] = useState(true);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async (query?: string) => {
    if (!apiEnabled()) return;
    setLoading(true);
    setItems(await listConversations((query ?? q).trim() || undefined, showArchived));
    setLoading(false);
  }, [q, showArchived]);
  useEffect(() => { void load(); }, [showArchived]); // eslint-disable-line react-hooks/exhaustive-deps

  async function restore(id: string) {
    if (await unarchiveConversation(id)) { toast.success("Restored"); void load(); } else toast.error("Couldn't restore");
  }
  async function archive(id: string) {
    if (await archiveConversation(id)) { toast("Archived"); void load(); } else toast.error("Couldn't archive");
  }

  return (
    <div className="px-5 pt-6 pb-12">
      <div className="flex items-center gap-2 mb-1">
        <MessageSquare size={18} strokeWidth={1.5} style={{ color: "var(--gold)" }} />
        <h1 className="text-xl font-display">Chat history</h1>
        <button onClick={() => void load()} className="tap-target ml-auto" aria-label="Refresh" style={{ color: "var(--text-dim)" }}>
          <RefreshCw size={15} strokeWidth={1.5} className={loading ? "animate-spin" : ""} />
        </button>
      </div>
      <p className="cap-data mb-3" style={{ color: "var(--text-dim)" }}>Every Radian conversation — tap to reopen the full Q&amp;A.</p>

      {!apiEnabled() ? (
        <p style={{ fontSize: 13, color: "var(--text-dim)" }}>API not configured on this device — conversations live on your server, set VITE_API_URL to see them.</p>
      ) : (
        <>
          <div className="flex items-center gap-2 mb-2 px-3 py-2" style={{ borderRadius: 8, border: "1px solid var(--line)", background: "var(--surface)" }}>
            <Search size={14} strokeWidth={1.5} style={{ color: "var(--text-dim)" }} />
            <input value={q} onChange={(e) => { setQ(e.target.value); void load(e.target.value); }} placeholder="Search conversations & messages" className="flex-1 bg-transparent outline-none" style={{ fontSize: 13.5, color: "var(--text)" }} />
          </div>
          <button onClick={() => setShowArchived((s) => !s)} className="press cap-data mb-3 inline-flex items-center gap-1" style={{ color: showArchived ? "var(--gold)" : "var(--text-dim)" }}>
            <Archive size={12} strokeWidth={1.5} /> {showArchived ? "Showing archived" : "Hiding archived"}
          </button>

          {items.length === 0 ? (
            <div className="flex flex-col items-center justify-center text-center py-14 gap-2">
              <MessageSquare size={22} strokeWidth={1.5} style={{ color: "var(--text-dim)" }} />
              <span style={{ fontSize: 14, color: "var(--text-dim)" }}>{q ? "No conversations match that search." : "No conversations yet."}</span>
              <span className="cap-data" style={{ color: "var(--text-dim)" }}>Ask Radian anything — your threads are saved here to revisit.</span>
            </div>
          ) : (
            <div className="space-y-1.5">
              {items.map((c) => {
                const archived = c.status === "archived";
                return (
                  <div key={c.id} className="flex items-center gap-2 py-2.5 px-1 tap-row" style={{ borderBottom: "1px solid var(--line)" }}>
                    <button onClick={() => navigate(`/?conversation=${encodeURIComponent(c.id)}`)} className="press flex-1 min-w-0 text-left">
                      <span className="block truncate" style={{ fontSize: 15, color: "var(--text)" }}>{c.title || "Conversation"}</span>
                      <span className="cap-data" style={{ color: "var(--text-dim)" }}>
                        {when(c.updated_at)}{c.anchor_title ? ` · on ${c.anchor_title}` : ""}{archived ? " · archived" : ""}
                      </span>
                    </button>
                    <button onClick={() => (archived ? restore(c.id) : archive(c.id))} className="press" aria-label={archived ? "Restore" : "Archive"} style={{ color: "var(--text-dim)" }}>
                      {archived ? <ArchiveRestore size={15} strokeWidth={1.5} /> : <Archive size={15} strokeWidth={1.5} />}
                    </button>
                    <ChevronRight size={15} strokeWidth={1.5} style={{ color: "var(--text-dim)" }} />
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}
