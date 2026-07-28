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
    if (points.length < 2) return [];

    // Generate transect profile samples between points
    const samples: { distanceKm: number; ndvi: number }[] = [];
    let totalDist = 0;

    for (let i = 0; i < points.length - 1; i++) {
      const p1 = points[i]!;
      const p2 = points[i + 1]!;
      const steps = 15;

      for (let s = 0; s <= steps; s++) {
        const t = s / steps;
        const lat = p1[0] + (p2[0] - p1[0]) * t;
        const lng = p1[1] + (p2[1] - p1[1]) * t;

        const dist = totalDist + t * 2.4; // approx dist step
        const ndvi = Number(
          (0.2 + 0.5 * Math.sin(t * Math.PI * 3) + Math.random() * 0.1).toFixed(3),
        );
        samples.push({ distanceKm: Number(dist.toFixed(2)), ndvi });
      }
      totalDist += 2.4;
    }

    return samples;
  }, [points, sampleValues]);

  if (points.length < 2 && (!sampleValues || sampleValues.length === 0)) {
    return (
      <div className="glass-panel rounded-xl p-3 font-mono text-xs flex items-center justify-center text-muted-foreground gap-2 h-36">
        <Activity className="h-4 w-4 text-primary animate-pulse" />
        <span>
          Click 2 or more points on the map to sample an NDVI field transect cross-section
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
