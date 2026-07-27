import Header from "@/components/layout/Header";
import { createFileRoute } from "@tanstack/react-router";
import { lazy, Suspense, useEffect, useState } from "react";
import Sidebar from "@/components/layout/Sidebar";
import MainLayout from "@/components/layout/MainLayout";
import type { LogEntry, LogLevel } from "@/lib/types";
import BottomPane from "@/components/analytics/BottomPane";
import NDVIStats from "@/components/analytics/NDVIStats";
import type { LayerState } from "@/components/gis/GISMap";
import MapOverlays, { MapLoading } from "@/components/gis/MapOverlays";

import UploadModal from "@/components/modals/UploadModal";
import SettingsModal from "@/components/modals/SettingsModal";
import ExportGeoTIFFModal from "@/components/modals/ExportGeoTIFFModal";
import ResultDetailsModal from "@/components/modals/ResultDetailsModal";
import NDVIGeoTIFFModal from "@/components/modals/NDVIGeoTIFFModal";
import AOIStatsModal from "@/components/modals/AOIStatsModal";
import CartographicExportModal from "@/components/modals/CartographicExportModal";
import { useGeoTIFFStore } from "@/stores/geotiff-store";
import { calculateAOIStatistics, type AOIStatsResult } from "@/lib/geotiff/calculate-aoi-statistics";
import { useTheme } from "@/hooks/use-theme";

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
    "temporal" | "change" | "results" | "log"
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
  const [cartographicModalOpen, setCartographicModalOpen] = useState(false);

  const { raster, selectedPixel } = useGeoTIFFStore();

  useEffect(() => {
    if (raster) {
      setBottomPaneExpanded(true);
    } else {
      setBottomPaneExpanded(false);
    }
  }, [raster]);

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
    if (selectedPixel && selectedPixel.value !== null) {
      setBottomPaneExpanded(true);
      pushLog(
        "INFO",
        `Real GeoTIFF Point analysis: ${lat.toFixed(4)}°, ${lng.toFixed(4)}° · Row=${selectedPixel.row}, Col=${selectedPixel.col} · NDVI=${selectedPixel.value.toFixed(3)}`
      );
    }
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
      pushLog("INFO", next ? "Distance & Area Measurement tool activated" : "Measurement tool deactivated");
      return next;
    });
  };

  const handleToggleSwipe = () => {
    setSwipeMode((prev) => {
      const next = !prev;
      pushLog("INFO", next ? "Swipe compare mode activated" : "Swipe compare mode deactivated");
      if (next) {
        setBottomTab("change");
        setBottomPaneExpanded(true);
      }
      return next;
    });
  };

  const handleToggleAOI = () => {
    setAoiMode((prev) => {
      const next = !prev;
      if (next) {
        setMeasureMode(false);
      }
      pushLog("INFO", next ? "AOI Field Polygon tool activated. Click 3+ points on map to enclose region." : "AOI tool deactivated");
      return next;
    });
  };

  const handleAOIFinished = (points: [number, number][]) => {
    if (!raster) {
      pushLog("WARN", "Please load an NDVI GeoTIFF raster to calculate clipped AOI polygon statistics.");
      return;
    }
    const stats = calculateAOIStatistics(raster, points);
    if (stats) {
      setAoiStatsResult(stats);
      setAoiModalOpen(true);
      pushLog(
        "SUCCESS",
        `AOI Field Polygon clipped: ${stats.areaHectares} ha (${stats.areaAcres} acres) · Mean NDVI=${stats.mean}, Veg Coverage=${stats.vegetationPercentage}%`
      );
    }
  };

  const handleOpenResult = (name: string, rYear: number) => {
    setYear(rYear);
    pushLog("SUCCESS", `Loaded result layer "${name}" onto map console`);
  };

  const handleExportGeoTIFF = (name: string) => {
    setExportResultName(name);
    setExportModalOpen(true);
  };

  const handleViewResultGauge = (name: string) => {
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
                <GISMap
                  layers={layers}
                  year={year}
                  clicked={clicked}
                  onClick={handleClick}
                  onOutsideClick={handleOutsideClick}
                  onCursor={(lat, lng, zoom) => setCursor({ lat, lng, zoom })}
                  measureActive={measureMode}
                  swipeActive={swipeMode}
                  aoiActive={aoiMode}
                  onAOIFinished={handleAOIFinished}
                  bottomPaneExpanded={bottomPaneExpanded}
                />
              </Suspense>
            </ClientOnly>

            <MapOverlays cursor={cursor} year={year} />
          </div>

          {clicked && raster && selectedPixel && !selectedPixel.isNoData && !measureMode && !aoiMode && (
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
          onViewResultGauge={handleViewResultGauge}
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
