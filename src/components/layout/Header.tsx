import { Globe2, Ruler, GitCompareArrows, Settings2, Crop, Printer, Sun, Moon } from "lucide-react";
import { formatCoord } from "@/lib/geo-format";
import type { Theme } from "@/hooks/use-theme";

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
}) {
  return (
    <header className="flex h-14 shrink-0 items-center justify-between border-b border-border bg-[var(--surface-0)] px-4 shadow-[0_1px_6px_rgba(0,0,0,0.06)] relative z-20">
      {/* Left Logo Section */}
      <div className="flex items-center gap-3">
        <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-primary text-primary-foreground shadow-[0_0_16px_oklch(0.78_0.17_168_/_40%)]">
          <Globe2 className="h-5 w-5" />
        </div>
        <div className="leading-tight">
          <div className="flex items-center gap-2">
            <span className="text-base font-semibold tracking-tight text-foreground">
              BhuDrishti
            </span>
          </div>
          <span className="text-[11px] text-muted-foreground font-medium">
            Sentinel-2 NDVI Analytics
          </span>
        </div>
      </div>

      {/* Middle Controls */}
      <div className="hidden items-center gap-2.5 md:flex">
        <IconBtn
          icon={Ruler}
          label="Measure Distance & Area"
          active={measureActive}
          onClick={onToggleMeasure}
        />
        <IconBtn
          icon={GitCompareArrows}
          label={
            swipeDisabled
              ? "Load an NDVI GeoTIFF before using Swipe Comparison."
              : "Swipe compare mode"
          }
          active={swipeActive}
          disabled={swipeDisabled}
          onClick={onToggleSwipe}
        />
        <IconBtn
          icon={Crop}
          label="Draw AOI Field Polygon & Clip Stats"
          active={aoiActive}
          onClick={onToggleAOI}
        />
        <IconBtn
          icon={Printer}
          label="Export Cartographic Map Layout"
          onClick={onOpenCartographicExport}
        />
        <IconBtn
          icon={theme === "dark" ? Sun : Moon}
          label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
          onClick={onToggleTheme}
        />
        <IconBtn icon={Settings2} label="Console Settings" onClick={onOpenSettings} />
      </div>

      {/* Right Status Section */}
      <div className="flex items-center gap-3 font-mono text-[11px] text-muted-foreground">
        <div className="flex flex-col items-center justify-center text-center leading-tight">
          <span className="text-[11px] font-medium text-foreground">
            {formatCoord(cursor.lat, "lat")}
            <span className="mx-1 text-muted-foreground/70 font-normal">|</span>
            {formatCoord(cursor.lng, "lng")}
          </span>
          <span className="text-[11px] font-semibold text-muted-foreground tracking-tight">
            CRS: EPSG:4326
          </span>
        </div>
        <span className="rounded bg-[var(--surface-2)] px-2 py-0.5 font-semibold text-foreground border border-border">
          z {cursor.zoom.toFixed(0)}
        </span>
        <span className="hidden items-center gap-1.5 rounded-full border border-border bg-[var(--surface-1)] px-2 py-1 md:flex font-medium">
          <span className="h-1.5 w-1.5 rounded-full bg-[var(--success)] shadow-[0_0_6px_var(--success)]" />
          Engine online
        </span>
      </div>
    </header>
  );
}
