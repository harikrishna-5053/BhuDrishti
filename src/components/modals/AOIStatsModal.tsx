import { X, Crop, Layers, CheckCircle2, PieChart } from "lucide-react";
import type { AOIStatsResult } from "@/lib/geotiff/calculate-aoi-statistics";

interface AOIStatsModalProps {
  open: boolean;
  onClose: () => void;
  stats: AOIStatsResult | null;
  rasterName?: string;
}

export default function AOIStatsModal({ open, onClose, stats, rasterName }: AOIStatsModalProps) {
  if (!open || !stats) return null;

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
        <div className="p-5 space-y-4 text-xs">
          {/* Active Layer Info */}
          <div className="rounded-xl border border-border bg-[var(--surface-1)] p-3 flex items-center justify-between shadow-sm">
            <div className="flex items-center gap-2">
              <Layers className="h-4 w-4 text-primary shrink-0" />
              <span className="truncate max-w-[200px] text-foreground font-bold">
                {rasterName || "Active Raster Layer"}
              </span>
            </div>
            <span className="text-[10px] text-muted-foreground font-semibold">
              {stats.pixelCount.toLocaleString()} pixels sampled
            </span>
          </div>

          {/* Area Metrics Card */}
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
              <div className="text-[10px] text-muted-foreground font-semibold">(NDVI ≥ 0.4)</div>
            </div>
          </div>

          {/* Clipped Statistics 4-Box Grid */}
          <div className="grid grid-cols-4 gap-2 text-center">
            <StatBox label="Min" value={stats.minimum.toFixed(2)} />
            <StatBox label="Max" value={stats.maximum.toFixed(2)} />
            <StatBox label="Mean" value={stats.mean.toFixed(2)} />
            <StatBox label="Median" value={stats.median.toFixed(2)} />
          </div>

          {/* Recommendation Banner */}
          <div className="rounded-xl border border-emerald-500/40 bg-emerald-500/10 p-3 flex items-center gap-2.5 text-emerald-700 dark:text-emerald-300 font-medium">
            <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
            <span className="text-[11px] leading-relaxed">
              Target polygon area successfully extracted. All metrics are calculated strictly inside
              the drawn field boundary.
            </span>
          </div>
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
    <div className="rounded-lg border border-border bg-[var(--surface-1)] p-2 shadow-sm">
      <div className="text-[9px] uppercase font-bold text-muted-foreground">{label}</div>
      <div className="text-sm font-bold text-foreground">{value}</div>
    </div>
  );
}
