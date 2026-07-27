import { useState } from "react";
import { X, Upload, FileCheck, AlertCircle } from "lucide-react";
import type { LogLevel } from "@/lib/types";

interface UploadModalProps {
  open: boolean;
  onClose: () => void;
  onPushLog: (level: LogLevel, msg: string) => void;
}

export default function UploadModal({ open, onClose, onPushLog }: UploadModalProps) {
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  if (!open) return null;

  const validateAndSetFile = (f: File) => {
    setErrorMessage(null);
    const ext = f.name.split(".").pop()?.toLowerCase();
    if (ext !== "zip" && f.type !== "application/zip" && f.type !== "application/x-zip-compressed") {
      setErrorMessage("Please select a valid Sentinel-2 ZIP file.");
      setFile(null);
      return;
    }
    setFile(f);
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      validateAndSetFile(e.dataTransfer.files[0]);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      validateAndSetFile(e.target.files[0]);
    }
  };

  const handleUpload = () => {
    if (!file || uploading) return;
    setUploading(true);
    setProgress(10);
    onPushLog("INFO", `Started Sentinel-2 NDVI processing for ${file.name}`);

    const interval = setInterval(() => {
      setProgress((p) => {
        if (p >= 100) {
          clearInterval(interval);
          setUploading(false);
          onPushLog("SUCCESS", `NDVI generation completed for ${file.name}`);
          onClose();
          return 0;
        }
        return p + 25;
      });
    }, 300);
  };

  const handleCloseModal = () => {
    if (uploading) return;
    setFile(null);
    setErrorMessage(null);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 font-mono">
      <div className="glass-panel w-full max-w-lg rounded-2xl border border-border bg-[var(--surface-0)] shadow-2xl overflow-hidden animate-ticker">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <div className="flex items-center gap-2.5">
            <div className="grid h-8 w-8 place-items-center rounded-lg bg-primary/20 text-primary">
              <Upload className="h-4 w-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-foreground">Upload Sentinel-2 Dataset</h3>
              <p className="text-[11px] font-medium text-muted-foreground">Support for Sentinel-2 Level-2A ZIP files</p>
            </div>
          </div>
          <button
            onClick={handleCloseModal}
            disabled={uploading}
            className="grid h-8 w-8 place-items-center rounded-md text-muted-foreground hover:bg-[var(--surface-2)] hover:text-foreground transition disabled:opacity-50 cursor-pointer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 space-y-4">
          {/* Drag and drop zone */}
          <div
            onDragOver={(e) => e.preventDefault()}
            onDrop={handleDrop}
            className="relative flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-slate-400 dark:border-border bg-[var(--surface-1)] p-6 text-center transition hover:border-primary hover:bg-primary/5"
          >
            <input
              type="file"
              accept=".zip,application/zip"
              onChange={handleFileChange}
              className="absolute inset-0 cursor-pointer opacity-0"
              disabled={uploading}
            />
            {file ? (
              <div className="flex flex-col items-center gap-2 text-emerald-600 dark:text-emerald-400">
                <FileCheck className="h-8 w-8" />
                <span className="text-xs font-bold text-foreground">{file.name}</span>
                <span className="text-[10px] text-muted-foreground font-semibold">
                  {(file.size / (1024 * 1024)).toFixed(1)} MB · Ready for pipeline
                </span>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-2">
                <div className="grid h-10 w-10 place-items-center rounded-full bg-[var(--surface-2)] text-muted-foreground border border-border">
                  <Upload className="h-5 w-5" />
                </div>
                <div className="text-xs font-bold text-foreground">
                  Drag and drop your Sentinel-2 ZIP file here, or browse
                </div>
                <div className="text-[10px] text-muted-foreground font-medium">
                  Accepts Sentinel-2 L2A .zip archives containing GRANULE spectral bands
                </div>
              </div>
            )}
          </div>

          {errorMessage && (
            <div className="flex items-center gap-2 rounded-lg border border-red-500/40 bg-red-500/10 p-3 text-xs text-red-600 dark:text-red-400 font-medium">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

          {uploading && (
            <div className="space-y-1.5 font-mono text-xs">
              <div className="flex justify-between text-[11px] font-semibold text-muted-foreground">
                <span>Ingesting granule spectral bands...</span>
                <span>{progress}%</span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-[var(--surface-2)] border border-border">
                <div
                  className="h-full rounded-full bg-primary transition-all duration-300"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 border-t border-border px-5 py-3 bg-[var(--surface-1)]">
          <button
            onClick={handleCloseModal}
            disabled={uploading}
            className="rounded-md border border-border px-4 py-2 text-xs font-semibold text-foreground hover:bg-[var(--surface-2)] transition disabled:opacity-50 cursor-pointer"
          >
            Cancel
          </button>
          <button
            onClick={handleUpload}
            disabled={!file || uploading}
            className="rounded-md bg-primary px-4 py-2 text-xs font-bold text-primary-foreground shadow-md hover:bg-primary/90 transition disabled:opacity-50 cursor-pointer"
          >
            {uploading ? "Processing..." : "Process Dataset"}
          </button>
        </div>
      </div>
    </div>
  );
}
