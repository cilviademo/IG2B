import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch, Router as WouterRouter } from "wouter";
import { useHashLocation } from "wouter/use-hash-location";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import TabBar from "./components/TabBar";
import Dashboard from "./pages/Dashboard";
import Inbox from "./pages/Inbox";
import Timeline from "./pages/Timeline";
import Atlas from "./pages/Atlas";
import ContextPack from "./pages/ContextPack";
import WeeklyBrief from "./pages/WeeklyBrief";
import ImportExport from "./pages/ImportExport";
import CaptureDeepLink from "./pages/CaptureDeepLink";
import Share from "./pages/Share";

// When opened directly from disk (the self-contained single-file build),
// the page is file:// and pushState is forbidden — so use hash routing there.
// Served over http(s) we keep clean path-based URLs.
const isFileProtocol = typeof window !== "undefined" && window.location.protocol === "file:";

function Routes() {
  return (
    <Switch>
      <Route path="/" component={Dashboard} />
      <Route path="/inbox" component={Inbox} />
      <Route path="/timeline" component={Timeline} />
      <Route path="/atlas" component={Atlas} />
      <Route path="/context" component={ContextPack} />
      <Route path="/brief" component={WeeklyBrief} />
      <Route path="/io" component={ImportExport} />
      <Route path="/capture" component={CaptureDeepLink} />
      <Route path="/share" component={Share} />
      <Route path="/404" component={NotFound} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  const routerProps = isFileProtocol ? { hook: useHashLocation } : {};
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="light">
        <TooltipProvider delayDuration={200}>
          <Toaster />
          <WouterRouter {...routerProps}>
            <div
              className="min-h-[100dvh] flex flex-col safe-top"
              style={{ background: "oklch(0.985 0.004 280)" }}
            >
              <main className="flex-1 overflow-y-auto pb-20">
                <Routes />
              </main>
              <TabBar />
            </div>
          </WouterRouter>
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
