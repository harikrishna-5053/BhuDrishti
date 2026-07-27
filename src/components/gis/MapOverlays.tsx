import { Compass } from "lucide-react";

type CursorState = {
  lat: number;
  lng: number;
  zoom: number;
};

export function MapLoading() {
  return (
    <div className="grid h-full w-full place-items-center bg-[var(--surface-0)]">
      <div className="flex items-center gap-3 text-xs text-muted-foreground">
        <div className="h-3 w-3 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        Initialising Earth engine…
      </div>
    </div>
  );
}

export default function MapOverlays({
  cursor,
  year,
}: {
  cursor: CursorState;
  year: number;
}) {
  const scaleKm = Math.max(
    1,
    Math.round(20000 / Math.pow(2, cursor.zoom)),
  );

  return (
    <>
      <div className="pointer-events-none absolute left-4 top-4 z-[500] grid h-14 w-14 place-items-center rounded-full border border-border bg-[var(--surface-1)]/80 shadow-lg backdrop-blur">
        <div className="relative flex h-full w-full items-center justify-center">
          <Compass className="h-7 w-7 text-primary" />
          <span className="absolute top-1 font-mono text-[9px] font-bold text-primary">
            N
          </span>
        </div>
      </div>

      <div className="pointer-events-none absolute bottom-4 left-4 z-[500] w-64 rounded-lg border border-border bg-[var(--surface-1)]/85 p-3 shadow-lg backdrop-blur">
        <div className="mb-1.5 flex items-center justify-between text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          <span>NDVI · {year}</span>
          <span className="font-mono">−0.2 → 0.95</span>
        </div>

        <div className="h-2 w-full rounded-full ndvi-swatch" />

        <div className="mt-1.5 flex justify-between font-mono text-[9px] text-muted-foreground">
          <span>Water</span>
          <span>Bare</span>
          <span>Sparse</span>
          <span>Moderate</span>
          <span>Dense</span>
        </div>
      </div>

      <div className="pointer-events-none absolute bottom-4 right-4 z-[500] flex items-end gap-2 rounded-md border border-border bg-[var(--surface-1)]/85 px-2 py-1.5 shadow-lg backdrop-blur">
        <div className="flex flex-col items-center">
          <div className="h-1.5 w-24 border border-foreground bg-[repeating-linear-gradient(90deg,var(--color-foreground)_0,var(--color-foreground)_12px,transparent_12px,transparent_24px)]" />

          <span className="mt-0.5 font-mono text-[10px] text-muted-foreground">
            {scaleKm} km
          </span>
        </div>
      </div>
    </>
  );
}