import { useState, useRef, useEffect, useCallback } from "react";
import {
  X,
  FileCheck,
  AlertCircle,
  RefreshCw,
  Layers,
  HelpCircle,
  AlertTriangle,
  Trash2,
  FolderOpen,
} from "lucide-react";
import { readNDVIGeoTIFF } from "@/lib/geotiff/read-ndvi-geotiff";
import { useGeoTIFFStore } from "@/stores/geotiff-store";
import { GeoTIFFValidationError } from "@/lib/geotiff/errors";
import type { LogLevel } from "@/lib/types";

const LARGE_FILE_WARNING_BYTES = 50 * 1024 * 1024; // 50 MB

export default function NDVIGeoTIFFModal({
  open,
  onClose,
  onPushLog,
}: {
  open: boolean;
  onClose: () => void;
  onPushLog: (level: LogLevel, msg: string) => void;
}) {
  // Candidate file state (strictly isolated local modal state)
  const [file, setFile] = useState<File | null>(null);
  const [parsing, setParsing] = useState(false);
  const [stage, setStage] = useState("");
  const [validationError, setValidationError] = useState<GeoTIFFValidationError | null>(null);
  const [confirmReplaceStep, setConfirmReplaceStep] = useState(false);

  // Native file input ref for clean resets and same-file re-selection
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Active raster store (managed by Updates 1 & 2)
  const { raster, setRaster } = useGeoTIFFStore();

  /**
   * Reset candidate modal state completely without affecting active map raster
   */
  const resetCandidateModalState = useCallback(() => {
    setFile(null);
    setParsing(false);
    setStage("");
    setValidationError(null);
    setConfirmReplaceStep(false);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }, []);

  /**
   * Safe modal close handler ensuring complete candidate cleanup
   */
  const handleClose = useCallback(() => {
    if (parsing) return; // Guard against closing mid-parsing
    resetCandidateModalState();
    onClose();
  }, [parsing, resetCandidateModalState, onClose]);

  // Keyboard accessibility: Close on Escape when not parsing
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && open && !parsing) {
        handleClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, parsing, handleClose]);

  if (!open) return null;

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (selected) {
      setFile(selected);
      setValidationError(null);
    }
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const dropped = e.dataTransfer.files?.[0];
    if (dropped) {
      setFile(dropped);
      setValidationError(null);
    }
  };

  const handleLoadClick = () => {
    if (!file || parsing || validationError !== null) return;

    setValidationError(null);

    // If an active raster is already loaded, prompt for confirmation before starting candidate validation
    if (raster) {
      setConfirmReplaceStep(true);
    } else {
      executeLoad();
    }
  };

  /**
   * Transactional Atomic Replacement Workflow:
   * 1. Keeps current raster active in useGeoTIFFStore during parsing.
   * 2. Parses candidate file into temporary state (candidateRaster).
   * 3. Validates file, CRS, dimensions, geotransform, band values, and statistics.
   * 4. Only AFTER 100% validation success, commits candidate to active store (setRaster).
   * 5. Resets candidate modal state and closes modal.
   */
  const executeLoad = async () => {
    if (!file || parsing) return;

    const isReplacing = Boolean(raster);

    try {
      setParsing(true);
      setValidationError(null);

      setStage("Reading candidate file...");
      onPushLog(
        "INFO",
        `${isReplacing ? "Validating replacement candidate GeoTIFF" : "Reading local GeoTIFF file"}: ${file.name} (${(file.size / (1024 * 1024)).toFixed(1)} MB)`,
      );

      setStage("Validating metadata & CRS...");
      await new Promise((r) => setTimeout(r, 60));

      // Transactional parsing: read candidate file without altering current active raster
      const candidateRaster = await readNDVIGeoTIFF(file, (level, msg) => {
        onPushLog(level, msg);
      });

      setStage("Committing layer to map console...");
      await new Promise((r) => setTimeout(r, 60));

      // ATOMIC COMMIT: Replace active raster only AFTER complete candidate validation success
      setRaster(candidateRaster);

      onPushLog(
        "SUCCESS",
        `GeoTIFF ${candidateRaster.fileName} loaded successfully (${candidateRaster.width}x${candidateRaster.height}, ${candidateRaster.crs}). Min=${candidateRaster.statistics.minimum}, Max=${candidateRaster.statistics.maximum}`,
      );

      // Clean up local candidate state & close modal
      resetCandidateModalState();
      onClose();
    } catch (err: unknown) {
      setParsing(false);
      setConfirmReplaceStep(false);

      // FAILURE BEHAVIOR: Current active raster remains 100% untouched & visible!
      let parsedErr: GeoTIFFValidationError;

      if (err instanceof GeoTIFFValidationError) {
        if (isReplacing) {
          parsedErr = new GeoTIFFValidationError({
            code: err.code,
            title: `Unable to Replace Raster — ${err.title}`,
            userMessage: `Unable to replace raster.\n\nThe selected file could not be loaded. Your existing raster has been preserved.\n\n${err.userMessage}`,
            detectedCrs: err.detectedCrs,
            technicalDetails: err.technicalDetails,
            originalError: err.originalError,
          });
        } else {
          parsedErr = err;
        }
      } else {
        const fallbackMsg =
          err instanceof Error ? err.message : "Unable to read the selected GeoTIFF.";
        parsedErr = new GeoTIFFValidationError({
          code: "INVALID_GEOTIFF",
          title: isReplacing ? "Unable to Replace Raster" : "Invalid GeoTIFF",
          userMessage: isReplacing
            ? `Unable to replace raster.\n\nThe selected file could not be loaded. Your existing raster has been preserved.\n\n${fallbackMsg}`
            : fallbackMsg,
          originalError: err,
        });
      }

      setValidationError(parsedErr);
      onPushLog("ERROR", `GeoTIFF Load Failed: ${parsedErr.userMessage.replace(/\n\n/g, " ")}`);
    }
  };

  const fileExt = file ? file.name.split(".").pop()?.toUpperCase() : "";

  return (
    <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/65 backdrop-blur-sm p-4 font-mono select-none">
      <div className="glass-panel w-full max-w-lg rounded-2xl border border-border bg-[var(--surface-0)] shadow-2xl overflow-hidden animate-ticker">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <div className="flex items-center gap-2.5">
            <div className="grid h-8 w-8 place-items-center rounded-lg bg-emerald-500/20 text-emerald-600 dark:text-emerald-400">
              <Layers className="h-4 w-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-foreground">Load NDVI GeoTIFF</h3>
              <p className="text-[11px] font-medium text-muted-foreground">
                Visualize an existing NDVI .tif or .tiff for any region in India
              </p>
            </div>
          </div>
          <button
            onClick={handleClose}
            disabled={parsing}
            aria-label="Close GeoTIFF modal"
            className="grid h-8 w-8 place-items-center rounded-md text-muted-foreground hover:bg-[var(--surface-2)] hover:text-foreground transition disabled:opacity-50 cursor-pointer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 space-y-4 max-h-[80vh] overflow-y-auto">
          {/* Confirmation Step if Active Raster already loaded */}
          {confirmReplaceStep && raster ? (
            <div className="rounded-xl border border-amber-500/50 bg-amber-500/10 p-4 text-xs space-y-3">
              <div className="flex items-center gap-2 font-bold text-amber-700 dark:text-amber-400">
                <HelpCircle className="h-5 w-5 shrink-0" />
                <span>Replace Existing GeoTIFF Raster?</span>
              </div>
              <p className="text-[11px] text-foreground leading-relaxed">
                An NDVI GeoTIFF layer (
                <strong className="text-foreground font-bold">{raster.fileName}</strong>) is
                currently active on the map console.
              </p>
              <p className="text-[11px] text-foreground leading-relaxed">
                Loading <strong className="text-foreground font-bold">{file?.name}</strong> will
                validate the new raster. If validation succeeds, it will replace the active layer.
                If validation fails, your current raster will remain active and unchanged.
              </p>
              <div className="flex items-center justify-end gap-2 pt-2 border-t border-amber-500/30">
                <button
                  onClick={() => setConfirmReplaceStep(false)}
                  disabled={parsing}
                  className="rounded-md border border-border px-3 py-1.5 text-xs font-semibold text-foreground hover:bg-[var(--surface-2)] cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  onClick={executeLoad}
                  disabled={parsing}
                  aria-label="Confirm replacement of active GeoTIFF raster"
                  className="rounded-md bg-amber-600 text-white px-3 py-1.5 text-xs font-bold hover:bg-amber-500 shadow-md cursor-pointer disabled:opacity-50"
                >
                  {parsing ? "Validating..." : "Confirm & Validate"}
                </button>
              </div>
            </div>
          ) : (
            <>
              {/* File Input & Dropzone or Selected Candidate Card */}
              {file ? (
                /* Selected Candidate File Card */
                <div className="rounded-xl border border-emerald-500/40 bg-emerald-500/5 p-4 space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 font-bold text-xs">
                        {fileExt}
                      </div>
                      <div className="min-w-0">
                        <div
                          className="text-xs font-bold text-foreground truncate"
                          title={file.name}
                        >
                          {file.name}
                        </div>
                        <div className="text-[10px] text-muted-foreground font-semibold flex items-center gap-2">
                          <span>{(file.size / (1024 * 1024)).toFixed(2)} MB</span>
                          <span>•</span>
                          <span className="text-emerald-600 dark:text-emerald-400 font-bold">
                            {validationError
                              ? "Validation Error"
                              : parsing
                                ? "Validating..."
                                : "Ready to Load"}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Actions for Selected Candidate File */}
                  <div className="flex items-center justify-end gap-2 pt-2 border-t border-emerald-500/20">
                    <button
                      type="button"
                      onClick={() => {
                        if (fileInputRef.current) {
                          fileInputRef.current.click();
                        }
                      }}
                      disabled={parsing}
                      aria-label="Change candidate GeoTIFF file"
                      className="rounded-md border border-border bg-[var(--surface-1)] px-2.5 py-1 text-[11px] font-semibold text-foreground hover:bg-[var(--surface-2)] transition cursor-pointer disabled:opacity-50 flex items-center gap-1.5"
                    >
                      <FolderOpen className="h-3 w-3 text-muted-foreground" />
                      <span>Change File</span>
                    </button>

                    <button
                      type="button"
                      onClick={resetCandidateModalState}
                      disabled={parsing}
                      aria-label="Remove selected candidate GeoTIFF file"
                      className="rounded-md border border-destructive/40 bg-destructive/10 px-2.5 py-1 text-[11px] font-semibold text-destructive hover:bg-destructive/20 transition cursor-pointer disabled:opacity-50 flex items-center gap-1.5"
                    >
                      <Trash2 className="h-3 w-3" />
                      <span>Remove Selected File</span>
                    </button>
                  </div>
                </div>
              ) : (
                /* Initial Dropzone */
                <div
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={handleDrop}
                  className="relative flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-emerald-600/60 dark:border-emerald-500/40 bg-emerald-500/5 p-6 text-center transition hover:border-emerald-600 hover:bg-emerald-500/10"
                >
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".tif,.tiff"
                    onChange={handleFileChange}
                    disabled={parsing}
                    aria-label="Select GeoTIFF file"
                    className="absolute inset-0 cursor-pointer opacity-0 disabled:cursor-not-allowed"
                  />
                  <div className="flex flex-col items-center gap-1.5">
                    <Layers className="h-8 w-8 text-emerald-600 dark:text-emerald-400" />
                    <span className="text-xs font-bold text-foreground">
                      Drag & drop your NDVI GeoTIFF file here, or{" "}
                      <span className="text-emerald-600 dark:text-emerald-400 underline font-bold">
                        browse
                      </span>
                    </span>
                    <span className="text-[10px] text-muted-foreground font-medium">
                      Accepted formats: .tif, .tiff (EPSG:4326 or UTM WGS84)
                    </span>
                  </div>
                </div>
              )}

              {/* Hidden file input when candidate file card is visible for Change File */}
              {file && (
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".tif,.tiff"
                  onChange={handleFileChange}
                  disabled={parsing}
                  className="hidden"
                />
              )}

              {/* Large file warning */}
              {file && file.size > LARGE_FILE_WARNING_BYTES && (
                <div className="flex items-center gap-2 rounded-lg bg-amber-500/10 border border-amber-500/40 p-2.5 text-[11px] text-amber-700 dark:text-amber-400 font-medium">
                  <AlertTriangle className="h-4 w-4 shrink-0" />
                  <span>
                    Warning: Large file ({(file.size / (1024 * 1024)).toFixed(0)} MB). Parsing may
                    take longer in browser memory.
                  </span>
                </div>
              )}

              {/* Structured Application Error UI Card */}
              {validationError && (
                <div
                  role="alert"
                  aria-live="polite"
                  className="rounded-xl border border-destructive/50 bg-destructive/10 p-4 text-xs space-y-3 animate-ticker"
                >
                  <div className="flex items-center gap-2 font-bold text-destructive text-sm border-b border-destructive/30 pb-2">
                    <AlertCircle className="h-5 w-5 shrink-0" />
                    <span>{validationError.title}</span>
                  </div>

                  <div className="text-xs text-foreground leading-relaxed font-medium whitespace-pre-line">
                    {validationError.userMessage}
                  </div>

                  {/* Secondary Technical Details (e.g. Detected CRS code: 32767) */}
                  {validationError.technicalDetails && (
                    <div className="rounded-md bg-[var(--surface-1)] border border-border p-2 text-[11px] text-muted-foreground font-mono">
                      {validationError.technicalDetails}
                    </div>
                  )}

                  {/* Supported CRS info & Detected CRS failure details */}
                  {validationError.code === "UNSUPPORTED_CRS" && (
                    <div className="rounded-md bg-[var(--surface-1)] border border-border p-3 text-[11px] space-y-1.5 font-mono">
                      <div className="font-bold text-foreground">
                        Supported Coordinate Reference Systems:
                      </div>
                      <div className="text-[10px] text-muted-foreground leading-relaxed">
                        BhuDrishti supports WGS84 geographic coordinates, all WGS84 UTM zones, and other projected GeoTIFFs when a valid browser-compatible CRS definition is available.
                      </div>
                      <div className="text-[10px] text-muted-foreground pt-1 border-t border-border/50 space-y-0.5">
                        {validationError.detectedCrs && (
                          <div>
                            <strong className="text-foreground">Detected CRS:</strong>{" "}
                            <span className="text-destructive font-bold">
                              {validationError.detectedCrs}
                            </span>
                          </div>
                        )}
                        {validationError.technicalDetails && (
                          <div>
                            <strong className="text-foreground">Reason:</strong>{" "}
                            <span>{validationError.technicalDetails}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Loading stage bar */}
              {parsing && (
                <div role="status" aria-live="polite" className="space-y-1.5 text-xs">
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
              onClick={handleClose}
              disabled={parsing}
              aria-label="Cancel candidate file selection"
              className="rounded-md border border-border px-4 py-2 text-xs font-semibold text-foreground hover:bg-[var(--surface-2)] transition disabled:opacity-50 cursor-pointer"
            >
              Cancel
            </button>
            <button
              onClick={handleLoadClick}
              disabled={!file || parsing || validationError !== null}
              aria-label={
                raster ? "Replace active GeoTIFF raster" : "Load GeoTIFF onto map console"
              }
              className="rounded-md bg-emerald-600 text-white px-4 py-2 text-xs font-bold shadow-md hover:bg-emerald-500 transition disabled:opacity-50 cursor-pointer"
            >
              {parsing ? "Processing GeoTIFF..." : raster ? "Replace Active Raster" : "Load on Map"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
