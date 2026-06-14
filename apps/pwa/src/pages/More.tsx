import { Link } from "wouter";
import { Swords, Activity, FileText, Compass, BarChart3, Clock, Settings, ShieldCheck, FolderOpen, Globe2, ChevronRight } from "lucide-react";

// AURORA A1 — the "More" hub. The tab bar drops to five (Home · Inbox · Atlas · Timeline ·
// More); everything else is one calm tap away here. No capability removed — just relocated.
const ITEMS: { href: string; icon: typeof Swords; label: string; sub: string }[] = [
  { href: "/atlas", icon: Globe2, label: "Atlas", sub: "Memory graph — the constellation behind Radian" },
  { href: "/library", icon: FolderOpen, label: "Library", sub: "Your vault, stored · files · completed · archived" },
  { href: "/quests", icon: Swords, label: "Quests", sub: "Today · Later · Archive" },
  { href: "/activity", icon: Activity, label: "AI Activity", sub: "Every AI run — view, retry, archive" },
  { href: "/insights", icon: BarChart3, label: "Insights", sub: "Progress, simulations, research" },
  { href: "/context", icon: FileText, label: "Context", sub: "Goal-scoped packs" },
  { href: "/brief", icon: Compass, label: "Weekly Brief", sub: "The editorial digest" },
  { href: "/time-machine", icon: Clock, label: "Time Machine", sub: "Replay · lessons · resurfaced" },
  { href: "/settings", icon: Settings, label: "Settings", sub: "Vault · connections · API" },
  { href: "/diagnostics", icon: ShieldCheck, label: "Diagnostics", sub: "Verification + debug (admin)" },
];

export default function More() {
  return (
    <div className="px-5 pt-6 pb-12">
      <h1 className="text-xl font-display mb-1">More</h1>
      <p className="cap-data mb-5" style={{ color: "var(--text-dim)" }}>everything beyond the four core tabs</p>
      <div>
        {ITEMS.map((it, i) => {
          const Icon = it.icon;
          return (
            <Link key={it.href} href={it.href} className="tap-row flex items-center gap-3 py-3.5" style={{ borderBottom: i === ITEMS.length - 1 ? "none" : "1px solid var(--line)" }}>
              <span className="flex items-center justify-center" style={{ width: 38, height: 38, borderRadius: 10, background: "var(--gold-soft)", border: "1px solid var(--gold-line)", color: "var(--gold)", flexShrink: 0 }}>
                <Icon size={17} strokeWidth={1.5} />
              </span>
              <span className="min-w-0">
                <div style={{ fontSize: 15, color: "var(--text)" }}>{it.label}</div>
                <div className="cap-data truncate" style={{ color: "var(--text-dim)" }}>{it.sub}</div>
              </span>
              <ChevronRight size={16} strokeWidth={1.5} className="ml-auto shrink-0" style={{ color: "var(--text-dim)" }} />
            </Link>
          );
        })}
      </div>
    </div>
  );
}
