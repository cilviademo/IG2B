import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
  children: ReactNode;
}
interface State {
  hasError: boolean;
  message: string;
}

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, message: "" };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, message: error.message };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Local-only: log to console, never to a remote endpoint.
    console.error("Indigold error boundary:", error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div
          className="min-h-[100dvh] flex flex-col items-center justify-center p-8 text-center"
          style={{ background: "oklch(0.08 0.02 280)", color: "oklch(0.75 0.01 280)" }}
        >
          <p className="label-mono mb-2" style={{ color: "oklch(0.6 0.22 25)" }}>
            System Fault
          </p>
          <h1 className="text-xl mb-2">Something went dark.</h1>
          <p className="text-sm mb-6" style={{ color: "oklch(0.55 0.02 280)" }}>
            {this.state.message}
          </p>
          <button
            onClick={() => window.location.reload()}
            className="px-4 py-2 rounded-lg text-sm"
            style={{ background: "oklch(0.45 0.22 264)", color: "oklch(0.95 0.01 280)" }}
          >
            Reload
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
