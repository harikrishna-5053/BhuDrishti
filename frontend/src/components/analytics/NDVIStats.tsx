import { X, MapPin, Layers } from "lucide-react";
import { ndviColor, classify } from "@/lib/ndvi";
import Histogram from "./Histogram";
import { useGeoTIFFStore } from "@/stores/geotiff-store";

export default function NDVIStats({
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
  const { raster, selectedPixel } = useGeoTIFFStore();

  if (!raster || !selectedPixel || selectedPixel.value === null || selectedPixel.isNoData) {
    return null;
  }

  const currentNdvi = selectedPixel.value;
  const currentCls = classify(currentNdvi);
  const stats = raster.statistics;

  return (
    <div className="glass-panel w-80 shrink-0 border-l border-border bg-[var(--surface-0)] flex flex-col z-[500] shadow-2xl animate-ticker">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border px-4 py-3 bg-[var(--surface-1)]">
        <div className="flex items-center gap-2">
          <div className="grid h-6 w-6 place-items-center rounded bg-emerald-500/20 text-emerald-600 dark:text-emerald-400">
            <Layers className="h-3.5 w-3.5" />
          </div>
          <div>
            <h3 className="font-mono text-xs font-bold text-foreground">GeoTIFF Pixel Inspector</h3>
            <p className="font-mono text-[10px] text-muted-foreground flex items-center gap-1">
              <MapPin className="h-2.5 w-2.5 text-primary" />
              {lat.toFixed(4)}°, {lng.toFixed(4)}°
            </p>
          </div>
        </div>

        <button
          onClick={onClose}
          className="grid h-6 w-6 place-items-center rounded text-muted-foreground hover:bg-[var(--surface-2)] hover:text-foreground transition cursor-pointer"
        >
          <X className="h-3.5 w-3.5" />
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

          {/* Location Row / Col detail for GeoTIFF */}
          <div className="mt-2 text-[10px] text-muted-foreground font-medium">
            Location: Row <span className="text-foreground font-bold">{selectedPixel.row}</span>, Col{" "}
            <span className="text-foreground font-bold">{selectedPixel.col}</span>
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
          <Stat label="Median" value={(stats.median ?? stats.mean).toFixed(2)} />
          <Stat label="Std Dev" value={(stats.standardDeviation ?? stats.stdDev).toFixed(3)} />
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
          <Histogram year={year} histogram={stats.histogram} currentNdvi={currentNdvi} />
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div
      className={`rounded-lg border p-2 text-center transition ${
        accent
          ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
          : "border-border bg-[var(--surface-1)]"
      }`}
    >
      <div className="text-[9px] uppercase font-bold text-muted-foreground">{label}</div>
      <div className="mt-0.5 text-xs font-bold text-foreground">{value}</div>
    </div>
  );
}

function VegBadge({ cls }: { cls: string }) {
  let color = "bg-muted text-muted-foreground";
  if (cls.includes("Dense"))
    color = "bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border border-emerald-500/40";
  else if (cls.includes("Moderate"))
    color = "bg-teal-500/20 text-teal-600 dark:text-teal-400 border border-teal-500/40";
  else if (cls.includes("Sparse"))
    color = "bg-yellow-500/20 text-yellow-600 dark:text-yellow-400 border border-yellow-500/40";
  else if (cls.includes("Water"))
    color = "bg-blue-500/20 text-blue-600 dark:text-blue-400 border border-blue-500/40";

  return (
    <span className={`rounded px-1.5 py-0.5 font-mono text-[10px] font-bold ${color}`}>{cls}</span>
  );
}
