import { useState, useEffect } from "react";
import { X, Crop, Layers, CheckCircle2, ShieldCheck, AlertCircle, TrendingUp, Calendar, Loader2 } from "lucide-react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import type { AOIStatsResult } from "@/lib/geotiff/calculate-aoi-statistics";
import { api, type AOITimeSeriesItem } from "@/lib/api/client";

interface AOIStatsModalProps {
  open: boolean;
  onClose: () => void;
  stats: AOIStatsResult | null;
  rasterName?: string;
  geojson?: any;
  outputRelPath?: string;
}

export default function AOIStatsModal({
  open,
  onClose,
  stats,
  rasterName,
  geojson,
  outputRelPath = "",
}: AOIStatsModalProps) {
  const [analysisMode, setAnalysisMode] = useState<"single" | "timeseries">("single");
  const [timeSeriesData, setTimeSeriesData] = useState<AOITimeSeriesItem[]>([]);
  const [loadingTimeSeries, setLoadingTimeSeries] = useState<boolean>(false);
  const [timeSeriesError, setTimeSeriesError] = useState<string | null>(null);

  useEffect(() => {
    if (open && analysisMode === "timeseries" && geojson) {
      fetchTimeSeries();
    }
  }, [open, analysisMode, geojson]);

  const fetchTimeSeries = async () => {
    setLoadingTimeSeries(true);
    setTimeSeriesError(null);
    try {
      const res = await api.fetchAOITimeSeries({
        output_relative_path: outputRelPath,
        satellite: "ALL",
        processing_type: "ALL",
        geojson: geojson,
      });
      setTimeSeriesData(res.series || []);
      if (res.series.length === 0) {
        setTimeSeriesError("No available matching rasters found in output directory for time-series analysis.");
      }
    } catch (err: any) {
      setTimeSeriesError(err.message || "Failed to fetch time-series analysis.");
    } finally {
      setLoadingTimeSeries(false);
    }
  };

  if (!open || !stats) return null;

  const isError = Boolean(stats.errorTitle || stats.errorMessage);

  return (
    <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/65 backdrop-blur-sm p-4 font-mono">
      <div className="glass-panel w-full max-w-xl rounded-2xl border border-border bg-[var(--surface-0)] shadow-2xl overflow-hidden animate-ticker flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-5 py-4 shrink-0">
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

        {/* Mode Switcher Tabs */}
        <div className="px-5 pt-3 shrink-0">
          <div className="grid grid-cols-2 gap-1.5 rounded-xl bg-[var(--surface-1)] p-1 border border-border">
            <button
              type="button"
              onClick={() => setAnalysisMode("single")}
              className={`flex items-center justify-center gap-2 rounded-lg py-2 text-xs font-bold transition cursor-pointer ${
                analysisMode === "single"
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Layers className="h-4 w-4" />
              <span>Analyse This Image Only</span>
            </button>
            <button
              type="button"
              onClick={() => setAnalysisMode("timeseries")}
              className={`flex items-center justify-center gap-2 rounded-lg py-2 text-xs font-bold transition cursor-pointer ${
                analysisMode === "timeseries"
                  ? "bg-emerald-600 text-white shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <TrendingUp className="h-4 w-4" />
              <span>Analyse Location Over Time</span>
            </button>
          </div>
        </div>

        {/* Content Body */}
        <div className="p-5 space-y-4 text-xs overflow-y-auto flex-1">
          {analysisMode === "single" ? (
            isError ? (
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
                {/* Active Layer Info */}
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
              </>
            )
          ) : (
            /* TIME-SERIES MODE CONTENT */
            <div className="space-y-4">
              {loadingTimeSeries ? (
                <div className="flex flex-col items-center justify-center py-12 space-y-3 text-muted-foreground">
                  <Loader2 className="h-8 w-8 animate-spin text-emerald-500" />
                  <span className="text-xs font-semibold">
                    Calculating windowed multi-date statistics across outputs...
                  </span>
                </div>
              ) : timeSeriesError ? (
                <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-4 text-amber-600 dark:text-amber-400 text-xs font-semibold">
                  {timeSeriesError}
                </div>
              ) : (
                <>
                  {/* Recharts Multi-Date Line Chart */}
                  <div className="rounded-xl border border-border bg-[var(--surface-1)] p-3 space-y-2">
                    <div className="flex items-center justify-between text-xs font-bold text-foreground">
                      <span className="flex items-center gap-1.5">
                        <TrendingUp className="h-4 w-4 text-emerald-500" />
                        <span>Mean NDVI Trend Over Time</span>
                      </span>
                      <span className="text-[10px] font-mono text-muted-foreground">
                        {timeSeriesData.length} dates analyzed
                      </span>
                    </div>

                    <div className="h-48 w-full pt-2">
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={timeSeriesData}>
                          <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                          <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                          <YAxis domain={[-0.2, 1.0]} tick={{ fontSize: 10 }} />
                          <Tooltip
                            contentStyle={{
                              backgroundColor: "var(--surface-0)",
                              borderColor: "var(--border)",
                              borderRadius: "8px",
                              fontSize: "11px",
                            }}
                          />
                          <Line
                            type="monotone"
                            dataKey="mean_ndvi"
                            stroke="#10b981"
                            strokeWidth={2.5}
                            dot={{ r: 4, fill: "#10b981" }}
                            name="Mean NDVI"
                          />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  </div>

                  {/* Multi-Date Statistics Table */}
                  <div className="rounded-xl border border-border bg-[var(--surface-1)] overflow-hidden">
                    <div className="px-3 py-2 border-b border-border bg-[var(--surface-2)] text-[11px] font-bold text-foreground flex items-center justify-between">
                      <span>Multi-Date Output Metrics</span>
                      <span className="text-[10px] text-muted-foreground font-mono">
                        {stats.areaHectares} ha
                      </span>
                    </div>
                    <div className="max-h-44 overflow-y-auto">
                      <table className="w-full text-left text-[11px]">
                        <thead className="bg-[var(--surface-0)] text-muted-foreground border-b border-border text-[9px] uppercase font-mono">
                          <tr>
                            <th className="px-3 py-1.5">Date</th>
                            <th className="px-2 py-1.5">Satellite</th>
                            <th className="px-2 py-1.5">Type</th>
                            <th className="px-2 py-1.5">Min</th>
                            <th className="px-2 py-1.5">Max</th>
                            <th className="px-2 py-1.5">Mean</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border/50 font-mono">
                          {timeSeriesData.map((item, idx) => (
                            <tr key={idx} className="hover:bg-[var(--surface-2)]">
                              <td className="px-3 py-1.5 font-bold text-foreground">{item.date}</td>
                              <td className="px-2 py-1.5 text-muted-foreground">{item.satellite}</td>
                              <td className="px-2 py-1.5 text-muted-foreground capitalize">
                                {item.processing_type}
                              </td>
                              <td className="px-2 py-1.5 text-muted-foreground">{item.min_ndvi.toFixed(2)}</td>
                              <td className="px-2 py-1.5 text-muted-foreground">{item.max_ndvi.toFixed(2)}</td>
                              <td className="px-2 py-1.5 font-bold text-emerald-600 dark:text-emerald-400">
                                {item.mean_ndvi.toFixed(2)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-border px-5 py-3 bg-[var(--surface-1)] shrink-0">
          <div className="text-[10px] text-muted-foreground font-mono">
            {analysisMode === "single"
              ? "Single image extraction"
              : `${timeSeriesData.length} multi-date outputs analyzed`}
          </div>
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
