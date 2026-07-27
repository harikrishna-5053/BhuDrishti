import { useMemo } from "react";
import { X } from "lucide-react";

import {
  Bar,
  BarChart,
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import {
  classify,
  localStats,
  ndviAt,
  ndviColor,
  type VegClass,
} from "@/lib/ndvi";

import { formatCoord } from "@/lib/geo-format";

type NDVIStatsProps = {
  lat: number;
  lng: number;
  year: number;
  onClose: () => void;
};

export default function NDVIStats({
  lat,
  lng,
  year,
  onClose,
}: NDVIStatsProps) {
  const ndvi = ndviAt(lat, lng, year);
  const cls = classify(ndvi);

  const stats = useMemo(
    () => localStats(lat, lng, year),
    [lat, lng, year],
  );

  return (
    <div className="glass-panel absolute right-3 top-3 z-[600] flex max-h-[calc(100%-1.5rem)] w-96 flex-col overflow-hidden rounded-2xl animate-ticker">
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <div className="flex items-center gap-2">
          <div
            className="h-6 w-6 rounded-md"
            style={{ background: ndviColor(ndvi) }}
          />

          <div>
            <div className="text-sm font-semibold">Point Analysis</div>

            <div className="font-mono text-[10px] text-muted-foreground">
              {formatCoord(lat, "lat")} · {formatCoord(lng, "lng")}
            </div>
          </div>
        </div>

        <button
          onClick={onClose}
          className="grid h-7 w-7 place-items-center rounded-md text-muted-foreground hover:bg-[var(--surface-2)] hover:text-foreground"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        <div
          className="mb-3 rounded-xl border border-border p-4"
          style={{
            background:
              "linear-gradient(135deg, oklch(0.24 0.03 250 / 60%), oklch(0.18 0.03 250 / 60%))",
          }}
        >
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
            Current NDVI · {year}
          </div>

          <div className="mt-1 flex items-baseline gap-2">
            <span
              className="font-mono text-4xl font-bold"
              style={{ color: ndviColor(ndvi) }}
            >
              {ndvi.toFixed(3)}
            </span>

            <VegBadge cls={cls} />
          </div>

          <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-[var(--surface-3)]">
            <div className="h-full ndvi-swatch" />
          </div>

          <div className="relative -mt-2 h-2" aria-hidden>
            <div
              className="absolute -top-1 h-3 w-0.5 rounded-full bg-foreground shadow-[0_0_6px_oklch(1_0_0)]"
              style={{
                left: `${((ndvi + 0.2) / 1.15) * 100}%`,
              }}
            />
          </div>
        </div>

        <div className="mb-4 grid grid-cols-3 gap-2">
          <Stat label="Min" value={stats.min.toFixed(2)} />
          <Stat label="Max" value={stats.max.toFixed(2)} />
          <Stat label="Mean" value={stats.mean.toFixed(2)} />
          <Stat label="Median" value={stats.median.toFixed(2)} />
          <Stat label="Std Dev" value={stats.std.toFixed(3)} />
          <Stat
            label="Veg %"
            value={`${stats.vegPct.toFixed(0)}%`}
            accent
          />
        </div>

        <div className="mb-2 flex items-center justify-between">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            Pixel distribution
          </div>

          <span className="font-mono text-[10px] text-muted-foreground">
            n = {stats.histogram.reduce((sum, bin) => sum + bin.count, 0)}
          </span>
        </div>

        <div className="h-40 rounded-lg border border-border bg-[var(--surface-1)] p-2">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={stats.histogram}
              margin={{ top: 4, right: 4, left: -20, bottom: 0 }}
            >
              <CartesianGrid
                strokeDasharray="3 3"
                stroke="oklch(1 0 0 / 6%)"
                vertical={false}
              />

              <XAxis
                dataKey="bin"
                tick={{
                  fill: "var(--color-muted-foreground)",
                  fontSize: 9,
                  fontFamily: "JetBrains Mono",
                }}
                tickFormatter={(value: number) => value.toFixed(1)}
                stroke="oklch(1 0 0 / 15%)"
              />

              <YAxis
                tick={{
                  fill: "var(--color-muted-foreground)",
                  fontSize: 9,
                  fontFamily: "JetBrains Mono",
                }}
                stroke="oklch(1 0 0 / 15%)"
              />

              <Tooltip
                contentStyle={{
                  background: "var(--surface-2)",
                  border: "1px solid var(--color-border)",
                  borderRadius: 8,
                  fontSize: 11,
                }}
                labelFormatter={(value) =>
                  `NDVI ${Number(value).toFixed(2)}`
                }
                cursor={{ fill: "oklch(1 0 0 / 5%)" }}
              />

              <ReferenceLine
                x={ndvi}
                stroke="oklch(0.95 0 0)"
                strokeDasharray="3 3"
              />

              <Bar dataKey="count" radius={[3, 3, 0, 0]}>
                {stats.histogram.map((bin, index) => (
                  <rect
                    key={index}
                    fill={ndviColor(bin.bin)}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <div
      className={`rounded-lg border border-border p-2 ${
        accent ? "bg-primary/10" : "bg-[var(--surface-1)]"
      }`}
    >
      <div className="text-[9px] uppercase tracking-wider text-muted-foreground">
        {label}
      </div>

      <div
        className={`font-mono text-sm font-semibold ${
          accent ? "text-primary" : "text-foreground"
        }`}
      >
        {value}
      </div>
    </div>
  );
}

function VegBadge({ cls }: { cls: VegClass }) {
  const styles: Record<VegClass, { color: string; bg: string }> = {
    Water: {
      color: "oklch(0.9 0.05 240)",
      bg: "oklch(0.4 0.15 250 / 30%)",
    },
    "Bare land": {
      color: "oklch(0.85 0.1 60)",
      bg: "oklch(0.55 0.16 40 / 30%)",
    },
    "Sparse vegetation": {
      color: "oklch(0.9 0.14 90)",
      bg: "oklch(0.7 0.15 90 / 30%)",
    },
    "Moderate vegetation": {
      color: "oklch(0.9 0.15 140)",
      bg: "oklch(0.7 0.18 140 / 30%)",
    },
    "Dense vegetation": {
      color: "oklch(0.85 0.17 150)",
      bg: "oklch(0.5 0.18 150 / 40%)",
    },
  };

  const style = styles[cls];

  return (
    <span
      className="rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider"
      style={{
        color: style.color,
        background: style.bg,
      }}
    >
      {cls}
    </span>
  );
}