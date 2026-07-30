import {
  ChevronLeft,
  ChevronRight,
  Download,
  Eye,
  EyeOff,
  FolderOpen,
  FolderKanban,
  Layers,
  Leaf,
  Play,
  Satellite,
  FileImage,
  Trash2,
  Maximize2,
  X,
  Loader2,
} from "lucide-react";
import { useEffect, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import type { LayerState } from "@/components/gis/GISMap";
import type { LogLevel } from "@/lib/types";
import { useGeoTIFFStore } from "@/stores/geotiff-store";
import type { ColorRampPreset } from "@/lib/ndvi";
import { toast } from "sonner";

const LAYER_META: {
  key: keyof LayerState;
  label: string;
  hint: string;
  swatch: string;
}[] = [
  { key: "ndvi", label: "NDVI Raster", hint: "S2 L2A · 10 m", swatch: "var(--gradient-ndvi)" },
  {
    key: "rgb",
    label: "RGB Satellite Imagery",
    hint: "Basemap · OSM",
    swatch: "linear-gradient(135deg,#3a4a6b,#7a8ba8)",
  },
  {
    key: "custom",
    label: "Custom Analysis Layer",
    hint: "User AOI",
    swatch: "oklch(0.75 0.18 300)",
  },
];

const PIPELINE = [
  {
    id: "preproc",
    label: "Sentinel-2 Preprocessing",
    icon: Satellite,
    hint: "Atmospheric · cloud mask",
  },
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
  onOpenGeoTIFFUpload,
  onRemoveGeoTIFF,
  inputRelPath = "",
  outputRelPath = "",
  backendConnected = false,
  activeJobId = null,
  activeJobStatus = null,
  jobSummary = null,
  onOpenBrowser,
  onGenerateNDVI,
  onCancelJob,
}: {
  open: boolean;
  onToggle: () => void;
  layers: LayerState;
  setLayers: Dispatch<SetStateAction<LayerState>>;
  onPushLog: (level: LogLevel, msg: string) => void;
  onOpenUpload?: () => void;
  onOpenGeoTIFFUpload?: () => void;
  onRemoveGeoTIFF?: () => void;
  inputRelPath?: string;
  outputRelPath?: string;
  backendConnected?: boolean;
  activeJobId?: string | null;
  activeJobStatus?: string | null;
  jobSummary?: any;
  onOpenBrowser: (scope: "input" | "output") => void;
  onGenerateNDVI: () => void;
  onCancelJob: () => void;
}) {
  return (
    <aside
      className={`relative flex shrink-0 flex-col border-r border-border bg-[var(--surface-0)] transition-[width] duration-300 ease-out shadow-[0_2px_8px_rgba(0,0,0,0.06)] z-10 ${
        open ? "w-[340px]" : "w-14"
      }`}
    >
      <button
        onClick={onToggle}
        className="absolute -right-3 top-6 z-10 grid h-6 w-6 place-items-center rounded-full border border-border bg-[var(--surface-0)] text-muted-foreground shadow-md hover:text-primary transition cursor-pointer"
        title={open ? "Collapse sidebar" : "Expand sidebar"}
      >
        {open ? (
          <ChevronLeft className="h-3.5 w-3.5" />
        ) : (
          <ChevronRight className="h-3.5 w-3.5" />
        )}
      </button>

      {open ? (
        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4">
          {/* 1. NDVI GENERATION & BACKEND PATHS SECTION */}
          <NDVIGenerationSection
            inputRelPath={inputRelPath}
            outputRelPath={outputRelPath}
            backendConnected={backendConnected}
            activeJobId={activeJobId}
            activeJobStatus={activeJobStatus}
            jobSummary={jobSummary}
            onOpenBrowser={onOpenBrowser}
            onGenerateNDVI={onGenerateNDVI}
            onCancelJob={onCancelJob}
          />

          {/* 2. PROCESS STATUS SECTION */}
          <ProcessingSection activeJobSummary={jobSummary} onPushLog={onPushLog} />

          {/* 3. LOCAL NDVI GEOTIFF SECTION */}
          <LocalGeoTIFFSection onOpenGeoTIFFUpload={onOpenGeoTIFFUpload} />

          {/* 4. LAYER MANAGER SECTION */}
          <LayerManagerSection
            layers={layers}
            setLayers={setLayers}
            onPushLog={onPushLog}
            onRemoveGeoTIFF={onRemoveGeoTIFF}
          />
        </div>
      ) : (
        <div className="flex flex-1 flex-col items-center gap-4 pt-6">
          {[
            {
              icon: FolderKanban,
              label: "NDVI Generation",
              onClick: () => onOpenBrowser("input"),
            },
            { icon: Play, label: "Process Status", onClick: onToggle },
            {
              icon: FileImage,
              label: "Local NDVI GeoTIFF",
              onClick: onOpenGeoTIFFUpload || onToggle,
            },
            { icon: Layers, label: "Layer Manager", onClick: onToggle },
          ].map((item, i) => {
            const Icon = item.icon;
            return (
              <button
                key={i}
                onClick={item.onClick}
                title={`View ${item.label}`}
                className="grid h-9 w-9 place-items-center rounded-md text-muted-foreground hover:bg-[var(--surface-2)] hover:text-primary transition cursor-pointer"
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
        <div className="grid h-6 w-6 place-items-center rounded bg-[var(--surface-2)] text-primary border border-border">
          <Icon className="h-3.5 w-3.5" />
        </div>
        <span className="text-[11px] font-bold uppercase tracking-wider text-foreground">
          {title}
        </span>
      </div>
      {count && (
        <span className="font-mono text-[10px] text-muted-foreground font-medium">{count}</span>
      )}
    </div>
  );
}

/**
 * Section 1: NDVI GENERATION & BACKEND PATHS
 */
function NDVIGenerationSection({
  inputRelPath,
  outputRelPath,
  backendConnected,
  activeJobId,
  activeJobStatus,
  jobSummary,
  onOpenBrowser,
  onGenerateNDVI,
  onCancelJob,
}: {
  inputRelPath: string;
  outputRelPath: string;
  backendConnected: boolean;
  activeJobId: string | null;
  activeJobStatus: string | null;
  jobSummary: any;
  onOpenBrowser: (scope: "input" | "output") => void;
  onGenerateNDVI: () => void;
  onCancelJob: () => void;
}) {
  const isJobActive = activeJobId && ["QUEUED", "RUNNING", "CANCELLING"].includes(activeJobStatus || "");
  const isCancelling = activeJobStatus === "CANCELLING";

  return (
    <section className="glass-panel rounded-xl p-3 bg-[var(--surface-0)] border border-border shadow-[0_2px_8px_rgba(0,0,0,0.06)] space-y-2.5">
      <SectionHeader icon={FolderKanban} title="NDVI Pipeline Paths" />

      {/* Input Path Selection Button */}
      <div className="space-y-1">
        <label className="block text-[10px] font-bold uppercase tracking-wider text-muted-foreground font-mono">
          Input Folder (Sentinel-2 ZIPs)
        </label>
        <button
          onClick={() => onOpenBrowser("input")}
          disabled={!backendConnected || !!isJobActive}
          className="flex w-full items-center justify-between gap-2 rounded-lg border border-border bg-[var(--surface-1)] px-2.5 py-1.5 text-xs text-foreground transition hover:border-primary/60 hover:bg-[var(--surface-2)] disabled:opacity-50 cursor-pointer font-mono"
        >
          <div className="flex items-center gap-1.5 min-w-0 truncate">
            <FolderOpen className="h-3.5 w-3.5 text-primary shrink-0" />
            <span className="truncate text-[11px] font-medium">
              /{inputRelPath || "(root input_zips)"}
            </span>
          </div>
          <span className="text-[10px] font-semibold text-primary shrink-0">Browse</span>
        </button>
      </div>

      {/* Output Path Selection Button */}
      <div className="space-y-1">
        <label className="block text-[10px] font-bold uppercase tracking-wider text-muted-foreground font-mono">
          Output Folder (Generated Rasters)
        </label>
        <button
          onClick={() => onOpenBrowser("output")}
          disabled={!backendConnected || !!isJobActive}
          className="flex w-full items-center justify-between gap-2 rounded-lg border border-border bg-[var(--surface-1)] px-2.5 py-1.5 text-xs text-foreground transition hover:border-primary/60 hover:bg-[var(--surface-2)] disabled:opacity-50 cursor-pointer font-mono"
        >
          <div className="flex items-center gap-1.5 min-w-0 truncate">
            <FolderOpen className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
            <span className="truncate text-[11px] font-medium">
              /{outputRelPath || "(root output)"}
            </span>
          </div>
          <span className="text-[10px] font-semibold text-emerald-500 shrink-0">Browse</span>
        </button>
      </div>

      {/* Active Job Real Progress Panel */}
      {isJobActive ? (
        <div className="rounded-lg border border-primary/40 bg-primary/10 p-2.5 space-y-2 font-mono text-xs">
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-1.5 font-bold text-primary text-[11px]">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              {isCancelling ? "CANCELLING..." : activeJobStatus}
            </span>
            <button
              onClick={onCancelJob}
              disabled={isCancelling}
              className="rounded bg-red-500/20 px-2 py-0.5 text-[10px] font-bold text-red-500 hover:bg-red-500/30 transition disabled:opacity-50 cursor-pointer"
            >
              {isCancelling ? "Cancelling..." : "Cancel"}
            </button>
          </div>

          <div className="space-y-1 text-[11px]">
            <div className="flex justify-between text-foreground">
              <span className="truncate text-[10px] font-semibold">{jobSummary?.current_stage || "processing"}</span>
              {jobSummary?.progress_percent !== null && jobSummary?.progress_percent !== undefined ? (
                <span className="font-bold text-primary">{jobSummary.progress_percent}%</span>
              ) : (
                <span className="text-muted-foreground text-[10px]">Indeterminate</span>
              )}
            </div>

            {/* Progress Bar */}
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-[var(--surface-2)]">
              {jobSummary?.progress_percent !== null && jobSummary?.progress_percent !== undefined ? (
                <div
                  className="h-full bg-primary transition-all duration-300"
                  style={{ width: `${jobSummary.progress_percent}%` }}
                />
              ) : (
                <div className="h-full w-full bg-primary/60 animate-pulse" />
              )}
            </div>

            {jobSummary?.current_zip && (
              <div className="truncate text-[10px] text-muted-foreground">
                ZIP: <span className="text-foreground">{jobSummary.current_zip}</span>
              </div>
            )}
            {jobSummary?.message && (
              <div className="truncate text-[10px] text-muted-foreground font-medium">
                {jobSummary.message}
              </div>
            )}
          </div>
        </div>
      ) : (
        <button
          onClick={onGenerateNDVI}
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-3 py-2 text-xs font-bold text-primary-foreground shadow-md hover:bg-primary/90 transition cursor-pointer font-mono"
        >
          <Play className="h-3.5 w-3.5 fill-current" />
          <span>Generate NDVI</span>
        </button>
      )}
    </section>
  );
}

/**
 * Section 2: PROCESS STATUS PIPELINE
 */
function ProcessingSection({
  activeJobSummary,
  onPushLog,
}: {
  activeJobSummary: any;
  onPushLog: (l: LogLevel, m: string) => void;
}) {
  const handleClickStep = (label: string) => {
    if (!activeJobSummary) {
      toast.info("NDVI generation backend is ready. Select folders and click 'Generate NDVI' above.");
    }
  };

  return (
    <section className="glass-panel rounded-xl p-3 bg-[var(--surface-0)] border border-border shadow-[0_2px_8px_rgba(0,0,0,0.06)]">
      <SectionHeader icon={Play} title="Pipeline Stages" count="Sentinel-2" />
      <div className="space-y-1.5">
        {PIPELINE.map((step, i) => {
          const Icon = step.icon;
          const isActiveStage = activeJobSummary?.current_stage?.toLowerCase().includes(step.id);
          return (
            <div
              key={step.id}
              onClick={() => handleClickStep(step.label)}
              className={`group flex w-full items-center gap-2.5 rounded-lg border px-2.5 py-2 text-left transition font-mono ${
                isActiveStage
                  ? "border-primary bg-primary/10 shadow-sm"
                  : "border-border bg-[var(--surface-0)] hover:border-primary/60 hover:bg-[var(--surface-1)] cursor-pointer"
              }`}
            >
              <div className="grid h-7 w-7 shrink-0 place-items-center rounded-md bg-[var(--surface-2)] font-mono text-[10px] font-semibold text-foreground border border-border">
                {String(i + 1).padStart(2, "0")}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-1 text-xs font-semibold text-foreground">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <Icon className={`h-3.5 w-3.5 shrink-0 ${isActiveStage ? "text-primary animate-pulse" : "text-primary"}`} />
                    <span className="truncate">{step.label}</span>
                  </div>
                </div>
                <div className="font-mono text-[10px] text-muted-foreground">{step.hint}</div>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

/**
 * Section 3: LOCAL NDVI GEOTIFF
 */
function LocalGeoTIFFSection({ onOpenGeoTIFFUpload }: { onOpenGeoTIFFUpload?: () => void }) {
  return (
    <section className="glass-panel rounded-xl p-3 bg-[var(--surface-0)] border border-border shadow-[0_2px_8px_rgba(0,0,0,0.06)]">
      <SectionHeader icon={FileImage} title="Local NDVI GeoTIFF" />

      <button
        onClick={onOpenGeoTIFFUpload}
        className="mb-1.5 flex w-full items-center gap-2 rounded-lg border border-emerald-500/60 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-600 dark:text-emerald-400 transition hover:bg-emerald-500/20 cursor-pointer font-medium"
      >
        <FileImage className="h-3.5 w-3.5 shrink-0" />
        <span className="font-semibold">Load NDVI GeoTIFF</span>
        <span className="ml-auto font-mono text-[10px] opacity-80">.tif / .tiff</span>
      </button>
      <p className="px-1 text-[10px] text-muted-foreground font-medium">
        Visualize and analyze an existing NDVI GeoTIFF.
      </p>
    </section>
  );
}

/**
 * Section 4: LAYER MANAGER
 */
function LayerManagerSection({
  layers,
  setLayers,
  onPushLog,
  onRemoveGeoTIFF,
}: {
  layers: LayerState;
  setLayers: Dispatch<SetStateAction<LayerState>>;
  onPushLog: (l: LogLevel, m: string) => void;
  onRemoveGeoTIFF?: () => void;
}) {
  const [order, setOrder] = useState(LAYER_META.map((l) => l.key));

  // GeoTIFF Zustand store
  const {
    raster,
    visible: geoVisible,
    opacity: geoOpacity,
    colorRamp,
    setVisible: setGeoVisible,
    setOpacity: setGeoOpacity,
    setColorRamp,
    clearRaster,
    triggerZoomToRaster,
  } = useGeoTIFFStore();

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
    <section className="glass-panel rounded-xl p-3 flex-1 flex flex-col bg-[var(--surface-0)] border border-border shadow-[0_2px_8px_rgba(0,0,0,0.06)]">
      <SectionHeader
        icon={Layers}
        title="Layer Manager"
        count={`${order.length + (raster ? 1 : 0)} layers`}
      />
      <div className="space-y-1.5 overflow-y-auto flex-1 pr-1">
        {/* Dynamic Uploaded GeoTIFF Layer Entry */}
        {raster && (
          <div className="rounded-lg border border-emerald-500/60 bg-emerald-500/10 p-2 font-mono space-y-2 shadow-sm">
            <div className="flex items-center gap-2">
              <button
                onClick={() => setGeoVisible(!geoVisible)}
                className={`grid h-6 w-6 place-items-center rounded cursor-pointer ${
                  geoVisible ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground"
                }`}
                title={geoVisible ? "Hide uploaded layer" : "Show uploaded layer"}
              >
                {geoVisible ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
              </button>
              <div
                className="h-4 w-4 shrink-0 rounded border border-border"
                style={{ background: "var(--gradient-ndvi)" }}
              />
              <div className="min-w-0 flex-1">
                <div className="truncate text-xs font-bold text-emerald-700 dark:text-emerald-300">
                  Uploaded NDVI GeoTIFF
                </div>
                <div className="truncate text-[9px] text-muted-foreground">
                  {raster.fileName} · {raster.width}×{raster.height}
                </div>
              </div>
              <button
                onClick={triggerZoomToRaster}
                className="grid h-6 w-6 place-items-center rounded text-muted-foreground hover:bg-emerald-500/20 hover:text-emerald-700 dark:hover:text-emerald-300 transition cursor-pointer"
                title="Zoom to uploaded raster bounds"
              >
                <Maximize2 className="h-3 w-3" />
              </button>
              <button
                onClick={() => {
                  clearRaster();
                  if (onRemoveGeoTIFF) onRemoveGeoTIFF();
                  onPushLog("INFO", "Removed uploaded NDVI GeoTIFF layer from map workspace");
                }}
                className="grid h-6 w-6 place-items-center rounded text-red-500 hover:bg-red-500/20 transition cursor-pointer"
                title="Remove layer from map"
              >
                <Trash2 className="h-3 w-3" />
              </button>
            </div>

            {/* Opacity Slider */}
            <div className="flex items-center gap-2 pt-1">
              <span className="text-[9px] uppercase text-muted-foreground">Opacity</span>
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={geoOpacity}
                onChange={(e) => setGeoOpacity(parseFloat(e.target.value))}
                className="h-1 flex-1 accent-emerald-500 cursor-pointer"
              />
              <span className="w-7 text-right text-[9px] text-muted-foreground font-semibold">
                {Math.round(geoOpacity * 100)}%
              </span>
            </div>
          </div>
        )}

        {/* Existing Layers List */}
        {order.map((key, i) => {
          const meta = LAYER_META.find((m) => m.key === key)!;
          const st = layers[key];
          return (
            <div
              key={key}
              className="flex flex-col gap-1.5 rounded-lg border border-border bg-[var(--surface-0)] p-2 transition hover:border-primary/50 shadow-[0_1px_3px_rgba(0,0,0,0.04)]"
            >
              <div className="flex items-center gap-2">
                <button
                  onClick={() => toggle(key)}
                  className={`grid h-6 w-6 place-items-center rounded transition cursor-pointer ${
                    st.visible ? "text-primary" : "text-muted-foreground opacity-50"
                  }`}
                  title={st.visible ? "Hide layer" : "Show layer"}
                >
                  {st.visible ? (
                    <Eye className="h-3.5 w-3.5" />
                  ) : (
                    <EyeOff className="h-3.5 w-3.5" />
                  )}
                </button>
                <div
                  className="h-3.5 w-3.5 shrink-0 rounded border border-border"
                  style={{ background: meta.swatch }}
                />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-xs font-semibold text-foreground">{meta.label}</div>
                  <div className="font-mono text-[9px] text-muted-foreground">{meta.hint}</div>
                </div>
                <div className="flex items-center gap-0.5">
                  <button
                    onClick={() => move(i, -1)}
                    disabled={i === 0}
                    className="px-1 text-[10px] text-muted-foreground hover:text-foreground disabled:opacity-30 cursor-pointer"
                    title="Move up"
                  >
                    ▲
                  </button>
                  <button
                    onClick={() => move(i, 1)}
                    disabled={i === order.length - 1}
                    className="px-1 text-[10px] text-muted-foreground hover:text-foreground disabled:opacity-30 cursor-pointer"
                    title="Move down"
                  >
                    ▼
                  </button>
                </div>
              </div>

              {st.visible && (
                <div className="flex items-center gap-2 pt-1 border-t border-border/40">
                  <span className="font-mono text-[9px] uppercase text-muted-foreground">
                    Opacity
                  </span>
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.05}
                    value={st.opacity}
                    onChange={(e) => setOpacity(key, parseFloat(e.target.value))}
                    className="h-1 flex-1 accent-primary cursor-pointer"
                  />
                  <span className="w-7 font-mono text-right text-[9px] text-muted-foreground font-semibold">
                    {Math.round(st.opacity * 100)}%
                  </span>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
