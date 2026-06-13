import { Link } from "wouter";
import { Telescope } from "lucide-react";

// Styled to match the dark cosmic theme (per handoff next-step: fix 404 theming).
export default function NotFound() {
  return (
    <div className="min-h-[70dvh] flex flex-col items-center justify-center px-8 text-center" style={{ color: "var(--text-dim)" }}>
      <Telescope size={28} strokeWidth={1.5} style={{ color: "var(--text-dim)" }} />
      <p className="mt-3 mb-1" style={{ fontSize: 12, color: "var(--text-dim)" }}>Lost in the dark</p>
      <h1 className="text-2xl font-display mb-2" style={{ color: "var(--text)" }}>404 — Off the map</h1>
      <p className="text-sm mb-6" style={{ color: "var(--text-dim)" }}>This coordinate isn&apos;t in the Atlas.</p>
      <Link href="/">
        <button className="px-4 py-2.5 text-sm font-semibold" style={{ background: "var(--gold)", color: "#161118", borderRadius: 6 }}>
          Return to mission control
        </button>
      </Link>
    </div>
  );
}
