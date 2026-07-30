import { useState, useEffect } from "react";
import { Globe2, Ruler, GitCompareArrows, Settings2, Crop, Printer, Sun, Moon } from "lucide-react";
import { formatCoord } from "@/lib/geo-format";
import type { Theme } from "@/hooks/use-theme";
import { api } from "@/lib/api/client";
import { useGeoTIFFStore } from "@/stores/geotiff-store";

function IconBtn({
  icon: Icon,
  label,
  active,
  disabled,
  onClick,
}: {
  icon: typeof Ruler;
  label: string;
  active?: boolean;
  disabled?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      title={label}
      aria-label={label}
      onClick={onClick}
      disabled={disabled}
      className={`grid h-8 w-8 place-items-center rounded-md border transition focus:outline-none focus:ring-1 focus:ring-primary ${
        disabled
          ? "border-border bg-[var(--surface-0)] text-muted-foreground opacity-40 cursor-not-allowed"
          : active
            ? "border-primary bg-primary text-primary-foreground shadow-[var(--shadow-glow)] cursor-pointer"
            : "border-border bg-[var(--surface-0)] text-muted-foreground hover:border-primary/60 hover:text-primary hover:bg-[var(--surface-1)] cursor-pointer"
      }`}
    >
      <Icon className="h-4 w-4" />
    </button>
  );
}

export default function Header({
  cursor,
  theme = "dark",
  onToggleTheme,
  measureActive,
  swipeActive,
  swipeDisabled,
  aoiActive,
  onToggleMeasure,
  onToggleSwipe,
  onToggleAOI,
  onOpenCartographicExport,
  onOpenSettings,
  onBackendStatusChange,
}: {
  cursor: {
    lat: number;
    lng: number;
    zoom: number;
  };
  theme?: Theme;
  onToggleTheme?: () => void;
  measureActive?: boolean;
  swipeActive?: boolean;
  swipeDisabled?: boolean;
  aoiActive?: boolean;
  onToggleMeasure?: () => void;
  onToggleSwipe?: () => void;
  onToggleAOI?: () => void;
  onOpenCartographicExport?: () => void;
  onOpenSettings?: () => void;
  onBackendStatusChange?: (connected: boolean) => void;
}) {
  const [backendStatus, setBackendStatus] = useState<"checking" | "connected" | "disconnected">("checking");
  const { raster } = useGeoTIFFStore();
  const activeCRS = raster?.crs || "EPSG:4326";

  const checkHealth = async () => {
    try {
      await api.getHealth();
      setBackendStatus("connected");
      onBackendStatusChange?.(true);
    } catch {
      setBackendStatus("disconnected");
      onBackendStatusChange?.(false);
    }
  };

  useEffect(() => {
    let timerId: number | null = null;
    let cancelled = false;

    const runHealthCheck = async () => {
      try {
        await api.getHealth();
        if (!cancelled) {
          setBackendStatus("connected");
          onBackendStatusChange?.(true);
        }
      } catch {
        if (!cancelled) {
          setBackendStatus("disconnected");
          onBackendStatusChange?.(false);
        }
      } finally {
        if (!cancelled) {
          timerId = window.setTimeout(runHealthCheck, 20000);
        }
      }
    };

    runHealthCheck();

    return () => {
      cancelled = true;
      if (timerId !== null) window.clearTimeout(timerId);
    };
  }, []);

  return (
    <header className="flex h-14 shrink-0 items-center justify-between border-b border-border bg-[var(--surface-0)] px-4 shadow-[0_1px_6px_rgba(0,0,0,0.06)] relative z-20">
      {/* Left Logo Section */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2">
          <div className="grid h-8 w-8 place-items-center rounded-lg border border-border bg-[var(--surface-1)] shadow-sm overflow-hidden p-1">
            <img src="/favicon.svg" alt="BhuDrishti Logo" className="h-full w-full object-contain" />
          </div>
          <div>
            <h1 className="text-sm font-bold text-foreground tracking-tight font-mono">BhuDrishti</h1>
            <p className="text-[10px] text-muted-foreground font-mono">NDVI Analytics Console</p>
          </div>
        </div>
      </div>

      {/* Center Tools Section */}
      <div className="flex items-center gap-2">
        <IconBtn
          icon={Ruler}
          label="Measure Distance"
          active={measureActive}
          onClick={onToggleMeasure}
        />
        <IconBtn
          icon={GitCompareArrows}
          label="Swipe Compare"
          active={swipeActive}
          disabled={swipeDisabled}
          onClick={onToggleSwipe}
        />
        <IconBtn
          icon={Crop}
          label="AOI Analysis"
          active={aoiActive}
          onClick={onToggleAOI}
        />
        <div className="mx-1 h-5 w-px bg-border" />
        <IconBtn
          icon={Printer}
          label="Export Map Layout"
          onClick={onOpenCartographicExport}
        />
        <IconBtn
          icon={Settings2}
          label="Settings"
          onClick={onOpenSettings}
        />
        <div className="mx-1 h-5 w-px bg-border" />
        <IconBtn
          icon={theme === "dark" ? Sun : Moon}
          label={`Switch to ${theme === "dark" ? "light" : "dark"} theme`}
          onClick={onToggleTheme}
        />
      </div>

      {/* Right Status Section */}
      <div className="flex items-center gap-3 font-mono text-[11px] text-muted-foreground">
        <div className="flex flex-col items-center justify-center text-center leading-tight">
          <span className="text-[11px] font-medium text-foreground">
            {formatCoord(cursor.lat, "lat")}
            <span className="mx-1 text-muted-foreground/70 font-normal">|</span>
            {formatCoord(cursor.lng, "lng")}
          </span>
          <span className="text-[11px] font-semibold text-primary tracking-tight">
            CRS: {activeCRS}
          </span>
        </div>
        <span className="rounded bg-[var(--surface-2)] px-2 py-0.5 font-semibold text-foreground border border-border">
          z {cursor.zoom.toFixed(0)}
        </span>

        {/* Dynamic Backend Status Indicator */}
        <button
          onClick={checkHealth}
          title="Click to recheck backend connection"
          className="hidden items-center gap-1.5 rounded-full border border-border bg-[var(--surface-1)] px-2.5 py-1 md:flex font-medium transition cursor-pointer hover:bg-[var(--surface-2)]"
        >
          {backendStatus === "checking" ? (
            <>
              <span className="h-1.5 w-1.5 rounded-full bg-slate-400 animate-ping" />
              <span className="text-muted-foreground">Checking backend...</span>
            </>
          ) : backendStatus === "connected" ? (
            <>
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.7)]" />
              <span className="text-emerald-600 dark:text-emerald-400 font-semibold">Backend connected</span>
            </>
          ) : (
            <>
              <span className="h-1.5 w-1.5 rounded-full bg-amber-500 shadow-[0_0_6px_rgba(245,158,11,0.6)]" />
              <span className="text-amber-600 dark:text-amber-400">Processing backend not connected</span>
            </>
          )}
        </button>
      </div>
    </header>
  );
}
