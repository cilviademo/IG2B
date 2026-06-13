import { useJson } from "@/hooks/useJson";
import { type ContextPackData, TRUTH_LAYER_COLORS } from "@/lib/types";
import { Loading, ErrorState } from "@/components/State";
import { SectionRule } from "@/components/primitives";
import ContextBuilder from "@/components/ContextBuilder";

export default function ContextPack() {
  const { data, loading, error } = useJson<ContextPackData>("/data/sample_context_pack.json");

  if (loading) return <Loading label="Encompass Layer" />;
  if (error || !data) return <ErrorState message={error ?? "no data"} />;

  const pct = Math.min(100, Math.round((data.token_budget.used / data.token_budget.total) * 100));
  const over = pct > 95;

  return (
    <div className="px-5 pt-6 pb-6">
      <div className="flex items-baseline justify-between mb-3">
        <h1 className="text-xl font-display">Context pack</h1>
        <span className="cap-data">Encompass</span>
      </div>

      {/* G11 — goal-scoped, token-budgeted retrieval (live). Sample pack below for shape. */}
      <ContextBuilder />

      <h2 className="mt-3" style={{ fontSize: 16, color: "var(--text)" }}>{data.title}</h2>
      <p className="mt-1" style={{ fontSize: 14, lineHeight: 1.5, color: "var(--text-dim)" }}>{data.purpose}</p>

      {/* Token budget — mono fraction + 2px hairline meter */}
      <div className="mt-6"><SectionRule label="Token budget" /></div>
      <div className="flex items-baseline justify-between mt-3 mb-1.5">
        <span className="font-data" style={{ fontSize: 15, color: "var(--text)" }}>
          {data.token_budget.used.toLocaleString()} / {data.token_budget.total.toLocaleString()}
        </span>
        <span className="cap-data" style={{ color: over ? "var(--risk)" : "var(--text-dim)" }}>{pct}%</span>
      </div>
      <div style={{ height: 2, background: "var(--line)", borderRadius: 2, overflow: "hidden" }}>
        <div style={{ height: "100%", width: `${pct}%`, background: over ? "var(--risk)" : "var(--gold)" }} />
      </div>
      <div className="cap-data mt-2" style={{ color: "var(--text-dim)" }}>assembled {new Date(data.updated_at).toLocaleString("en-US")}</div>

      {/* Source nodes — text chips, hairline border */}
      <div className="mt-6"><SectionRule label="Source nodes" /></div>
      <div className="flex flex-wrap gap-1.5 mt-3">
        {data.source_nodes.map((id) => (
          <span key={id} className="text-[11px] font-mono px-2 py-0.5" style={{ borderRadius: 6, border: "1px solid var(--line)", color: "var(--text-dim)" }}>{id}</span>
        ))}
      </div>

      {/* Sections — ruled, provenance badge as a mono glyph in a thin circle */}
      {data.sections.map((s, i) => {
        const color = TRUTH_LAYER_COLORS[s.truth_layer];
        return (
          <div key={i} className="mt-6 animate-fade-in-up" style={{ animationDelay: `${i * 40}ms` }}>
            <hr className="rule mb-3" />
            <div className="flex items-start justify-between gap-3 mb-1.5">
              <h3 className="font-semibold" style={{ fontSize: 15, color: "var(--text)" }}>{s.heading}</h3>
              <span
                className="font-data shrink-0 flex items-center justify-center"
                style={{ width: 22, height: 22, borderRadius: 999, border: `1px solid ${color}`, color, fontSize: 12 }}
                title={`Truth layer ${s.truth_layer}`}
              >
                {s.truth_layer}
              </span>
            </div>
            <p style={{ fontSize: 14, lineHeight: 1.55, color: "var(--text-dim)" }}>{s.content}</p>
            <span className="cap-data mt-1.5 inline-block" style={{ color: "var(--text-dim)" }}>provenance · {s.provenance}</span>
          </div>
        );
      })}
    </div>
  );
}
