import { Link } from "wouter";
import { Telescope } from "lucide-react";

// Styled to match the dark cosmic theme (per handoff next-step: fix 404 theming).
export default function NotFound() {
  return (
    <div
      className="min-h-[70dvh] flex flex-col items-center justify-center px-8 text-center"
      style={{ color: "oklch(0.75 0.01 280)" }}
    >
      <Telescope size={30} style={{ color: "oklch(0.6 0.2 264)" }} />
      <p className="label-mono mt-3 mb-1">Lost in the dark</p>
      <h1 className="text-2xl mb-2 glow-text-gold" style={{ color: "oklch(0.92 0.01 280)" }}>
        404 — Off the map
      </h1>
      <p className="text-sm mb-6" style={{ color: "oklch(0.55 0.02 280)" }}>
        This coordinate isn&apos;t in the Atlas.
      </p>
      <Link href="/">
        <button
          className="px-4 py-2 rounded-xl text-sm font-semibold"
          style={{ background: "oklch(0.45 0.22 264)", color: "oklch(0.95 0.01 280)" }}
        >
          Return to Mission Control
        </button>
      </Link>
    </div>
  );
}
