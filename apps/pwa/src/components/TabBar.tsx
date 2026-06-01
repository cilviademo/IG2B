import { useLocation, Link } from "wouter";
import {
  LayoutDashboard,
  Inbox,
  Clock,
  Globe2,
  FileText,
  Compass,
  ArrowUpDown,
} from "lucide-react";

const tabs = [
  { path: "/", icon: LayoutDashboard, label: "Home" },
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
        background: "oklch(0.99 0.004 280 / 0.92)",
        backdropFilter: "blur(20px)",
        WebkitBackdropFilter: "blur(20px)",
      }}
    >
      <div className="border-t" style={{ borderColor: "oklch(0.55 0.03 264 / 0.3)" }}>
        <div className="flex items-center justify-around px-1 pt-1.5 pb-1">
          {tabs.map((tab) => {
            const isActive = location === tab.path;
            const Icon = tab.icon;
            return (
              <Link key={tab.path} href={tab.path}>
                <button
                  aria-label={tab.label}
                  aria-current={isActive ? "page" : undefined}
                  className={`flex flex-col items-center gap-0.5 px-1.5 py-1 rounded-lg transition-all duration-200 min-w-[44px] ${
                    isActive ? "tab-active" : "tab-inactive"
                  }`}
                  style={isActive ? { background: "oklch(0.45 0.22 264 / 0.1)" } : undefined}
                >
                  <Icon size={18} strokeWidth={isActive ? 2.2 : 1.5} />
                  <span className="text-[9px] font-medium tracking-wide">{tab.label}</span>
                </button>
              </Link>
            );
          })}
        </div>
      </div>
    </nav>
  );
}
