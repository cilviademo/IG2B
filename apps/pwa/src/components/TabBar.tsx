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
import { useTasks } from "@/contexts/TaskCenter";

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
  const { badge } = useTasks();

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
          const count = badge(tab.path);
          return (
            <Link key={tab.path} href={tab.path}>
              <button
                aria-label={count > 0 ? `${tab.label} (${count} ready)` : tab.label}
                aria-current={isActive ? "page" : undefined}
                className="relative flex flex-col items-center gap-0.5 px-1.5 py-1.5 min-w-[44px]"
                style={{ color: isActive ? "var(--gold)" : "var(--text-dim)" }}
              >
                <Icon size={18} strokeWidth={1.5} />
                {count > 0 && (
                  <span
                    className="absolute pulse-soft"
                    style={{ top: 2, right: "calc(50% - 16px)", minWidth: 15, height: 15, padding: "0 4px", borderRadius: 999, background: "var(--gold)", color: "#161118", fontSize: 9, fontWeight: 700, lineHeight: "15px", textAlign: "center" }}
                  >
                    {count > 9 ? "9+" : count}
                  </span>
                )}
                <span className="text-[9px] font-medium" style={{ letterSpacing: 0 }}>{tab.label}</span>
              </button>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
