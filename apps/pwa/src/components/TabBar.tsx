import { useLocation, Link } from "wouter";
import {
  LayoutDashboard,
  Inbox,
  Clock,
  Globe2,
  FileText,
  Compass,
  ArrowUpDown,
  Swords,
} from "lucide-react";

const tabs = [
  { path: "/", icon: LayoutDashboard, label: "Home" },
  { path: "/quests", icon: Swords, label: "Quests" },
  { path: "/inbox", icon: Inbox, label: "Inbox" },
  { path: "/timeline", icon: Clock, label: "Timeline" },
  { path: "/atlas", icon: Globe2, label: "Atlas" },
  { path: "/context", icon: FileText, label: "Context" },
  { path: "/brief", icon: Compass, label: "Brief" },
  { path: "/io", icon: ArrowUpDown, label: "I/O" },
] as const;

export default function TabBar() {
  const [location] = useLocation();

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-50 safe-bottom"
      style={{
        background: "color-mix(in srgb, var(--bg) 82%, transparent)",
        backdropFilter: "blur(20px)",
        WebkitBackdropFilter: "blur(20px)",
        borderTop: "1px solid var(--line)",
      }}
    >
      <div className="flex items-center justify-around px-1 pt-1.5 pb-1">
        {tabs.map((tab) => {
          const isActive = location === tab.path;
          const Icon = tab.icon;
          return (
            <Link key={tab.path} href={tab.path}>
              <button
                aria-label={tab.label}
                aria-current={isActive ? "page" : undefined}
                className="flex flex-col items-center gap-0.5 px-1.5 py-1.5 min-w-[44px]"
                style={{ color: isActive ? "var(--gold)" : "var(--text-dim)" }}
              >
                <Icon size={18} strokeWidth={1.5} />
                <span className="text-[9px] font-medium" style={{ letterSpacing: 0 }}>{tab.label}</span>
              </button>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
