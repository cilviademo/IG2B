import { useEffect, useState } from "react";
import { ShieldCheck, Activity, RefreshCw, AlertTriangle } from "lucide-react";
import { useJson } from "@/hooks/useJson";
import { fetchObservability, apiEnabled, type Observability } from "@/lib/api";
import { Button } from "@/components/primitives";

// Phase 5 — Verification Center + Debug Console (admin-gated, single-user owner).
// Four states per subsystem: Stub · Build · Live · Phone.
//   gray  = untested · yellow = simulated only (stub/build/live but not on device)
//   green = owner-verified on device (phone). Source: /data/verification.json (stub+build
//   truth from the green matrix), GET /radian/observability (live), localStorage (phone).

interface Subsystem { key: string; label: string; gate: number; stub: string | null; live: string | null; phoneKey: string }
interface Manifest { build_verified: boolean; generated: string; subsystems: Subsystem[] }

const GRAY = "var(--text-dim)", YEL = "var(--gold)", GRN = "var(--good)", RED = "var(--risk)";
const ADMIN_KEY = "indigold_admin";
const phoneStoreKey = (k: string) => `indigold_phonegate_${k}`;

function Cell({ label, color, title }: { label: string; color: string; title?: string }) {
  return (
    <span title={title} className="inline-flex items-center justify-center" style={{ minWidth: 52, fontSize: 10, padding: "2px 6px", borderRadius: 6, border: `1px solid ${color}`, color, opacity: color === GRAY ? 0.6 : 1 }}>
      {label}
    </span>
  );
}

