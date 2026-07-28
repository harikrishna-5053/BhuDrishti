import { useMemo } from "react";

import {
  Activity,
  BarChart3,
  ChevronDown,
  ChevronUp,
  Download,
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

import { monthlyTimeline } from "@/lib/ndvi";

import { formatCoord } from "@/lib/geo-format";

import type { LogEntry, LogLevel } from "@/lib/types";

import { useGeoTIFFStore } from "@/stores/geotiff-store";

import CropHealthGauge from "./CropHealthGauge";

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
}: {
  expanded: boolean;
  onToggleExpand: () => void;
  tab: "temporal" | "change" | "results" | "log";
  setTab: (t: "temporal" | "change" | "results" | "log") => void;
  logs: LogEntry[];
  compareA: number;
  compareB: number;
  setCompareA: (y: number) => void;
  setCompareB: (y: number) => void;
  clicked: { lat: number; lng: number } | null;
  onOpenResult?: (name: string, year: number) => void;
  onExportGeoTIFF?: (name: string) => void;
  onViewResultGauge?: (name: string) => void;
}) {
  const { raster } = useGeoTIFFStore();
  const point = clicked ?? { lat: 22.9, lng: 79.1 };

  return (
    <div
      className={`flex shrink-0 flex-col border-t border-border bg-[var(--surface-0)] transition-[height] duration-300 ease-in-out overflow-hidden shadow-[0_-2px_10px_rgba(0,0,0,0.06)] relative z-20 ${
        expanded ? "h-72" : "h-10"
      }`}
    >
      {/* Tab Header / Compact Handle Bar */}
      <div className="flex h-10 shrink-0 items-center justify-between border-b border-border px-3 bg-[var(--surface-1)]">
        <div className="flex items-center gap-1">
          <TabBtn active={tab === "temporal"} onClick={() => setTab("temporal")} icon={BarChart3}>
            Temporal Analytics
          </TabBtn>
          <TabBtn
            active={tab === "change"}
            onClick={() => setTab("change")}
            icon={GitCompareArrows}
          >
            Change Detection
          </TabBtn>
          <TabBtn active={tab === "results"} onClick={() => setTab("results")} icon={Sparkles}>
            Results Explorer
          </TabBtn>
          <TabBtn active={tab === "log"} onClick={() => setTab("log")} icon={Terminal}>
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
          {tab === "change" && (
            <ChangePanel
              lat={point.lat}
              lng={point.lng}
              a={compareA}
              b={compareB}
              setA={setCompareA}
              setB={setCompareB}
            />
          )}
          {tab === "results" && (
            <ResultsPanel
              onOpenResult={onOpenResult}
              onExportGeoTIFF={onExportGeoTIFF}
              onViewResultGauge={onViewResultGauge}
            />
          )}
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

  const data = useMemo(() => {
    return monthlyTimeline(lat, lng, 2026).map((d) => ({
      month: d.month,
      ndvi: d.ndvi,
    }));
  }, [lat, lng]);

  return (
    <div
      className={`grid h-full gap-3 ${raster ? "grid-cols-1 lg:grid-cols-[1fr_360px]" : "grid-cols-1"}`}
    >
      <div className="glass-panel flex h-full min-h-0 flex-col rounded-xl p-3 bg-[var(--surface-0)] border border-border shadow-[0_2px_8px_rgba(0,0,0,0.06)]">
        <div className="mb-2 flex items-center justify-between">
          <div>
            <div className="text-xs font-bold text-foreground">Monthly NDVI Phenology Timeline</div>
            <div className="font-mono text-[10px] text-muted-foreground font-medium">
              {formatCoord(lat, "lat")} · {formatCoord(lng, "lng")}
            </div>
          </div>
          <div className="flex items-center gap-1.5 font-mono text-[10px] text-muted-foreground font-medium">
            <span className="h-2 w-2 rounded-full bg-primary shadow-[0_0_6px_var(--color-primary)]" />
            Active Phenology
          </div>
        </div>
        <div className="min-h-0 flex-1">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ top: 4, right: 12, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
              <XAxis
                dataKey="month"
                tick={{ fill: "var(--color-muted-foreground)", fontSize: 10 }}
                stroke="var(--color-border)"
              />
              <YAxis
                domain={[-0.1, 0.9]}
                tick={{ fill: "var(--color-muted-foreground)", fontSize: 10 }}
                stroke="var(--color-border)"
              />
              <Tooltip
                contentStyle={{
                  background: "var(--surface-0)",
                  color: "var(--color-foreground)",
                  border: "1px solid var(--color-border)",
                  borderRadius: 8,
                  fontSize: 11,
                  fontFamily: "JetBrains Mono",
                  boxShadow: "0 4px 12px rgba(0,0,0,0.1)",
                }}
              />
              <Line
                type="monotone"
                dataKey="ndvi"
                stroke="var(--color-primary)"
                strokeWidth={2.5}
                dot={{ r: 3 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {raster && <CropHealthGauge />}
    </div>
  );
}

function ChangePanel({
  lat,
  lng,
  a,
  b,
  setA,
  setB,
}: {
  lat: number;
  lng: number;
  a: number;
  b: number;
  setA: (y: number) => void;
  setB: (y: number) => void;
}) {
  const data = useMemo(() => {
    return monthlyTimeline(lat, lng, a).map((d, i) => {
      const bv = monthlyTimeline(lat, lng, b)[i]!.ndvi;
      return { month: d.month, delta: bv - d.ndvi };
    });
  }, [lat, lng, a, b]);

  return (
    <div className="grid h-full grid-cols-1 gap-3 lg:grid-cols-[260px_1fr]">
      <div className="glass-panel rounded-xl p-3 flex flex-col justify-between bg-[var(--surface-0)] border border-border shadow-[0_2px_8px_rgba(0,0,0,0.06)]">
        <div>
          <div className="mb-2 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
            Compare Reference
          </div>
          <div className="space-y-2">
            <YearPicker label="Reference (A)" value={a} onChange={setA} />
            <YearPicker label="Target (B)" value={b} onChange={setB} />
          </div>
        </div>
        <div className="font-mono text-[10px] text-muted-foreground border-t border-border pt-2 font-medium">
          Calculates pixel-by-pixel vegetation index delta between target periods.
        </div>
      </div>

      <div className="glass-panel flex min-h-0 flex-col rounded-xl p-3 bg-[var(--surface-0)] border border-border shadow-[0_2px_8px_rgba(0,0,0,0.06)]">
        <div className="mb-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
          Monthly Delta Trend ({a} → {b})
        </div>
        <div className="min-h-0 flex-1">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data} margin={{ top: 4, right: 4, left: -25, bottom: 0 }}>
              <defs>
                <linearGradient id="pos" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--success)" stopOpacity={0.6} />
                  <stop offset="100%" stopColor="var(--success)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
              <XAxis
                dataKey="month"
                tick={{ fill: "var(--color-muted-foreground)", fontSize: 9 }}
                stroke="var(--color-border)"
              />
              <YAxis
                tick={{ fill: "var(--color-muted-foreground)", fontSize: 9 }}
                stroke="var(--color-border)"
              />
              <Tooltip
                contentStyle={{
                  background: "var(--surface-0)",
                  color: "var(--color-foreground)",
                  border: "1px solid var(--color-border)",
                  borderRadius: 8,
                  fontSize: 11,
                  boxShadow: "0 4px 12px rgba(0,0,0,0.1)",
                }}
              />
              <ReferenceLine y={0} stroke="var(--color-border)" />
              <Area
                type="monotone"
                dataKey="delta"
                stroke="var(--success)"
                fill="url(#pos)"
                strokeWidth={2}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}

function YearPicker({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (y: number) => void;
}) {
  return (
    <div>
      <div className="mb-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      <div className="flex rounded-md border border-border bg-[var(--surface-1)] p-0.5">
        {[2024, 2025, 2026].map((y) => (
          <button
            key={y}
            onClick={() => onChange(y)}
            className={`flex-1 rounded px-2 py-1 font-mono text-xs transition cursor-pointer ${
              y === value
                ? "bg-primary text-primary-foreground font-bold shadow-sm"
                : "text-muted-foreground hover:text-foreground font-medium"
            }`}
          >
            {y}
          </button>
        ))}
      </div>
    </div>
  );
}

/* ---------------- Results Explorer ---------------- */

const RESULTS = [
  {
    id: "r1",
    name: "NDVI Mosaic · Jan 2026",
    date: "2026-01-31",
    tile: "T44QMG + 3",
    resolution: "10 m",
    projection: "EPSG:4326",
    stats: { mean: 0.61, coverage: "98%" },
    year: 2026,
  },
  {
    id: "r2",
    name: "NDVI Mosaic · Q4 2025",
    date: "2025-12-30",
    tile: "T43PGR + 5",
    resolution: "10 m",
    projection: "EPSG:4326",
    stats: { mean: 0.48, coverage: "94%" },
    year: 2025,
  },
  {
    id: "r3",
    name: "Change Map 2025→2026",
    date: "2026-02-02",
    tile: "IN·subset",
    resolution: "30 m",
    projection: "EPSG:4326",
    stats: { mean: 0.13, coverage: "100%" },
    year: 2026,
  },
];

function ResultsPanel({
  onOpenResult,
  onExportGeoTIFF,
  onViewResultGauge,
}: {
  onOpenResult?: (name: string, year: number) => void;
  onExportGeoTIFF?: (name: string) => void;
  onViewResultGauge?: (name: string) => void;
}) {
  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
      {RESULTS.map((r) => (
        <div
          key={r.id}
          className="glass-panel overflow-hidden rounded-xl bg-[var(--surface-0)] border border-border shadow-[0_2px_8px_rgba(0,0,0,0.06)]"
        >
          <div
            className="relative h-20 w-full"
            style={{
              background:
                r.id === "r3"
                  ? "linear-gradient(135deg, oklch(0.55 0.2 30), oklch(0.7 0.03 250), oklch(0.55 0.2 150))"
                  : "var(--gradient-ndvi)",
            }}
          >
            <div className="absolute inset-0 scan-line" />
            <div className="absolute right-2 top-2 rounded bg-black/50 px-1.5 py-0.5 font-mono text-[9px] font-bold uppercase text-white backdrop-blur border border-white/20">
              {r.year}
            </div>
          </div>
          <div className="p-3 font-mono">
            <div className="text-sm font-bold text-foreground">{r.name}</div>
            <div className="text-[10px] text-muted-foreground font-medium">
              {r.date} · {r.tile}
            </div>
            <div className="mt-2 grid grid-cols-2 gap-1.5 text-[10px]">
              <MiniField label="Resolution" value={r.resolution} />
              <MiniField label="Projection" value={r.projection} />
              <MiniField label="Mean NDVI" value={r.stats.mean.toFixed(2)} />
              <MiniField label="Coverage" value={r.stats.coverage} />
            </div>
            <div className="mt-3 flex items-center gap-1.5">
              <button
                onClick={() => onOpenResult && onOpenResult(r.name, r.year)}
                className="flex-1 rounded-md bg-primary/15 px-2 py-1.5 text-xs font-bold text-primary hover:bg-primary/25 transition flex items-center justify-center gap-1 border border-primary/30 cursor-pointer"
                title="Load raster result on map"
              >
                <MapIcon className="h-3 w-3" />
                Open
              </button>
              <button
                onClick={() => onExportGeoTIFF && onExportGeoTIFF(r.name)}
                className="flex-1 rounded-md bg-[var(--surface-1)] border border-border px-2 py-1.5 text-xs font-bold text-foreground hover:bg-[var(--surface-2)] transition flex items-center justify-center gap-1 cursor-pointer"
                title="Export GeoTIFF file"
              >
                <Download className="h-3 w-3" />
                GeoTIFF
              </button>
              <button
                onClick={() => onViewResultGauge && onViewResultGauge(r.name)}
                className="rounded-md bg-[var(--surface-1)] border border-border p-1.5 text-xs text-muted-foreground hover:text-foreground transition cursor-pointer"
                title="View band statistics"
              >
                <Gauge className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        </div>
      ))}
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
