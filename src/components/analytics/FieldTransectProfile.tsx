import { useMemo } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { TrendingUp, Activity } from "lucide-react";

interface FieldTransectProfileProps {
  points: [number, number][]; // [lat, lng]
  sampleValues?: { distanceKm: number; ndvi: number }[];
}

export default function FieldTransectProfile({ points, sampleValues }: FieldTransectProfileProps) {
  const chartData = useMemo(() => {
    if (sampleValues && sampleValues.length > 0) return sampleValues;
    return [];
  }, [sampleValues]);

  if (!sampleValues || sampleValues.length === 0) {
    return (
      <div className="glass-panel rounded-xl p-4 font-mono text-xs flex flex-col items-center justify-center text-center text-muted-foreground gap-1.5 h-44 border border-border">
        <Activity className="h-5 w-5 text-primary" />
        <span className="font-bold text-foreground">Field Transect NDVI Cross-Section</span>
        <span className="text-[11px] max-w-sm">
          Real line-transect pixel sampling requires backend spatial raster API connection.
        </span>
      </div>
    );
  }

  return (
    <div className="glass-panel rounded-xl p-3 font-mono text-xs space-y-2 h-44 flex flex-col">
      <div className="flex items-center justify-between border-b border-border pb-1 shrink-0">
        <div className="flex items-center gap-2">
          <TrendingUp className="h-4 w-4 text-emerald-400" />
          <span className="font-semibold text-foreground">Field Transect NDVI Cross-Section</span>
        </div>
        <span className="text-[10px] text-muted-foreground">{chartData.length} sampled points</span>
      </div>

      <div className="min-h-0 flex-1">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData} margin={{ top: 4, right: 8, left: -25, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="oklch(1 0 0 / 6%)" />
            <XAxis
              dataKey="distanceKm"
              tick={{ fill: "var(--color-muted-foreground)", fontSize: 9 }}
              stroke="oklch(1 0 0 / 15%)"
            />
            <YAxis
              domain={[-0.1, 1.0]}
              tick={{ fill: "var(--color-muted-foreground)", fontSize: 9 }}
              stroke="oklch(1 0 0 / 15%)"
            />
            <Tooltip
              contentStyle={{
                background: "var(--surface-2)",
                border: "1px solid var(--color-border)",
                borderRadius: 8,
                fontSize: 11,
              }}
            />
            <Line
              type="monotone"
              dataKey="ndvi"
              stroke="var(--success)"
              strokeWidth={2}
              dot={{ r: 2 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
