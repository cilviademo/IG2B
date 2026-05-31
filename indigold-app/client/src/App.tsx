import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch } from "wouter";
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

function Router() {
  return (
    <Switch>
      <Route path="/" component={Dashboard} />
      <Route path="/inbox" component={Inbox} />
      <Route path="/timeline" component={Timeline} />
      <Route path="/atlas" component={Atlas} />
      <Route path="/context" component={ContextPack} />
      <Route path="/brief" component={WeeklyBrief} />
      <Route path="/io" component={ImportExport} />
      <Route path="/404" component={NotFound} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="dark">
        <TooltipProvider delayDuration={200}>
          <Toaster />
          <div
            className="min-h-[100dvh] flex flex-col safe-top"
            style={{ background: "oklch(0.08 0.02 280)" }}
          >
            <main className="flex-1 overflow-y-auto pb-20">
              <Router />
            </main>
            <TabBar />
          </div>
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
