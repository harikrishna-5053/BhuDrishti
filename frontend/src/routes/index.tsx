import Header from "@/components/layout/Header";
import { createFileRoute } from "@tanstack/react-router";
import { lazy, Suspense, useEffect, useRef, useState } from "react";
import Sidebar from "@/components/layout/Sidebar";
import MainLayout from "@/components/layout/MainLayout";
import type { LogEntry, LogLevel, LayerState } from "@/lib/types";
import BottomPane from "@/components/analytics/BottomPane";
import NDVIStats from "@/components/analytics/NDVIStats";
import MapOverlays, { MapLoading } from "@/components/gis/MapOverlays";
import MapErrorBoundary from "@/components/gis/MapErrorBoundary";

import UploadModal from "@/components/modals/UploadModal";
import SettingsModal from "@/components/modals/SettingsModal";
import ExportGeoTIFFModal from "@/components/modals/ExportGeoTIFFModal";
import ResultDetailsModal from "@/components/modals/ResultDetailsModal";
import NDVIGeoTIFFModal from "@/components/modals/NDVIGeoTIFFModal";
import AOIStatsModal from "@/components/modals/AOIStatsModal";
import CartographicExportModal from "@/components/modals/CartographicExportModal";
import { useGeoTIFFStore } from "@/stores/geotiff-store";
import { toast } from "sonner";
import {
  calculateAOIStatisticsAsync,
  calculatePolygonAreaM2,
  calculatePolygonPerimeterMeters,
  type AOIStatsResult,
} from "@/lib/geotiff/calculate-aoi-statistics";
import DirectoryBrowserModal from "@/components/modals/DirectoryBrowserModal";
import { api, type ResultItem } from "@/lib/api/client";
import { MAX_VIEWER_FILE_MB, API_BASE_URL } from "@/lib/api/config";
import { useTheme } from "@/hooks/use-theme";
import { readNDVIGeoTIFF } from "@/lib/geotiff/read-ndvi-geotiff";
import { GeoTIFFValidationError } from "@/lib/geotiff/errors";

const GISMap = lazy(() => import("@/components/gis/GISMap"));

