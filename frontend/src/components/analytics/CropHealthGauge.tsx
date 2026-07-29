import { useMemo } from "react";
import { Activity, AlertTriangle, CheckCircle2, Leaf, ShieldAlert } from "lucide-react";
import { useGeoTIFFStore } from "@/stores/geotiff-store";

export default function CropHealthGauge() {
  const { raster } = useGeoTIFFStore();

  const healthData = useMemo(() => {
    if (!raster) return null;

    const { values, noDataValue } = raster;
    let totalValid = 0;
    let denseCount = 0;
    let modCount = 0;
    let stressCount = 0;
    let nonVegCount = 0;

    const step = Math.max(1, Math.floor(values.length / 50000)); // Performance sampling for large arrays

    for (let i = 0; i < values.length; i += step) {
      const v = values[i];
      if (v === undefined || isNaN(v) || !isFinite(v)) continue;
      if (noDataValue !== null && Math.abs(v - noDataValue) < 1e-4) continue;
      if (Math.abs(v - -9999) < 1e-4) continue;
      if (v < -1.0 || v > 1.0) continue;

      totalValid++;
      if (v >= 0.6) denseCount++;
      else if (v >= 0.3) modCount++;
      else if (v >= 0.1) stressCount++;
      else nonVegCount++;
    }

    if (totalValid === 0) return null;

    const densePct = (denseCount / totalValid) * 100;
    const modPct = (modCount / totalValid) * 100;
    const stressPct = (stressCount / totalValid) * 100;
    const nonVegPct = (nonVegCount / totalValid) * 100;

    // Overall agricultural health index score
    const healthScore = Math.min(
      100,
      Math.round(densePct * 1.0 + modPct * 0.65 + stressPct * 0.25),
    );

    let status: { title: string; color: string; icon: typeof CheckCircle2; bg: string } = {
      title: "Flourishing / High Vigor",
      color: "var(--success)",
      icon: CheckCircle2,
      bg: "oklch(0.5 0.18 150 / 15%)",
    };

    if (healthScore < 40) {
      status = {
        title: "Severe Crop Stress / Drought",
        color: "var(--destructive)",
        icon: ShieldAlert,
        bg: "oklch(0.5 0.18 30 / 15%)",
      };
    } else if (healthScore < 70) {
      status = {
        title: "Moderate Health / Watch Zone",
        color: "oklch(0.65 0.16 85)",
        icon: AlertTriangle,
        bg: "oklch(0.7 0.18 90 / 15%)",
      };
    }

    return {
      totalValid,
      densePct,
      modPct,
      stressPct,
      nonVegPct,
      healthScore,
      status,
    };
  }, [raster]);

  if (!healthData) return null;

  const StatusIcon = healthData.status.icon;

  return (
    <div className="glass-panel rounded-xl p-3 font-mono text-xs space-y-3 bg-[var(--surface-0)] border border-border shadow-[0_2px_8px_rgba(0,0,0,0.06)]">
      <div className="flex items-center justify-between border-b border-border pb-2">
        <div className="flex items-center gap-2">
          <div className="grid h-6 w-6 place-items-center rounded bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30">
            <Leaf className="h-3.5 w-3.5" />
          </div>
          <span className="font-bold text-foreground">Crop Vigor & Health Anomaly</span>
        </div>
        <span
          className="flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold border border-border"
          style={{ color: healthData.status.color, background: healthData.status.bg }}
        >
          <StatusIcon className="h-3 w-3" />
          {healthData.status.title}
        </span>
      </div>

      {/* Health Score Progress Bar */}
      <div>
        <div className="flex items-baseline justify-between mb-1">
          <span className="text-[10px] font-bold uppercase text-muted-foreground">
            Agricultural Health Index
          </span>
          <span className="text-sm font-extrabold" style={{ color: healthData.status.color }}>
            {healthData.healthScore} / 100
          </span>
        </div>
        <div className="h-2 w-full overflow-hidden rounded-full bg-[var(--surface-2)] border border-border">
          <div
            className="h-full transition-all duration-500 rounded-full"
            style={{ width: `${healthData.healthScore}%`, background: healthData.status.color }}
          />
        </div>
      </div>

      {/* 4-class Distribution Breakdown Grid */}
      <div className="grid grid-cols-2 gap-2 text-[10px]">
        <HealthMetric
          label="Healthy Crop (NDVI ≥ 0.6)"
          pct={healthData.densePct}
          color="oklch(0.55 0.17 150)"
        />
        <HealthMetric
          label="Developing (0.3 - 0.6)"
          pct={healthData.modPct}
          color="oklch(0.6 0.15 140)"
        />
        <HealthMetric
          label="Crop Stress (0.1 - 0.3)"
          pct={healthData.stressPct}
          color="oklch(0.6 0.14 90)"
        />
        <HealthMetric
          label="Water / Bare Land (<0.1)"
          pct={healthData.nonVegPct}
          color="oklch(0.55 0.1 60)"
        />
      </div>
    </div>
  );
}

function HealthMetric({ label, pct, color }: { label: string; pct: number; color: string }) {
  return (
    <div className="rounded-lg bg-[var(--surface-1)] border border-border p-2 shadow-sm">
      <div className="flex items-center justify-between text-muted-foreground mb-1 font-medium">
        <span className="truncate">{label}</span>
        <span className="font-bold text-foreground">{pct.toFixed(1)}%</span>
      </div>
      <div className="h-1 overflow-hidden rounded-full bg-[var(--surface-2)] border border-border/50">
        <div className="h-full rounded-full" style={{ width: `${pct}%`, background: color }} />
      </div>
    </div>
  );
}
