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
  const [tileId, setTileId] = useState("T44QMG");
  const [acquisitionDate, setAcquisitionDate] = useState("2026-02-15");
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);

  if (!open) return null;

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      setFile(e.dataTransfer.files[0]);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
    }
  };

  const handleUpload = () => {
    if (!file && !tileId) return;
    setUploading(true);
    setProgress(10);
    onPushLog("INFO", `Started upload for tile ${tileId} (${file ? file.name : "Synthetic dataset"})`);

    const interval = setInterval(() => {
      setProgress((p) => {
        if (p >= 100) {
          clearInterval(interval);
          setUploading(false);
          onPushLog("SUCCESS", `Dataset ${tileId} uploaded and registered in workspace successfully.`);
          onClose();
          return 0;
        }
        return p + 25;
      });
    }, 300);
  };

  return (
    <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="glass-panel w-full max-w-lg rounded-2xl border border-border bg-[var(--surface-0)] shadow-2xl overflow-hidden animate-ticker">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <div className="flex items-center gap-2.5">
            <div className="grid h-8 w-8 place-items-center rounded-lg bg-primary/20 text-primary">
              <Upload className="h-4 w-4" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-foreground">Upload Sentinel-2 Dataset</h3>
              <p className="text-[11px] text-muted-foreground">Support for .SAFE, .zip and COG GeoTIFF files</p>
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
        <div className="p-5 space-y-4">
          {/* Drag and drop zone */}
          <div
            onDragOver={(e) => e.preventDefault()}
            onDrop={handleDrop}
            className="relative flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-border bg-[var(--surface-1)] p-6 text-center transition hover:border-primary/60 hover:bg-primary/5"
          >
            <input
              type="file"
              accept=".zip,.safe,.tif,.tiff"
              onChange={handleFileChange}
              className="absolute inset-0 cursor-pointer opacity-0"
            />
            {file ? (
              <div className="flex flex-col items-center gap-1.5 text-primary">
                <FileCheck className="h-8 w-8" />
                <span className="font-mono text-xs font-semibold">{file.name}</span>
                <span className="font-mono text-[10px] text-muted-foreground">
                  {(file.size / (1024 * 1024)).toFixed(1)} MB
                </span>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-1.5">
                <Upload className="h-8 w-8 text-muted-foreground" />
                <span className="text-xs font-medium text-foreground">
                  Drag and drop your Sentinel-2 dataset here, or <span className="text-primary underline">browse</span>
                </span>
                <span className="font-mono text-[10px] text-muted-foreground">
                  Maximum file size: 2.5 GB · Level-2A Processing
                </span>
              </div>
            )}
          </div>

          {/* Form fields */}
          <div className="grid grid-cols-2 gap-3 font-mono text-xs">
            <div>
              <label className="mb-1 block text-[10px] uppercase text-muted-foreground">Tile ID / Granule</label>
              <input
                type="text"
                value={tileId}
                onChange={(e) => setTileId(e.target.value)}
                className="w-full rounded-md border border-border bg-[var(--surface-1)] px-3 py-2 text-foreground focus:border-primary focus:outline-none"
                placeholder="e.g. T44QMG"
              />
            </div>
            <div>
              <label className="mb-1 block text-[10px] uppercase text-muted-foreground">Acquisition Date</label>
              <input
                type="date"
                value={acquisitionDate}
                onChange={(e) => setAcquisitionDate(e.target.value)}
                className="w-full rounded-md border border-border bg-[var(--surface-1)] px-3 py-2 text-foreground focus:border-primary focus:outline-none"
              />
            </div>
          </div>

          {uploading && (
            <div className="space-y-1.5 font-mono text-xs">
              <div className="flex justify-between text-[11px] text-muted-foreground">
                <span>Ingesting granule...</span>
                <span>{progress}%</span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-[var(--surface-2)]">
                <div
                  className="h-full bg-primary transition-all duration-200"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>
          )}

          <div className="flex items-center gap-2 rounded-lg bg-[var(--surface-2)] p-2.5 text-[11px] text-muted-foreground">
            <AlertCircle className="h-4 w-4 shrink-0 text-primary" />
            <span>Uploaded files undergo automated Sen2Cor atmospheric correction and BOA reflectance scaling.</span>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 border-t border-border px-5 py-3 bg-[var(--surface-1)]">
          <button
            onClick={onClose}
            disabled={uploading}
            className="rounded-md border border-border px-4 py-2 text-xs font-medium text-muted-foreground hover:bg-[var(--surface-2)] hover:text-foreground transition"
          >
            Cancel
          </button>
          <button
            onClick={handleUpload}
            disabled={uploading}
            className="rounded-md bg-primary px-4 py-2 text-xs font-medium text-primary-foreground shadow-md hover:bg-primary/90 transition"
          >
            {uploading ? "Uploading..." : "Start Ingestion"}
          </button>
        </div>
      </div>
    </div>
  );
}
