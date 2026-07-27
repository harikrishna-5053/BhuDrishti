import { X, Layers, AlertCircle } from "lucide-react";
import { ndviColor, type VegClass } from "@/lib/ndvi";
import { formatCoord } from "@/lib/geo-format";
import { useGeoTIFFStore } from "@/stores/geotiff-store";
import Histogram from "./Histogram";

type NDVIStatsProps = {
  lat: number;
  lng: number;
  year: number;
  onClose: () => void;
};

export default function NDVIStats({
  lat,
  lng,
  onClose,
}: NDVIStatsProps) {
  const { raster, selectedPixel } = useGeoTIFFStore();

  // The Point Analysis panel MUST only appear when real raster data is available for the clicked location
  if (!raster || !selectedPixel || selectedPixel.isNoData || selectedPixel.value === null) {
    return null;
  }

  const currentNdvi = selectedPixel.value;
  const currentCls = selectedPixel.vegClass as VegClass | null;
  const stats = raster.statistics;

  return (
    <div className="glass-panel absolute right-3 top-3 z-[600] flex max-h-[calc(100%-1.5rem)] w-96 flex-col overflow-hidden rounded-2xl animate-ticker border border-border bg-[var(--surface-0)] shadow-2xl">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border px-4 py-3 bg-[var(--surface-1)]">
        <div className="flex items-center gap-2">
          <div className="grid h-6 w-6 place-items-center rounded bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 font-mono text-[10px]">
            <Layers className="h-3.5 w-3.5" />
          </div>

          <div>
            <div className="text-sm font-bold text-foreground">GeoTIFF Point Analysis</div>
            <div className="font-mono text-[10px] text-muted-foreground font-medium">
              {formatCoord(lat, "lat")} · {formatCoord(lng, "lng")}
            </div>
          </div>
        </div>

        <button
          onClick={onClose}
          className="grid h-7 w-7 place-items-center rounded-md text-muted-foreground hover:bg-[var(--surface-2)] hover:text-foreground transition cursor-pointer"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-4 font-mono text-xs">
        {/* Main NDVI Value Card */}
        <div className="mb-3 rounded-xl border border-border bg-[var(--surface-1)] p-4 shadow-sm">
          <div className="flex justify-between text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
            <span className="truncate max-w-[220px]">{raster.fileName}</span>
            {stats.isSampled && (
              <span className="rounded bg-amber-500/20 px-1 py-0.5 text-[9px] text-amber-600 dark:text-amber-400 font-bold border border-amber-500/30">
                Sampled
              </span>
            )}
          </div>

          <div className="mt-1 flex items-baseline gap-2">
            <span
              className="font-mono text-4xl font-bold"
              style={{ color: ndviColor(currentNdvi) }}
            >
              {currentNdvi.toFixed(3)}
            </span>

            {currentCls && <VegBadge cls={currentCls} />}
          </div>

          {/* Matrix Row / Col detail for GeoTIFF */}
          <div className="mt-2 text-[10px] text-muted-foreground font-medium">
            Matrix: Row <span className="text-foreground font-bold">{selectedPixel.row}</span>, Col <span className="text-foreground font-bold">{selectedPixel.col}</span>
          </div>

          <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-[var(--surface-3)] border border-border">
            <div className="h-full ndvi-swatch" />
          </div>

          <div className="relative -mt-2 h-2" aria-hidden>
            <div
              className="absolute -top-1 h-3 w-0.5 rounded-full bg-foreground shadow-[0_0_6px_var(--color-foreground)]"
              style={{
                left: `${((currentNdvi + 0.2) / 1.15) * 100}%`,
              }}
            />
          </div>
        </div>

        {/* 6-box Statistics Grid */}
        <div className="mb-4 grid grid-cols-3 gap-2">
          <Stat label="Min" value={stats.minimum.toFixed(2)} />
          <Stat label="Max" value={stats.maximum.toFixed(2)} />
          <Stat label="Mean" value={stats.mean.toFixed(2)} />
          <Stat label="Median" value={stats.median.toFixed(2)} />
          <Stat label="Std Dev" value={stats.standardDeviation.toFixed(3)} />
          <Stat label="Veg %" value={`${stats.vegetationPercentage.toFixed(0)}%`} accent />
        </div>

        {/* Histogram Section Header */}
        <div className="mb-2 flex items-center justify-between">
          <div className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
            Raster Pixel Distribution
          </div>

          <span className="font-mono text-[10px] text-muted-foreground font-semibold">
            n = {stats.validPixelCount.toLocaleString()}
          </span>
        </div>

        {/* Histogram Chart */}
        <div className="h-40 rounded-lg border border-border bg-[var(--surface-1)] p-2 shadow-sm">
          <Histogram histogram={stats.histogram} currentNdvi={currentNdvi} />
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
      className={`rounded-lg border border-border p-2 shadow-sm ${
        accent ? "bg-primary/10" : "bg-[var(--surface-1)]"
      }`}
    >
      <div className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground">
        {label}
      </div>

      <div
        className={`font-mono text-sm font-bold ${
          accent ? "text-primary" : "text-foreground"
        }`}
      >
        {value}
      </div>
    </div>
  );
}

function VegBadge({ cls }: { cls: VegClass }) {
  const styles: Record<VegClass, { color: string; bg: string }> = {
    Water: {
      color: "oklch(0.4 0.15 250)",
      bg: "oklch(0.4 0.15 250 / 15%)",
    },
    "Bare land": {
      color: "oklch(0.55 0.16 40)",
      bg: "oklch(0.55 0.16 40 / 15%)",
    },
    "Sparse vegetation": {
      color: "oklch(0.55 0.15 90)",
      bg: "oklch(0.7 0.15 90 / 15%)",
    },
    "Moderate vegetation": {
      color: "oklch(0.45 0.18 140)",
      bg: "oklch(0.7 0.18 140 / 15%)",
    },
    "Dense vegetation": {
      color: "oklch(0.35 0.18 150)",
      bg: "oklch(0.5 0.18 150 / 20%)",
    },
  };

  const style = styles[cls] || styles["Bare land"];

  return (
    <span
      className="rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider border border-border shadow-sm"
      style={{
        color: style.color,
        background: style.bg,
      }}
    >
      {cls}
    </span>
  );
}