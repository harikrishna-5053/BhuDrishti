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
import { useTheme } from "@/hooks/use-theme";

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

  const { raster, selectedPixel } = useGeoTIFFStore();

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
    </>
  );
}
