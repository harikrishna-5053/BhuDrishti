import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

interface TimeSeriesProps {
  data: { month: string; [key: string]: string | number }[];
  years: number[];
}

/*
 * TODO: Reserved component for multi-year temporal trend visualizations.
 * Keep unmounted in production path until multi-temporal Sentinel-2 pipeline is connected.
 */
export default function TimeSeries({ data, years }: TimeSeriesProps) {
  return (
    <div className="h-full w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="oklch(1 0 0 / 6%)" />
          <XAxis
            dataKey="month"
            tick={{ fill: "var(--color-muted-foreground)", fontSize: 10 }}
            stroke="oklch(1 0 0 / 15%)"
          />
          <YAxis
            domain={[-0.1, 0.9]}
            tick={{ fill: "var(--color-muted-foreground)", fontSize: 10 }}
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
          {years.map((y, i) => (
            <Line
              key={y}
              type="monotone"
              dataKey={String(y)}
              stroke={`var(--chart-${i + 1})`}
              strokeWidth={i === years.length - 1 ? 2.5 : 2}
              dot={i === years.length - 1 ? { r: 2 } : false}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
