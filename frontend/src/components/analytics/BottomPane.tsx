import { useMemo } from "react";

import {
  Activity,
  BarChart3,
  ChevronDown,
  ChevronUp,
  Download,
  FileText,
  Gauge,
  GitCompareArrows,
  Layers,
  Map as MapIcon,
  Sparkles,
  Terminal,
} from "lucide-react";

import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { formatCoord } from "@/lib/geo-format";

import type { LogEntry, LogLevel } from "@/lib/types";

import { useGeoTIFFStore } from "@/stores/geotiff-store";

import CropHealthGauge from "./CropHealthGauge";
import MetadataPanel from "@/components/metadata/MetadataPanel";

/* ---------------- Bottom Pane ---------------- */

export default function BottomPane({
  expanded,
  onToggleExpand,
  tab,
  setTab,
  logs,
  compareA,
  compareB,
  setCompareA,
  setCompareB,
  clicked,
  onOpenResult,
  onExportGeoTIFF,
  onViewResultGauge,
  jobResults = [],
  onOpenResultInViewer,
  onDownloadResult,
}: {
  expanded: boolean;
  onToggleExpand: () => void;
  tab: "temporal" | "change" | "results" | "metadata" | "log";
  setTab: (t: "temporal" | "change" | "results" | "metadata" | "log") => void;
  logs: LogEntry[];
  compareA: number;
  compareB: number;
  setCompareA: (y: number) => void;
  setCompareB: (y: number) => void;
  clicked: { lat: number; lng: number } | null;
  onOpenResult?: (name: string, year: number) => void;
  onExportGeoTIFF?: (name: string) => void;
  onViewResultGauge?: (name: string) => void;
  jobResults?: any[];
  onOpenResultInViewer?: (res: any) => void;
  onDownloadResult?: (res: any) => void;
}) {
  const { raster } = useGeoTIFFStore();
  const point = clicked ?? { lat: 22.9, lng: 79.1 };

  const handleTabClick = (t: "temporal" | "change" | "results" | "metadata" | "log") => {
    setTab(t);
    if (!expanded) {
      onToggleExpand();
    }
  };

  return (
    <div
      className={`flex shrink-0 flex-col border-t border-border bg-[var(--surface-0)] transition-[height] duration-300 ease-in-out overflow-hidden shadow-[0_-2px_10px_rgba(0,0,0,0.06)] relative z-20 ${
        expanded ? "h-72" : "h-10"
      }`}
    >
      {/* Tab Header / Compact Handle Bar */}
      <div className="flex h-10 shrink-0 items-center justify-between border-b border-border px-3 bg-[var(--surface-1)]">
        <div className="flex items-center gap-1">
          <TabBtn
            active={tab === "temporal"}
            onClick={() => handleTabClick("temporal")}
            icon={BarChart3}
          >
            Temporal Analytics
          </TabBtn>
          <TabBtn
            active={tab === "change"}
            onClick={() => handleTabClick("change")}
            icon={GitCompareArrows}
          >
            Change Detection
          </TabBtn>
          <TabBtn
            active={tab === "results"}
            onClick={() => handleTabClick("results")}
            icon={Sparkles}
          >
            Results Explorer
          </TabBtn>
          <TabBtn
            active={tab === "metadata"}
            onClick={() => handleTabClick("metadata")}
            icon={FileText}
          >
            GeoTIFF Metadata
          </TabBtn>
          <TabBtn active={tab === "log"} onClick={() => handleTabClick("log")} icon={Terminal}>
            Processing Log
            <span className="ml-1.5 rounded bg-primary/20 px-1.5 py-0.5 font-mono text-[9px] text-primary font-bold">
              {logs.length}
            </span>
          </TabBtn>
        </div>

        {/* Right side controls */}
        <div className="flex items-center gap-3">
          {raster ? (
            <span className="hidden sm:flex items-center gap-1.5 font-mono text-[10px] font-bold text-emerald-700 dark:text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/40">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
              <span className="truncate max-w-[140px]">{raster.fileName}</span>
            </span>
          ) : (
            <span className="hidden sm:flex items-center gap-1.5 font-mono text-[10px] text-muted-foreground bg-[var(--surface-2)] px-2 py-0.5 rounded border border-border">
              <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/40" />
              No NDVI raster loaded
            </span>
          )}

          <button
            onClick={onToggleExpand}
            aria-label={expanded ? "Collapse analysis panel" : "Open analysis panel"}
            title={expanded ? "Collapse analysis panel" : "Open analysis panel"}
            className="flex items-center gap-1 rounded-md border border-border bg-[var(--surface-0)] px-2.5 py-1 font-mono text-xs text-foreground hover:bg-primary/15 hover:text-primary transition focus:outline-none focus:ring-1 focus:ring-primary cursor-pointer shadow-sm font-semibold"
          >
            <span className="text-[11px] font-bold hidden md:inline">
              {expanded ? "Collapse" : raster ? "Open Analysis" : "Toggle Panel"}
            </span>
            {expanded ? (
              <ChevronDown className="h-3.5 w-3.5 text-primary" />
            ) : (
              <ChevronUp className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
            )}
          </button>
        </div>
      </div>

      {/* Expanded Content Area */}
      {expanded && (
        <div className="min-h-0 flex-1 overflow-auto p-3 bg-[var(--background)]">
          {tab === "temporal" && <TemporalPanel lat={point.lat} lng={point.lng} />}
          {tab === "change" && <ChangePanel />}
          {tab === "results" && (
            <ResultsPanel
              onOpenResult={onOpenResult}
              onExportGeoTIFF={onExportGeoTIFF}
              onViewResultGauge={onViewResultGauge}
              jobResults={jobResults}
              onOpenResultInViewer={onOpenResultInViewer}
              onDownloadResult={onDownloadResult}
            />
          )}
          {tab === "metadata" && <MetadataPanel />}
          {tab === "log" && <LogConsole logs={logs} />}
        </div>
      )}
    </div>
  );
}

