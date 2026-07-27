import { createFileRoute } from "@tanstack/react-router";
import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import {
  Activity,
  ArrowUpRight,
  BarChart3,
  ChevronLeft,
  ChevronRight,
  Compass,
  Database,
  Download,
  Eye,
  EyeOff,
  FolderOpen,
  Gauge,
  GitCompareArrows,
  Globe2,
  Layers,
  Leaf,
  Map as MapIcon,
  Play,
  Ruler,
  Satellite,
  Settings2,
  Sparkles,
  Terminal,
  Upload,
  X,
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

import {
  classify,
  localStats,
  monthlyTimeline,
  ndviAt,
  ndviColor,
  seasonalBreakdown,
  type VegClass,
} from "@/lib/ndvi";
import type { LayerState } from "@/components/gis/GISMap";

const GISMap = lazy(() => import("@/components/gis/GISMap"));

function ClientOnly({ children, fallback }: { children: React.ReactNode; fallback: React.ReactNode }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return <>{mounted ? children : fallback}</>;
}

export const Route = createFileRoute("/")({
  component: Dashboard,
  head: () => ({
    meta: [
      { title: "BhuDrishti — NDVI Analytics Console" },
      {
        name: "description",
        content:
          "Interactive Sentinel-2 NDVI console: layer manager, point analysis, temporal analytics and change detection for the Indian subcontinent.",
      },
    ],
  }),
});

type LogLevel = "INFO" | "SUCCESS" | "WARN" | "ERROR";
type LogEntry = { id: number; time: string; level: LogLevel; msg: string };

type WorkspaceItem = {
  id: string;
  name: string;
  date: string;
  tile: string;
  cloud: number;
};

const INITIAL_LAYERS: LayerState = {
  ndvi: { visible: true, opacity: 0.75 },
  rgb: { visible: true, opacity: 0.55 },
  india: { visible: true, opacity: 0.9 },
  states: { visible: true, opacity: 0.55 },
  districts: { visible: false, opacity: 0.4 },
  custom: { visible: false, opacity: 0.7 },
};

const LAYER_META: {
  key: keyof LayerState;
  label: string;
  hint: string;
  swatch: string;
}[] = [
  { key: "ndvi", label: "NDVI Raster", hint: "S2 L2A · 10 m", swatch: "var(--gradient-ndvi)" },
  { key: "rgb", label: "RGB Satellite Imagery", hint: "Basemap · OSM", swatch: "linear-gradient(135deg,#3a4a6b,#7a8ba8)" },
  { key: "india", label: "India Boundary", hint: "Admin 0", swatch: "oklch(0.78 0.17 195)" },
  { key: "states", label: "State Boundaries", hint: "Admin 1", swatch: "oklch(0.75 0.13 90)" },
  { key: "districts", label: "District Boundaries", hint: "Admin 2", swatch: "oklch(0.7 0.05 250)" },
  { key: "custom", label: "Custom Analysis Layer", hint: "User AOI", swatch: "oklch(0.75 0.18 300)" },
];

const DATASETS: WorkspaceItem[] = [
  { id: "S2B_T44QMG_20260118", name: "S2B_MSIL2A_T44QMG", date: "2026-01-18", tile: "T44QMG", cloud: 3 },
  { id: "S2A_T43PGR_20251221", name: "S2A_MSIL2A_T43PGR", date: "2025-12-21", tile: "T43PGR", cloud: 8 },
  { id: "S2B_T45QUE_20251108", name: "S2B_MSIL2A_T45QUE", date: "2025-11-08", tile: "T45QUE", cloud: 12 },
  { id: "S2A_T44RLQ_20250924", name: "S2A_MSIL2A_T44RLQ", date: "2025-09-24", tile: "T44RLQ", cloud: 21 },
];

const PROJECTS = [
  { id: "prj-ganga", name: "Ganga Basin Vegetation", tiles: 128, updated: "2h ago" },
  { id: "prj-wg", name: "Western Ghats Monitoring", tiles: 84, updated: "1d ago" },
  { id: "prj-thar", name: "Thar Desertification", tiles: 46, updated: "3d ago" },
];

const PIPELINE = [
  { id: "preproc", label: "Sentinel-2 Preprocessing", icon: Satellite, hint: "Atmospheric · cloud mask" },
  { id: "ndvi", label: "NDVI Generation", icon: Leaf, hint: "(NIR − Red) / (NIR + Red)" },
  { id: "mosaic", label: "Periodic Mosaic", icon: Layers, hint: "Median composite" },
  { id: "export", label: "Export GeoTIFF", icon: Download, hint: "COG · EPSG:4326" },
];

function Dashboard() {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [layers, setLayers] = useState<LayerState>(INITIAL_LAYERS);
  const [year, setYear] = useState<number>(2026);
  const [cursor, setCursor] = useState<{ lat: number; lng: number; zoom: number }>({
    lat: 22.5,
    lng: 82,
    zoom: 5,
  });
  const [clicked, setClicked] = useState<{ lat: number; lng: number } | null>({
    lat: 22.9,
    lng: 79.1,
  });
  const [bottomTab, setBottomTab] = useState<
    "temporal" | "change" | "results" | "log"
  >("temporal");
  const [compareA, setCompareA] = useState(2025);
  const [compareB, setCompareB] = useState(2026);
  const [logs, setLogs] = useState<LogEntry[]>([
    { id: 1, time: "10:42:11", level: "INFO", msg: "Reading Sentinel-2 dataset S2B_T44QMG_20260118" },
    { id: 2, time: "10:42:14", level: "INFO", msg: "Applying Sen2Cor atmospheric correction" },
    { id: 3, time: "10:42:47", level: "SUCCESS", msg: "NDVI generated for tile T44QMG (10 m, EPSG:4326)" },
    { id: 4, time: "10:43:02", level: "INFO", msg: "Compositing periodic median mosaic (Jan 2026)" },
    { id: 5, time: "10:43:35", level: "SUCCESS", msg: "Mosaic completed · 4 tiles merged · 1.2 GB" },
    { id: 6, time: "10:44:01", level: "WARN", msg: "Tile T45QUE has 12% cloud cover — masked pixels excluded" },
  ]);

  const pushLog = (level: LogLevel, msg: string) => {
    setLogs((prev) => [
      ...prev,
      {
        id: prev.length + 1,
        time: new Date().toLocaleTimeString("en-GB"),
        level,
        msg,
      },
    ]);
  };

  const handleClick = (lat: number, lng: number) => {
    setClicked({ lat, lng });
    pushLog(
      "INFO",
      `Point analysis: ${lat.toFixed(4)}°, ${lng.toFixed(4)}° · NDVI=${ndviAt(lat, lng, year).toFixed(3)}`,
    );
  };

  return (
    <div className="flex h-screen w-full flex-col overflow-hidden bg-background text-foreground">
      <TopBar cursor={cursor} year={year} setYear={setYear} />
      <div className="flex min-h-0 flex-1">
        <Sidebar
          open={sidebarOpen}
          onToggle={() => setSidebarOpen((v) => !v)}
          layers={layers}
          setLayers={setLayers}
          onPushLog={pushLog}
        />
        <main className="flex min-w-0 flex-1 flex-col">
          <div className="relative flex min-h-0 flex-1">
            <div className="relative flex-1">
              <ClientOnly fallback={<MapLoading />}>
                <Suspense fallback={<MapLoading />}>
                  <GISMap
                  layers={layers}
                  year={year}
                  clicked={clicked}
                  onClick={handleClick}
                  onCursor={(lat, lng, zoom) => setCursor({ lat, lng, zoom })}
                  />
                </Suspense>
              </ClientOnly>
              <MapOverlays cursor={cursor} year={year} />
            </div>
            {clicked && (
              <PointAnalysisPanel
                lat={clicked.lat}
                lng={clicked.lng}
                year={year}
                onClose={() => setClicked(null)}
              />
            )}
          </div>
          <BottomPane
            tab={bottomTab}
            setTab={setBottomTab}
            logs={logs}
            compareA={compareA}
            compareB={compareB}
            setCompareA={setCompareA}
            setCompareB={setCompareB}
            clicked={clicked}
          />
        </main>
      </div>
    </div>
  );
}

/* ---------------- Top Bar ---------------- */

function TopBar({
  cursor,
  year,
  setYear,
}: {
  cursor: { lat: number; lng: number; zoom: number };
  year: number;
  setYear: (y: number) => void;
}) {
  return (
    <header className="flex h-14 shrink-0 items-center justify-between border-b border-border bg-[var(--surface-0)] px-4">
      <div className="flex items-center gap-3">
        <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-primary text-primary-foreground shadow-[0_0_16px_oklch(0.78_0.17_168_/_40%)]">
          <Globe2 className="h-5 w-5" />
        </div>
        <div className="leading-tight">
          <div className="flex items-center gap-2">
            <span className="text-base font-semibold tracking-tight">BhuDrishti</span>
            <span className="rounded border border-border bg-[var(--surface-2)] px-1.5 py-0.5 font-mono text-[10px] uppercase text-muted-foreground">
              v2.4 · L2A
            </span>
          </div>
          <span className="text-[11px] text-muted-foreground">
            Sentinel-2 NDVI Analytics · India Node
          </span>
        </div>
      </div>

      <div className="hidden items-center gap-2 md:flex">
        <div className="flex items-center gap-1 rounded-md border border-border bg-[var(--surface-1)] p-1">
          {[2024, 2025, 2026].map((y) => (
            <button
              key={y}
              onClick={() => setYear(y)}
              className={`rounded px-3 py-1 font-mono text-xs transition ${
                y === year
                  ? "bg-primary text-primary-foreground shadow-[var(--shadow-glow)]"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {y}
            </button>
          ))}
        </div>
        <IconBtn icon={Ruler} label="Measure" />
        <IconBtn icon={GitCompareArrows} label="Swipe compare" />
        <IconBtn icon={Settings2} label="Settings" />
      </div>

      <div className="flex items-center gap-3 font-mono text-[11px] text-muted-foreground">
        <span className="hidden md:inline">CRS: EPSG:4326</span>
        <span className="hidden md:inline">|</span>
        <span>
          {formatCoord(cursor.lat, "lat")} , {formatCoord(cursor.lng, "lng")}
        </span>
        <span className="rounded bg-[var(--surface-2)] px-2 py-0.5">
          z {cursor.zoom.toFixed(0)}
        </span>
        <span className="hidden items-center gap-1.5 rounded-full border border-border bg-[var(--surface-1)] px-2 py-1 md:flex">
          <span className="h-1.5 w-1.5 rounded-full bg-[var(--success)] shadow-[0_0_6px_var(--success)]" />
          Engine online
        </span>
      </div>
    </header>
  );
}

function IconBtn({ icon: Icon, label }: { icon: typeof Ruler; label: string }) {
  return (
    <button
      title={label}
      className="grid h-8 w-8 place-items-center rounded-md border border-border bg-[var(--surface-1)] text-muted-foreground transition hover:border-primary/60 hover:text-primary"
    >
      <Icon className="h-4 w-4" />
    </button>
  );
}

function formatCoord(v: number, kind: "lat" | "lng") {
  const dir =
    kind === "lat" ? (v >= 0 ? "N" : "S") : v >= 0 ? "E" : "W";
  return `${Math.abs(v).toFixed(4)}° ${dir}`;
}

/* ---------------- Sidebar ---------------- */

function Sidebar({
  open,
  onToggle,
  layers,
  setLayers,
  onPushLog,
}: {
  open: boolean;
  onToggle: () => void;
  layers: LayerState;
  setLayers: React.Dispatch<React.SetStateAction<LayerState>>;
  onPushLog: (level: LogLevel, msg: string) => void;
}) {
  return (
    <aside
      className={`relative flex shrink-0 flex-col border-r border-border bg-[var(--surface-0)] transition-[width] duration-300 ease-out ${
        open ? "w-[340px]" : "w-14"
      }`}
    >
      <button
        onClick={onToggle}
        className="absolute -right-3 top-6 z-10 grid h-6 w-6 place-items-center rounded-full border border-border bg-[var(--surface-2)] text-muted-foreground shadow-md hover:text-primary"
      >
        {open ? <ChevronLeft className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
      </button>

      {open ? (
        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4">
          <WorkspaceSection onPushLog={onPushLog} />
          <ProcessingSection onPushLog={onPushLog} />
          <LayerManagerSection layers={layers} setLayers={setLayers} />
        </div>
      ) : (
        <div className="flex flex-1 flex-col items-center gap-4 pt-6">
          {[FolderOpen, Play, Layers].map((Icon, i) => (
            <button
              key={i}
              className="grid h-9 w-9 place-items-center rounded-md text-muted-foreground hover:bg-[var(--surface-2)] hover:text-primary"
            >
              <Icon className="h-4 w-4" />
            </button>
          ))}
        </div>
      )}
    </aside>
  );
}

function SectionHeader({
  icon: Icon,
  title,
  count,
}: {
  icon: typeof FolderOpen;
  title: string;
  count?: string;
}) {
  return (
    <div className="mb-2 flex items-center justify-between">
      <div className="flex items-center gap-2">
        <div className="grid h-6 w-6 place-items-center rounded bg-[var(--surface-2)] text-primary">
          <Icon className="h-3.5 w-3.5" />
        </div>
        <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          {title}
        </span>
      </div>
      {count && (
        <span className="font-mono text-[10px] text-muted-foreground">{count}</span>
      )}
    </div>
  );
}

function WorkspaceSection({ onPushLog }: { onPushLog: (l: LogLevel, m: string) => void }) {
  const [activeProject, setActiveProject] = useState(PROJECTS[0].id);
  return (
    <section className="glass-panel rounded-xl p-3">
      <SectionHeader icon={FolderOpen} title="Workspace" count="3 projects" />
      <button
        onClick={() => onPushLog("INFO", "Upload dialog opened for Sentinel-2 dataset")}
        className="mb-3 flex w-full items-center gap-2 rounded-lg border border-dashed border-primary/40 bg-primary/10 px-3 py-2.5 text-xs text-primary transition hover:bg-primary/15"
      >
        <Upload className="h-3.5 w-3.5" />
        <span className="font-medium">Upload Sentinel-2 dataset</span>
        <span className="ml-auto font-mono text-[10px] opacity-70">.SAFE / .zip</span>
      </button>

      <div className="mb-3 space-y-1">
        <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Projects</div>
        {PROJECTS.map((p) => (
          <button
            key={p.id}
            onClick={() => setActiveProject(p.id)}
            className={`flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-xs transition ${
              activeProject === p.id
                ? "bg-primary/15 text-foreground ring-1 ring-primary/40"
                : "text-muted-foreground hover:bg-[var(--surface-2)] hover:text-foreground"
            }`}
          >
            <div className="min-w-0">
              <div className="truncate font-medium">{p.name}</div>
              <div className="font-mono text-[10px] opacity-70">
                {p.tiles} tiles · {p.updated}
              </div>
            </div>
            {activeProject === p.id && (
              <span className="ml-2 h-1.5 w-1.5 rounded-full bg-primary shadow-[0_0_6px_var(--color-primary)]" />
            )}
          </button>
        ))}
      </div>

      <div className="space-y-1">
        <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
          Recent datasets
        </div>
        {DATASETS.map((d) => (
          <div
            key={d.id}
            className="group flex items-center gap-2 rounded-md px-2 py-1.5 text-xs hover:bg-[var(--surface-2)]"
          >
            <Database className="h-3.5 w-3.5 shrink-0 text-accent" />
            <div className="min-w-0 flex-1">
              <div className="truncate font-mono text-[11px]">{d.name}</div>
              <div className="font-mono text-[10px] text-muted-foreground">
                {d.date} · {d.tile} · {d.cloud}% cloud
              </div>
            </div>
            <ArrowUpRight className="h-3.5 w-3.5 opacity-0 transition group-hover:opacity-100" />
          </div>
        ))}
      </div>
    </section>
  );
}

function ProcessingSection({ onPushLog }: { onPushLog: (l: LogLevel, m: string) => void }) {
  const [running, setRunning] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => {
      setProgress((p) => {
        if (p >= 100) {
          clearInterval(t);
          onPushLog("SUCCESS", `${labelFor(running)} completed`);
          setRunning(null);
          return 0;
        }
        return p + 8;
      });
    }, 220);
    return () => clearInterval(t);
  }, [running, onPushLog]);

  const labelFor = (id: string) =>
    PIPELINE.find((p) => p.id === id)?.label ?? id;

  const start = (id: string) => {
    onPushLog("INFO", `${labelFor(id)} started`);
    setRunning(id);
    setProgress(4);
  };

  return (
    <section className="glass-panel rounded-xl p-3">
      <SectionHeader icon={Play} title="Processing Center" count="pipeline" />
      <div className="space-y-1.5">
        {PIPELINE.map((step, i) => {
          const active = running === step.id;
          const Icon = step.icon;
          return (
            <button
              key={step.id}
              onClick={() => start(step.id)}
              disabled={!!running}
              className={`group flex w-full items-center gap-2.5 rounded-lg border px-2.5 py-2 text-left transition ${
                active
                  ? "border-primary/60 bg-primary/10"
                  : "border-transparent bg-[var(--surface-1)] hover:border-border hover:bg-[var(--surface-2)]"
              } ${running && !active ? "opacity-50" : ""}`}
            >
              <div className="grid h-7 w-7 shrink-0 place-items-center rounded-md bg-[var(--surface-2)] font-mono text-[10px] text-muted-foreground">
                {String(i + 1).padStart(2, "0")}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5 text-xs font-medium">
                  <Icon className="h-3.5 w-3.5 text-primary" />
                  <span className="truncate">{step.label}</span>
                </div>
                <div className="font-mono text-[10px] text-muted-foreground">
                  {step.hint}
                </div>
                {active && (
                  <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-[var(--surface-3)]">
                    <div
                      className="h-full rounded-full bg-primary transition-[width] duration-200"
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                )}
              </div>
              <Play className="h-3.5 w-3.5 shrink-0 text-muted-foreground group-hover:text-primary" />
            </button>
          );
        })}
      </div>
    </section>
  );
}

function LayerManagerSection({
  layers,
  setLayers,
}: {
  layers: LayerState;
  setLayers: React.Dispatch<React.SetStateAction<LayerState>>;
}) {
  const [order, setOrder] = useState(LAYER_META.map((l) => l.key));

  const toggle = (k: keyof LayerState) =>
    setLayers((s) => ({ ...s, [k]: { ...s[k], visible: !s[k].visible } }));
  const setOpacity = (k: keyof LayerState, v: number) =>
    setLayers((s) => ({ ...s, [k]: { ...s[k], opacity: v } }));
  const move = (i: number, dir: -1 | 1) => {
    setOrder((prev) => {
      const next = [...prev];
      const j = i + dir;
      if (j < 0 || j >= next.length) return prev;
      [next[i], next[j]] = [next[j]!, next[i]!];
      return next;
    });
  };

  return (
    <section className="glass-panel rounded-xl p-3">
      <SectionHeader icon={Layers} title="Layer Manager" count={`${order.length} layers`} />
      <div className="space-y-1.5">
        {order.map((key, i) => {
          const meta = LAYER_META.find((m) => m.key === key)!;
          const state = layers[key];
          return (
            <div
              key={key}
              className="rounded-lg border border-border bg-[var(--surface-1)] p-2"
            >
              <div className="flex items-center gap-2">
                <button
                  onClick={() => toggle(key)}
                  className={`grid h-6 w-6 place-items-center rounded ${
                    state.visible ? "text-primary" : "text-muted-foreground"
                  }`}
                >
                  {state.visible ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
                </button>
                <div
                  className="h-4 w-4 shrink-0 rounded"
                  style={{ background: meta.swatch }}
                />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-xs font-medium">{meta.label}</div>
                  <div className="font-mono text-[10px] text-muted-foreground">{meta.hint}</div>
                </div>
                <div className="flex flex-col">
                  <button
                    onClick={() => move(i, -1)}
                    className="grid h-3.5 w-4 place-items-center text-muted-foreground hover:text-primary"
                  >
                    <svg viewBox="0 0 8 5" className="h-2 w-2 fill-current">
                      <path d="M4 0 L8 5 L0 5 Z" />
                    </svg>
                  </button>
                  <button
                    onClick={() => move(i, 1)}
                    className="grid h-3.5 w-4 place-items-center text-muted-foreground hover:text-primary"
                  >
                    <svg viewBox="0 0 8 5" className="h-2 w-2 fill-current">
                      <path d="M0 0 L8 0 L4 5 Z" />
                    </svg>
                  </button>
                </div>
              </div>
              <div className="mt-2 flex items-center gap-2">
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={state.opacity}
                  onChange={(e) => setOpacity(key, Number(e.target.value))}
                  className="ndvi-slider h-1 flex-1 cursor-pointer accent-[var(--color-primary)]"
                />
                <span className="w-8 text-right font-mono text-[10px] text-muted-foreground">
                  {Math.round(state.opacity * 100)}%
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

/* ---------------- Map overlays (scale bar, north, legend) ---------------- */

function MapLoading() {
  return (
    <div className="grid h-full w-full place-items-center bg-[var(--surface-0)]">
      <div className="flex items-center gap-3 text-xs text-muted-foreground">
        <div className="h-3 w-3 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        Initialising Earth engine…
      </div>
    </div>
  );
}

function MapOverlays({
  cursor,
  year,
}: {
  cursor: { lat: number; lng: number; zoom: number };
  year: number;
}) {
  const scaleKm = Math.max(1, Math.round(20000 / Math.pow(2, cursor.zoom)));
  return (
    <>
      {/* North arrow */}
      <div className="pointer-events-none absolute left-4 top-4 z-[500] grid h-14 w-14 place-items-center rounded-full border border-border bg-[var(--surface-1)]/80 shadow-lg backdrop-blur">
        <div className="relative flex h-full w-full items-center justify-center">
          <Compass className="h-7 w-7 text-primary" />
          <span className="absolute top-1 font-mono text-[9px] font-bold text-primary">N</span>
        </div>
      </div>

      {/* Legend */}
      <div className="pointer-events-none absolute bottom-4 left-4 z-[500] w-64 rounded-lg border border-border bg-[var(--surface-1)]/85 p-3 shadow-lg backdrop-blur">
        <div className="mb-1.5 flex items-center justify-between text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          <span>NDVI · {year}</span>
          <span className="font-mono">−0.2 → 0.95</span>
        </div>
        <div className="h-2 w-full rounded-full ndvi-swatch" />
        <div className="mt-1.5 flex justify-between font-mono text-[9px] text-muted-foreground">
          <span>Water</span>
          <span>Bare</span>
          <span>Sparse</span>
          <span>Moderate</span>
          <span>Dense</span>
        </div>
      </div>

      {/* Scale bar */}
      <div className="pointer-events-none absolute bottom-4 right-4 z-[500] flex items-end gap-2 rounded-md border border-border bg-[var(--surface-1)]/85 px-2 py-1.5 shadow-lg backdrop-blur">
        <div className="flex flex-col items-center">
          <div className="h-1.5 w-24 border border-foreground bg-[repeating-linear-gradient(90deg,var(--color-foreground)_0,var(--color-foreground)_12px,transparent_12px,transparent_24px)]" />
          <span className="mt-0.5 font-mono text-[10px] text-muted-foreground">{scaleKm} km</span>
        </div>
      </div>
    </>
  );
}

/* ---------------- Point Analysis Panel ---------------- */

function PointAnalysisPanel({
  lat,
  lng,
  year,
  onClose,
}: {
  lat: number;
  lng: number;
  year: number;
  onClose: () => void;
}) {
  const ndvi = ndviAt(lat, lng, year);
  const cls = classify(ndvi);
  const stats = useMemo(() => localStats(lat, lng, year), [lat, lng, year]);

  return (
    <div className="glass-panel absolute right-3 top-3 z-[600] flex max-h-[calc(100%-1.5rem)] w-96 flex-col overflow-hidden rounded-2xl animate-ticker">
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <div className="flex items-center gap-2">
          <div
            className="h-6 w-6 rounded-md"
            style={{ background: ndviColor(ndvi) }}
          />
          <div>
            <div className="text-sm font-semibold">Point Analysis</div>
            <div className="font-mono text-[10px] text-muted-foreground">
              {formatCoord(lat, "lat")} · {formatCoord(lng, "lng")}
            </div>
          </div>
        </div>
        <button
          onClick={onClose}
          className="grid h-7 w-7 place-items-center rounded-md text-muted-foreground hover:bg-[var(--surface-2)] hover:text-foreground"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        <div
          className="mb-3 rounded-xl border border-border p-4"
          style={{
            background:
              "linear-gradient(135deg, oklch(0.24 0.03 250 / 60%), oklch(0.18 0.03 250 / 60%))",
          }}
        >
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
            Current NDVI · {year}
          </div>
          <div className="mt-1 flex items-baseline gap-2">
            <span
              className="font-mono text-4xl font-bold"
              style={{ color: ndviColor(ndvi) }}
            >
              {ndvi.toFixed(3)}
            </span>
            <VegBadge cls={cls} />
          </div>
          <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-[var(--surface-3)]">
            <div className="h-full ndvi-swatch" />
          </div>
          <div
            className="relative -mt-2 h-2"
            aria-hidden
          >
            <div
              className="absolute -top-1 h-3 w-0.5 rounded-full bg-foreground shadow-[0_0_6px_oklch(1_0_0)]"
              style={{ left: `${((ndvi + 0.2) / 1.15) * 100}%` }}
            />
          </div>
        </div>

        <div className="mb-4 grid grid-cols-3 gap-2">
          <Stat label="Min" value={stats.min.toFixed(2)} />
          <Stat label="Max" value={stats.max.toFixed(2)} />
          <Stat label="Mean" value={stats.mean.toFixed(2)} />
          <Stat label="Median" value={stats.median.toFixed(2)} />
          <Stat label="Std Dev" value={stats.std.toFixed(3)} />
          <Stat label="Veg %" value={`${stats.vegPct.toFixed(0)}%`} accent />
        </div>

        <div className="mb-2 flex items-center justify-between">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            Pixel distribution
          </div>
          <span className="font-mono text-[10px] text-muted-foreground">
            n = {stats.histogram.reduce((s, b) => s + b.count, 0)}
          </span>
        </div>
        <div className="h-40 rounded-lg border border-border bg-[var(--surface-1)] p-2">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={stats.histogram} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="oklch(1 0 0 / 6%)" vertical={false} />
              <XAxis
                dataKey="bin"
                tick={{ fill: "var(--color-muted-foreground)", fontSize: 9, fontFamily: "JetBrains Mono" }}
                tickFormatter={(v: number) => v.toFixed(1)}
                stroke="oklch(1 0 0 / 15%)"
              />
              <YAxis
                tick={{ fill: "var(--color-muted-foreground)", fontSize: 9, fontFamily: "JetBrains Mono" }}
                stroke="oklch(1 0 0 / 15%)"
              />
              <Tooltip
                contentStyle={{
                  background: "var(--surface-2)",
                  border: "1px solid var(--color-border)",
                  borderRadius: 8,
                  fontSize: 11,
                }}
                labelFormatter={(v) => `NDVI ${Number(v).toFixed(2)}`}
                cursor={{ fill: "oklch(1 0 0 / 5%)" }}
              />
              <ReferenceLine x={ndvi} stroke="oklch(0.95 0 0)" strokeDasharray="3 3" />
              {stats.histogram.map((b, i) => (
                <ReferenceLine key={i} y={0} stroke="transparent" />
              ))}
              <Bar dataKey="count" radius={[3, 3, 0, 0]}>
                {stats.histogram.map((b, i) => (
                  <rect key={i} fill={ndviColor(b.bin)} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <div
      className={`rounded-lg border border-border p-2 ${
        accent ? "bg-primary/10" : "bg-[var(--surface-1)]"
      }`}
    >
      <div className="text-[9px] uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      <div
        className={`font-mono text-sm font-semibold ${
          accent ? "text-primary" : "text-foreground"
        }`}
      >
        {value}
      </div>
    </div>
  );
}

function VegBadge({ cls }: { cls: VegClass }) {
  const map: Record<VegClass, { color: string; bg: string }> = {
    Water: { color: "oklch(0.9 0.05 240)", bg: "oklch(0.4 0.15 250 / 30%)" },
    "Bare land": { color: "oklch(0.85 0.1 60)", bg: "oklch(0.55 0.16 40 / 30%)" },
    "Sparse vegetation": { color: "oklch(0.9 0.14 90)", bg: "oklch(0.7 0.15 90 / 30%)" },
    "Moderate vegetation": { color: "oklch(0.9 0.15 140)", bg: "oklch(0.7 0.18 140 / 30%)" },
    "Dense vegetation": { color: "oklch(0.85 0.17 150)", bg: "oklch(0.5 0.18 150 / 40%)" },
  };
  const s = map[cls];
  return (
    <span
      className="rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider"
      style={{ color: s.color, background: s.bg }}
    >
      {cls}
    </span>
  );
}

/* ---------------- Bottom Pane ---------------- */

function BottomPane({
  tab,
  setTab,
  logs,
  compareA,
  compareB,
  setCompareA,
  setCompareB,
  clicked,
}: {
  tab: "temporal" | "change" | "results" | "log";
  setTab: (t: "temporal" | "change" | "results" | "log") => void;
  logs: LogEntry[];
  compareA: number;
  compareB: number;
  setCompareA: (y: number) => void;
  setCompareB: (y: number) => void;
  clicked: { lat: number; lng: number } | null;
}) {
  const point = clicked ?? { lat: 22.9, lng: 79.1 };
  return (
    <div className="flex h-72 shrink-0 flex-col border-t border-border bg-[var(--surface-0)]">
      <div className="flex shrink-0 items-center gap-1 border-b border-border px-3">
        <TabBtn active={tab === "temporal"} onClick={() => setTab("temporal")} icon={BarChart3}>
          Temporal Analytics
        </TabBtn>
        <TabBtn active={tab === "change"} onClick={() => setTab("change")} icon={GitCompareArrows}>
          Change Detection
        </TabBtn>
        <TabBtn active={tab === "results"} onClick={() => setTab("results")} icon={Sparkles}>
          Results Explorer
        </TabBtn>
        <div className="ml-auto">
          <TabBtn active={tab === "log"} onClick={() => setTab("log")} icon={Terminal}>
            Processing Log
            <span className="ml-1.5 rounded bg-primary/20 px-1.5 py-0.5 font-mono text-[9px] text-primary">
              {logs.length}
            </span>
          </TabBtn>
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-auto p-3">
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
        {tab === "results" && <ResultsPanel />}
        {tab === "log" && <LogConsole logs={logs} />}
      </div>
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
      className={`flex items-center gap-1.5 border-b-2 px-3 py-2 text-xs transition ${
        active
          ? "border-primary text-foreground"
          : "border-transparent text-muted-foreground hover:text-foreground"
      }`}
    >
      <Icon className="h-3.5 w-3.5" />
      {children}
    </button>
  );
}

function TemporalPanel({ lat, lng }: { lat: number; lng: number }) {
  const years = [2024, 2025, 2026];
  const data = useMemo(() => {
    const timelines = years.map((y) => monthlyTimeline(lat, lng, y));
    return timelines[0]!.map((_, i) => ({
      month: timelines[0]![i]!.month,
      "2024": timelines[0]![i]!.ndvi,
      "2025": timelines[1]![i]!.ndvi,
      "2026": timelines[2]![i]!.ndvi,
    }));
  }, [lat, lng]);

  const avg = (y: number) =>
    data.reduce((s, d) => s + (d[String(y) as "2024"] as number), 0) / data.length;
  const a25 = avg(2025);
  const a26 = avg(2026);
  const delta = ((a26 - a25) / Math.max(0.01, a25)) * 100;

  const seasonal = useMemo(() => {
    const s25 = seasonalBreakdown(lat, lng, 2025);
    const s26 = seasonalBreakdown(lat, lng, 2026);
    return s25.map((s, i) => ({
      season: s.season,
      "2025": s.ndvi,
      "2026": s26[i]!.ndvi,
    }));
  }, [lat, lng]);

  return (
    <div className="grid h-full grid-cols-1 gap-3 lg:grid-cols-[1fr_320px]">
      <div className="glass-panel flex min-h-0 flex-col rounded-xl p-3">
        <div className="mb-2 flex items-center justify-between">
          <div>
            <div className="text-xs font-semibold">Monthly NDVI Timeline</div>
            <div className="font-mono text-[10px] text-muted-foreground">
              {formatCoord(lat, "lat")} · {formatCoord(lng, "lng")}
            </div>
          </div>
          <div className="flex items-center gap-3 font-mono text-[10px]">
            {years.map((y, i) => (
              <div key={y} className="flex items-center gap-1.5">
                <span
                  className="h-2 w-2 rounded-full"
                  style={{ background: `var(--chart-${i + 1})` }}
                />
                {y}
              </div>
            ))}
          </div>
        </div>
        <div className="min-h-0 flex-1">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="oklch(1 0 0 / 6%)" />
              <XAxis dataKey="month" tick={{ fill: "var(--color-muted-foreground)", fontSize: 10 }} stroke="oklch(1 0 0 / 15%)" />
              <YAxis domain={[-0.1, 0.9]} tick={{ fill: "var(--color-muted-foreground)", fontSize: 10 }} stroke="oklch(1 0 0 / 15%)" />
              <Tooltip
                contentStyle={{
                  background: "var(--surface-2)",
                  border: "1px solid var(--color-border)",
                  borderRadius: 8,
                  fontSize: 11,
                }}
              />
              <Line type="monotone" dataKey="2024" stroke="var(--chart-1)" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="2025" stroke="var(--chart-2)" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="2026" stroke="var(--chart-3)" strokeWidth={2.5} dot={{ r: 2 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="flex flex-col gap-3">
        <div className="glass-panel rounded-xl p-3">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
            Year-over-year change
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span
              className={`font-mono text-2xl font-bold ${
                delta >= 0 ? "text-[var(--success)]" : "text-[var(--destructive)]"
              }`}
            >
              {delta >= 0 ? "+" : ""}
              {delta.toFixed(1)}%
            </span>
            <span className="text-[10px] text-muted-foreground">2025 → 2026</span>
          </div>
          <div className="mt-2 grid grid-cols-2 gap-2 font-mono text-[11px]">
            <div className="rounded-md bg-[var(--surface-1)] p-2">
              <div className="text-[9px] uppercase text-muted-foreground">Avg 2025</div>
              <div>{a25.toFixed(3)}</div>
            </div>
            <div className="rounded-md bg-[var(--surface-1)] p-2">
              <div className="text-[9px] uppercase text-muted-foreground">Avg 2026</div>
              <div>{a26.toFixed(3)}</div>
            </div>
          </div>
        </div>

        <div className="glass-panel flex min-h-0 flex-1 flex-col rounded-xl p-3">
          <div className="mb-1 text-[10px] uppercase tracking-wider text-muted-foreground">
            Seasonal average
          </div>
          <div className="min-h-0 flex-1">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={seasonal} margin={{ top: 4, right: 4, left: -25, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="oklch(1 0 0 / 6%)" vertical={false} />
                <XAxis dataKey="season" tick={{ fill: "var(--color-muted-foreground)", fontSize: 9 }} stroke="oklch(1 0 0 / 15%)" />
                <YAxis tick={{ fill: "var(--color-muted-foreground)", fontSize: 9 }} stroke="oklch(1 0 0 / 15%)" />
                <Tooltip
                  contentStyle={{
                    background: "var(--surface-2)",
                    border: "1px solid var(--color-border)",
                    borderRadius: 8,
                    fontSize: 11,
                  }}
                />
                <Legend wrapperStyle={{ fontSize: 10 }} />
                <Bar dataKey="2025" fill="var(--chart-2)" radius={[3, 3, 0, 0]} />
                <Bar dataKey="2026" fill="var(--chart-3)" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
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

  // Change matrix cells
  const grid = useMemo(() => {
    const cells: { x: number; y: number; v: number }[] = [];
    const size = 14;
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const la = lat + (y - size / 2) * 0.15;
        const ln = lng + (x - size / 2) * 0.15;
        cells.push({ x, y, v: ndviAt(la, ln, b) - ndviAt(la, ln, a) });
      }
    }
    return { cells, size };
  }, [lat, lng, a, b]);

  const totals = grid.cells.reduce(
    (acc, c) => {
      if (c.v > 0.05) acc.improve++;
      else if (c.v < -0.05) acc.loss++;
      else acc.stable++;
      return acc;
    },
    { improve: 0, loss: 0, stable: 0 },
  );
  const total = grid.cells.length;

  return (
    <div className="grid h-full grid-cols-1 gap-3 lg:grid-cols-[300px_1fr_240px]">
      <div className="glass-panel rounded-xl p-3">
        <div className="mb-2 text-[10px] uppercase tracking-wider text-muted-foreground">
          Compare
        </div>
        <div className="space-y-2">
          <YearPicker label="Reference (A)" value={a} onChange={setA} />
          <YearPicker label="Target (B)" value={b} onChange={setB} />
        </div>
        <div className="mt-3 space-y-1.5 text-xs">
          <ClassRow color="var(--success)" label="Vegetation improvement" pct={(totals.improve / total) * 100} />
          <ClassRow color="oklch(0.7 0.03 250)" label="Stable regions" pct={(totals.stable / total) * 100} />
          <ClassRow color="var(--destructive)" label="Vegetation loss" pct={(totals.loss / total) * 100} />
        </div>
      </div>

      <div className="glass-panel flex min-h-0 flex-col rounded-xl p-3">
        <div className="mb-2 flex items-center justify-between">
          <div className="text-xs font-semibold">NDVI Difference Map (B − A)</div>
          <div className="font-mono text-[10px] text-muted-foreground">
            {a} → {b} · around {formatCoord(lat, "lat")}
          </div>
        </div>
        <div className="grid min-h-0 flex-1 grid-cols-[1fr_16px] gap-2">
          <div
            className="grid overflow-hidden rounded-lg border border-border"
            style={{
              gridTemplateColumns: `repeat(${grid.size}, 1fr)`,
              gridTemplateRows: `repeat(${grid.size}, 1fr)`,
            }}
          >
            {grid.cells.map((c, i) => (
              <div
                key={i}
                title={c.v.toFixed(3)}
                style={{
                  background:
                    c.v > 0
                      ? `oklch(0.6 ${0.12 + Math.min(0.15, c.v * 0.3)} 150 / ${Math.min(1, 0.4 + Math.abs(c.v) * 2)})`
                      : `oklch(0.55 ${0.14 + Math.min(0.15, -c.v * 0.3)} 30 / ${Math.min(1, 0.4 + Math.abs(c.v) * 2)})`,
                }}
              />
            ))}
          </div>
          <div className="flex flex-col items-center justify-between text-[9px] font-mono text-muted-foreground">
            <span>+0.3</span>
            <div
              className="my-1 w-2 flex-1 rounded"
              style={{
                background:
                  "linear-gradient(180deg, oklch(0.55 0.2 150), oklch(0.7 0.03 250), oklch(0.55 0.2 30))",
              }}
            />
            <span>−0.3</span>
          </div>
        </div>
      </div>

      <div className="glass-panel flex min-h-0 flex-col rounded-xl p-3">
        <div className="mb-1 text-[10px] uppercase tracking-wider text-muted-foreground">
          Monthly delta
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
              <CartesianGrid strokeDasharray="3 3" stroke="oklch(1 0 0 / 6%)" />
              <XAxis dataKey="month" tick={{ fill: "var(--color-muted-foreground)", fontSize: 9 }} stroke="oklch(1 0 0 / 15%)" />
              <YAxis tick={{ fill: "var(--color-muted-foreground)", fontSize: 9 }} stroke="oklch(1 0 0 / 15%)" />
              <Tooltip
                contentStyle={{
                  background: "var(--surface-2)",
                  border: "1px solid var(--color-border)",
                  borderRadius: 8,
                  fontSize: 11,
                }}
              />
              <ReferenceLine y={0} stroke="oklch(1 0 0 / 30%)" />
              <Area type="monotone" dataKey="delta" stroke="var(--success)" fill="url(#pos)" strokeWidth={2} />
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
      <div className="mb-1 text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="flex rounded-md border border-border bg-[var(--surface-1)] p-0.5">
        {[2024, 2025, 2026].map((y) => (
          <button
            key={y}
            onClick={() => onChange(y)}
            className={`flex-1 rounded px-2 py-1 font-mono text-xs transition ${
              y === value
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {y}
          </button>
        ))}
      </div>
    </div>
  );
}

function ClassRow({ color, label, pct }: { color: string; label: string; pct: number }) {
  return (
    <div>
      <div className="mb-0.5 flex items-center justify-between text-[11px]">
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-sm" style={{ background: color }} />
          {label}
        </span>
        <span className="font-mono text-[10px] text-muted-foreground">{pct.toFixed(1)}%</span>
      </div>
      <div className="h-1 overflow-hidden rounded-full bg-[var(--surface-2)]">
        <div className="h-full" style={{ width: `${pct}%`, background: color }} />
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

function ResultsPanel() {
  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
      {RESULTS.map((r) => (
        <div key={r.id} className="glass-panel overflow-hidden rounded-xl">
          <div
            className="relative h-24 w-full"
            style={{
              background:
                r.id === "r3"
                  ? "linear-gradient(135deg, oklch(0.55 0.2 30), oklch(0.7 0.03 250), oklch(0.55 0.2 150))"
                  : "var(--gradient-ndvi)",
            }}
          >
            <div className="absolute inset-0 scan-line" />
            <div className="absolute right-2 top-2 rounded bg-black/40 px-1.5 py-0.5 font-mono text-[9px] uppercase text-white backdrop-blur">
              {r.year}
            </div>
          </div>
          <div className="p-3">
            <div className="text-sm font-semibold">{r.name}</div>
            <div className="font-mono text-[10px] text-muted-foreground">
              {r.date} · {r.tile}
            </div>
            <div className="mt-2 grid grid-cols-2 gap-1.5 font-mono text-[10px]">
              <MiniField label="Resolution" value={r.resolution} />
              <MiniField label="Projection" value={r.projection} />
              <MiniField label="Mean NDVI" value={r.stats.mean.toFixed(2)} />
              <MiniField label="Coverage" value={r.stats.coverage} />
            </div>
            <div className="mt-3 flex items-center gap-1.5">
              <button className="flex-1 rounded-md bg-primary/15 px-2 py-1.5 text-xs font-medium text-primary hover:bg-primary/25">
                <MapIcon className="mr-1 inline h-3 w-3" />
                Open
              </button>
              <button className="flex-1 rounded-md bg-[var(--surface-2)] px-2 py-1.5 text-xs font-medium text-foreground hover:bg-[var(--surface-3)]">
                <Download className="mr-1 inline h-3 w-3" />
                GeoTIFF
              </button>
              <button className="rounded-md bg-[var(--surface-2)] px-2 py-1.5 text-xs text-muted-foreground hover:text-foreground">
                <Gauge className="h-3 w-3" />
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
    <div className="rounded bg-[var(--surface-1)] px-1.5 py-1">
      <div className="text-[8px] uppercase text-muted-foreground">{label}</div>
      <div className="text-foreground">{value}</div>
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
    <div className="glass-panel h-full overflow-hidden rounded-xl">
      <div className="flex items-center justify-between border-b border-border px-3 py-2">
        <div className="flex items-center gap-2 text-xs">
          <Terminal className="h-3.5 w-3.5 text-primary" />
          <span className="font-semibold">Processing Log</span>
          <span className="font-mono text-[10px] text-muted-foreground">
            bhudrishti-engine :: session #4218
          </span>
        </div>
        <div className="flex items-center gap-1.5 font-mono text-[10px] text-muted-foreground">
          <Activity className="h-3 w-3 text-[var(--success)]" />
          streaming
        </div>
      </div>
      <div className="h-[calc(100%-2.5rem)] overflow-y-auto p-3 font-mono text-[11px] leading-relaxed">
        {logs.map((l) => (
          <div key={l.id} className="flex gap-3 animate-ticker">
            <span className="shrink-0 text-muted-foreground">{l.time}</span>
            <span className={`w-14 shrink-0 font-semibold ${colorFor(l.level)}`}>
              {l.level}
            </span>
            <span className="text-foreground/90">{l.msg}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
