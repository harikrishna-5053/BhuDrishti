import {
  ArrowUpRight,
  ChevronLeft,
  ChevronRight,
  Database,
  Download,
  Eye,
  EyeOff,
  FolderOpen,
  Layers,
  Leaf,
  Play,
  Satellite,
  Upload,
} from "lucide-react";
import { useEffect, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import type { LayerState } from "@/components/gis/GISMap";
import type { WorkspaceItem, LogLevel } from "@/lib/types";

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

export default function Sidebar({
  open,
  onToggle,
  layers,
  setLayers,
  onPushLog,
  onOpenUpload,
  onSelectDataset,
}: {
  open: boolean;
  onToggle: () => void;
  layers: LayerState;
  setLayers: Dispatch<SetStateAction<LayerState>>;
  onPushLog: (level: LogLevel, msg: string) => void;
  onOpenUpload: () => void;
  onSelectDataset?: (item: WorkspaceItem) => void;
}) {
  return (
    <aside
      className={`relative flex shrink-0 flex-col border-r border-border bg-[var(--surface-0)] transition-[width] duration-300 ease-out ${
        open ? "w-[340px]" : "w-14"
      }`}
    >
      <button
        onClick={onToggle}
        className="absolute -right-3 top-6 z-10 grid h-6 w-6 place-items-center rounded-full border border-border bg-[var(--surface-2)] text-muted-foreground shadow-md hover:text-primary transition"
        title={open ? "Collapse sidebar" : "Expand sidebar"}
      >
        {open ? <ChevronLeft className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
      </button>

      {open ? (
        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4">
          <WorkspaceSection
            onPushLog={onPushLog}
            onOpenUpload={onOpenUpload}
            onSelectDataset={onSelectDataset}
          />
          <ProcessingSection onPushLog={onPushLog} />
          <LayerManagerSection layers={layers} setLayers={setLayers} />
        </div>
      ) : (
        <div className="flex flex-1 flex-col items-center gap-4 pt-6">
          {[
            { icon: FolderOpen, label: "Workspace" },
            { icon: Play, label: "Processing" },
            { icon: Layers, label: "Layers" },
          ].map((item, i) => {
            const Icon = item.icon;
            return (
              <button
                key={i}
                onClick={onToggle}
                title={`Expand & view ${item.label}`}
                className="grid h-9 w-9 place-items-center rounded-md text-muted-foreground hover:bg-[var(--surface-2)] hover:text-primary transition"
              >
                <Icon className="h-4 w-4" />
              </button>
            );
          })}
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

function WorkspaceSection({
  onPushLog,
  onOpenUpload,
  onSelectDataset,
}: {
  onPushLog: (l: LogLevel, m: string) => void;
  onOpenUpload: () => void;
  onSelectDataset?: (item: WorkspaceItem) => void;
}) {
  const [activeProject, setActiveProject] = useState(PROJECTS[0].id);

  return (
    <section className="glass-panel rounded-xl p-3">
      <SectionHeader icon={FolderOpen} title="Workspace" count="3 projects" />
      <button
        onClick={onOpenUpload}
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
            onClick={() => {
              setActiveProject(p.id);
              onPushLog("INFO", `Switched active project to ${p.name}`);
            }}
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
          <button
            key={d.id}
            onClick={() => {
              onPushLog("INFO", `Loaded dataset tile ${d.tile} (${d.name})`);
              if (onSelectDataset) onSelectDataset(d);
            }}
            className="group flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs transition hover:bg-[var(--surface-2)] text-foreground"
          >
            <Database className="h-3.5 w-3.5 shrink-0 text-accent" />
            <div className="min-w-0 flex-1">
              <div className="truncate font-mono text-[11px]">{d.name}</div>
              <div className="font-mono text-[10px] text-muted-foreground">
                {d.date} · {d.tile} · {d.cloud}% cloud
              </div>
            </div>
            <ArrowUpRight className="h-3.5 w-3.5 opacity-0 transition group-hover:opacity-100 text-primary" />
          </button>
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
  setLayers: Dispatch<SetStateAction<LayerState>>;
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
                  title={state.visible ? "Hide layer" : "Show layer"}
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
                    title="Move layer up"
                  >
                    <svg viewBox="0 0 8 5" className="h-2 w-2 fill-current">
                      <path d="M4 0 L8 5 L0 5 Z" />
                    </svg>
                  </button>
                  <button
                    onClick={() => move(i, 1)}
                    className="grid h-3.5 w-4 place-items-center text-muted-foreground hover:text-primary"
                    title="Move layer down"
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