function TabBtn({
  active,
  onClick,
  icon: Icon,
  children,
}: {
  active: boolean;
  onClick: () => void;
  icon: typeof BarChart3;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1.5 border-b-2 px-3 py-2 text-xs font-bold transition cursor-pointer ${
        active
          ? "border-primary text-foreground bg-[var(--surface-0)] shadow-sm"
          : "border-transparent text-muted-foreground hover:text-foreground"
      }`}
    >
      <Icon className="h-3.5 w-3.5" />
      {children}
    </button>
  );
}

function TemporalPanel({ lat, lng }: { lat: number; lng: number }) {
  const { raster } = useGeoTIFFStore();

  if (!raster) {
    return (
      <div className="glass-panel h-full rounded-xl p-6 bg-[var(--surface-0)] border border-border flex flex-col items-center justify-center text-center gap-2 font-mono text-xs">
        <BarChart3 className="h-8 w-8 text-muted-foreground/60" />
        <div className="text-sm font-bold text-foreground">Temporal Phenology Timeline</div>
        <div className="text-muted-foreground max-w-md">
          Multiple dated NDVI rasters are required for temporal analysis. Load or process
          multi-temporal GeoTIFF datasets to generate phenology time-series.
        </div>
      </div>
    );
  }

  return (
    <div className="grid h-full gap-3 grid-cols-1 lg:grid-cols-[1fr_360px]">
      <div className="glass-panel flex h-full min-h-0 flex-col rounded-xl p-4 bg-[var(--surface-0)] border border-border justify-center font-mono space-y-3">
        <div className="flex items-center gap-3">
          <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-emerald-500/20 text-emerald-600 dark:text-emerald-400">
            <BarChart3 className="h-5 w-5" />
          </div>
          <div>
            <div className="text-xs font-bold text-foreground">Single-Date NDVI Product Loaded</div>
            <div className="text-[11px] text-muted-foreground font-medium">{raster.fileName}</div>
          </div>
        </div>

        <div className="rounded-lg border border-border bg-[var(--surface-1)] p-3 text-xs text-muted-foreground space-y-2">
          <p>
            <strong className="text-foreground">Requirement Note:</strong> Multiple dated NDVI
            rasters are required for temporal analysis, monthly phenology trends, and multi-year
            comparison.
          </p>
          <p className="text-[11px]">
            Use <strong className="text-foreground">Crop Health Classification</strong> on the right
            to inspect single-date scientific index statistics derived from{" "}
            <code className="text-primary">{raster.fileName}</code>.
          </p>
        </div>
      </div>

      <CropHealthGauge />
    </div>
  );
}

function ChangePanel() {
  return (
    <div className="glass-panel h-full rounded-xl p-6 bg-[var(--surface-0)] border border-border flex flex-col items-center justify-center text-center gap-2 font-mono text-xs">
      <GitCompareArrows className="h-8 w-8 text-muted-foreground/60" />
      <div className="text-sm font-bold text-foreground">Change Detection Unavailable</div>
      <div className="text-muted-foreground max-w-md">
        Multiple dated NDVI rasters are required for temporal analysis and change detection (target
        minus reference index delta). Load multi-date GeoTIFF rasters to compute pixel index deltas.
      </div>
    </div>
  );
}
function ResultsPanel({
  jobResults = [],
  onOpenResultInViewer,
  onDownloadResult,
  onOpenResult,
  onExportGeoTIFF,
  onViewResultGauge,
}: {
  jobResults?: any[];
  onOpenResultInViewer?: (res: any) => void;
  onDownloadResult?: (res: any) => void;
  onOpenResult?: (name: string, year: number) => void;
  onExportGeoTIFF?: (name: string) => void;
  onViewResultGauge?: (name: string) => void;
}) {
  const { raster, zoomTrigger } = useGeoTIFFStore();

  if (!raster && jobResults.length === 0) {
    return (
      <div className="glass-panel h-full rounded-xl p-6 bg-[var(--surface-0)] border border-border flex flex-col items-center justify-center text-center gap-2 font-mono text-xs">
        <Sparkles className="h-8 w-8 text-muted-foreground/60" />
        <div className="text-sm font-bold text-foreground">No Result Layers Available</div>
        <div className="text-muted-foreground max-w-md">
          No backend-generated or local result layers available yet. Load an NDVI GeoTIFF file or
          run NDVI Generation to create raster result layers.
        </div>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3 font-mono text-xs">
      {/* Backend Job Results */}
      {jobResults.map((res) => {
        const sizeMB = (res.size_bytes / (1024 * 1024)).toFixed(2);
        return (
          <div
            key={res.result_id}
            className="glass-panel overflow-hidden rounded-xl bg-[var(--surface-0)] border border-primary/40 shadow-md font-mono"
          >
            <div className="relative h-12 w-full bg-[var(--surface-1)] border-b border-border flex items-center justify-between px-3">
              <span className="rounded bg-primary/20 px-2 py-0.5 text-[10px] font-bold text-primary border border-primary/40">
                {res.category}
              </span>
              <span className="text-[10px] text-muted-foreground font-bold">{sizeMB} MB</span>
            </div>
            <div className="p-3 space-y-2">
              <div className="text-xs font-bold text-foreground truncate" title={res.filename}>
                {res.filename}
              </div>
              <div className="text-[10px] text-muted-foreground truncate font-mono">
                /{res.relative_path}
              </div>

              <div className="pt-2 flex items-center gap-1.5">
                <button
                  onClick={() => onOpenResultInViewer?.(res)}
                  className="flex-1 rounded-md bg-primary text-primary-foreground px-2.5 py-1.5 text-xs font-bold hover:bg-primary/90 transition flex items-center justify-center gap-1 cursor-pointer shadow-sm"
                >
                  <MapIcon className="h-3.5 w-3.5" />
                  Open in Viewer
                </button>
                <button
                  onClick={() => onDownloadResult?.(res)}
                  className="rounded-md border border-border bg-[var(--surface-1)] px-2.5 py-1.5 text-xs font-bold text-foreground hover:bg-[var(--surface-2)] transition flex items-center justify-center gap-1 cursor-pointer"
                  title="Direct browser download"
                >
                  <Download className="h-3.5 w-3.5" />
                  Download
                </button>
              </div>
            </div>
          </div>
        );
      })}

      {/* Active Local GeoTIFF Card */}
      {raster && (
        <div className="glass-panel overflow-hidden rounded-xl bg-[var(--surface-0)] border border-emerald-500/40 shadow-lg font-mono">
          <div className="relative h-12 w-full bg-[var(--surface-1)] border-b border-border flex items-center justify-between px-3">
            <span className="rounded bg-emerald-500/20 px-2 py-0.5 text-[10px] font-bold text-emerald-600 dark:text-emerald-400 border border-emerald-500/40">
              Active Map Raster
            </span>
            <span className="text-[10px] text-muted-foreground font-bold">{raster.crs}</span>
          </div>
          <div className="p-3">
            <div className="text-xs font-bold text-foreground truncate" title={raster.fileName}>
              {raster.fileName}
            </div>
            <div className="text-[10px] text-muted-foreground font-medium mt-0.5">
              {(raster.fileSize / (1024 * 1024)).toFixed(2)} MB · {raster.width} × {raster.height} px
            </div>
            <div className="mt-2 grid grid-cols-2 gap-1 text-[10px]">
              <MiniField label="Mean NDVI" value={raster.statistics.mean.toFixed(3)} />
              <MiniField
                label="Veg Coverage"
                value={`${raster.statistics.vegetationPercentage.toFixed(1)}%`}
              />
            </div>
            <div className="mt-3 flex items-center gap-1.5">
              <button
                onClick={() => useGeoTIFFStore.setState({ zoomTrigger: zoomTrigger + 1 })}
                className="flex-1 rounded-md bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border border-emerald-500/40 px-2 py-1.5 text-xs font-bold hover:bg-emerald-500/30 transition flex items-center justify-center gap-1 cursor-pointer"
              >
                <MapIcon className="h-3.5 w-3.5" />
                Zoom to Bounds
              </button>
              <button
                onClick={() => onExportGeoTIFF && onExportGeoTIFF(raster.fileName)}
                className="rounded-md bg-[var(--surface-1)] border border-border px-2.5 py-1.5 text-xs font-bold text-foreground hover:bg-[var(--surface-2)] transition flex items-center justify-center gap-1 cursor-pointer"
              >
                <Download className="h-3.5 w-3.5" />
                Export
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function MiniField({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded bg-[var(--surface-1)] border border-border px-1.5 py-1">
      <div className="text-[8px] font-bold uppercase text-muted-foreground">{label}</div>
      <div className="text-foreground font-semibold">{value}</div>
    </div>
  );
}

/* ---------------- Log Console ---------------- */

function LogConsole({ logs }: { logs: LogEntry[] }) {
  const colorFor = (l: LogLevel) =>
    l === "SUCCESS"
      ? "text-[var(--success)]"
      : l === "ERROR"
        ? "text-[var(--destructive)]"
        : l === "WARN"
          ? "text-[var(--warning)]"
          : "text-[var(--info)]";
  return (
    <div className="glass-panel h-full overflow-hidden rounded-xl bg-[var(--surface-0)] border border-border shadow-[0_2px_8px_rgba(0,0,0,0.06)]">
      <div className="flex items-center justify-between border-b border-border px-3 py-1.5 bg-[var(--surface-1)]">
        <div className="flex items-center gap-2 text-xs">
          <Terminal className="h-3.5 w-3.5 text-primary" />
          <span className="font-bold text-foreground">Processing Log</span>
          <span className="font-mono text-[10px] text-muted-foreground font-medium">
            bhudrishti-engine :: session #4218
          </span>
        </div>
        <div className="flex items-center gap-1.5 font-mono text-[10px] text-muted-foreground font-semibold">
          <Activity className="h-3 w-3 text-[var(--success)]" />
          streaming
        </div>
      </div>
      <div className="h-[calc(100%-2.2rem)] overflow-y-auto p-3 font-mono text-[11px] leading-relaxed">
        {logs.map((l) => (
          <div key={l.id} className="flex gap-3 animate-ticker">
            <span className="shrink-0 text-muted-foreground font-medium">{l.time}</span>
            <span className={`w-14 shrink-0 font-bold ${colorFor(l.level)}`}>{l.level}</span>
            <span className="text-foreground font-medium">{l.msg}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
