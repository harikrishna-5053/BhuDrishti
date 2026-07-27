import { useState } from "react";
import { X, Layers, FileCheck, AlertTriangle, AlertCircle, RefreshCw, HelpCircle } from "lucide-react";
import { useGeoTIFFStore } from "@/stores/geotiff-store";
import { readNDVIGeoTIFF } from "@/lib/geotiff/read-ndvi-geotiff";
import type { LogLevel } from "@/lib/types";

interface NDVIGeoTIFFModalProps {
  open: boolean;
  onClose: () => void;
  onPushLog: (level: LogLevel, msg: string) => void;
}

const LARGE_FILE_WARNING_BYTES = 250 * 1024 * 1024; // 250 MB

export default function NDVIGeoTIFFModal({ open, onClose, onPushLog }: NDVIGeoTIFFModalProps) {
  const [file, setFile] = useState<File | null>(null);
  const [parsing, setParsing] = useState(false);
  const [stage, setStage] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [confirmReplaceStep, setConfirmReplaceStep] = useState(false);

  const { raster, setRaster, setError, clearRaster } = useGeoTIFFStore();

  if (!open) return null;

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setErrorMessage(null);
    setConfirmReplaceStep(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const selected = e.dataTransfer.files[0];
      validateAndSetFile(selected);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setErrorMessage(null);
    setConfirmReplaceStep(false);
    if (e.target.files && e.target.files[0]) {
      validateAndSetFile(e.target.files[0]);
    }
  };

  const validateAndSetFile = (f: File) => {
    const ext = f.name.split(".").pop()?.toLowerCase();
    if (ext !== "tif" && ext !== "tiff") {
      setErrorMessage("The selected file is not a TIFF file. Please select a .tif or .tiff file.");
      setFile(null);
      return;
    }
    setFile(f);
  };

  const handleLoadClick = () => {
    if (!file) return;
    // If a raster is already loaded, prompt confirmation
    if (raster && !confirmReplaceStep) {
      setConfirmReplaceStep(true);
      return;
    }
    executeLoad();
  };

  const executeLoad = async () => {
    if (!file) return;
    setParsing(true);
    setErrorMessage(null);

    try {
      // Clear previous raster first
      if (raster) {
        clearRaster();
      }

      setStage("Reading file...");
      onPushLog("INFO", `Reading local GeoTIFF file: ${file.name} (${(file.size / (1024 * 1024)).toFixed(1)} MB)`);

      setStage("Parsing GeoTIFF metadata...");
      await new Promise((r) => setTimeout(r, 100));

      setStage("Reading raster values...");
      await new Promise((r) => setTimeout(r, 100));

      setStage("Calculating NDVI statistics...");
      const loadedRaster = await readNDVIGeoTIFF(file);

      setStage("Rendering raster on map...");
      await new Promise((r) => setTimeout(r, 100));

      setRaster(loadedRaster);
      onPushLog(
        "SUCCESS",
        `GeoTIFF ${loadedRaster.fileName} loaded (${loadedRaster.width}x${loadedRaster.height}, ${loadedRaster.crs}). Min=${loadedRaster.statistics.minimum}, Max=${loadedRaster.statistics.maximum}`
      );

      setParsing(false);
      setConfirmReplaceStep(false);
      onClose();
    } catch (err: any) {
      const msg = err.message || "Unable to read the selected GeoTIFF.";
      setErrorMessage(msg);
      setError(msg);
      onPushLog("ERROR", `GeoTIFF Load Failed: ${msg}`);
      setParsing(false);
      setConfirmReplaceStep(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/65 backdrop-blur-sm p-4 font-mono">
      <div className="glass-panel w-full max-w-lg rounded-2xl border border-border bg-[var(--surface-0)] shadow-2xl overflow-hidden animate-ticker">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <div className="flex items-center gap-2.5">
            <div className="grid h-8 w-8 place-items-center rounded-lg bg-emerald-500/20 text-emerald-600 dark:text-emerald-400">
              <Layers className="h-4 w-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-foreground">Load NDVI GeoTIFF</h3>
              <p className="text-[11px] font-medium text-muted-foreground">Visualize an existing NDVI .tif or .tiff for any region in India</p>
            </div>
          </div>
          <button
            onClick={() => {
              setConfirmReplaceStep(false);
              onClose();
            }}
            disabled={parsing}
            className="grid h-8 w-8 place-items-center rounded-md text-muted-foreground hover:bg-[var(--surface-2)] hover:text-foreground transition disabled:opacity-50 cursor-pointer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 space-y-4">
          {/* Confirmation Step if Raster already loaded */}
          {confirmReplaceStep && raster ? (
            <div className="rounded-xl border border-amber-500/50 bg-amber-500/10 p-4 text-xs space-y-3">
              <div className="flex items-center gap-2 font-bold text-amber-700 dark:text-amber-400">
                <HelpCircle className="h-5 w-5 shrink-0" />
                <span>Replace Existing GeoTIFF Raster?</span>
              </div>
              <p className="text-[11px] text-foreground leading-relaxed">
                An NDVI GeoTIFF layer (<strong className="text-foreground font-bold">{raster.fileName}</strong>) is currently loaded on the map console.
              </p>
              <p className="text-[11px] text-foreground leading-relaxed">
                Loading <strong className="text-foreground font-bold">{file?.name}</strong> will remove the active layer and recalculate all statistics, histogram, and metadata.
              </p>
              <div className="flex items-center justify-end gap-2 pt-2 border-t border-amber-500/30">
                <button
                  onClick={() => setConfirmReplaceStep(false)}
                  className="rounded-md border border-border px-3 py-1.5 text-xs font-semibold text-foreground hover:bg-[var(--surface-2)] cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  onClick={executeLoad}
                  className="rounded-md bg-amber-600 text-white px-3 py-1.5 text-xs font-bold hover:bg-amber-500 shadow-md cursor-pointer"
                >
                  Confirm & Replace
                </button>
              </div>
            </div>
          ) : (
            <>
              {/* Dropzone */}
              <div
                onDragOver={(e) => e.preventDefault()}
                onDrop={handleDrop}
                className="relative flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-emerald-600/60 dark:border-emerald-500/40 bg-emerald-500/5 p-6 text-center transition hover:border-emerald-600 hover:bg-emerald-500/10"
              >
                <input
                  type="file"
                  accept=".tif,.tiff"
                  onChange={handleFileChange}
                  disabled={parsing}
                  className="absolute inset-0 cursor-pointer opacity-0 disabled:cursor-not-allowed"
                />
                {file ? (
                  <div className="flex flex-col items-center gap-1.5 text-emerald-600 dark:text-emerald-400">
                    <FileCheck className="h-9 w-9" />
                    <span className="text-xs font-bold text-foreground">{file.name}</span>
                    <span className="text-[10px] text-muted-foreground font-semibold">
                      {(file.size / (1024 * 1024)).toFixed(2)} MB
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        setFile(null);
                        setConfirmReplaceStep(false);
                      }}
                      disabled={parsing}
                      className="mt-1 text-[10px] font-semibold text-muted-foreground underline hover:text-foreground cursor-pointer"
                    >
                      Change file
                    </button>
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-1.5">
                    <Layers className="h-8 w-8 text-emerald-600 dark:text-emerald-400" />
                    <span className="text-xs font-bold text-foreground">
                      Drag & drop your NDVI GeoTIFF file here, or <span className="text-emerald-600 dark:text-emerald-400 underline font-bold">browse</span>
                    </span>
                    <span className="text-[10px] text-muted-foreground font-medium">
                      Accepted formats: .tif, .tiff (EPSG:4326 or UTM WGS84)
                    </span>
                  </div>
                )}
              </div>

              {/* Large file warning */}
              {file && file.size > LARGE_FILE_WARNING_BYTES && (
                <div className="flex items-center gap-2 rounded-lg bg-amber-500/10 border border-amber-500/40 p-2.5 text-[11px] text-amber-700 dark:text-amber-400 font-medium">
                  <AlertTriangle className="h-4 w-4 shrink-0" />
                  <span>Warning: Large file ({(file.size / (1024 * 1024)).toFixed(0)} MB). Parsing may take longer in browser memory.</span>
                </div>
              )}

              {/* Error message */}
              {errorMessage && (
                <div className="flex items-start gap-2 rounded-lg bg-destructive/15 border border-destructive/40 p-3 text-xs text-destructive">
                  <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                  <div>
                    <div className="font-bold">Validation Error</div>
                    <div className="font-medium">{errorMessage}</div>
                  </div>
                </div>
              )}

              {/* Loading stage bar */}
              {parsing && (
                <div className="space-y-1.5 text-xs">
                  <div className="flex items-center justify-between text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">
                    <span className="flex items-center gap-1.5">
                      <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                      {stage}
                    </span>
                  </div>
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-[var(--surface-2)] border border-border">
                    <div className="h-full bg-emerald-500 animate-pulse w-full" />
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        {!confirmReplaceStep && (
          <div className="flex items-center justify-end gap-2 border-t border-border px-5 py-3 bg-[var(--surface-1)]">
            <button
              onClick={onClose}
              disabled={parsing}
              className="rounded-md border border-border px-4 py-2 text-xs font-semibold text-foreground hover:bg-[var(--surface-2)] transition disabled:opacity-50 cursor-pointer"
            >
              Cancel
            </button>
            <button
              onClick={handleLoadClick}
              disabled={!file || parsing}
              className="rounded-md bg-emerald-600 text-white px-4 py-2 text-xs font-bold shadow-md hover:bg-emerald-500 transition disabled:opacity-50 cursor-pointer"
            >
              {parsing ? "Processing GeoTIFF..." : "Load on Map"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
