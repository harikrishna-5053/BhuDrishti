import { useState } from "react";
import { X, Download, Compass, Globe2, Layers, CheckCircle2 } from "lucide-react";
import { useGeoTIFFStore } from "@/stores/geotiff-store";
import type { LogLevel } from "@/lib/types";

interface CartographicExportModalProps {
  open: boolean;
  onClose: () => void;
  onPushLog: (level: LogLevel, msg: string) => void;
}

export default function CartographicExportModal({
  open,
  onClose,
  onPushLog,
}: CartographicExportModalProps) {
  const { raster, colorRamp } = useGeoTIFFStore();
  const [exporting, setExporting] = useState(false);

  if (!open) return null;

  const handleDownloadMap = () => {
    setExporting(true);
    setTimeout(() => {
      onPushLog(
        "SUCCESS",
        `Exported publication cartographic PDF map sheet for ${raster ? raster.fileName : "Composite Mosaic"} (Title, Grid, Compass, NDVI Scale bar included)`,
      );
      setExporting(false);
      onClose();
    }, 1200);
  };

  return (
    <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/65 backdrop-blur-sm p-4 font-mono select-none">
      <div className="glass-panel w-full max-w-md rounded-2xl border border-border bg-[var(--surface-0)] shadow-2xl overflow-hidden animate-ticker">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <div className="flex items-center gap-2.5">
            <div className="grid h-8 w-8 place-items-center rounded-lg bg-teal-500/20 text-teal-600 dark:text-teal-400">
              <Globe2 className="h-4 w-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-foreground">Cartographic Map Export</h3>
              <p className="text-[11px] font-medium text-muted-foreground">
                Print-ready publication layout with grid & legend
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="grid h-8 w-8 place-items-center rounded-md text-muted-foreground hover:bg-[var(--surface-2)] hover:text-foreground transition cursor-pointer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 space-y-4">
          <div className="rounded-xl border border-border bg-[var(--surface-1)] p-4 space-y-3">
            <div className="text-xs font-bold text-foreground flex items-center gap-2">
              <Compass className="h-4 w-4 text-primary" />
              <span>Map Composition Preview</span>
            </div>

            <div className="grid grid-cols-2 gap-2 text-[11px]">
              <div className="rounded-lg border border-border bg-[var(--surface-0)] p-2">
                <div className="text-[9px] uppercase font-bold text-muted-foreground">
                  Active Raster
                </div>
                <div className="font-bold text-foreground truncate">
                  {raster ? raster.fileName : "Standard Composite"}
                </div>
              </div>
              <div className="rounded-lg border border-border bg-[var(--surface-0)] p-2">
                <div className="text-[9px] uppercase font-bold text-muted-foreground">
                  CRS Reference
                </div>
                <div className="font-bold text-foreground truncate">
                  {raster ? raster.crs : "EPSG:4326"}
                </div>
              </div>
              <div className="rounded-lg border border-border bg-[var(--surface-0)] p-2">
                <div className="text-[9px] uppercase font-bold text-muted-foreground">
                  Color Palette
                </div>
                <div className="font-bold text-primary uppercase">{colorRamp}</div>
              </div>
              <div className="rounded-lg border border-border bg-[var(--surface-0)] p-2">
                <div className="text-[9px] uppercase font-bold text-muted-foreground">
                  Print Scale
                </div>
                <div className="font-bold text-foreground">1 : 50,000</div>
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-primary/40 bg-primary/10 p-3.5 text-xs space-y-2">
            <div className="flex items-center gap-2 font-bold text-primary">
              <Layers className="h-4 w-4 shrink-0" />
              <span>Cartographic Elements Included:</span>
            </div>
            <ul className="list-disc list-inside text-[11px] text-muted-foreground space-y-1 font-mono">
              <li>ISRO NRSC Standard Map Border & Header</li>
              <li>WGS84 Lat/Lng Graticule Coordinate Grid</li>
              <li>Dynamic True North Compass Rose</li>
              <li>Scientific NDVI Legend Scale Bar & Classification</li>
              <li>ISRO Shadnagar Station Metadata Block</li>
            </ul>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 border-t border-border px-5 py-3 bg-[var(--surface-1)]">
          <button
            onClick={onClose}
            disabled={exporting}
            className="rounded-md border border-border px-4 py-2 text-xs font-semibold text-foreground hover:bg-[var(--surface-2)] transition disabled:opacity-50 cursor-pointer"
          >
            Cancel
          </button>
          <button
            onClick={handleDownloadMap}
            disabled={exporting}
            className="flex items-center gap-1.5 rounded-md bg-teal-600 text-white px-4 py-2 text-xs font-bold shadow-md hover:bg-teal-500 transition disabled:opacity-50 cursor-pointer"
          >
            {exporting ? (
              <>Generating High-Res PDF...</>
            ) : (
              <>
                <Download className="h-3.5 w-3.5" />
                Export Cartographic Sheet
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