export default function Diagnostics() {
  const [admin, setAdmin] = useState(() => localStorage.getItem(ADMIN_KEY) === "1");
  const { data: manifest } = useJson<Manifest>("/data/verification.json");
  const [obs, setObs] = useState<Observability | null>(null);
  const [loading, setLoading] = useState(false);
  const [phone, setPhone] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (!manifest) return;
    const p: Record<string, boolean> = {};
    for (const s of manifest.subsystems) p[s.phoneKey] = localStorage.getItem(phoneStoreKey(s.phoneKey)) === "1";
    setPhone(p);
  }, [manifest]);

  async function refresh() { setLoading(true); setObs(await fetchObservability()); setLoading(false); }
  useEffect(() => { if (admin) void refresh(); }, [admin]);

  function togglePhone(k: string) {
    const next = !phone[k];
    setPhone((p) => ({ ...p, [k]: next }));
    try { localStorage.setItem(phoneStoreKey(k), next ? "1" : "0"); } catch { /* quota */ }
  }

  function enableAdmin() { localStorage.setItem(ADMIN_KEY, "1"); setAdmin(true); }

  if (!admin) {
    return (
      <div className="px-5 pt-6 pb-6">
        <h1 className="text-xl font-display mb-3">Diagnostics</h1>
        <p style={{ fontSize: 14, color: "var(--text-dim)", lineHeight: 1.5, marginBottom: 16 }}>
          Admin-only. The Verification Center tracks each subsystem across Stub · Build · Live · Phone,
          and the Debug Console shows queue, jobs, budget, providers and storage health.
        </p>
        <Button variant="primary" leftIcon={<ShieldCheck size={15} strokeWidth={1.5} />} onClick={enableAdmin}>Enable diagnostics on this device</Button>
      </div>
    );
  }

  const liveUp = obs ? (obs.db === "healthy") : false;
  const liveColor = !apiEnabled() ? GRAY : obs ? (liveUp ? GRN : RED) : GRAY;

  return (
    <div className="px-5 pt-6 pb-6">
      <div className="flex items-center gap-2 mb-1">
        <ShieldCheck size={18} strokeWidth={1.5} style={{ color: "var(--gold)" }} />
        <h1 className="text-xl font-display">Verification Center</h1>
        <button onClick={refresh} className="tap-target ml-auto" aria-label="Refresh" style={{ color: "var(--text-dim)" }}>
          <RefreshCw size={15} strokeWidth={1.5} className={loading ? "animate-spin" : ""} />
        </button>
      </div>
      <p className="cap-data mb-4" style={{ color: "var(--text-dim)" }}>
        gray untested · gold simulated only · green owner-verified{manifest ? ` · manifest ${manifest.generated}` : ""}
      </p>

      {/* Verification matrix */}
      {manifest && (
        <div className="space-y-2">
          {manifest.subsystems.map((s) => {
            const stubC = s.stub ? YEL : GRAY;
            const buildC = manifest.build_verified ? YEL : GRAY;
            const lc = s.live ? liveColor : GRAY;
            const pc = phone[s.phoneKey] ? GRN : GRAY;
            return (
              <div key={s.key} className="flex items-center gap-2 py-2" style={{ borderBottom: "1px solid var(--line)" }}>
                <div className="flex-1 min-w-0">
                  <div style={{ fontSize: 13.5, color: "var(--text)" }}>{s.label}</div>
                  <div className="cap-data" style={{ color: "var(--text-dim)" }}>gate {s.gate}{s.stub ? ` · ${s.stub}` : ""}</div>
                </div>
                <Cell label="Stub" color={stubC} title={s.stub || "no stub suite"} />
                <Cell label="Build" color={buildC} />
                <Cell label="Live" color={lc} title={s.live || "no direct live probe"} />
                <button onClick={() => togglePhone(s.phoneKey)} aria-label={`Toggle phone-verified for ${s.label}`}>
                  <Cell label={phone[s.phoneKey] ? "Phone ✓" : "Phone"} color={pc} title="Tap to mark owner-verified on device" />
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* Debug Console */}
      <div className="flex items-center gap-2 mt-7 mb-2">
        <Activity size={16} strokeWidth={1.5} style={{ color: "var(--gold)" }} />
        <h2 className="text-base font-display">Debug Console</h2>
      </div>
      {!apiEnabled() ? (
        <p style={{ fontSize: 13, color: "var(--text-dim)" }}>API not configured on this device.</p>
      ) : !obs ? (
        <p className="pulse-soft" style={{ fontSize: 13, color: "var(--text-dim)" }}>Loading live status… (free-tier API may be waking)</p>
      ) : (
        <div className="space-y-3" style={{ fontSize: 12.5 }}>
          <Line k="Storage" v={`db ${obs.db} · redis ${obs.queue.redis} · queue depth ${obs.queue.depth}`} bad={obs.db !== "healthy" || obs.queue.redis !== "healthy"} />
          <Line k="Jobs" v={obs.jobs.length ? obs.jobs.map((j) => `${j.status} ${j.count}`).join(" · ") : "none yet"} bad={obs.jobs.some((j) => j.status === "failed" && j.count > 0)} />
          <Line k="Budget" v={`${obs.budget.state} · $${(obs.budget.month_to_date_cents / 100).toFixed(2)} / $${(obs.budget.monthly_budget_cents / 100).toFixed(2)}`} bad={obs.budget.state !== "ok"} />
          <Line k="Providers" v={`mode ${obs.providers.mode} · default ${obs.providers.default_provider} · ${Object.entries(obs.providers.providers).filter(([, p]) => p.configured).map(([n]) => n).join(", ") || "deterministic only"}`} />
          <Line k="Embeddings" v={`${obs.embeddings.provider}/${obs.embeddings.model} · ${obs.embeddings.embedded} embedded · ${obs.embeddings.active ? "active" : "deterministic"}`} />
          <Line k="pgvector" v={obs.pgvector.available ? `available ${obs.pgvector.version ?? ""}` : "not available (fallback active)"} />
          {obs.problems.length > 0 && (
            <div className="pt-2" style={{ borderTop: "1px solid var(--line)" }}>
              <div className="flex items-center gap-1.5 mb-1" style={{ color: "var(--risk)" }}>
                <AlertTriangle size={12} strokeWidth={1.5} /> <span className="cap-data">recent unfinished / problem jobs</span>
              </div>
              {obs.problems.map((p) => (
                <div key={p.id} className="font-mono" style={{ color: "var(--text-dim)", fontSize: 11, padding: "1px 0" }}>
                  {p.type} · <span style={{ color: p.status === "failed" ? "var(--risk)" : p.status === "queued" ? "var(--gold)" : "var(--text-dim)" }}>{p.status}</span>{p.error ? ` — ${p.error}` : ""}
                </div>
              ))}
            </div>
          )}
          <p className="cap-data" style={{ color: "var(--text-dim)" }}>as of {new Date(obs.generated_at).toLocaleTimeString()}</p>
        </div>
      )}
    </div>
  );
}

function Line({ k, v, bad }: { k: string; v: string; bad?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <span style={{ color: "var(--text-dim)", minWidth: 76 }}>{k}</span>
      <span className="font-mono text-right" style={{ color: bad ? "var(--risk)" : "var(--text)" }}>{v}</span>
    </div>
  );
}
