import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "wouter";
import { Archive, FileUp, CheckCircle2, FolderOpen, ExternalLink, RotateCcw, Globe2 } from "lucide-react";
import { toast } from "sonner";
import { fetchCaptures, assetSignedUrl, unarchiveCapture, apiEnabled, type BackendCapture } from "@/lib/api";
import { onVaultSynced } from "@/lib/sync";
import { Loading } from "@/components/State";
import { EmptyState } from "@/components/primitives";
import { CAPTURE_TYPE_LABEL } from "@/lib/types";

// The Repository / Library — your vault as durable storage. Everything you've
// captured, grouped by what it is now: uploaded Files, Completed (enriched into the
// graph), and Archived. It's the storage counterpart to Atlas (the graph view);
// both read the same server vault, so they always agree.
type Bucket = "all" | "files" | "completed" | "archived";

const typeLabel = (t: string) => (CAPTURE_TYPE_LABEL as Record<string, string>)[t] || t.replace(/_/g, " ");

export default function Library() {
  const [items, setItems] = useState<BackendCapture[] | null>(null);
  const [bucket, setBucket] = useState<Bucket>("all");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!apiEnabled()) { setItems([]); setLoading(false); return; }
    const caps = await fetchCaptures();
    if (caps !== null) setItems(caps);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
    const off = onVaultSynced(() => void load());
    return off;
  }, [load]);

  const all = items ?? [];
  const counts = useMemo(() => ({
    all: all.length,
    files: all.filter((c) => !!c.screenshot_ref).length,
    completed: all.filter((c) => c.processing_status === "processed").length,
    archived: all.filter((c) => c.status === "archived").length,
  }), [all]);

  const shown = useMemo(() => {
    if (bucket === "files") return all.filter((c) => !!c.screenshot_ref);
    if (bucket === "completed") return all.filter((c) => c.processing_status === "processed");
    if (bucket === "archived") return all.filter((c) => c.status === "archived");
    return all;
  }, [all, bucket]);

  async function openFile(id: string) {
    const url = await assetSignedUrl(id);
    if (url) window.open(url, "_blank");
    else toast.error("Couldn't open file", { description: "Signed link unavailable — try Force Sync." });
  }

  async function onUnarchive(id: string) {
    const ok = await unarchiveCapture(id);
    if (ok) { toast.success("Restored to Inbox"); void load(); }
    else toast.error("Couldn't restore");
  }

  if (loading && items === null) return <Loading label="Library" />;

  const chips: { key: Bucket; label: string; icon: typeof Archive }[] = [
    { key: "all", label: `All ${counts.all}`, icon: FolderOpen },
    { key: "files", label: `Files ${counts.files}`, icon: FileUp },
    { key: "completed", label: `Completed ${counts.completed}`, icon: CheckCircle2 },
    { key: "archived", label: `Archived ${counts.archived}`, icon: Archive },
  ];

  return (
    <div className="px-5 pt-6 pb-6">
      <h1 className="text-xl font-display mb-1">Library</h1>
      <p className="cap-data mb-4" style={{ color: "var(--text-dim)" }}>your vault, stored · files · completed · archived</p>

      {!apiEnabled() && (
        <p className="text-xs leading-relaxed mb-3" style={{ color: "var(--text-dim)" }}>
          Connect the API (and sign in under Settings → Account) to see your stored vault here.
        </p>
      )}

      <div className="flex flex-wrap gap-2 mb-4">
        {chips.map((c) => {
          const Icon = c.icon;
          const active = bucket === c.key;
          return (
            <button key={c.key} onClick={() => setBucket(c.key)} className="press inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold"
              style={{ borderRadius: 999, border: `1px solid ${active ? "var(--gold-line)" : "var(--line)"}`, color: active ? "var(--gold)" : "var(--text-dim)" }}>
              <Icon size={13} strokeWidth={1.5} /> {c.label}
            </button>
          );
        })}
      </div>

      {shown.length === 0 ? (
        <EmptyState icon={<FolderOpen size={24} strokeWidth={1.5} />} title="Nothing here yet">
          Captures you share land in Inbox; once processed or archived they're stored here.
        </EmptyState>
      ) : (
        <div className="space-y-2">
          {shown.map((c) => (
            <div key={c.id} className="p-3.5" style={{ borderRadius: 10, border: "1px solid var(--line)", background: "var(--surface)" }}>
              <div className="flex items-center gap-2 mb-1">
                <span className="text-[10px] px-2 py-0.5" style={{ borderRadius: 6, border: "1px solid var(--line)", color: "var(--text-dim)" }}>{typeLabel(c.type)}</span>
                {c.status === "archived" && <span className="cap-data inline-flex items-center gap-1" style={{ color: "var(--text-dim)" }}><Archive size={11} strokeWidth={1.5} /> archived</span>}
                {c.processing_status === "processed" && c.status !== "archived" && <span className="cap-data inline-flex items-center gap-1" style={{ color: "var(--good)" }}><CheckCircle2 size={11} strokeWidth={1.5} /> completed</span>}
                <span className="cap-data ml-auto" style={{ color: "var(--text-dim)" }}>{new Date(c.captured_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</span>
              </div>
              <div style={{ fontSize: 15, lineHeight: 1.4, color: "var(--text)" }}>{c.title}</div>
              {c.url && <div className="truncate cap-data mt-0.5" style={{ color: "var(--info)" }}>{c.url}</div>}
              <div className="flex flex-wrap gap-2 mt-2.5">
                {c.screenshot_ref && (
                  <button onClick={() => openFile(c.screenshot_ref!)} className="press inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold" style={{ borderRadius: 6, border: "1px solid var(--line)", color: "var(--text-dim)" }}>
                    <ExternalLink size={12} strokeWidth={1.5} /> Open file
                  </button>
                )}
                <Link href="/atlas" className="press inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold" style={{ borderRadius: 6, border: "1px solid var(--line)", color: "var(--text-dim)" }}>
                  <Globe2 size={12} strokeWidth={1.5} /> Atlas
                </Link>
                {c.status === "archived" && (
                  <button onClick={() => onUnarchive(c.id)} className="press inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold" style={{ borderRadius: 6, border: "1px solid var(--line)", color: "var(--text-dim)" }}>
                    <RotateCcw size={12} strokeWidth={1.5} /> Restore
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
