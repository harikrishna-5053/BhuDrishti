import React, { Component, type ReactNode } from "react";
import { RefreshCw } from "lucide-react";
import { reportLovableError } from "@/lib/lovable-error-reporting";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export default class MapErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error("GIS Map Error Boundary caught error:", error, errorInfo);
    reportLovableError(error, { boundary: "gis_map_error_boundary" });
  }

  private handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div className="flex h-full w-full flex-col items-center justify-center bg-slate-900/90 p-6 text-center text-slate-200 backdrop-blur-md">
          <div className="max-w-md space-y-4 rounded-xl border border-rose-500/30 bg-slate-950/80 p-6 shadow-2xl">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-rose-500/10 text-rose-400">
              <RefreshCw className="h-6 w-6" />
            </div>
            <h3 className="text-lg font-semibold text-slate-100">GIS Map View Reset</h3>
            <p className="text-xs text-slate-400">
              The map layer encountered a temporary rendering issue and was safely contained.
            </p>
            <button
              onClick={this.handleReset}
              className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-emerald-500"
            >
              <RefreshCw className="h-3.5 w-3.5" /> Reload GIS Console Map
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
