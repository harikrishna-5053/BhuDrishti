import { X, Gauge, Layers, Info } from "lucide-react";

interface ResultDetailsModalProps {
  open: boolean;
  onClose: () => void;
  resultName: string;
}

export default function ResultDetailsModal({ open, onClose, resultName }: ResultDetailsModalProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="glass-panel w-full max-w-lg rounded-2xl border border-border bg-[var(--surface-0)] shadow-2xl overflow-hidden animate-ticker">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <div className="flex items-center gap-2.5">
            <div className="grid h-8 w-8 place-items-center rounded-lg bg-primary/20 text-primary">
              <Gauge className="h-4 w-4" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-foreground">
                Granule & Spectral Statistics
              </h3>
              <p className="text-[11px] text-muted-foreground">{resultName}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="grid h-8 w-8 place-items-center rounded-md text-muted-foreground hover:bg-[var(--surface-2)] hover:text-foreground transition"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 space-y-4 font-mono text-xs">
          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-lg bg-[var(--surface-1)] p-2.5">
              <span className="text-[9px] uppercase text-muted-foreground">Sensor</span>
              <div className="text-sm font-semibold text-foreground">MSI (Sentinel-2B)</div>
            </div>
            <div className="rounded-lg bg-[var(--surface-1)] p-2.5">
              <span className="text-[9px] uppercase text-muted-foreground">Processing Level</span>
              <div className="text-sm font-semibold text-foreground">Level-2A (BOA)</div>
            </div>
            <div className="rounded-lg bg-[var(--surface-1)] p-2.5">
              <span className="text-[9px] uppercase text-muted-foreground">Sun Elevation</span>
              <div className="text-sm font-semibold text-foreground">48.25°</div>
            </div>
            <div className="rounded-lg bg-[var(--surface-1)] p-2.5">
              <span className="text-[9px] uppercase text-muted-foreground">Cloud Cover</span>
              <div className="text-sm font-semibold text-[var(--success)]">2.8%</div>
            </div>
          </div>

          <div>
            <div className="mb-1.5 text-[10px] uppercase tracking-wider text-muted-foreground">
              Band Reflectance Means
            </div>
            <div className="space-y-1.5">
              {[
                { band: "B2 (Blue 490nm)", val: "0.084", color: "oklch(0.6 0.15 240)" },
                { band: "B3 (Green 560nm)", val: "0.112", color: "oklch(0.7 0.18 140)" },
                { band: "B4 (Red 665nm)", val: "0.095", color: "oklch(0.6 0.2 30)" },
                { band: "B8 (NIR 842nm)", val: "0.384", color: "oklch(0.5 0.2 150)" },
                { band: "B11 (SWIR 1610nm)", val: "0.210", color: "oklch(0.7 0.1 60)" },
              ].map((b) => (
                <div
                  key={b.band}
                  className="flex items-center justify-between rounded-md bg-[var(--surface-1)] px-3 py-1.5"
                >
                  <span className="flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full" style={{ background: b.color }} />
                    <span className="text-[11px]">{b.band}</span>
                  </span>
                  <span className="font-semibold text-foreground">{b.val}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end border-t border-border px-5 py-3 bg-[var(--surface-1)]">
          <button
            onClick={onClose}
            className="rounded-md bg-primary px-4 py-2 text-xs font-medium text-primary-foreground shadow-md hover:bg-primary/90 transition"
          >
            Close Details
          </button>
        </div>
      </div>
    </div>
  );
}
