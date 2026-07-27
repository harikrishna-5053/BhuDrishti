import Header from "@/components/layout/Header";
import { createFileRoute } from "@tanstack/react-router";
import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { formatCoord } from "@/lib/geo-format";
import Sidebar from "@/components/layout/Sidebar";
import MainLayout from "@/components/layout/MainLayout";
import type { LogEntry, LogLevel } from "@/lib/types";
import BottomPane from "@/components/analytics/BottomPane";
import NDVIStats from "@/components/analytics/NDVIStats";
import {
  ndviAt
} from "@/lib/ndvi";
import type { LayerState } from "@/components/gis/GISMap";
import MapOverlays, {
  MapLoading,
} from "@/components/gis/MapOverlays";


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
  <MainLayout
    header={
      <Header
        cursor={cursor}
        year={year}
        setYear={setYear}
      />
    }
    sidebar={
      <Sidebar
        open={sidebarOpen}
        onToggle={() => setSidebarOpen((v) => !v)}
        layers={layers}
        setLayers={setLayers}
        onPushLog={pushLog}
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
              onCursor={(lat, lng, zoom) =>
                setCursor({ lat, lng, zoom })
              }
            />
          </Suspense>
        </ClientOnly>

        <MapOverlays cursor={cursor} year={year} />
      </div>

      {clicked && (
        <NDVIStats
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
  </MainLayout>
);
}

