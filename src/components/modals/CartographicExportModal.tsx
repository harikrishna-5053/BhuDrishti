import { useState } from "react";
import { X, Download, Compass, Globe2, Layers, CheckCircle2 } from "lucide-react";
import { useGeoTIFFStore } from "@/stores/geotiff-store";

interface CartographicExportModalProps {
  open: boolean;
  onClose: () => void;
  onPushLog: (level: any, msg: string) => void;
}

export default function CartographicExportModal({ open, onClose, onPushLog }: CartographicExportModalProps) {
  const { raster, colorRamp } = useGeoTIFFStore();
  const [exporting, setExporting] = useState(false);

  if (!open) return null;

  const handleDownloadMap = () => {
    setExporting(true);
    setTimeout(() => {
      onPushLog("SUCCESS", `Exported presentation cartographic map layout for ${raster?.fileName || "BhuDrishti NDVI Overlay"}`);
      setExporting(false);
      onClose();
    }, 1200);
  };

  return (
    <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/70 backdrop-blur-md p-4 font-mono">
      <div className="glass-panel w-full max-w-2xl rounded-2xl border border-border bg-[var(--surface-0)] shadow-2xl overflow-hidden animate-ticker flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-5 py-4 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="grid h-8 w-8 place-items-center rounded-lg bg-primary text-primary-foreground">
              <Globe2 className="h-4 w-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-foreground">Cartographic Map Export</h3>
              <p className="text-[10px] font-medium text-muted-foreground">ISRO NRSC Cartographic Layout Generator</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="grid h-8 w-8 place-items-center rounded-md text-muted-foreground hover:bg-[var(--surface-2)] hover:text-foreground transition cursor-pointer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Printable Map Frame Canvas Preview */}
        <div className="p-5 overflow-y-auto min-h-0 flex-1 space-y-4">
          <div className="relative rounded-xl border-2 border-primary/50 bg-[var(--surface-1)] p-4 shadow-xl overflow-hidden space-y-3">
            {/* Map Cartographic Header Banner */}
            <div className="flex items-center justify-between border-b border-border pb-2">
              <div className="flex items-center gap-2">
                <div className="h-7 w-7 rounded bg-primary text-primary-foreground grid place-items-center font-bold text-xs">
                  ISRO
                </div>
                <div>
                  <div className="text-xs font-bold tracking-tight text-foreground">
                    BhuDrishti :: Sentinel-2 NDVI Product
                  </div>
                  <div className="text-[9px] font-semibold text-muted-foreground">
                    National Remote Sensing Centre (NRSC), ISRO Shadnagar
                  </div>
                </div>
              </div>
              <div className="text-right text-[9px] font-semibold text-muted-foreground">
                <div>CRS: {raster?.crs || "EPSG:4326 (WGS84)"}</div>
                <div>Date: {new Date().toLocaleDateString("en-IN")}</div>
              </div>
            </div>

            {/* Simulated Canvas Preview Container */}
            <div className="relative h-56 w-full rounded-lg overflow-hidden border border-border bg-[linear-gradient(135deg,#1e293b,#0f172a)] flex items-center justify-center shadow-inner">
              <div
                className="absolute inset-0 opacity-80"
                style={{ background: "var(--gradient-ndvi)" }}
              />
              <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_30%,rgba(0,0,0,0.6)_100%)]" />

              {/* Watermark Logo */}
              <div className="relative z-10 text-center font-mono text-white/90 drop-shadow-md">
                <Globe2 className="h-8 w-8 mx-auto mb-1 animate-pulse" />
                <div className="text-sm font-bold tracking-wider uppercase">
                  {raster?.fileName || "BhuDrishti Satellite Map Overlay"}
                </div>
                <div className="text-[10px] opacity-90 font-medium">
                  {raster ? `${raster.width} × ${raster.height} px · Palette: ${colorRamp.toUpperCase()}` : "Sentinel-2 10 m Resolution"}
                </div>
              </div>

              {/* North Arrow Compass Icon */}
              <div className="absolute top-3 right-3 rounded-full bg-black/60 p-2 text-white border border-white/20 backdrop-blur shadow-lg flex flex-col items-center">
                <span className="text-[9px] font-bold text-primary">N</span>
                <Compass className="h-4 w-4 text-primary" />
              </div>

              {/* Scale Bar */}
              <div className="absolute bottom-3 left-3 bg-black/60 px-2 py-1 rounded border border-white/20 backdrop-blur text-[9px] text-white font-mono">
                <div className="flex items-center gap-1">
                  <div className="h-1.5 w-12 border-b-2 border-l-2 border-r-2 border-white flex justify-between" />
                  <span>10 km</span>
                </div>
              </div>
            </div>

            {/* Map Legend Bar */}
            <div className="rounded-lg bg-[var(--surface-2)] border border-border p-2 space-y-1">
              <div className="flex items-center justify-between text-[9px] text-muted-foreground uppercase font-bold">
                <span>NDVI Vegetation Index Color Bar</span>
                <span>−0.2 → +1.0</span>
              </div>
              <div className="h-3 w-full rounded ndvi-swatch border border-border" />
              <div className="flex justify-between text-[8px] font-semibold text-muted-foreground">
                <span>Water (-0.2)</span>
                <span>Bare Land (0.1)</span>
                <span>Sparse (0.3)</span>
                <span>Moderate (0.5)</span>
                <span>Dense Forest (0.8+)</span>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-border px-5 py-3 bg-[var(--surface-1)] shrink-0">
          <span className="text-[10px] text-muted-foreground flex items-center gap-1 font-semibold">
            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" /> Print-ready PNG map layout
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              disabled={exporting}
              className="rounded-md border border-border px-4 py-2 text-xs font-semibold text-foreground hover:bg-[var(--surface-2)] transition cursor-pointer"
            >
              Cancel
            </button>
            <button
              onClick={handleDownloadMap}
              disabled={exporting}
              className="rounded-md bg-primary text-primary-foreground px-4 py-2 text-xs font-bold hover:bg-primary/90 transition shadow flex items-center gap-1.5 cursor-pointer"
            >
              <Download className="h-3.5 w-3.5" />
              {exporting ? "Generating Map Layout..." : "Export Map Image (PNG)"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
