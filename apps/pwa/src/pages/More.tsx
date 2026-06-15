import { Link } from "wouter";
import { Swords, Activity, FileText, Compass, BarChart3, Clock, Settings, ShieldCheck, Globe2, LayoutDashboard, ChevronRight, Inbox as InboxIcon, GitFork, Globe, Radar, MessageSquare } from "lucide-react";

// The "More" hub. Primary tabs are Radian · Inbox · Timeline · Library · More; everything
// else is one calm tap away here. No capability removed — just relocated.
const ITEMS: { href: string; icon: typeof Swords; label: string; sub: string }[] = [
  { href: "/history", icon: MessageSquare, label: "Chat history", sub: "Every Radian conversation — reopen the full Q&A" },
  { href: "/atlas", icon: Globe2, label: "Atlas", sub: "Memory graph — the constellation behind Radian" },
  { href: "/home", icon: LayoutDashboard, label: "Mission Control", sub: "The classic dashboard overview" },
  { href: "/quests", icon: Swords, label: "Quests", sub: "Today · Later · Archive" },
  { href: "/activity", icon: Activity, label: "AI Activity", sub: "Every AI run — view, retry, archive" },
  { href: "/research", icon: InboxIcon, label: "Research Inbox", sub: "External evidence + feeds — triage what the world knows" },
  { href: "/tensions", icon: GitFork, label: "Tensions", sub: "Where your beliefs and the evidence disagree" },
  { href: "/world-lens", icon: Globe, label: "World Lens", sub: "What changed outside your vault (open from a node)" },
  { href: "/watchlists", icon: Radar, label: "Watchlists", sub: "Monitor topics — new scholarship & feeds, on a cadence" },
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
