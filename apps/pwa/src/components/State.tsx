import { Loader2, AlertTriangle } from "lucide-react";

export function Loading({ label = "Loading" }: { label?: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-24 gap-3">
      <Loader2 className="animate-spin" size={20} strokeWidth={1.5} style={{ color: "var(--text-dim)" }} />
      <span style={{ fontSize: 13, color: "var(--text-dim)" }}>{label}</span>
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
