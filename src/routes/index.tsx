import Header from "@/components/layout/Header";
import { createFileRoute } from "@tanstack/react-router";
import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { formatCoord } from "@/lib/geo-format";
import {
  Compass,
  X,
} from "lucide-react";
import Sidebar from "@/components/layout/Sidebar";
import MainLayout from "@/components/layout/MainLayout";
import type { LogEntry, LogLevel } from "@/lib/types";
import BottomPane from "@/components/analytics/BottomPane";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import {
  classify,
  localStats,
  ndviAt,
  ndviColor,
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
  </MainLayout>
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

