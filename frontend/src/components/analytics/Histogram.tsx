import { useMemo } from "react";
import {
  BarChart,
  Bar,
  Cell,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";
import { useGeoTIFFStore } from "@/stores/geotiff-store";

interface HistogramProps {
  year?: number;
  currentNdvi?: number | null;
  histogram?: { binStart: number; binEnd: number; count: number }[];
}

function generateDefaultHistogram(year: number) {
  const seed = year % 10;
  return Array.from({ length: 25 }, (_, i) => ({
    binStart: -1 + i * 0.08,
    binEnd: -1 + (i + 1) * 0.08,
    count: Math.floor(Math.abs(Math.sin(i + seed)) * 1800 + 150),
  }));
}

export default function Histogram({ year = 2026, currentNdvi, histogram }: HistogramProps) {
  const { raster } = useGeoTIFFStore();

  const formattedData = useMemo(() => {
    const rawBins = histogram || raster?.statistics?.histogram || generateDefaultHistogram(year);
    return rawBins.map((bin: { binStart: number; binEnd: number; count: number }) => ({
      bin: Number(((bin.binStart + bin.binEnd) / 2).toFixed(2)),
      binStart: bin.binStart,
      binEnd: bin.binEnd,
      count: bin.count,
    }));
  }, [histogram, raster, year]);

  return (
    <div className="h-full w-full select-none">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={formattedData} margin={{ top: 8, right: 12, left: 0, bottom: 4 }}>
          <XAxis
            dataKey="bin"
            stroke="var(--color-muted-foreground)"
            fontSize={9}
            tickLine={false}
            domain={[-1, 1]}
            ticks={[-1, -0.5, 0, 0.5, 1]}
          />
          <YAxis
            stroke="var(--color-muted-foreground)"
            fontSize={9}
            tickLine={false}
            width={34}
            tickFormatter={(v) => (v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v)}
          />
          <Tooltip
            contentStyle={{
              background: "var(--surface-0)",
              borderColor: "var(--color-border)",
              color: "var(--color-foreground)",
              borderRadius: 8,
              fontSize: 11,
              fontFamily: "JetBrains Mono",
              boxShadow: "0 4px 12px rgba(0,0,0,0.1)",
            }}
            labelFormatter={(val, payload) => {
              if (payload && payload[0] && payload[0].payload) {
                const item = payload[0].payload;
                return `NDVI Range: [${Number(item.binStart).toFixed(2)} .. ${Number(item.binEnd).toFixed(2)}]`;
              }
              return `NDVI ${Number(val).toFixed(2)}`;
            }}
            formatter={(value) => [`${Number(value ?? 0).toLocaleString()} pixels`, "Count"]}
            cursor={{ fill: "var(--surface-2)" }}
          />
          {currentNdvi !== undefined && currentNdvi !== null && (
            <ReferenceLine x={currentNdvi} stroke="#34d399" strokeWidth={2} strokeDasharray="3 3" />
          )}
          <Bar dataKey="count" fill="#10b981" radius={[3, 3, 0, 0]}>
            {formattedData.map((entry: { binStart: number; binEnd: number }, index: number) => {
              const hasSelection = currentNdvi !== undefined && currentNdvi !== null;
              const isCurrentBin =
                hasSelection &&
                currentNdvi >= entry.binStart &&
                (index === formattedData.length - 1
                  ? currentNdvi <= entry.binEnd
                  : currentNdvi < entry.binEnd);
              return (
                <Cell
                  key={`cell-${index}`}
                  fill={isCurrentBin ? "#34d399" : "#10b981"}
                  fillOpacity={hasSelection ? (isCurrentBin ? 1.0 : 0.3) : 1.0}
                  stroke={isCurrentBin ? "#059669" : "transparent"}
                  strokeWidth={isCurrentBin ? 2 : 0}
                />
              );
            })}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
