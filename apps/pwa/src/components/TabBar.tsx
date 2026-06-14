import { useLocation, Link } from "wouter";
import {
  LayoutDashboard,
  Inbox,
  Sparkles,
  Clock,
  Menu,
} from "lucide-react";
import { useTasks } from "@/contexts/TaskCenter";
import { haptic } from "@/lib/haptics";

// AURORA A1 — five tabs. Home · Inbox · Atlas · Timeline · More. Everything else moved
// under More so the bar breathes (was eight; tap targets were cramped on small phones).
// "More" badge aggregates unseen tasks whose home is one of the relocated routes.
const tabs = [
  { path: "/", icon: LayoutDashboard, label: "Home" },
  { path: "/inbox", icon: Inbox, label: "Inbox" },
  { path: "/companion", icon: Sparkles, label: "Radian" },
  { path: "/timeline", icon: Clock, label: "Timeline" },
  { path: "/more", icon: Menu, label: "More" },
] as const;

// Routes that now live under More — their badges roll up into the More tab.
// Atlas is now background memory (reachable from Radian + More), not a primary tab.
const MORE_ROUTES = ["/atlas", "/library", "/quests", "/insights", "/context", "/brief", "/time-machine", "/settings", "/io", "/diagnostics"];

export default function TabBar() {
  const [location] = useLocation();
  const { badge } = useTasks();

  const badgeFor = (path: string) => {
    if (path === "/more") return MORE_ROUTES.reduce((n, r) => n + badge(r), 0);
    return badge(path);
  };

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
      <div className="flex items-center justify-around px-2 pt-1.5 pb-1">
        {tabs.map((tab) => {
          const isActive = tab.path === "/" ? location === "/" : location.startsWith(tab.path);
          const Icon = tab.icon;
          const count = badgeFor(tab.path);
          return (
            <Link key={tab.path} href={tab.path}>
              <button
                onPointerDown={() => haptic(6)}
                aria-label={count > 0 ? `${tab.label} (${count} ready)` : tab.label}
                aria-current={isActive ? "page" : undefined}
                className="relative flex flex-col items-center gap-0.5 px-3 py-1.5 min-w-[56px] min-h-[44px]"
                style={{ color: isActive ? "var(--gold)" : "var(--text-dim)" }}
              >
                <Icon size={20} strokeWidth={1.5} />
                {count > 0 && (
                  <span
                    className="absolute pulse-soft"
                    style={{ top: 0, right: "calc(50% - 20px)", minWidth: 15, height: 15, padding: "0 4px", borderRadius: 999, background: "var(--gold)", color: "#161118", fontSize: 9, fontWeight: 700, lineHeight: "15px", textAlign: "center" }}
                  >
                    {count > 9 ? "9+" : count}
                  </span>
                )}
                <span className="text-[10px] font-medium" style={{ letterSpacing: 0 }}>{tab.label}</span>
              </button>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