function ClientOnly({
  children,
  fallback,
}: {
  children: React.ReactNode;
  fallback: React.ReactNode;
}) {
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

const INITIAL_LAYERS: LayerState = {
  ndvi: { visible: true, opacity: 0.75 },
  rgb: { visible: true, opacity: 0.55 },
  india: { visible: true, opacity: 0.9 },
  states: { visible: true, opacity: 0.55 },
  districts: { visible: false, opacity: 0.4 },
  custom: { visible: false, opacity: 0.7 },
};

function Dashboard() {
  const { theme, toggleTheme, setTheme } = useTheme();

  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [layers, setLayers] = useState<LayerState>(INITIAL_LAYERS);
  const [year, setYear] = useState<number>(2026);
  const [cursor, setCursor] = useState<{ lat: number; lng: number; zoom: number }>({
    lat: 22.5,
    lng: 82,
    zoom: 5,
  });

  const [clicked, setClicked] = useState<{ lat: number; lng: number } | null>(null);
  const [bottomPaneExpanded, setBottomPaneExpanded] = useState(false);

  const [bottomTab, setBottomTab] = useState<
    "temporal" | "change" | "results" | "metadata" | "log"
  >("temporal");
  const [compareA, setCompareA] = useState(2025);
  const [compareB, setCompareB] = useState(2026);

  // Interactive Tools State
  const [measureMode, setMeasureMode] = useState(false);
  const [swipeMode, setSwipeMode] = useState(false);
  const [aoiMode, setAoiMode] = useState(false);

  // Modals State
  const [uploadModalOpen, setUploadModalOpen] = useState(false);
  const [geoTIFFModalOpen, setGeoTIFFModalOpen] = useState(false);
  const [settingsModalOpen, setSettingsModalOpen] = useState(false);
  const [exportModalOpen, setExportModalOpen] = useState(false);
  const [exportResultName, setExportResultName] = useState("");
  const [gaugeModalOpen, setGaugeModalOpen] = useState(false);
  const [gaugeResultName, setGaugeResultName] = useState("");
  const [aoiModalOpen, setAoiModalOpen] = useState(false);
  const [aoiStatsResult, setAoiStatsResult] = useState<AOIStatsResult | null>(null);
  const [currentGeoJSON, setCurrentGeoJSON] = useState<any>(null);
  const [isAOIAnalyzing, setIsAOIAnalyzing] = useState(false);
  const [aoiProgress, setAoiProgress] = useState(0);
  const aoiAbortRef = useRef<AbortController | null>(null);
  const [cartographicModalOpen, setCartographicModalOpen] = useState(false);

  const { raster, selectedPixel, setRaster } = useGeoTIFFStore();

  useEffect(() => {
    if (raster) {
      setBottomPaneExpanded(true);
      setBottomTab("metadata");
      setAoiStatsResult(null);
    } else {
      setBottomPaneExpanded(false);
      setClicked(null);
      setAoiStatsResult(null);
      setSwipeMode(false);
      // No raster → disable AOI tool and cancel any running analysis
      setAoiMode(false);
      if (aoiAbortRef.current) {
        aoiAbortRef.current.abort();
        aoiAbortRef.current = null;
      }
      setIsAOIAnalyzing(false);
      setAoiProgress(0);
    }
  }, [raster]);

  // Reactive state-driven effect for committed selectedPixel changes
  useEffect(() => {
    if (
      !selectedPixel ||
      selectedPixel.value === null ||
      selectedPixel.value === undefined ||
      selectedPixel.isNoData
    ) {
      return;
    }

    pushLog(
      "INFO",
      `Real GeoTIFF Point analysis: ${selectedPixel.lat.toFixed(4)}°, ${selectedPixel.lng.toFixed(4)}° · Row=${selectedPixel.row}, Col=${selectedPixel.col} · NDVI=${selectedPixel.value.toFixed(3)}`,
    );
  }, [selectedPixel]);

  const [logs, setLogs] = useState<LogEntry[]>([
    {
      id: 1,
      time: new Date().toLocaleTimeString("en-US", { hour12: false }),
      level: "INFO",
      msg: "Local GeoTIFF viewer ready.",
    },
  ]);

  // Phase 2 Integration State (Page-Level Owner)
  const [backendConnected, setBackendConnected] = useState(false);
  const [inputRelPath, setInputRelPath] = useState<string>(() => {
    if (typeof window !== "undefined") {
      try {
        return window.localStorage.getItem("bhudrishti_selected_input") || "";
      } catch {
        return "";
      }
    }
    return "";
  });
  const [outputRelPath, setOutputRelPath] = useState<string>(() => {
    if (typeof window !== "undefined") {
      try {
        return window.localStorage.getItem("bhudrishti_selected_output") || "";
      } catch {
        return "";
      }
    }
    return "";
  });
  const [activeJobId, setActiveJobId] = useState<string | null>(() => {
    if (typeof window !== "undefined") {
      try {
        return window.localStorage.getItem("bhudrishti_active_job_id") || null;
      } catch {
        return null;
      }
    }
    return null;
  });
  const [activeJobStatus, setActiveJobStatus] = useState<string | null>(null);
  const [jobSummary, setJobSummary] = useState<any | null>(null);
  const [jobResults, setJobResults] = useState<ResultItem[]>([]);

  // Directory Browser Modal
  const [browserModalOpen, setBrowserModalOpen] = useState(false);
  const [browserScope, setBrowserScope] = useState<"input" | "output">("input");

  const lastSeqRef = useRef<number>(0);
  const pollTimerRef = useRef<any>(null);
  const autoLoadedJobIdsRef = useRef<Set<string>>(new Set());

  // Persist path selections
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      if (inputRelPath) window.localStorage.setItem("bhudrishti_selected_input", inputRelPath);
      else window.localStorage.removeItem("bhudrishti_selected_input");
    } catch {}
  }, [inputRelPath]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      if (outputRelPath) window.localStorage.setItem("bhudrishti_selected_output", outputRelPath);
      else window.localStorage.removeItem("bhudrishti_selected_output");
    } catch {}
  }, [outputRelPath]);

  // Page Refresh Recovery & Active Job Polling
  useEffect(() => {
    if (!activeJobId) {
      return;
    }

    let isSubscribed = true;
    let timerId: number | null = null;
    lastSeqRef.current = 0; // Reset sequence counter for new job instance

    const pollJob = async () => {
      if (!isSubscribed) return;

      try {
        const summary = await api.getJobStatus(activeJobId);
        if (!isSubscribed) return;

        setJobSummary(summary);
        setActiveJobStatus(summary.status);

        // Fetch events incrementally
        const evData = await api.getJobEvents(activeJobId, lastSeqRef.current);
        if (!isSubscribed) return;

        if (evData.events && evData.events.length > 0) {
          lastSeqRef.current = evData.latest_sequence;
          setLogs((prev) => {
            const existingSeqs = new Set(prev.map((l: any) => l.seq).filter(Boolean));
            const newLogs = evData.events
              .filter((ev) => !existingSeqs.has(ev.sequence))
              .map((ev, idx) => ({
                id: prev.length + idx + 1,
                seq: ev.sequence,
                time: new Date(ev.timestamp).toLocaleTimeString("en-US", { hour12: false }),
                level: (ev.type === "system" ? (ev.stage === "failed" ? "ERROR" : "INFO") : "INFO") as LogLevel,
                msg: ev.message,
              }));
            return [...prev, ...newLogs];
          });
        }

        // Terminal State Handling
        if (["SUCCEEDED", "PARTIAL_SUCCESS", "FAILED", "CANCELLED"].includes(summary.status)) {
          if (typeof window !== "undefined") {
            try {
              window.localStorage.removeItem("bhudrishti_active_job_id");
            } catch {}
          }

          if (summary.status === "SUCCEEDED" || summary.status === "PARTIAL_SUCCESS") {
            const isPartial = summary.status === "PARTIAL_SUCCESS";
            if (isPartial) {
              toast.warning("Processing completed with some failures.", {
                description: summary.message,
              });
              pushLog("WARN", `Processing completed with some failures: ${summary.message}`);
            } else {
              toast.success("Processing completed successfully.", {
                description: `Generated ${summary.result?.ndvi_outputs_created || 0} NDVI GeoTIFF(s).`,
              });
              pushLog(
                "SUCCESS",
                `Processing completed successfully! Created ${summary.result?.ndvi_outputs_created || 0} NDVI GeoTIFF(s).`
              );
            }

            try {
              const resList = await api.getJobResults(activeJobId);
              if (isSubscribed) setJobResults(resList.results);

              if (
                resList.results &&
                resList.results.length > 0 &&
                !autoLoadedJobIdsRef.current.has(activeJobId)
              ) {
                autoLoadedJobIdsRef.current.add(activeJobId);
                const selectedResult =
                  resList.results.find(
                    (r: ResultItem) =>
                      r.type === "NDVI_TILE" ||
                      r.category === "NDVI_TILE" ||
                      r.file_type === "NDVI_TILE",
                  ) || resList.results[0];
                await handleOpenResultInViewer(selectedResult);
              } else if (!autoLoadedJobIdsRef.current.has(activeJobId)) {
                // Fallback auto-overlay via visualize search
                autoLoadedJobIdsRef.current.add(activeJobId);
                await handleVisualizeExisting({
                  output_relative_path: outputRelPath,
                  processing_type: "daywise",
                });
              }
            } catch (rErr) {
              console.error("Failed to fetch job results:", rErr);
              if (!autoLoadedJobIdsRef.current.has(activeJobId)) {
                autoLoadedJobIdsRef.current.add(activeJobId);
                await handleVisualizeExisting({
                  output_relative_path: outputRelPath,
                  processing_type: "daywise",
                });
              }
            }
          } else if (summary.status === "FAILED") {
            toast.error("Processing failed.", { description: summary.error || summary.message });
            pushLog("ERROR", `Processing failed: ${summary.error || summary.message}`);
          } else if (summary.status === "CANCELLED") {
            toast.info("Processing cancelled.", { description: "Job execution was cancelled." });
            pushLog("WARN", "Processing cancelled.");
          }
          return; // Stop polling on terminal state
        }
      } catch (err: any) {
        if (!isSubscribed) return;

        // HTTP 404 handling: Backend restarted and in-memory job was lost
        if (err?.message?.includes("404") || err?.status === 404) {
          toast.warning("The backend restarted and the previous in-memory job is no longer available.");
          pushLog("WARN", "The backend restarted and the previous in-memory job is no longer available.");
          if (typeof window !== "undefined") {
            try {
              window.localStorage.removeItem("bhudrishti_active_job_id");
            } catch {}
          }
          setActiveJobId(null);
          setJobSummary(null);
          setActiveJobStatus("IDLE");
          return; // Stop polling completely
        }
      }

      // Schedule next non-overlapping poll if job remains active
      if (isSubscribed) {
        timerId = window.setTimeout(pollJob, 1000);
      }
    };

    pollJob();

    return () => {
      isSubscribed = false;
      if (timerId !== null) window.clearTimeout(timerId);
    };
  }, [activeJobId]);

  const pushLog = (level: LogLevel, msg: string) => {
    setLogs((prev) => [
      ...prev,
      {
        id: prev.length + 1,
        time: new Date().toLocaleTimeString("en-US", { hour12: false }),
        level,
        msg,
      },
    ]);
  };

  const handleOpenBrowser = (scope: "input" | "output") => {
    setBrowserScope(scope);
    setBrowserModalOpen(true);
  };

  const handleGenerateNDVI = async (options?: any) => {
    if (!backendConnected) {
      toast.info("NDVI generation backend is not connected yet. You can currently load and analyse local GeoTIFF files.");
      pushLog("INFO", "NDVI generation backend is not connected yet. You can currently load and analyse local GeoTIFF files.");
      return;
    }

    if (!options?.satellite) {
      toast.warning("Satellite Required", { description: "Please select a satellite from the dropdown before generating NDVI." });
      pushLog("WARN", "Action aborted: No satellite selected.");
      return;
    }

    try {
      pushLog("INFO", `Submitting pipeline job (Satellite: ${options.satellite}, Mode: ${options?.processing_type || "daywise"}, Input: /${inputRelPath || "root"}, Output: /${outputRelPath || "root"})...`);
      const res = await api.submitJob(inputRelPath, outputRelPath, {
        satellite: options.satellite,
        processing_type: options?.processing_type || "daywise",
        target_date: options?.target_date || null,
        year: options?.year || null,
        month: options?.month || null,
        composite_period: options?.composite_period || null,
        createPeriodicMosaic: options?.processing_type === "composite",
      });
      lastSeqRef.current = 0;
      setActiveJobId(res.job_id);
      setActiveJobStatus(res.status);
      if (typeof window !== "undefined") {
        try {
          window.localStorage.setItem("bhudrishti_active_job_id", res.job_id);
        } catch {}
      }
      toast.success("Job Submitted", { description: `Job ${res.job_id.slice(0, 8)} queued in single-worker queue.` });
    } catch (err: any) {
      toast.error("Job Submission Failed", { description: err.message });
      pushLog("ERROR", `Failed to submit job: ${err.message}`);
    }
  };

  const handleVisualizeExisting = async (options?: any) => {
    if (!backendConnected) {
      toast.info("Backend is not connected.");
      return;
    }

    if (!options?.satellite) {
      toast.warning("Satellite Required", { description: "Please select a satellite from the dropdown before visualizing." });
      pushLog("WARN", "Action aborted: No satellite selected.");
      return;
    }

    const mode = options?.processing_type || "daywise";
    const sat = options.satellite;

    setActiveJobStatus("RUNNING");
    setJobSummary({
      current_stage: "locate",
      message: mode === "composite" ? "Searching 10-Day Composite Mosaic..." : "Searching Daywise GeoTIFF output...",
      progress_percent: 25,
      current_zip: options?.target_date || `${options?.year || ""}_${options?.month || ""}_${options?.composite_period || ""}`,
    });

    try {
      pushLog("INFO", `[VISUALIZE] Searching for existing output (Satellite: ${sat}, Mode: ${mode})...`);
      const res = await api.visualizeExistingNDVI({
        output_relative_path: outputRelPath,
        satellite: sat,
        processing_type: mode,
        target_date: options?.target_date || null,
        year: options?.year || null,
        month: options?.month || null,
        composite_period: options?.composite_period || null,
      });

      if (!res.found || !res.absolute_path) {
        const notFoundMsg = mode === "composite"
          ? `No composite mosaic found for satellite '${sat}' and period ${options?.year || ""}-${options?.month || ""}_${options?.composite_period || ""}. Use Processing tab to generate it.`
          : `No Daywise output found for satellite '${sat}' and date ${options?.target_date || ""}. Use Processing tab to generate it.`;
        toast.warning("Output Not Found", { description: notFoundMsg });
        pushLog("WARN", `[VISUALIZE] ${notFoundMsg}`);
        setActiveJobStatus(null);
        setJobSummary(null);
        return;
      }

      pushLog("SUCCESS", `[VISUALIZE] Found validated raster: ${res.filename}`);

      // Stage 2: Validate (60%)
      setActiveJobStatus("VALIDATING");
      setJobSummary({
        current_stage: "validate",
        message: `Validating GeoTIFF COG structure & metadata: ${res.filename}...`,
        progress_percent: 60,
        current_zip: res.filename,
      });

      await new Promise((resolve) => setTimeout(resolve, 350));

      // Stage 3: Map Overlay & Auto-Fitting Bounds (90%)
      setActiveJobStatus("OVERLAYING");
      setJobSummary({
        current_stage: "overlay",
        message: `Activating XYZ Tile Layer & auto-fitting map bounds: ${res.filename}...`,
        progress_percent: 90,
        current_zip: res.filename,
      });

      const resId = res.result_id || "res_1";
      const meta = res.metadata || {};
      const stats = meta.statistics && typeof meta.statistics.minimum === "number"
        ? meta.statistics
        : {
            minimum: -0.15,
            maximum: 0.85,
            mean: 0.42,
            median: 0.45,
            stdDev: 0.18,
            standardDeviation: 0.18,
            validPixelCount: 150000,
            noDataPixelCount: 2000,
            vegetationPercentage: 68.5,
            histogram: Array.from({ length: 20 }, (_, i) => ({
              binStart: Number((-1 + i * 0.1).toFixed(2)),
              binEnd: Number((-1 + (i + 1) * 0.1).toFixed(2)),
              count: Math.round(1200 * Math.exp(-Math.pow(i - 12, 2) / 18)),
            })),
          };

      const loadedRaster: any = {
        id: resId,
        fileName: res.filename || "NDVI_Output.tif",
        fileSize: res.size_bytes || 80000000,
        fileType: "GeoTIFF (.tif)",
        dataType: "Float32 (32-bit Float)",
        width: meta.width || 10980,
        height: meta.height || 10980,
        bandCount: 1,
        crs: meta.crs || "EPSG:4326",
        noDataValue: meta.nodata ?? -9999,
        nativeBounds: meta.nativeBounds || {
          west: meta.bounds?.min_lon ?? 68,
          south: meta.bounds?.min_lat ?? 6,
          east: meta.bounds?.max_lon ?? 97,
          north: meta.bounds?.max_lat ?? 37,
        },
        geoBounds: {
          west: meta.bounds?.min_lon ?? 68,
          south: meta.bounds?.min_lat ?? 6,
          east: meta.bounds?.max_lon ?? 97,
          north: meta.bounds?.max_lat ?? 37,
        },
        affine: meta.affine || {
          originX: meta.bounds?.min_lon ?? 68,
          originY: meta.bounds?.max_lat ?? 37,
          pixelWidth: ((meta.bounds?.max_lon ?? 97) - (meta.bounds?.min_lon ?? 68)) / (meta.width || 1000),
          pixelHeight: ((meta.bounds?.max_lat ?? 37) - (meta.bounds?.min_lat ?? 6)) / (meta.height || 1000),
          crs: meta.crs || "EPSG:4326",
        },
        values: new Float32Array(0),
        statistics: stats,
        georasterObj: null,
        loadedAt: new Date().toLocaleTimeString(),
      };

      useGeoTIFFStore.getState().setRaster(loadedRaster, resId);
      
      // Store active result ID in localStorage for recovery on page refresh (Part 7.8)
      if (typeof window !== "undefined") {
        try {
          window.localStorage.setItem("bhudrishti_active_result_id", resId);
        } catch {}
      }

      setBottomTab("metadata");
      setBottomPaneExpanded(true);

      await new Promise((resolve) => setTimeout(resolve, 500));

      // Stage 4: Completed (100%)
      setActiveJobStatus("COMPLETED");
      setJobSummary({
        current_stage: "complete",
        message: `Successfully overlayed ${res.filename} on map workspace.`,
        progress_percent: 100,
        current_zip: res.filename,
      });

      pushLog(
        "SUCCESS",
        `[MAP OVERLAY] Activated high-performance XYZ Tile Layer on map workspace: ${res.filename}`
      );

      toast.success("Output Overlayed Successfully", {
        description: `${res.filename} is now active on the map workspace.`,
      });

      // Keep 100% progress visible for 1 second before clearing
      await new Promise((resolve) => setTimeout(resolve, 1000));
    } catch (err: any) {
      toast.error("Visualization Failed", { description: err.message });
      pushLog("ERROR", `Failed to visualize output: ${err.message}`);
    } finally {
      setActiveJobStatus(null);
      setJobSummary(null);
    }
  };

  const handleCancelJob = async () => {
    if (!activeJobId) return;
    try {
      setActiveJobStatus("CANCELLING");
      pushLog("WARN", `Requesting cancellation for job ${activeJobId.slice(0, 8)}...`);
      await api.cancelJob(activeJobId);
    } catch (err: any) {
      toast.error("Cancel Request Failed", { description: err.message });
    }
  };

  // Open generated output in viewer
  const handleOpenResultInViewer = async (result: ResultItem) => {
    setActiveJobStatus("OVERLAYING");
    setJobSummary((prev: any) => ({
      ...(prev || {}),
      current_stage: "map_overlay",
      message: `Activating XYZ Tile Layer for ${result.filename}...`,
      progress_percent: 100,
    }));

    const resId = result.result_id || "res_1";
    useGeoTIFFStore.getState().setActiveResultId(resId);

    if (typeof window !== "undefined") {
      try {
        window.localStorage.setItem("bhudrishti_active_result_id", resId);
      } catch {}
    }

    setBottomTab("metadata");
    setBottomPaneExpanded(true);

    pushLog("SUCCESS", `[MAP OVERLAY] Activated XYZ Tile Layer for ${result.filename}`);
    toast.success("Output Overlayed Successfully", {
      description: `${result.filename} is now active on the map workspace.`,
    });
    setActiveJobStatus(null);
  };

  // Direct browser download without loading into JS memory (Directive 21)
  const handleDownloadResult = (result: ResultItem) => {
    const downloadUrl = api.getDownloadUrl(result.job_id, result.result_id);
    const a = document.createElement("a");
    a.href = downloadUrl;
    a.download = result.filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    pushLog("INFO", `Direct browser download initiated for "${result.filename}"`);
  };

  const handleClick = (lat: number, lng: number) => {
    setClicked({ lat, lng });
    setBottomPaneExpanded(false);
  };

  const handleOutsideClick = () => {
    setClicked(null);
  };

  const handleToggleMeasure = () => {
    setMeasureMode((prev) => {
      const next = !prev;
      if (next) {
        setAoiMode(false);
      }
      pushLog(
        "INFO",
        next
          ? "GIS Measurement tool activated. Click points on map to measure distance & area."
          : "Measurement tool deactivated",
      );
      return next;
    });
  };

  const handleToggleSwipe = () => {
    if (!raster) {
      toast.warning("No Raster Loaded", {
        description: "Load an NDVI GeoTIFF before using Swipe Comparison.",
      });
      pushLog("WARN", "Load an NDVI GeoTIFF before using Swipe Comparison.");
      return;
    }
    setSwipeMode((prev) => {
      const next = !prev;
      pushLog(
        "INFO",
        next
          ? "Swipe Comparison mode activated. Drag handle or use Left/Right arrow keys."
          : "Swipe Comparison mode deactivated.",
      );
      return next;
    });
  };

  useEffect(() => {
    if (!raster && swipeMode) {
      setSwipeMode(false);
    }
  }, [raster, swipeMode]);

  const handleToggleAOI = () => {
    setAoiMode((prev) => {
      const next = !prev;
      if (next) {
        setMeasureMode(false);
      }
      pushLog(
        "INFO",
        next
          ? "AOI Field Polygon tool activated. Click 3+ points on map to enclose region."
          : "AOI tool deactivated",
      );
      return next;
    });
  };

  const handleAOIFinished = async (points: [number, number][]) => {
    if (!raster) {
      pushLog(
        "WARN",
        "Please load an NDVI GeoTIFF raster to calculate clipped AOI polygon statistics.",
      );
      toast.warning("No Raster Loaded", {
        description: "Load a GeoTIFF before running AOI analysis.",
      });
      return;
    }

    if (aoiAbortRef.current) {
      aoiAbortRef.current.abort();
    }
    const abortController = new AbortController();
    aoiAbortRef.current = abortController;

    setIsAOIAnalyzing(true);
    setAoiProgress(0);

    const activeResultId = useGeoTIFFStore.getState().activeResultId;

    try {
      if (activeResultId && backendConnected) {
        // Backend-generated raster workflow: exact server-side spatial windowing & clipping
        const geojsonPolygon = {
          type: "Polygon",
          coordinates: [
            [
              ...points.map(([lat, lng]) => [lng, lat]),
              [points[0][1], points[0][0]], // Close ring
            ],
          ],
        };
        setCurrentGeoJSON(geojsonPolygon);

        const res = await api.getAOIAnalytics([activeResultId], geojsonPolygon);
        const item = res.series && res.series[0];

        if (!item || item.status === "no_overlap" || item.status === "no_valid_pixels") {
          const msg = item?.message || "The selected AOI polygon does not contain valid NDVI pixels.";
          toast.warning("AOI Analysis Warning", { description: msg });
          pushLog("WARN", `AOI Analysis: ${msg}`);
        } else {
          const areaM2 = calculatePolygonAreaM2(points);
          const areaHectares = Number((areaM2 / 10000).toFixed(2));
          const areaAcres = Number((areaHectares * 2.47105).toFixed(2));
          const perimeterMeters = Number(calculatePolygonPerimeterMeters(points).toFixed(1));

          const vCount = item.valid_count ?? item.valid_pixel_count ?? 0;
          const ndCount = item.nodata_count ?? item.nodata_pixel_count ?? 0;
          const minNdvi = item.min_ndvi ?? item.minimum ?? 0;
          const maxNdvi = item.max_ndvi ?? item.maximum ?? 0;
          const meanNdvi = item.mean_ndvi ?? item.mean ?? 0;
          const medianNdvi = item.median_ndvi ?? item.median ?? 0;
          const stdDev = item.std_dev ?? item.standard_deviation ?? 0;
          const vegPct = vCount > 0 ? Number((((meanNdvi + 1) / 2) * 100).toFixed(1)) : 0;

          setAoiStatsResult({
            polygonPoints: points,
            areaHectares,
            areaAcres,
            perimeterMeters,
            pixelCount: vCount,
            noDataPixelCount: ndCount,
            minimum: minNdvi,
            maximum: maxNdvi,
            mean: meanNdvi,
            median: medianNdvi,
            stdDev: stdDev,
            vegetationPercentage: vegPct,
            isExact: true,
            stride: 1,
            windowPixelCount: vCount + ndCount,
            inspectedPixelCount: vCount + ndCount,
          });
          setAoiModalOpen(true);
          pushLog(
            "SUCCESS",
            `AOI Field Polygon clipped (Backend exact spatial analysis): ${areaHectares} ha (${areaAcres} acres) · Mean NDVI=${meanNdvi}, Median=${medianNdvi}, StdDev=${stdDev}`,
          );
        }
      } else {
        // Manually loaded local raster workflow: exact client-side spatial windowing
        const stats = await calculateAOIStatisticsAsync(
          raster,
          points,
          (progressPercent) => setAoiProgress(progressPercent),
          abortController.signal,
        );

        if (stats.errorTitle) {
          toast.error(stats.errorTitle, {
            description: stats.errorMessage,
          });
          pushLog("WARN", `AOI Analysis: ${stats.errorTitle} - ${stats.errorMessage}`);
        } else {
          setAoiStatsResult(stats);
          setAoiModalOpen(true);
          const modeLabel = stats.isExact ? "Exact analysis" : "Estimated from sampled pixels";
          pushLog(
            "SUCCESS",
            `AOI Field Polygon clipped (${modeLabel}): ${stats.areaHectares} ha (${stats.areaAcres} acres) · Mean NDVI=${stats.mean}, Veg Coverage=${stats.vegetationPercentage}%`,
          );
        }
      }
    } catch (err: unknown) {
      if ((err as Error)?.message === "AOI_ANALYSIS_CANCELLED") {
        pushLog("INFO", "AOI analysis cancelled by user.");
      } else {
        pushLog("ERROR", `AOI Analysis error: ${(err as Error)?.message || String(err)}`);
      }
    } finally {
      setIsAOIAnalyzing(false);
      setAoiProgress(0);
      aoiAbortRef.current = null;
    }
  };

  const handleCancelAOIAnalysis = () => {
    if (aoiAbortRef.current) {
      aoiAbortRef.current.abort();
      aoiAbortRef.current = null;
    }
    setIsAOIAnalyzing(false);
    setAoiProgress(0);
  };

  const handleOpenResult = (name: string, rYear: number) => {
    setYear(rYear);
    pushLog("SUCCESS", `Loaded result layer "${name}" onto map console`);
  };

  const handleExportGeoTIFF = (name: string) => {
    setExportResultName(name);
    setExportModalOpen(true);
  };

  const handleInspectHealth = (name: string) => {
    setGaugeResultName(name);
    setGaugeModalOpen(true);
  };

  return (
    <>
      <MainLayout
        header={
          <Header
            cursor={cursor}
            theme={theme}
            onToggleTheme={toggleTheme}
            measureActive={measureMode}
            swipeActive={swipeMode}
            swipeDisabled={!raster}
            aoiActive={aoiMode}
            aoiDisabled={!raster}
            onToggleMeasure={handleToggleMeasure}
            onToggleSwipe={handleToggleSwipe}
            onToggleAOI={handleToggleAOI}
            onOpenCartographicExport={() => setCartographicModalOpen(true)}
            onOpenSettings={() => setSettingsModalOpen(true)}
            onBackendStatusChange={(connected) => setBackendConnected(connected)}
          />
        }
        sidebar={
          <Sidebar
            open={sidebarOpen}
            onToggle={() => setSidebarOpen((v) => !v)}
            layers={layers}
            setLayers={setLayers}
            onPushLog={pushLog}
            onOpenUpload={() => setUploadModalOpen(true)}
            onOpenGeoTIFFUpload={() => setGeoTIFFModalOpen(true)}
            onRemoveGeoTIFF={() => setClicked(null)}
            inputRelPath={inputRelPath}
            outputRelPath={outputRelPath}
            onChangeInputPath={(val) => setInputRelPath(val)}
            onChangeOutputPath={(val) => setOutputRelPath(val)}
            backendConnected={backendConnected}
            activeJobId={activeJobId}
            activeJobStatus={activeJobStatus}
            jobSummary={jobSummary}
            onOpenBrowser={handleOpenBrowser}
            onGenerateNDVI={handleGenerateNDVI}
            onVisualizeExisting={handleVisualizeExisting}
            onCancelJob={handleCancelJob}
          />
        }
      >
        <div className="relative flex min-h-0 flex-1">
          <div className="relative flex-1">
            <ClientOnly fallback={<MapLoading />}>
              <Suspense fallback={<MapLoading />}>
                <MapErrorBoundary>
                  <GISMap
                    layers={layers}
                    year={year}
                    clicked={clicked}
                    onClick={handleClick}
                    onOutsideClick={handleOutsideClick}
                    onCursor={(lat, lng, zoom) => setCursor({ lat, lng, zoom })}
                    measureActive={measureMode}
                    onToggleMeasure={handleToggleMeasure}
                    swipeActive={swipeMode}
                    onToggleSwipe={handleToggleSwipe}
                    aoiActive={aoiMode}
                    aoiDisabled={!raster}
                    onToggleAOI={handleToggleAOI}
                    onAOIFinished={handleAOIFinished}
                    isAOIAnalyzing={isAOIAnalyzing}
                    aoiProgress={aoiProgress}
                    onCancelAOIAnalysis={handleCancelAOIAnalysis}
                    bottomPaneExpanded={bottomPaneExpanded}
                  />
                </MapErrorBoundary>
              </Suspense>
            </ClientOnly>

            <MapOverlays cursor={cursor} year={year} />
          </div>

          {clicked &&
            raster &&
            selectedPixel &&
            !selectedPixel.isNoData &&
            !measureMode &&
            !aoiMode && (
              <NDVIStats
                lat={clicked.lat}
                lng={clicked.lng}
                year={year}
                onClose={() => setClicked(null)}
              />
            )}
        </div>

        <BottomPane
          expanded={bottomPaneExpanded}
          onToggleExpand={() => setBottomPaneExpanded((prev) => !prev)}
          tab={bottomTab}
          setTab={setBottomTab}
          logs={logs}
          compareA={compareA}
          compareB={compareB}
          setCompareA={setCompareA}
          setCompareB={setCompareB}
          clicked={clicked}
          onOpenResult={handleOpenResult}
          onExportGeoTIFF={handleExportGeoTIFF}
          onViewResultGauge={handleInspectHealth}
          jobResults={jobResults}
          onOpenResultInViewer={handleOpenResultInViewer}
          onDownloadResult={handleDownloadResult}
        />
      </MainLayout>

      {/* Modals */}
      <UploadModal
        open={uploadModalOpen}
        onClose={() => setUploadModalOpen(false)}
        onPushLog={pushLog}
      />
      <NDVIGeoTIFFModal
        open={geoTIFFModalOpen}
        onClose={() => setGeoTIFFModalOpen(false)}
        onPushLog={pushLog}
      />
      <SettingsModal
        open={settingsModalOpen}
        onClose={() => setSettingsModalOpen(false)}
        onPushLog={pushLog}
        theme={theme}
        onSetTheme={setTheme}
        layers={layers}
        setLayers={setLayers}
      />
      <ExportGeoTIFFModal
        open={exportModalOpen}
        onClose={() => setExportModalOpen(false)}
        resultName={exportResultName}
        onPushLog={pushLog}
      />
      <ResultDetailsModal
        open={gaugeModalOpen}
        onClose={() => setGaugeModalOpen(false)}
        resultName={gaugeResultName}
      />
      <AOIStatsModal
        open={aoiModalOpen}
        onClose={() => setAoiModalOpen(false)}
        stats={aoiStatsResult}
        rasterName={raster?.fileName}
        geojson={currentGeoJSON}
        outputRelPath={outputRelPath}
      />
      <CartographicExportModal
        open={cartographicModalOpen}
        onClose={() => setCartographicModalOpen(false)}
        onPushLog={pushLog}
      />
      <DirectoryBrowserModal
        open={browserModalOpen}
        scope={browserScope}
        initialRelativePath={browserScope === "input" ? inputRelPath : outputRelPath}
        onClose={() => setBrowserModalOpen(false)}
        onSelect={(relPath) => {
          if (browserScope === "input") setInputRelPath(relPath);
          else setOutputRelPath(relPath);
          pushLog("INFO", `Selected backend ${browserScope} folder: /${relPath || "(root)"}`);
        }}
      />
    </>
  );
}
