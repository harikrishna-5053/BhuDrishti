import { useState } from "react";
import { X, Download, Check } from "lucide-react";
import { toast } from "sonner";
import type { LogLevel } from "@/lib/types";

interface ExportGeoTIFFModalProps {
  open: boolean;
  onClose: () => void;
  resultName: string;
  onPushLog: (level: LogLevel, msg: string) => void;
}

export default function ExportGeoTIFFModal({
  open,
  onClose,
  resultName,
  onPushLog,
}: ExportGeoTIFFModalProps) {
  const [resolution, setResolution] = useState("10m");
  const [format, setFormat] = useState("cog");

  if (!open) return null;

  const handleExport = () => {
    toast.info("Not connected yet", {
      description: "GeoTIFF export service will be connected in the backend integration phase.",
    });
    onPushLog(
      "WARN",
      `Export requested for ${resultName} (${resolution}, ${format.toUpperCase()}): Not connected yet to backend raster generation service.`,
    );
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="glass-panel w-full max-w-md rounded-2xl border border-border bg-[var(--surface-0)] shadow-2xl overflow-hidden animate-ticker">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <div className="flex items-center gap-2.5">
            <div className="grid h-8 w-8 place-items-center rounded-lg bg-primary/20 text-primary">
              <Download className="h-4 w-4" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-foreground">Export GeoTIFF Dataset</h3>
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
          <div>
            <label className="mb-1.5 block text-[10px] uppercase text-muted-foreground">
              Spatial Resolution
            </label>
            <div className="grid grid-cols-3 gap-2">
              {[
                { id: "10m", label: "10 m (Full)" },
                { id: "20m", label: "20 m (Med)" },
                { id: "60m", label: "60 m (Low)" },
              ].map((item) => (
                <button
                  key={item.id}
                  onClick={() => setResolution(item.id)}
                  className={`flex flex-col items-center justify-center rounded-lg border p-2 text-center transition ${
                    resolution === item.id
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border bg-[var(--surface-1)] text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <span className="text-xs font-semibold">{item.id}</span>
                  <span className="text-[9px] opacity-70">{item.label.split(" ")[1]}</span>
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="mb-1.5 block text-[10px] uppercase text-muted-foreground">
              Raster Container Format
            </label>
            <div className="grid grid-cols-2 gap-2">
              {[
                { id: "cog", label: "Cloud-Optimized GeoTIFF (COG)" },
                { id: "geotiff", label: "Standard GeoTIFF (.tif)" },
              ].map((item) => (
                <button
                  key={item.id}
                  onClick={() => setFormat(item.id)}
                  className={`flex items-center justify-between rounded-lg border px-3 py-2 text-left transition ${
                    format === item.id
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border bg-[var(--surface-1)] text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <span className="text-[11px] font-medium">{item.label}</span>
                  {format === item.id && <Check className="h-3.5 w-3.5 shrink-0" />}
                </button>
              ))}
            </div>
          </div>

          <div className="rounded-lg bg-[var(--surface-1)] p-3 text-[11px] space-y-1 text-muted-foreground">
            <div className="flex justify-between">
              <span>Coordinate System:</span>
              <span className="text-foreground">EPSG:4326 (WGS84)</span>
            </div>
            <div className="flex justify-between">
              <span>Pixel Data Type:</span>
              <span className="text-foreground">Float32 (NDVI -1.0 .. +1.0)</span>
            </div>
            <div className="flex justify-between">
              <span>Compression:</span>
              <span className="text-foreground">DEFLATE / Predictor 3</span>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 border-t border-border px-5 py-3 bg-[var(--surface-1)]">
          <button
            onClick={onClose}
            className="rounded-md border border-border px-4 py-2 text-xs font-medium text-muted-foreground hover:bg-[var(--surface-2)] hover:text-foreground transition cursor-pointer"
          >
            Cancel
          </button>
          <button
            onClick={handleExport}
            className="rounded-md bg-primary px-4 py-2 text-xs font-medium text-primary-foreground shadow-md hover:bg-primary/90 transition cursor-pointer"
          >
            Download File
          </button>
        </div>
      </div>
    </div>
  );
}
