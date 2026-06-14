import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch, Router as WouterRouter, useLocation } from "wouter";
import { useHashLocation } from "wouter/use-hash-location";
import { lazy, Suspense, useEffect, useLayoutEffect, useRef } from "react";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import { TaskProvider } from "./contexts/TaskCenter";
import TabBar from "./components/TabBar";
import TopBar from "./components/TopBar";
import TaskToast from "./components/TaskToast";
import { Loading } from "./components/State";
import Dashboard from "./pages/Dashboard";

// Home loads eagerly (it's the landing surface). Every other route is code-split so the
// initial bundle stays small and first paint is fast — the heavier pages (Atlas canvas,
// Time Machine, I/O) only download when visited.
const Inbox = lazy(() => import("./pages/Inbox"));
const Timeline = lazy(() => import("./pages/Timeline"));
const TimeMachine = lazy(() => import("./pages/TimeMachine"));
const Atlas = lazy(() => import("./pages/Atlas"));
const Quests = lazy(() => import("./pages/Quests"));
const ContextPack = lazy(() => import("./pages/ContextPack"));
const WeeklyBrief = lazy(() => import("./pages/WeeklyBrief"));
const ImportExport = lazy(() => import("./pages/ImportExport"));
const More = lazy(() => import("./pages/More"));
const Insights = lazy(() => import("./pages/Insights"));
const SituationRoom = lazy(() => import("./pages/SituationRoom"));
const Diagnostics = lazy(() => import("./pages/Diagnostics"));
const CaptureDeepLink = lazy(() => import("./pages/CaptureDeepLink"));
const Share = lazy(() => import("./pages/Share"));

// When opened directly from disk (the self-contained single-file build),
// the page is file:// and pushState is forbidden — so use hash routing there.
// Served over http(s) we keep clean path-based URLs.
const isFileProtocol = typeof window !== "undefined" && window.location.protocol === "file:";

function Routes() {
  return (
    <Suspense fallback={<Loading label="Indigold" />}>
      <Switch>
        <Route path="/" component={Dashboard} />
        <Route path="/inbox" component={Inbox} />
        <Route path="/timeline" component={Timeline} />
        <Route path="/time-machine" component={TimeMachine} />
        <Route path="/atlas" component={Atlas} />
        <Route path="/quests" component={Quests} />
        <Route path="/context" component={ContextPack} />
        <Route path="/brief" component={WeeklyBrief} />
        <Route path="/io" component={ImportExport} />
        <Route path="/settings" component={ImportExport} />
        <Route path="/more" component={More} />
        <Route path="/insights" component={Insights} />
        <Route path="/situation-room" component={SituationRoom} />
        <Route path="/diagnostics" component={Diagnostics} />
        <Route path="/capture" component={CaptureDeepLink} />
        <Route path="/share" component={Share} />
        <Route path="/404" component={NotFound} />
        <Route component={NotFound} />
      </Switch>
    </Suspense>
  );
}

function App() {
  const routerProps = isFileProtocol ? { hook: useHashLocation } : {};
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="dark">
        <TooltipProvider delayDuration={200}>
          <Toaster />
          <WouterRouter {...routerProps}>
            <TaskProvider>
              <Shell />
            </TaskProvider>
          </WouterRouter>
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

// The app shell. (Global CSS `zoom` was removed — it overflowed narrow viewports and
// desynced Atlas hit-testing; readability now comes from a 16px base + responsive type.)
// A9 scroll restoration: `<main>` is the single scroll container; we remember scrollTop
// PER ROUTE and restore it on navigation (new routes start at top). This fixes the bug
// where scrolling one tab left others scrolled — each route keeps its own position.
function Shell() {
  const [location] = useLocation();
  const mainRef = useRef<HTMLElement>(null);
  const positions = useRef<Record<string, number>>({});
  const current = useRef<string>(location);

  // Continuously record the active route's scroll position.
  useEffect(() => {
    const el = mainRef.current;
    if (!el) return;
    const onScroll = () => { positions.current[current.current] = el.scrollTop; };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, []);

  // On route change: restore the incoming route's saved position (or top for new routes).
  useLayoutEffect(() => {
    current.current = location;
    const el = mainRef.current;
    if (el) el.scrollTop = positions.current[location] ?? 0;
  }, [location]);

  return (
    <div className="min-h-[100dvh] flex flex-col" style={{ background: "var(--bg)" }}>
      <TopBar />
      <main ref={mainRef} className="flex-1 overflow-y-auto overflow-x-hidden pb-20">
        <Routes />
      </main>
      <TaskToast />
      <TabBar />
    </div>
  );
}

export default App;
