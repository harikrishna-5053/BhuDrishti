import { useState } from "react";
import { X, Settings2, Check } from "lucide-react";
import type { LogLevel } from "@/lib/types";

interface SettingsModalProps {
  open: boolean;
  onClose: () => void;
  onPushLog: (level: LogLevel, msg: string) => void;
}

export default function SettingsModal({ open, onClose, onPushLog }: SettingsModalProps) {
  const [crs, setCrs] = useState("EPSG:4326");
  const [unit, setUnit] = useState("metric");
  const [palette, setPalette] = useState("standard");
  const [tileServer, setTileServer] = useState("osm");

  if (!open) return null;

  const handleSave = () => {
    onPushLog("SUCCESS", `Settings updated: CRS=${crs}, Units=${unit}, Palette=${palette}`);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="glass-panel w-full max-w-md rounded-2xl border border-border bg-[var(--surface-0)] shadow-2xl overflow-hidden animate-ticker">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <div className="flex items-center gap-2.5">
            <div className="grid h-8 w-8 place-items-center rounded-lg bg-primary/20 text-primary">
              <Settings2 className="h-4 w-4" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-foreground">Console Settings</h3>
              <p className="text-[11px] text-muted-foreground">Configure map projection & display preferences</p>
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
          {/* CRS Setting */}
          <div>
            <label className="mb-1.5 block text-[10px] uppercase text-muted-foreground">Coordinate Reference System</label>
            <div className="grid grid-cols-2 gap-2">
              {[
                { id: "EPSG:4326", label: "WGS 84 (EPSG:4326)" },
                { id: "EPSG:32644", label: "UTM Zone 44N (EPSG:32644)" },
              ].map((item) => (
                <button
                  key={item.id}
                  onClick={() => setCrs(item.id)}
                  className={`flex items-center justify-between rounded-lg border px-3 py-2 text-left transition ${
                    crs === item.id
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border bg-[var(--surface-1)] text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <span className="text-[11px] font-medium">{item.label}</span>
                  {crs === item.id && <Check className="h-3.5 w-3.5 shrink-0" />}
                </button>
              ))}
            </div>
          </div>

          {/* Unit Measurement */}
          <div>
            <label className="mb-1.5 block text-[10px] uppercase text-muted-foreground">Measurement Units</label>
            <div className="grid grid-cols-2 gap-2">
              {[
                { id: "metric", label: "Metric (km, ha, m²)" },
                { id: "imperial", label: "Imperial (mi, acres)" },
              ].map((item) => (
                <button
                  key={item.id}
                  onClick={() => setUnit(item.id)}
                  className={`flex items-center justify-between rounded-lg border px-3 py-2 text-left transition ${
                    unit === item.id
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border bg-[var(--surface-1)] text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <span className="text-[11px] font-medium">{item.label}</span>
                  {unit === item.id && <Check className="h-3.5 w-3.5 shrink-0" />}
                </button>
              ))}
            </div>
          </div>

          {/* Color Palette */}
          <div>
            <label className="mb-1.5 block text-[10px] uppercase text-muted-foreground">NDVI Color Palette</label>
            <div className="grid grid-cols-2 gap-2">
              {[
                { id: "standard", label: "Standard ISRO/ESA Green" },
                { id: "spectral", label: "Spectral Heatmap" },
              ].map((item) => (
                <button
                  key={item.id}
                  onClick={() => setPalette(item.id)}
                  className={`flex items-center justify-between rounded-lg border px-3 py-2 text-left transition ${
                    palette === item.id
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border bg-[var(--surface-1)] text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <span className="text-[11px] font-medium">{item.label}</span>
                  {palette === item.id && <Check className="h-3.5 w-3.5 shrink-0" />}
                </button>
              ))}
            </div>
          </div>

          {/* Base Map Tile Server */}
          <div>
            <label className="mb-1.5 block text-[10px] uppercase text-muted-foreground">Basemap Provider</label>
            <select
              value={tileServer}
              onChange={(e) => setTileServer(e.target.value)}
              className="w-full rounded-md border border-border bg-[var(--surface-1)] px-3 py-2 text-foreground focus:border-primary focus:outline-none"
            >
              <option value="osm">OpenStreetMap Standard</option>
              <option value="carto-dark">CartoDB Dark Matter</option>
              <option value="esri-sat">Esri World Imagery (Satellite)</option>
            </select>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 border-t border-border px-5 py-3 bg-[var(--surface-1)]">
          <button
            onClick={onClose}
            className="rounded-md border border-border px-4 py-2 text-xs font-medium text-muted-foreground hover:bg-[var(--surface-2)] hover:text-foreground transition"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="rounded-md bg-primary px-4 py-2 text-xs font-medium text-primary-foreground shadow-md hover:bg-primary/90 transition"
          >
            Save Changes
          </button>
        </div>
      </div>
    </div>
  );
}
