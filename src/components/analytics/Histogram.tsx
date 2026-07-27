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

interface HistogramProps {
  histogram: { bin: number; count: number }[];
  currentNdvi?: number;
}

export default function Histogram({ histogram, currentNdvi }: HistogramProps) {
  return (
    <div className="h-full w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={histogram} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="oklch(1 0 0 / 6%)" vertical={false} />
          <XAxis
            dataKey="bin"
            tick={{ fill: "var(--color-muted-foreground)", fontSize: 9, fontFamily: "JetBrains Mono" }}
            tickFormatter={(val: number) => val.toFixed(1)}
            stroke="oklch(1 0 0 / 15%)"
          />
          <YAxis
            tick={{ fill: "var(--color-muted-foreground)", fontSize: 9, fontFamily: "JetBrains Mono" }}
            stroke="oklch(1 0 0 / 15%)"
          />
          <Tooltip
            contentStyle={{
              background: "var(--surface-2)",
              border: "1px solid var(--color-border)",
              borderRadius: 8,
              fontSize: 11,
            }}
            labelFormatter={(val) => `NDVI ${Number(val).toFixed(2)}`}
            cursor={{ fill: "oklch(1 0 0 / 5%)" }}
          />
          {currentNdvi !== undefined && (
            <ReferenceLine x={currentNdvi} stroke="oklch(0.95 0 0)" strokeDasharray="3 3" />
          )}
          <Bar dataKey="count" radius={[3, 3, 0, 0]}>
            {histogram.map((entry, index) => (
              <rect key={index} fill={ndviColor(entry.bin)} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
