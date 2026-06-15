import { useCallback, useEffect, useState } from "react";
import { GitFork, RefreshCw, Check, X, Scale, Clock, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { apiEnabled, getTensions, listClaims, setClaimStatus, type TensionItem, type ClaimItem } from "@/lib/api";

// Tensions (Intelligence review): surface disagreement instead of flattening it — contested
// evidence, stale-but-accepted claims, and conflicting same-subject claims. Plus the claim list
// with owner review (accept / reject / supersede) and a confidence bar.
const KIND_LABEL: Record<string, string> = { contested_evidence: "Contested evidence", conflicting_claims: "Conflicting claims", stale_accepted: "Stale but accepted" };
const KIND_ICON: Record<string, typeof Scale> = { contested_evidence: Scale, conflicting_claims: GitFork, stale_accepted: Clock };

export default function Tensions() {
  const [tensions, setTensions] = useState<TensionItem[]>([]);
  const [claims, setClaims] = useState<ClaimItem[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!apiEnabled()) return;
    setLoading(true);
    const [t, c] = await Promise.all([getTensions(), listClaims()]);
    setTensions(t); setClaims(c); setLoading(false);
  }, []);
  useEffect(() => { void load(); }, [load]);

  async function review(id: string, status: string) {
    setClaims((cs) => cs.map((c) => (c.id === id ? { ...c, owner_status: status } : c)));
    if (!(await setClaimStatus(id, status))) { toast.error("Couldn't update"); void load(); }
    else void load(); // tensions may change after a review
  }

  return (
    <div className="px-5 pt-6 pb-12">
      <div className="flex items-center gap-2 mb-1">
        <GitFork size={18} strokeWidth={1.5} style={{ color: "var(--gold)" }} />
        <h1 className="text-xl font-display">Tensions</h1>
        <button onClick={() => void load()} className="tap-target ml-auto" aria-label="Refresh" style={{ color: "var(--text-dim)" }}>
          <RefreshCw size={15} strokeWidth={1.5} className={loading ? "animate-spin" : ""} />
        </button>
      </div>
      <p className="cap-data mb-4" style={{ color: "var(--text-dim)" }}>Where your beliefs and the evidence disagree — surfaced, not smoothed over.</p>

      {!apiEnabled() ? (
        <p style={{ fontSize: 13, color: "var(--text-dim)" }}>API not configured on this device.</p>
      ) : (
        <>
          {/* Tensions */}
          <div className="cap-data mb-2" style={{ color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: "0.06em" }}>Open tensions</div>
          {tensions.length === 0 ? (
            <div className="flex flex-col items-center justify-center text-center py-10 gap-2 mb-6">
              <Check size={20} strokeWidth={1.5} style={{ color: "var(--good)" }} />
              <span style={{ fontSize: 14, color: "var(--text-dim)" }}>No open tensions.</span>
              <span className="cap-data" style={{ color: "var(--text-dim)" }}>Conflicts appear here as claims gather evidence.</span>
            </div>
          ) : (
            <div className="space-y-2 mb-6">
              {tensions.map((t, i) => {
                const Icon = KIND_ICON[t.kind] || AlertTriangle;
                return (
                  <div key={i} className="p-3 flex items-start gap-2.5" style={{ borderRadius: 10, border: "1px solid var(--gold-line)", background: "var(--surface)" }}>
                    <Icon size={15} strokeWidth={1.5} style={{ color: "var(--gold)", flexShrink: 0, marginTop: 1 }} />
                    <span className="min-w-0">
                      <span className="cap-data block" style={{ color: "var(--gold)" }}>{KIND_LABEL[t.kind] || t.kind}{t.subject ? ` · ${t.subject}` : ""}</span>
                      <span style={{ fontSize: 13.5, lineHeight: 1.5, color: "var(--text)" }}>{t.why}</span>
                    </span>
                  </div>
                );
              })}
            </div>
          )}

          {/* Claims */}
          <div className="cap-data mb-2" style={{ color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: "0.06em" }}>Claims ({claims.length})</div>
          {claims.length === 0 ? (
            <p className="cap-data" style={{ color: "var(--text-dim)" }}>No claims yet — Radian forms these from evidence as you research.</p>
          ) : (
            <div className="space-y-2">
              {claims.map((c) => (
                <div key={c.id} className="p-3.5" style={{ borderRadius: 12, border: "1px solid var(--line)", background: "var(--surface)" }}>
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <span className="cap-data" style={{ color: "var(--text-dim)" }}>{c.claim_type}{c.subject ? ` · ${c.subject}` : ""}</span>
                    {c.contested && <span className="cap-data inline-flex items-center gap-0.5" style={{ color: "var(--gold)" }}><Scale size={9} strokeWidth={1.5} /> contested</span>}
                    {c.stale && <span className="cap-data inline-flex items-center gap-0.5" style={{ color: "var(--risk)" }}><Clock size={9} strokeWidth={1.5} /> stale</span>}
                    <span className="cap-data ml-auto" style={{ color: "var(--text-dim)" }}>{c.owner_status}</span>
                  </div>
                  <p style={{ fontSize: 14.5, lineHeight: 1.45, color: "var(--text)" }}>{c.statement}</p>
                  {/* confidence bar */}
                  <div className="flex items-center gap-2 mt-2">
                    <span className="cap-data" style={{ color: "var(--text-dim)" }}>confidence</span>
                    <span className="flex-1" style={{ height: 5, borderRadius: 999, background: "var(--surface-2)", overflow: "hidden" }}>
                      <span style={{ display: "block", height: "100%", width: `${Math.round((c.confidence || 0) * 100)}%`, background: c.confidence >= 0.66 ? "var(--good)" : c.confidence <= 0.34 ? "var(--risk)" : "var(--gold)" }} />
                    </span>
                    <span className="cap-data" style={{ color: "var(--text)" }}>{Math.round((c.confidence || 0) * 100)}%</span>
                  </div>
                  {c.owner_status !== "accepted" && c.owner_status !== "rejected" && (
                    <div className="flex items-center gap-3 mt-2.5 pt-2" style={{ borderTop: "1px solid var(--line)" }}>
                      <button onClick={() => void review(c.id, "accepted")} className="press inline-flex items-center gap-1 cap-data" style={{ color: "var(--good)" }}><Check size={12} strokeWidth={1.5} /> Accept</button>
                      <button onClick={() => void review(c.id, "rejected")} className="press inline-flex items-center gap-1 cap-data" style={{ color: "var(--risk)" }}><X size={12} strokeWidth={1.5} /> Reject</button>
                      <button onClick={() => void review(c.id, "superseded")} className="press inline-flex items-center gap-1 cap-data ml-auto" style={{ color: "var(--text-dim)" }}>Supersede</button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
