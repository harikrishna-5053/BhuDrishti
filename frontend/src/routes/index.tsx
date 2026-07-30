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
  type AOIStatsResult,
} from "@/lib/geotiff/calculate-aoi-statistics";
import DirectoryBrowserModal from "@/components/modals/DirectoryBrowserModal";
import { api, type ResultItem } from "@/lib/api/client";
import { MAX_VIEWER_FILE_MB } from "@/lib/api/config";
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

          if (summary.status === "SUCCEEDED") {
            toast.success("Processing completed successfully.", {
              description: `Generated ${summary.result?.ndvi_outputs_created || 0} NDVI GeoTIFF(s).`,
            });
            pushLog("SUCCESS", `Processing completed successfully! Created ${summary.result?.ndvi_outputs_created || 0} NDVI GeoTIFF(s).`);
            try {
              const resList = await api.getJobResults(activeJobId);
              if (isSubscribed) setJobResults(resList.results);
              setBottomPaneExpanded(true);
              setBottomTab("results");
            } catch (rErr) {
              console.error("Failed to fetch job results:", rErr);
            }
          } else if (summary.status === "PARTIAL_SUCCESS") {
            toast.warning("Processing completed with some failures.", {
              description: summary.message,
            });
            pushLog("WARN", `Processing completed with some failures: ${summary.message}`);
            try {
              const resList = await api.getJobResults(activeJobId);
              if (isSubscribed) setJobResults(resList.results);
              setBottomPaneExpanded(true);
              setBottomTab("results");
            } catch (rErr) {
              console.error("Failed to fetch job results:", rErr);
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

  const handleGenerateNDVI = async () => {
    if (!backendConnected) {
      toast.info("NDVI generation backend is not connected yet. You can currently load and analyse local GeoTIFF files.");
      pushLog("INFO", "NDVI generation backend is not connected yet. You can currently load and analyse local GeoTIFF files.");
      return;
    }

    if (!inputRelPath && inputRelPath !== "") {
      handleOpenBrowser("input");
      return;
    }

    try {
      pushLog("INFO", `Submitting pipeline job (Input: /${inputRelPath || "root"}, Output: /${outputRelPath || "root"})...`);
      const res = await api.submitJob(inputRelPath, outputRelPath, true);
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

  // Open generated output in viewer (Prompt 1)
  const handleOpenResultInViewer = async (result: ResultItem) => {
    const sizeMB = result.size_bytes / (1024 * 1024);
    if (sizeMB > MAX_VIEWER_FILE_MB) {
      toast.warning("File Size Exceeds Limit", {
        description: `GeoTIFF size (${sizeMB.toFixed(1)} MB) exceeds browser viewer limit (${MAX_VIEWER_FILE_MB} MB). Use Download instead.`,
      });
      pushLog("WARN", `Skipped browser auto-load: ${result.filename} (${sizeMB.toFixed(1)} MB) exceeds ${MAX_VIEWER_FILE_MB} MB limit.`);
      return;
    }

    toast.info("Fetching GeoTIFF Result...", { description: `Downloading ${result.filename} from backend server.` });
    pushLog("INFO", `Fetching server-generated result "${result.filename}" for browser viewer...`);

    try {
      const downloadUrl = api.getDownloadUrl(result.job_id, result.result_id);
      const res = await fetch(downloadUrl);
      if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
      const blob = await res.blob();
      const file = new File([blob], result.filename, { type: "image/tiff" });

      pushLog("INFO", `Reading candidate result file: ${file.name} (${(file.size / (1024 * 1024)).toFixed(1)} MB)...`);

      // Pass File through the exact existing local GeoTIFF parsing workflow
      const candidateRaster = await readNDVIGeoTIFF(file, (level: LogLevel, msg: string) => {
        pushLog(level, msg);
      });

      // Commit parsed raster to existing GeoTIFF store
      setRaster(candidateRaster);

      pushLog(
        "SUCCESS",
        `GeoTIFF ${candidateRaster.fileName} loaded successfully into map viewer (${candidateRaster.width}x${candidateRaster.height}, ${candidateRaster.crs}). Min=${candidateRaster.statistics.minimum}, Max=${candidateRaster.statistics.maximum}`
      );

      toast.success("Result loaded into viewer", {
        description: `${candidateRaster.fileName} is now active on the map workspace.`,
      });
    } catch (err: unknown) {
      // Keep previous valid raster unchanged, show validation error message
      let msg = "Failed to parse GeoTIFF result";
      if (err instanceof GeoTIFFValidationError) {
        msg = err.message;
      } else if (err instanceof Error) {
        msg = err.message;
      }
      toast.error("Failed to load result in viewer", { description: msg });
      pushLog("ERROR", `Could not load result into viewer: ${msg}`);
    }
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

    try {
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
