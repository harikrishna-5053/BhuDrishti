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
  PanelLeftOpen,
  PanelLeftClose,
} from "lucide-react";
import { useEffect, useState } from "react";
import { useRef, type Dispatch, type SetStateAction } from "react";
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
  { id: "overlay", label: "Map Layer Overlay", icon: Eye, hint: "Rendering GeoTIFF on map workspace" },
];

export default function Sidebar({
  open,
  onToggle,
  layers,
  setLayers,
  onPushLog,
  onOpenGeoTIFFUpload,
  onRemoveGeoTIFF,
  onChangeInputPath,
  onChangeOutputPath,
  inputRelPath = "",
  outputRelPath = "",
  backendConnected = false,
  activeJobId = null,
  activeJobStatus = null,
  jobSummary = null,
  onOpenBrowser,
  onGenerateNDVI,
  onCancelJob,
  onVisualizeExisting,
}: {
  open: boolean;
  onToggle: () => void;
  layers: LayerState;
  setLayers: Dispatch<SetStateAction<LayerState>>;
  onPushLog: (level: LogLevel, msg: string) => void;
  onOpenUpload?: () => void;
  onOpenGeoTIFFUpload?: () => void;
  onRemoveGeoTIFF?: () => void;
  onChangeInputPath?: (path: string) => void;
  onChangeOutputPath?: (path: string) => void;
  inputRelPath?: string;
  outputRelPath?: string;
  backendConnected?: boolean;
  activeJobId?: string | null;
  activeJobStatus?: string | null;
  jobSummary?: any;
  onOpenBrowser: (scope: "input" | "output") => void;
  onGenerateNDVI: (options?: any) => void;
  onCancelJob: () => void;
  onVisualizeExisting?: (options?: any) => void;
}) {
  const [activeWorkflowTab, setActiveWorkflowTab] = useState<"processing" | "visualize">("processing");

  // Shared Selector States
  const [satellite, setSatellite] = useState<string>("ALL");
  const [processingType, setProcessingType] = useState<"daywise" | "composite">("daywise");
  const [targetDate, setTargetDate] = useState<string>(new Date().toISOString().split("T")[0]);
  const [year, setYear] = useState<number>(2026);
  const [month, setMonth] = useState<number>(3);
  const [compositePeriod, setCompositePeriod] = useState<"01_10" | "11_20" | "21_END">("11_20");

  return (
    <aside
      className={`relative flex shrink-0 flex-col border-r border-border bg-[var(--surface-0)] transition-[width] duration-300 ease-out shadow-[0_2px_8px_rgba(0,0,0,0.06)] z-10 ${
        open ? "w-[360px]" : "w-14"
      }`}
    >
      {open ? (
        <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-3.5">
          {/* Control Panel Header with Workflow Tab Switcher */}
          <div className="space-y-2 border-b border-border pb-3">
            <div className="flex items-center justify-between font-mono">
              <span className="text-xs font-bold uppercase tracking-wider text-foreground">Control Panel</span>
              <button
                onClick={onToggle}
                title="Close Control Panel"
                aria-label="Close Control Panel"
                className="grid h-7 w-7 place-items-center rounded-lg border border-border bg-[var(--surface-1)] text-muted-foreground hover:bg-primary/10 hover:border-primary/40 hover:text-primary transition cursor-pointer"
              >
                <PanelLeftClose className="h-4 w-4" />
              </button>
            </div>

            {/* Top Workflow Tabs: Processing vs Visualize/Analysis */}
            <div className="grid grid-cols-2 gap-1 rounded-lg bg-[var(--surface-1)] p-1 border border-border">
              <button
                type="button"
                onClick={() => setActiveWorkflowTab("processing")}
                className={`flex items-center justify-center gap-1.5 rounded-md py-1.5 text-xs font-bold font-mono transition cursor-pointer ${
                  activeWorkflowTab === "processing"
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <Play className="h-3.5 w-3.5 fill-current" />
                <span>Processing</span>
              </button>
              <button
                type="button"
                onClick={() => setActiveWorkflowTab("visualize")}
                className={`flex items-center justify-center gap-1.5 rounded-md py-1.5 text-xs font-bold font-mono transition cursor-pointer ${
                  activeWorkflowTab === "visualize"
                    ? "bg-emerald-600 text-white shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <Eye className="h-3.5 w-3.5" />
                <span>Visualize / Analyze</span>
              </button>
            </div>
          </div>

          {/* TAB 1: PROCESSING WORKFLOW */}
          {activeWorkflowTab === "processing" && (
            <>
              <ProcessingWorkflowSection
                inputRelPath={inputRelPath}
                outputRelPath={outputRelPath}
                onChangeInputPath={onChangeInputPath || (() => {})}
                onChangeOutputPath={onChangeOutputPath || (() => {})}
                satellite={satellite}
                setSatellite={setSatellite}
                processingType={processingType}
                setProcessingType={setProcessingType}
                targetDate={targetDate}
                setTargetDate={setTargetDate}
                year={year}
                setYear={setYear}
                month={month}
                setMonth={setMonth}
                compositePeriod={compositePeriod}
                setCompositePeriod={setCompositePeriod}
                backendConnected={backendConnected}
                activeJobId={activeJobId}
                activeJobStatus={activeJobStatus}
                jobSummary={jobSummary}
                onGenerateNDVI={() =>
                  onGenerateNDVI({
                    satellite,
                    processing_type: processingType,
                    target_date: targetDate,
                    year,
                    month,
                    composite_period: compositePeriod,
                  })
                }
                onCancelJob={onCancelJob}
              />
              <ProcessingSection activeJobSummary={jobSummary} onPushLog={onPushLog} />
            </>
          )}

          {/* TAB 2: VISUALIZE / ANALYSIS WORKFLOW */}
          {activeWorkflowTab === "visualize" && (
            <>
              <VisualizeWorkflowSection
                outputRelPath={outputRelPath}
                onChangeOutputPath={onChangeOutputPath || (() => {})}
                satellite={satellite}
                setSatellite={setSatellite}
                processingType={processingType}
                setProcessingType={setProcessingType}
                targetDate={targetDate}
                setTargetDate={setTargetDate}
                year={year}
                setYear={setYear}
                month={month}
                setMonth={setMonth}
                compositePeriod={compositePeriod}
                setCompositePeriod={setCompositePeriod}
                backendConnected={backendConnected}
                onVisualizeExisting={() =>
                  onVisualizeExisting &&
                  onVisualizeExisting({
                    output_relative_path: outputRelPath,
                    satellite,
                    processing_type: processingType,
                    target_date: targetDate,
                    year,
                    month,
                    composite_period: compositePeriod,
                  })
                }
                onOpenGeoTIFFUpload={onOpenGeoTIFFUpload}
              />
            </>
          )}

          {/* LAYER MANAGER SECTION (SHARED ACROSS BOTH TABS) */}
          <LayerManagerSection
            layers={layers}
            setLayers={setLayers}
            onPushLog={onPushLog}
            onRemoveGeoTIFF={onRemoveGeoTIFF}
          />
        </div>
      ) : (
        <div className="flex flex-1 flex-col items-center gap-3 pt-3">
          <button
            onClick={onToggle}
            title="Open Control Panel (Expand Sidebar)"
            aria-label="Open Control Panel"
            className="grid h-9 w-9 place-items-center rounded-lg border border-border bg-[var(--surface-1)] text-primary hover:bg-primary/20 hover:border-primary/50 shadow-sm transition cursor-pointer"
          >
            <PanelLeftOpen className="h-5 w-5" />
          </button>
          <div className="h-px w-8 bg-border my-0.5" />
          {[
            { icon: FolderKanban, label: "NDVI Generation", onClick: onToggle },
            { icon: Eye, label: "Visualize / Analyze", onClick: onToggle },
            { icon: Layers, label: "Layer Manager", onClick: onToggle },
          ].map((item, i) => {
            const Icon = item.icon;
            return (
              <button
                key={i}
                onClick={item.onClick}
                title={`Open Control Panel — ${item.label}`}
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

import { CompositeCalendar, type CompositePeriod } from "@/components/ui/CompositeCalendar";

/**
 * TAB 1: PROCESSING WORKFLOW SECTION
 */
function ProcessingWorkflowSection({
  inputRelPath,
  outputRelPath,
  onChangeInputPath,
  onChangeOutputPath,
  satellite,
  setSatellite,
  processingType,
  setProcessingType,
  targetDate,
  setTargetDate,
  year,
  setYear,
  month,
  setMonth,
  compositePeriod,
  setCompositePeriod,
  backendConnected,
  activeJobId,
  activeJobStatus,
  jobSummary,
  onGenerateNDVI,
  onCancelJob,
}: {
  inputRelPath: string;
  outputRelPath: string;
  onChangeInputPath: (path: string) => void;
  onChangeOutputPath: (path: string) => void;
  satellite: string;
  setSatellite: (s: string) => void;
  processingType: "daywise" | "composite";
  setProcessingType: (t: "daywise" | "composite") => void;
  targetDate: string;
  setTargetDate: (d: string) => void;
  year: number;
  setYear: (y: number) => void;
  month: number;
  setMonth: (m: number) => void;
  compositePeriod: CompositePeriod;
  setCompositePeriod: (p: CompositePeriod) => void;
  backendConnected: boolean;
  activeJobId: string | null;
  activeJobStatus: string | null;
  jobSummary: any;
  onGenerateNDVI: () => void;
  onCancelJob: () => void;
}) {
  const isJobActive = activeJobId && ["QUEUED", "RUNNING", "CANCELLING", "OVERLAYING"].includes(activeJobStatus || "");
  const isCancelling = activeJobStatus === "CANCELLING";

  const inputFolderRef = useRef<HTMLInputElement>(null);
  const outputFolderRef = useRef<HTMLInputElement>(null);

  const handlePickNativeFolder = (targetRef: React.RefObject<HTMLInputElement | null>) => {
    if (targetRef.current) {
      targetRef.current.value = "";
      targetRef.current.click();
    }
  };

  return (
    <section className="glass-panel rounded-xl p-3 bg-[var(--surface-0)] border border-border shadow-[0_2px_8px_rgba(0,0,0,0.06)] space-y-3 font-mono text-xs">
      <SectionHeader icon={FolderKanban} title="Processing Parameters" />

      {/* Hidden Native File Explorer Inputs */}
      <input
        type="file"
        ref={inputFolderRef}
        // @ts-ignore
        webkitdirectory=""
        directory=""
        className="hidden"
        onChange={(e) => {
          const files = e.target.files;
          if (files && files.length > 0) {
            const first = files[0];
            let selectedPath = "";
            if ("path" in first && typeof (first as any).path === "string" && (first as any).path) {
              const fullFilePath = (first as any).path;
              const lastSlash = Math.max(fullFilePath.lastIndexOf("/"), fullFilePath.lastIndexOf("\\"));
              if (lastSlash > 0) selectedPath = fullFilePath.substring(0, lastSlash);
            }
            if (!selectedPath && first.webkitRelativePath) {
              const parts = first.webkitRelativePath.split("/");
              selectedPath = parts.length > 1 ? parts.slice(0, parts.length - 1).join("/") : parts[0];
            }
            onChangeInputPath(selectedPath || first.name);
          }
        }}
      />
      <input
        type="file"
        ref={outputFolderRef}
        // @ts-ignore
        webkitdirectory=""
        directory=""
        className="hidden"
        onChange={(e) => {
          const files = e.target.files;
          if (files && files.length > 0) {
            const first = files[0];
            let selectedPath = "";
            if ("path" in first && typeof (first as any).path === "string" && (first as any).path) {
              const fullFilePath = (first as any).path;
              const lastSlash = Math.max(fullFilePath.lastIndexOf("/"), fullFilePath.lastIndexOf("\\"));
              if (lastSlash > 0) selectedPath = fullFilePath.substring(0, lastSlash);
            }
            if (!selectedPath && first.webkitRelativePath) {
              const parts = first.webkitRelativePath.split("/");
              selectedPath = parts.length > 1 ? parts.slice(0, parts.length - 1).join("/") : parts[0];
            }
            onChangeOutputPath(selectedPath || first.name);
          }
        }}
      />

      {/* Satellite Selection Dropdown */}
      <div className="space-y-1">
        <label className="block text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
          Satellite Selection
        </label>
        <select
          value={satellite}
          onChange={(e) => setSatellite(e.target.value)}
          disabled={!backendConnected || !!isJobActive}
          className="w-full rounded-lg border border-border bg-[var(--surface-1)] px-2.5 py-1.5 text-xs text-foreground focus:border-primary focus:outline-none disabled:opacity-50 cursor-pointer"
        >
          <option value="ALL">All Sentinel-2 Satellites</option>
          <option value="SEN-2A">Sentinel-2A (SEN-2A)</option>
          <option value="SEN-2B">Sentinel-2B (SEN-2B)</option>
          <option value="SEN-2C">Sentinel-2C (SEN-2C)</option>
        </select>
      </div>

      {/* Processing Type Switcher: Daywise vs Composite */}
      <div className="space-y-1">
        <label className="block text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
          Processing Mode
        </label>
        <div className="grid grid-cols-2 gap-1 rounded-lg bg-[var(--surface-1)] p-1 border border-border">
          <button
            type="button"
            disabled={!backendConnected || !!isJobActive}
            onClick={() => setProcessingType("daywise")}
            className={`rounded py-1 text-center font-bold text-[11px] transition cursor-pointer ${
              processingType === "daywise"
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Daywise
          </button>
          <button
            type="button"
            disabled={!backendConnected || !!isJobActive}
            onClick={() => setProcessingType("composite")}
            className={`rounded py-1 text-center font-bold text-[11px] transition cursor-pointer ${
              processingType === "composite"
                ? "bg-emerald-600 text-white shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Composite (10-Day)
          </button>
        </div>
      </div>

      {/* Dynamic Date Selection based on Processing Mode */}
      {processingType === "daywise" ? (
        <div className="space-y-1">
          <label className="block text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
            Target Sensing Date
          </label>
          <input
            type="date"
            value={targetDate}
            onChange={(e) => setTargetDate(e.target.value)}
            disabled={!backendConnected || !!isJobActive}
            className="w-full rounded-lg border border-border bg-[var(--surface-1)] px-2.5 py-1.5 text-xs text-foreground focus:border-primary focus:outline-none disabled:opacity-50 cursor-pointer"
          />
        </div>
      ) : (
        <div className="space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                Year
              </label>
              <select
                value={year}
                onChange={(e) => setYear(parseInt(e.target.value))}
                disabled={!backendConnected || !!isJobActive}
                className="w-full rounded-lg border border-border bg-[var(--surface-1)] px-2 py-1 text-xs text-foreground focus:border-primary focus:outline-none disabled:opacity-50 cursor-pointer"
              >
                {[2026, 2025, 2024, 2023, 2022, 2021, 2020].map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                Month
              </label>
              <select
                value={month}
                onChange={(e) => setMonth(parseInt(e.target.value))}
                disabled={!backendConnected || !!isJobActive}
                className="w-full rounded-lg border border-border bg-[var(--surface-1)] px-2 py-1 text-xs text-foreground focus:border-primary focus:outline-none disabled:opacity-50 cursor-pointer"
              >
                {[
                  "January",
                  "February",
                  "March",
                  "April",
                  "May",
                  "June",
                  "July",
                  "August",
                  "September",
                  "October",
                  "November",
                  "December",
                ].map((m, idx) => (
                  <option key={m} value={idx + 1}>
                    {m}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* 3-Block Composite Period Calendar Selector */}
          <CompositeCalendar
            year={year}
            month={month}
            selectedPeriod={compositePeriod}
            onSelectPeriod={setCompositePeriod}
            disabled={!backendConnected || !!isJobActive}
          />
        </div>
      )}

      {/* Input Path */}
      <div className="space-y-1">
        <label className="block text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
          Input Folder (Sentinel-2 Archives)
        </label>
        <div className="flex items-center gap-1.5">
          <input
            type="text"
            value={inputRelPath}
            onChange={(e) => onChangeInputPath(e.target.value)}
            placeholder="Input path..."
            disabled={!backendConnected || !!isJobActive}
            className="flex-1 min-w-0 rounded-lg border border-border bg-[var(--surface-1)] px-2.5 py-1.5 text-xs text-foreground placeholder:text-muted-foreground/60 transition focus:border-primary focus:outline-none disabled:opacity-50 font-mono"
          />
          <button
            type="button"
            onClick={() => handlePickNativeFolder(inputFolderRef)}
            disabled={!backendConnected || !!isJobActive}
            title="Open OS File Explorer"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-border bg-[var(--surface-1)] text-primary hover:border-primary/60 hover:bg-[var(--surface-2)] disabled:opacity-50 transition cursor-pointer"
          >
            <FolderOpen className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Output Path */}
      <div className="space-y-1">
        <label className="block text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
          Output Folder (Generated Rasters)
        </label>
        <div className="flex items-center gap-1.5">
          <input
            type="text"
            value={outputRelPath}
            onChange={(e) => onChangeOutputPath(e.target.value)}
            placeholder="Output path..."
            disabled={!backendConnected || !!isJobActive}
            className="flex-1 min-w-0 rounded-lg border border-border bg-[var(--surface-1)] px-2.5 py-1.5 text-xs text-foreground placeholder:text-muted-foreground/60 transition focus:border-emerald-500 focus:outline-none disabled:opacity-50 font-mono"
          />
          <button
            type="button"
            onClick={() => handlePickNativeFolder(outputFolderRef)}
            disabled={!backendConnected || !!isJobActive}
            title="Open OS File Explorer"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-border bg-[var(--surface-1)] text-emerald-500 hover:border-emerald-500/60 hover:bg-[var(--surface-2)] disabled:opacity-50 transition cursor-pointer"
          >
            <FolderOpen className="h-4 w-4" />
          </button>
        </div>
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
 * TAB 2: VISUALIZE / ANALYSIS WORKFLOW SECTION
 */
function VisualizeWorkflowSection({
  outputRelPath,
  onChangeOutputPath,
  satellite,
  setSatellite,
  processingType,
  setProcessingType,
  targetDate,
  setTargetDate,
  year,
  setYear,
  month,
  setMonth,
  compositePeriod,
  setCompositePeriod,
  backendConnected,
  onVisualizeExisting,
  onOpenGeoTIFFUpload,
}: {
  outputRelPath: string;
  onChangeOutputPath: (path: string) => void;
  satellite: string;
  setSatellite: (s: string) => void;
  processingType: "daywise" | "composite";
  setProcessingType: (t: "daywise" | "composite") => void;
  targetDate: string;
  setTargetDate: (d: string) => void;
  year: number;
  setYear: (y: number) => void;
  month: number;
  setMonth: (m: number) => void;
  compositePeriod: CompositePeriod;
  setCompositePeriod: (p: CompositePeriod) => void;
  backendConnected: boolean;
  onVisualizeExisting: () => void;
  onOpenGeoTIFFUpload?: () => void;
}) {
  const outputFolderRef = useRef<HTMLInputElement>(null);

  const handlePickNativeFolder = (targetRef: React.RefObject<HTMLInputElement | null>) => {
    if (targetRef.current) {
      targetRef.current.value = "";
      targetRef.current.click();
    }
  };

  return (
    <section className="glass-panel rounded-xl p-3 bg-[var(--surface-0)] border border-border shadow-[0_2px_8px_rgba(0,0,0,0.06)] space-y-3 font-mono text-xs">
      <SectionHeader icon={Eye} title="Inspect Generated Rasters" />

      {/* Hidden Native File Explorer Input */}
      <input
        type="file"
        ref={outputFolderRef}
        // @ts-ignore
        webkitdirectory=""
        directory=""
        className="hidden"
        onChange={(e) => {
          const files = e.target.files;
          if (files && files.length > 0) {
            const first = files[0];
            let selectedPath = "";
            if ("path" in first && typeof (first as any).path === "string" && (first as any).path) {
              const fullFilePath = (first as any).path;
              const lastSlash = Math.max(fullFilePath.lastIndexOf("/"), fullFilePath.lastIndexOf("\\"));
              if (lastSlash > 0) selectedPath = fullFilePath.substring(0, lastSlash);
            }
            if (!selectedPath && first.webkitRelativePath) {
              const parts = first.webkitRelativePath.split("/");
              selectedPath = parts.length > 1 ? parts.slice(0, parts.length - 1).join("/") : parts[0];
            }
            onChangeOutputPath(selectedPath || first.name);
          }
        }}
      />

      {/* Satellite Filter */}
      <div className="space-y-1">
        <label className="block text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
          Satellite Filter
        </label>
        <select
          value={satellite}
          onChange={(e) => setSatellite(e.target.value)}
          disabled={!backendConnected}
          className="w-full rounded-lg border border-border bg-[var(--surface-1)] px-2.5 py-1.5 text-xs text-foreground focus:border-emerald-500 focus:outline-none disabled:opacity-50 cursor-pointer"
        >
          <option value="ALL">All Satellite Outputs</option>
          <option value="SEN-2A">Sentinel-2A Only</option>
          <option value="SEN-2B">Sentinel-2B Only</option>
          <option value="SEN-2C">Sentinel-2C Only</option>
        </select>
      </div>

      {/* Processing Type */}
      <div className="space-y-1">
        <label className="block text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
          Output Category
        </label>
        <div className="grid grid-cols-2 gap-1 rounded-lg bg-[var(--surface-1)] p-1 border border-border">
          <button
            type="button"
            disabled={!backendConnected}
            onClick={() => setProcessingType("daywise")}
            className={`rounded py-1 text-center font-bold text-[11px] transition cursor-pointer ${
              processingType === "daywise"
                ? "bg-emerald-600 text-white shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Daywise Rasters
          </button>
          <button
            type="button"
            disabled={!backendConnected}
            onClick={() => setProcessingType("composite")}
            className={`rounded py-1 text-center font-bold text-[11px] transition cursor-pointer ${
              processingType === "composite"
                ? "bg-emerald-600 text-white shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Composite Mosaics
          </button>
        </div>
      </div>

      {/* Dynamic Date Selector */}
      {processingType === "daywise" ? (
        <div className="space-y-1">
          <label className="block text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
            Sensing Date
          </label>
          <input
            type="date"
            value={targetDate}
            onChange={(e) => setTargetDate(e.target.value)}
            disabled={!backendConnected}
            className="w-full rounded-lg border border-border bg-[var(--surface-1)] px-2.5 py-1.5 text-xs text-foreground focus:border-emerald-500 focus:outline-none disabled:opacity-50 cursor-pointer"
          />
        </div>
      ) : (
        <div className="space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                Year
              </label>
              <select
                value={year}
                onChange={(e) => setYear(parseInt(e.target.value))}
                disabled={!backendConnected}
                className="w-full rounded-lg border border-border bg-[var(--surface-1)] px-2 py-1 text-xs text-foreground focus:border-emerald-500 focus:outline-none disabled:opacity-50 cursor-pointer"
              >
                {[2026, 2025, 2024, 2023, 2022, 2021, 2020].map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                Month
              </label>
              <select
                value={month}
                onChange={(e) => setMonth(parseInt(e.target.value))}
                disabled={!backendConnected}
                className="w-full rounded-lg border border-border bg-[var(--surface-1)] px-2 py-1 text-xs text-foreground focus:border-emerald-500 focus:outline-none disabled:opacity-50 cursor-pointer"
              >
                {[
                  "January",
                  "February",
                  "March",
                  "April",
                  "May",
                  "June",
                  "July",
                  "August",
                  "September",
                  "October",
                  "November",
                  "December",
                ].map((m, idx) => (
                  <option key={m} value={idx + 1}>
                    {m}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <CompositeCalendar
            year={year}
            month={month}
            selectedPeriod={compositePeriod}
            onSelectPeriod={setCompositePeriod}
            disabled={!backendConnected}
          />
        </div>
      )}

      {/* Output Directory Path */}
      <div className="space-y-1">
        <label className="block text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
          Output Folder Search Path
        </label>
        <div className="flex items-center gap-1.5">
          <input
            type="text"
            value={outputRelPath}
            onChange={(e) => onChangeOutputPath(e.target.value)}
            placeholder="Output folder path..."
            disabled={!backendConnected}
            className="flex-1 min-w-0 rounded-lg border border-border bg-[var(--surface-1)] px-2.5 py-1.5 text-xs text-foreground placeholder:text-muted-foreground/60 transition focus:border-emerald-500 focus:outline-none disabled:opacity-50 font-mono"
          />
          <button
            type="button"
            onClick={() => handlePickNativeFolder(outputFolderRef)}
            disabled={!backendConnected}
            title="Open OS File Explorer"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-border bg-[var(--surface-1)] text-emerald-500 hover:border-emerald-500/60 hover:bg-[var(--surface-2)] disabled:opacity-50 transition cursor-pointer"
          >
            <FolderOpen className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Visualize Action Button */}
      <button
        onClick={onVisualizeExisting}
        disabled={!backendConnected}
        className="flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-bold text-white shadow-md hover:bg-emerald-700 transition cursor-pointer font-mono disabled:opacity-50"
      >
        <Eye className="h-4 w-4" />
        <span>Visualize & Analyze Output</span>
      </button>

      {/* Direct Local Upload Option */}
      <div className="pt-1">
        <button
          onClick={onOpenGeoTIFFUpload}
          className="flex w-full items-center justify-between rounded-lg border border-border bg-[var(--surface-1)] px-2.5 py-1.5 text-[11px] text-muted-foreground hover:bg-[var(--surface-2)] hover:text-foreground transition cursor-pointer"
        >
          <span className="flex items-center gap-1.5 font-semibold">
            <FileImage className="h-3.5 w-3.5 text-emerald-500" />
            <span>Load Local .tif File</span>
          </span>
          <span className="font-mono text-[9px]">Browse...</span>
        </button>
      </div>
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
          const isActiveStage =
            (activeJobSummary?.current_stage &&
              activeJobSummary.current_stage.toLowerCase().includes(step.id)) ||
            (step.id === "overlay" &&
              (activeJobSummary?.current_stage === "map_overlay" || activeJobSummary?.current_stage === "overlay"));
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
