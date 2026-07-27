import { useMemo } from "react";

import {
  Activity,
  BarChart3,
  Download,
  Gauge,
  GitCompareArrows,
  Map as MapIcon,
  Sparkles,
  Terminal,
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
  monthlyTimeline,
  ndviAt,
  seasonalBreakdown,
} from "@/lib/ndvi";

import { formatCoord } from "@/lib/geo-format";

import type { LogEntry, LogLevel } from "@/lib/types";

/* ---------------- Bottom Pane ---------------- */

export default function BottomPane({
  tab,
  setTab,
  logs,
  compareA,
  compareB,
  setCompareA,
  setCompareB,
  clicked,
  onOpenResult,
  onExportGeoTIFF,
  onViewResultGauge,
}: {
  tab: "temporal" | "change" | "results" | "log";
  setTab: (t: "temporal" | "change" | "results" | "log") => void;
  logs: LogEntry[];
  compareA: number;
  compareB: number;
  setCompareA: (y: number) => void;
  setCompareB: (y: number) => void;
  clicked: { lat: number; lng: number } | null;
  onOpenResult?: (name: string, year: number) => void;
  onExportGeoTIFF?: (name: string) => void;
  onViewResultGauge?: (name: string) => void;
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
        {tab === "results" && (
          <ResultsPanel
            onOpenResult={onOpenResult}
            onExportGeoTIFF={onExportGeoTIFF}
            onViewResultGauge={onViewResultGauge}
          />
        )}
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

function ResultsPanel({
  onOpenResult,
  onExportGeoTIFF,
  onViewResultGauge,
}: {
  onOpenResult?: (name: string, year: number) => void;
  onExportGeoTIFF?: (name: string) => void;
  onViewResultGauge?: (name: string) => void;
}) {
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
              <button
                onClick={() => onOpenResult && onOpenResult(r.name, r.year)}
                className="flex-1 rounded-md bg-primary/15 px-2 py-1.5 text-xs font-medium text-primary hover:bg-primary/25 transition flex items-center justify-center gap-1"
                title="Load raster result on map"
              >
                <MapIcon className="h-3 w-3" />
                Open
              </button>
              <button
                onClick={() => onExportGeoTIFF && onExportGeoTIFF(r.name)}
                className="flex-1 rounded-md bg-[var(--surface-2)] px-2 py-1.5 text-xs font-medium text-foreground hover:bg-[var(--surface-3)] transition flex items-center justify-center gap-1"
                title="Export GeoTIFF file"
              >
                <Download className="h-3 w-3" />
                GeoTIFF
              </button>
              <button
                onClick={() => onViewResultGauge && onViewResultGauge(r.name)}
                className="rounded-md bg-[var(--surface-2)] p-1.5 text-xs text-muted-foreground hover:text-foreground transition"
                title="View band statistics"
              >
                <Gauge className="h-3.5 w-3.5" />
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
