import { useJson } from "@/hooks/useJson";
import { type ContextPackData, TRUTH_LAYER_COLORS } from "@/lib/types";
import { Loading, ErrorState } from "@/components/State";
import { FileText } from "lucide-react";

export default function ContextPack() {
  const { data, loading, error } = useJson<ContextPackData>("/data/sample_context_pack.json");

  if (loading) return <Loading label="Encompass Layer" />;
  if (error || !data) return <ErrorState message={error ?? "no data"} />;

  const pct = Math.min(100, Math.round((data.token_budget.used / data.token_budget.total) * 100));
  const over = pct > 90;

  return (
    <div className="px-5 pt-5 pb-6 space-y-4">
      <div className="flex items-center gap-2">
        <FileText size={18} style={{ color: "oklch(0.6 0.2 264)" }} />
        <h1 className="text-xl">Context Pack</h1>
        <span className="label-mono ml-auto">Encompass Layer</span>
      </div>

      {/* Title / purpose */}
      <section className="rounded-2xl p-4 border-glow" style={{ background: "oklch(0.11 0.02 280)" }}>
        <h2 className="text-base mb-1">{data.title}</h2>
        <p className="text-sm" style={{ color: "oklch(0.75 0.01 280)" }}>
          {data.purpose}
        </p>
      </section>

      {/* Token budget */}
      <section className="rounded-2xl p-4 border-glow" style={{ background: "oklch(0.11 0.02 280)" }}>
        <div className="flex items-center justify-between mb-2">
          <span className="label-mono">Token Budget</span>
          <span className="font-mono text-xs" style={{ color: over ? "oklch(0.6 0.22 25)" : "oklch(0.78 0.14 85)" }}>
            {data.token_budget.used.toLocaleString()} / {data.token_budget.total.toLocaleString()} · {pct}%
          </span>
        </div>
        <div className="h-2 rounded-full overflow-hidden" style={{ background: "oklch(0.18 0.02 280)" }}>
          <div
            className="h-full rounded-full transition-glow"
            style={{
              width: `${pct}%`,
              background: over
                ? "oklch(0.6 0.22 25)"
                : "linear-gradient(90deg, oklch(0.45 0.22 264), oklch(0.78 0.14 85))",
            }}
          />
        </div>
        <div className="label-mono mt-2">
          assembled {new Date(data.updated_at).toLocaleString("en-US")}
        </div>
      </section>

      {/* Source nodes */}
      <section className="rounded-2xl p-4 border-glow" style={{ background: "oklch(0.11 0.02 280)" }}>
        <span className="label-mono">Source Nodes</span>
        <div className="flex flex-wrap gap-1.5 mt-2">
          {data.source_nodes.map((id) => (
            <span
              key={id}
              className="text-[10px] font-mono px-2 py-0.5 rounded-full"
              style={{ background: "oklch(0.45 0.22 264 / 0.15)", color: "oklch(0.6 0.2 264)" }}
            >
              {id}
            </span>
          ))}
        </div>
      </section>

      {/* Sections */}
      {data.sections.map((s, i) => {
        const color = TRUTH_LAYER_COLORS[s.truth_layer];
        return (
          <section
            key={i}
            className="rounded-2xl p-4 border-glow animate-fade-in-up"
            style={{ background: "oklch(0.11 0.02 280)", animationDelay: `${i * 50}ms` }}
          >
            <div className="flex items-center justify-between mb-1.5">
              <h3 className="text-sm font-semibold">{s.heading}</h3>
              <span
                className="text-[10px] font-mono px-2 py-0.5 rounded-full"
                style={{ background: color + "22", color }}
              >
                {s.truth_layer}
              </span>
            </div>
            <p className="text-sm leading-relaxed mb-2" style={{ color: "oklch(0.75 0.01 280)" }}>
              {s.content}
            </p>
            <span className="label-mono">provenance · {s.provenance}</span>
          </section>
        );
      })}
    </div>
  );
}
