import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch, Router as WouterRouter, useLocation } from "wouter";
import { useHashLocation } from "wouter/use-hash-location";
import { lazy, Suspense } from "react";
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

// The app shell. The global type-zoom is applied everywhere EXCEPT the Atlas: CSS `zoom`
// desyncs canvas hit-testing (clientX vs getBoundingClientRect), and it does nothing for
// the canvas-drawn Atlas labels anyway — so we skip it there to keep node-tapping exact.
function Shell() {
  const [location] = useLocation();
  const zoom = location !== "/atlas";
  return (
    <div
      className={`${zoom ? "app-zoom " : ""}min-h-[100dvh] flex flex-col`}
      style={{ background: "var(--bg)" }}
    >
      <TopBar />
      <main className="flex-1 overflow-y-auto pb-20">
        <Routes />
      </main>
      <TaskToast />
      <TabBar />
    </div>
  );
}

export default App;
