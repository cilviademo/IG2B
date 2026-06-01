import { Loader2, AlertTriangle } from "lucide-react";

export function Loading({ label = "Loading" }: { label?: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-24 gap-3">
      <Loader2 className="animate-spin" size={22} style={{ color: "oklch(0.5 0.2 264)" }} />
      <span className="label-mono">{label}</span>
    </div>
  );
}

export function ErrorState({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-24 gap-2 px-8 text-center">
      <AlertTriangle size={22} style={{ color: "oklch(0.6 0.22 25)" }} />
      <span className="label-mono" style={{ color: "oklch(0.6 0.22 25)" }}>
        Fixture failed to load
      </span>
      <span className="text-sm" style={{ color: "oklch(0.46 0.02 280)" }}>
        {message}
      </span>
    </div>
  );
}
