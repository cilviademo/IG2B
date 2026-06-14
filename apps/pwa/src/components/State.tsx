import { AlertTriangle } from "lucide-react";

// AURORA A10 — a content skeleton instead of bare "Loading…". Always resolves to a real
// success/failure state (callers swap it out); it never masks a failure as endless shimmer.
export function Loading({ label }: { label?: string }) {
  return (
    <div className="px-5 pt-8" aria-busy="true" aria-label={label || "Loading"}>
      <div className="skeleton" style={{ height: 14, width: "38%", marginBottom: 18 }} />
      <div className="skeleton" style={{ height: 22, width: "82%", marginBottom: 10 }} />
      <div className="skeleton" style={{ height: 22, width: "68%", marginBottom: 28 }} />
      <div className="skeleton" style={{ height: 12, width: "30%", marginBottom: 14 }} />
      {[88, 72, 80].map((w, i) => (
        <div key={i} className="skeleton" style={{ height: 16, width: `${w}%`, marginBottom: 12 }} />
      ))}
    </div>
  );
}

export function ErrorState({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-24 gap-2 px-8 text-center">
      <AlertTriangle size={20} strokeWidth={1.5} style={{ color: "var(--risk)" }} />
      <span style={{ fontSize: 13, color: "var(--risk)" }}>Fixture failed to load</span>
      <span className="text-sm" style={{ color: "var(--text-dim)" }}>{message}</span>
    </div>
  );
}
