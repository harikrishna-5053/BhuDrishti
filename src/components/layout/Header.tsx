import {
  Globe2,
  Ruler,
  GitCompareArrows,
  Settings2,
} from "lucide-react";
import { formatCoord } from "@/lib/geo-format";
function IconBtn({
  icon: Icon,
  label,
}: {
  icon: typeof Ruler;
  label: string;
}) {
  return (
    <button
      title={label}
      className="grid h-8 w-8 place-items-center rounded-md border border-border bg-[var(--surface-1)] text-muted-foreground transition hover:border-primary/60 hover:text-primary"
    >
      <Icon className="h-4 w-4" />
    </button>
  );
}
export default function Header({
  cursor,
  year,
  setYear,
}: {
  cursor: {
    lat: number;
    lng: number;
    zoom: number;
  };
  year: number;
  setYear: (y: number) => void;
}) {
  return (
    <header className="flex h-14 shrink-0 items-center justify-between border-b border-border bg-[var(--surface-0)] px-4">

      {/* Left Logo Section */}

      <div className="flex items-center gap-3">
        <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-primary text-primary-foreground shadow-[0_0_16px_oklch(0.78_0.17_168_/_40%)]">
          <Globe2 className="h-5 w-5" />
        </div>
        <div className="leading-tight">
          <div className="flex items-center gap-2">
            <span className="text-base font-semibold tracking-tight">
              BhuDrishti
            </span>
            <span className="rounded border border-border bg-[var(--surface-2)] px-1.5 py-0.5 font-mono text-[10px] uppercase text-muted-foreground">
              v2.4 · L2A
            </span>
          </div>
          <span className="text-[11px] text-muted-foreground">
            Sentinel-2 NDVI Analytics · India Node
          </span>
        </div>
      </div>
      {/* Middle Controls */}
      <div className="hidden items-center gap-2 md:flex">
        <div className="flex items-center gap-1 rounded-md border border-border bg-[var(--surface-1)] p-1">
          {[2024, 2025, 2026].map((y) => (
            <button
              key={y}
              onClick={() => setYear(y)}
              className={`rounded px-3 py-1 font-mono text-xs transition ${
                y === year
                  ? "bg-primary text-primary-foreground shadow-[var(--shadow-glow)]"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {y}
            </button>
          ))}

        </div>
        <IconBtn
          icon={Ruler}
          label="Measure"
        />
        <IconBtn
          icon={GitCompareArrows}
          label="Swipe compare"
        />
        <IconBtn
          icon={Settings2}
          label="Settings"
        />
      </div>
      {/* Right Status Section */}
      <div className="flex items-center gap-3 font-mono text-[11px] text-muted-foreground">
        <span className="hidden md:inline">
          CRS: EPSG:4326
        </span>
        <span className="hidden md:inline">
          |
        </span>
        <span>
          {formatCoord(cursor.lat, "lat")}
          {" , "}
          {formatCoord(cursor.lng, "lng")}
        </span>
        <span className="rounded bg-[var(--surface-2)] px-2 py-0.5">
          z {cursor.zoom.toFixed(0)}
        </span>
        <span className="hidden items-center gap-1.5 rounded-full border border-border bg-[var(--surface-1)] px-2 py-1 md:flex">
          <span className="h-1.5 w-1.5 rounded-full bg-[var(--success)] shadow-[0_0_6px_var(--success)]" />
          Engine online
        </span>
      </div>
    </header>
  );
}