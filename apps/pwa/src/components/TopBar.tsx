import { useLocation, Link } from "wouter";
import { ChevronLeft, ChevronRight } from "lucide-react";
import NotificationCenter from "./NotificationCenter";

// Persistent top bar: back / forward page navigation + the wordmark. Addresses the
// "I need a way to go back/return" gap — every screen now has explicit history controls
// in addition to the per-sheet X close.
const TITLES: Record<string, string> = {
  "/": "Mission Control",
  "/quests": "Quests",
  "/inbox": "Inbox",
  "/timeline": "Timeline",
  "/time-machine": "Time Machine",
  "/atlas": "Atlas",
  "/context": "Context",
  "/brief": "Brief",
  "/io": "Settings",
  "/settings": "Settings",
  "/more": "More",
  "/insights": "Insights",
  "/diagnostics": "Diagnostics",
};

export default function TopBar() {
  const [location] = useLocation();
  const isHome = location === "/";
  const title = TITLES[location] || "Indigold";

  return (
    <div
      className="sticky top-0 z-40 flex items-center gap-1 px-2 safe-top"
      style={{
        height: 48,
        background: "color-mix(in srgb, var(--bg) 82%, transparent)",
        backdropFilter: "blur(20px)",
        WebkitBackdropFilter: "blur(20px)",
        borderBottom: "1px solid var(--line)",
      }}
    >
      <button
        onClick={() => window.history.back()}
        disabled={isHome}
        aria-label="Back"
        className="press flex items-center justify-center"
        style={{ width: 40, height: 40, borderRadius: 999, color: isHome ? "var(--line)" : "var(--text)", opacity: isHome ? 0.4 : 1 }}
      >
        <ChevronLeft size={22} strokeWidth={1.5} />
      </button>
      <button
        onClick={() => window.history.forward()}
        aria-label="Forward"
        className="press flex items-center justify-center shrink-0"
        style={{ width: 40, height: 40, borderRadius: 999, color: "var(--text-dim)" }}
      >
        <ChevronRight size={22} strokeWidth={1.5} />
      </button>

      {/* Title flexes + truncates so it never collides with the controls on small screens. */}
      <Link href="/" className="flex-1 min-w-0 px-2 press text-center">
        <span className="font-display block truncate" style={{ fontSize: 15, color: "var(--text)" }}>{title}</span>
      </Link>

      <div className="shrink-0">
        <NotificationCenter />
      </div>
    </div>
  );
}
