import { useEffect, useState } from "react";
import { Link } from "wouter";
import { Cpu, RefreshCw, ExternalLink } from "lucide-react";
import { fetchAiUsage, apiEnabled, type AiUsage } from "@/lib/api";

// AI Usage / Token Observatory. Reads /radian/usage (cost ledger aggregate) — metadata
// only, never the key. Mode/provider/model, today + month-to-date calls/tokens/cost, a
// budget bar, cost-by-feature, and the last 10 calls with status.
const usd = (cents: number) => `$${(cents / 100).toFixed(2)}`;
const STATUS_COLOR: Record<string, string> = { ok: "var(--good)", fallback: "var(--gold)", failed: "var(--risk)", "budget-limited": "var(--gold)" };

export default function AiUsagePanel() {
  const [u, setU] = useState<AiUsage | null>(null);
  const [loading, setLoading] = useState(false);

  async function load() { setLoading(true); setU(await fetchAiUsage()); setLoading(false); }
  useEffect(() => { void load(); }, []);

  if (!apiEnabled()) return null;

  return (
    <>
      <div className="mt-6 flex items-center gap-2">
        <Cpu size={15} strokeWidth={1.5} style={{ color: "var(--gold)" }} />
        <span style={{ fontSize: 14, color: "var(--text)" }}>AI usage</span>
        <button onClick={load} className="tap-target ml-auto" aria-label="Refresh usage" style={{ color: "var(--text-dim)" }}>
          <RefreshCw size={14} strokeWidth={1.5} className={loading ? "animate-spin" : ""} />
        </button>
      </div>
      <hr className="rule mt-1.5 mb-3" />

      {!u ? (
        <p className="pulse-soft" style={{ fontSize: 13, color: "var(--text-dim)" }}>Loading usage… <span className="cap-data">(free-tier API may be waking)</span></p>
      ) : (
        <div className="space-y-3">
          {/* mode / provider / model */}
          <div className="flex items-center justify-between" style={{ fontSize: 12.5 }}>
            <span style={{ color: "var(--text-dim)" }}>
              mode <span style={{ color: u.mode === "live" ? "var(--good)" : "var(--text)" }}>{u.mode}</span> · {u.provider}
            </span>
            <span className="flex items-center gap-1.5" style={{ color: u.key_detected ? "var(--good)" : "var(--text-dim)" }}>
              <span style={{ width: 6, height: 6, borderRadius: 999, background: u.key_detected ? "var(--good)" : "var(--text-dim)", display: "inline-block" }} />
              {u.key_detected ? "key detected" : "no key"}
            </span>
          </div>
          <div className="cap-data" style={{ color: "var(--text-dim)" }}>model · {u.active_model}</div>

          {/* budget bar */}
          <div>
            <div className="flex items-center justify-between mb-1" style={{ fontSize: 12 }}>
              <span style={{ color: "var(--text-dim)" }}>budget · {u.budget.state}</span>
              <span className="font-data" style={{ color: u.budget.state === "ok" ? "var(--text)" : "var(--gold)" }}>
                {usd(u.budget.month_to_date_cents)} / {usd(u.budget.monthly_budget_cents)}
              </span>
            </div>
            <div style={{ height: 6, borderRadius: 999, background: "var(--surface-2)", overflow: "hidden" }}>
              <div className="bar-fill" style={{ width: `${Math.round(u.budget.pct * 100)}%`, height: "100%", background: u.budget.pct >= 0.8 ? "var(--risk)" : "var(--gold)" }} />
            </div>
            <div className="cap-data mt-1" style={{ color: "var(--text-dim)" }}>{usd(u.budget.remaining_cents)} remaining</div>
            {u.budget.state !== "ok" && (
              <p className="cap-data mt-1" style={{ color: "var(--gold)" }}>
                {u.budget.state === "block" ? "Budget reached — AI calls are queued, not spending." : "Over 80% — degraded to cheap-tier only."}
              </p>
            )}
          </div>

          {/* today + month tiles */}
          <div className="grid grid-cols-2 gap-2">
            {([["Today", u.today], ["Month", u.month]] as const).map(([label, s]) => (
              <div key={label} style={{ border: "1px solid var(--line)", borderRadius: 10, padding: 10 }}>
                <div className="cap-data mb-1" style={{ color: "var(--text-dim)" }}>{label}</div>
                <div className="font-data" style={{ fontSize: 18, color: "var(--text)" }}>{s.calls}<span className="cap-data" style={{ color: "var(--text-dim)" }}> calls</span></div>
                <div className="cap-data" style={{ color: "var(--text-dim)" }}>{s.input_tokens.toLocaleString()} in · {s.output_tokens.toLocaleString()} out</div>
                <div className="cap-data" style={{ color: "var(--text-dim)" }}>~{usd(s.cost_cents)}</div>
              </div>
            ))}
          </div>

          {/* cost by feature */}
          {u.by_feature.length > 0 && (
            <div>
              <div className="cap-data mb-1" style={{ color: "var(--text-dim)" }}>cost by feature (month)</div>
              {u.by_feature.map((f) => (
                <div key={f.feature} className="flex items-center justify-between" style={{ fontSize: 12 }}>
                  <span style={{ color: "var(--text-dim)" }}>{f.feature}<span className="cap-data" style={{ opacity: 0.6 }}> ·{f.calls}</span></span>
                  <span className="font-data" style={{ color: "var(--text-dim)" }}>{usd(f.cost_cents)}</span>
                </div>
              ))}
            </div>
          )}

          {/* last 10 calls */}
          <div>
            <div className="cap-data mb-1" style={{ color: "var(--text-dim)" }}>last 10 calls</div>
            {u.recent.length === 0 ? (
              <p className="cap-data" style={{ color: "var(--text-dim)", opacity: 0.7 }}>No AI calls yet.</p>
            ) : (
              u.recent.map((r, i) => (
                <div key={i} className="flex items-center gap-2 py-1" style={{ fontSize: 11, borderBottom: i < u.recent.length - 1 ? "1px solid var(--line)" : "none" }}>
                  <span style={{ width: 6, height: 6, borderRadius: 999, background: STATUS_COLOR[r.status] || "var(--text-dim)", display: "inline-block", flexShrink: 0 }} />
                  <span style={{ color: "var(--text)", minWidth: 72 }}>{r.feature}</span>
                  <span className="font-mono" style={{ color: "var(--text-dim)", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.input_tokens}/{r.output_tokens}t · {r.latency_ms}ms</span>
                  {r.source_id && (
                    <Link href={`/atlas?focus=${r.source_id}`} aria-label="Open source" className="press shrink-0" style={{ color: "var(--gold)" }}><ExternalLink size={11} strokeWidth={1.5} /></Link>
                  )}
                  <span className="font-data" style={{ color: STATUS_COLOR[r.status] || "var(--text-dim)" }}>{r.status === "ok" ? usd(r.cost_cents) : r.status}</span>
                </div>
              ))
            )}
          </div>
          <p className="cap-data" style={{ color: "var(--text-dim)" }}>as of {new Date(u.generated_at).toLocaleTimeString()}</p>
        </div>
      )}
    </>
  );
}
