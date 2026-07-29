import { X, Crop, Layers, CheckCircle2, ShieldCheck, AlertCircle } from "lucide-react";
import type { AOIStatsResult } from "@/lib/geotiff/calculate-aoi-statistics";

interface AOIStatsModalProps {
  open: boolean;
  onClose: () => void;
  stats: AOIStatsResult | null;
  rasterName?: string;
}

export default function AOIStatsModal({ open, onClose, stats, rasterName }: AOIStatsModalProps) {
  if (!open || !stats) return null;

  const isError = Boolean(stats.errorTitle || stats.errorMessage);

  return (
    <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/65 backdrop-blur-sm p-4 font-mono">
      <div className="glass-panel w-full max-w-md rounded-2xl border border-border bg-[var(--surface-0)] shadow-2xl overflow-hidden animate-ticker">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <div className="flex items-center gap-2.5">
            <div className="grid h-8 w-8 place-items-center rounded-lg bg-primary/20 text-primary">
              <Crop className="h-4 w-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-foreground">AOI Field Polygon Analysis</h3>
              <p className="text-[10px] font-medium text-muted-foreground">
                Geodesic Area & Clipped Raster Metrics
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="grid h-8 w-8 place-items-center rounded-md text-muted-foreground hover:bg-[var(--surface-2)] hover:text-foreground transition cursor-pointer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 space-y-4 text-xs max-h-[75vh] overflow-y-auto">
          {isError ? (
            <div className="rounded-xl border border-red-500/40 bg-red-500/10 p-4 space-y-2">
              <div className="flex items-center gap-2 text-red-600 dark:text-red-400 font-bold text-sm">
                <AlertCircle className="h-5 w-5 shrink-0" />
                <span>{stats.errorTitle || "AOI Validation Warning"}</span>
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed">
                {stats.errorMessage || "The AOI polygon could not be analyzed."}
              </p>
            </div>
          ) : (
            <>
              {/* Active Layer Info & Sampling Badge */}
              <div className="rounded-xl border border-border bg-[var(--surface-1)] p-3 space-y-2 shadow-sm">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 min-w-0">
                    <Layers className="h-4 w-4 text-primary shrink-0" />
                    <span className="truncate text-foreground font-bold">
                      {rasterName || "Active Raster Layer"}
                    </span>
                  </div>
                  <span
                    className={`shrink-0 rounded px-2 py-0.5 font-mono text-[9px] font-bold uppercase ${
                      stats.isExact
                        ? "bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border border-emerald-500/40"
                        : "bg-amber-500/20 text-amber-600 dark:text-amber-400 border border-amber-500/40"
                    }`}
                  >
                    {stats.isExact ? "Exact analysis" : "Estimated from sampled pixels"}
                  </span>
                </div>
                <div className="flex items-center justify-between text-[10px] text-muted-foreground border-t border-border/50 pt-1.5 font-mono">
                  <span>
                    Inspected:{" "}
                    <strong className="text-foreground">{stats.pixelCount.toLocaleString()}</strong>{" "}
                    valid pixels
                  </span>
                  <span>
                    Perimeter:{" "}
                    <strong className="text-foreground">
                      {stats.perimeterMeters >= 1000
                        ? `${(stats.perimeterMeters / 1000).toFixed(2)} km`
                        : `${stats.perimeterMeters} m`}
                    </strong>
                  </span>
                </div>
              </div>

              {/* Area & Vegetation Metrics Cards */}
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-xl border border-primary/40 bg-primary/10 p-3">
                  <div className="text-[10px] uppercase font-bold text-muted-foreground">
                    AOI Field Area
                  </div>
                  <div className="text-xl font-bold text-primary">{stats.areaHectares} ha</div>
                  <div className="text-[10px] text-muted-foreground font-semibold">
                    ({stats.areaAcres} Acres)
                  </div>
                </div>
                <div className="rounded-xl border border-emerald-500/40 bg-emerald-500/10 p-3">
                  <div className="text-[10px] uppercase font-bold text-muted-foreground">
                    Vegetation Coverage
                  </div>
                  <div className="text-xl font-bold text-emerald-600 dark:text-emerald-400">
                    {stats.vegetationPercentage}%
                  </div>
                  <div className="text-[10px] text-muted-foreground font-semibold">
                    {stats.isExact ? "(NDVI ≥ 0.4)" : "(Estimated NDVI ≥ 0.4)"}
                  </div>
                </div>
              </div>

              {/* Clipped Statistics 5-Box Grid */}
              <div className="grid grid-cols-5 gap-1.5 text-center">
                <StatBox label="Min" value={stats.minimum.toFixed(2)} />
                <StatBox label="Max" value={stats.maximum.toFixed(2)} />
                <StatBox label="Mean" value={stats.mean.toFixed(2)} />
                <StatBox label="Median" value={stats.median.toFixed(2)} />
                <StatBox label="Std Dev" value={stats.stdDev.toFixed(2)} />
              </div>

              {/* Status Banner */}
              <div className="rounded-xl border border-emerald-500/40 bg-emerald-500/10 p-3 flex items-center gap-2.5 text-emerald-700 dark:text-emerald-300 font-medium">
                <ShieldCheck className="h-4 w-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                <span className="text-[11px] leading-relaxed">
                  Target polygon area extracted successfully. All metrics are calculated strictly
                  inside the drawn field boundary.
                </span>
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end border-t border-border px-5 py-3 bg-[var(--surface-1)]">
          <button
            onClick={onClose}
            className="rounded-md bg-primary text-primary-foreground px-4 py-2 text-xs font-bold hover:bg-primary/90 transition shadow cursor-pointer"
          >
            Close Analysis
          </button>
        </div>
      </div>
    </div>
  );
}

function StatBox({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-[var(--surface-1)] p-1.5 shadow-sm">
      <div className="text-[8px] uppercase font-bold text-muted-foreground truncate">{label}</div>
      <div className="text-xs font-bold text-foreground truncate">{value}</div>
    </div>
  );
}
