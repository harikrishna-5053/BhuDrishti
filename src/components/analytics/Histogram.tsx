import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";
import { ndviColor } from "@/lib/ndvi";
import type { NDVIRasterHistogramBin } from "@/lib/geotiff/types";

interface HistogramProps {
  histogram: (
    | { bin: number; count: number }
    | NDVIRasterHistogramBin
  )[];
  currentNdvi?: number;
}

export default function Histogram({ histogram, currentNdvi }: HistogramProps) {
  const formattedData = histogram.map((h) => {
    if ("binCenter" in h) {
      return {
        bin: h.binCenter,
        binStart: h.binStart,
        binEnd: h.binEnd,
        count: h.count,
      };
    }
    return {
      bin: h.bin,
      binStart: h.bin - 0.05,
      binEnd: h.bin + 0.05,
      count: h.count,
    };
  });

  return (
    <div className="h-full w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={formattedData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
          <XAxis
            dataKey="bin"
            tick={{ fill: "var(--color-muted-foreground)", fontSize: 9, fontFamily: "JetBrains Mono" }}
            tickFormatter={(val: number) => val.toFixed(1)}
            stroke="var(--color-border)"
          />
          <YAxis
            tick={{ fill: "var(--color-muted-foreground)", fontSize: 9, fontFamily: "JetBrains Mono" }}
            stroke="var(--color-border)"
          />
          <Tooltip
            contentStyle={{
              background: "var(--surface-0)",
              color: "var(--color-foreground)",
              border: "1px solid var(--color-border)",
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
            formatter={(value: any) => [`${Number(value).toLocaleString()} pixels`, "Count"]}
            cursor={{ fill: "var(--surface-2)" }}
          />
          {currentNdvi !== undefined && currentNdvi !== null && (
            <ReferenceLine x={currentNdvi} stroke="var(--color-foreground)" strokeDasharray="3 3" />
          )}
          <Bar dataKey="count" radius={[3, 3, 0, 0]}>
            {formattedData.map((entry, index) => (
              <rect key={index} fill={ndviColor(entry.bin)} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
