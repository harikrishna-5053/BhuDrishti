import { useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import { X, Settings2, Check, Sun, Moon, Eye, EyeOff, Map } from "lucide-react";
import type { LogLevel } from "@/lib/types";
import type { Theme } from "@/hooks/use-theme";
import type { LayerState } from "@/components/gis/GISMap";

interface SettingsModalProps {
  open: boolean;
  onClose: () => void;
  onPushLog: (level: LogLevel, msg: string) => void;
  theme?: Theme;
  onSetTheme?: (theme: Theme) => void;
  layers?: LayerState;
  setLayers?: Dispatch<SetStateAction<LayerState>>;
}

export default function SettingsModal({
  open,
  onClose,
  onPushLog,
  theme = "dark",
  onSetTheme,
  layers,
  setLayers,
}: SettingsModalProps) {
  const [crs, setCrs] = useState("EPSG:4326");
  const [unit, setUnit] = useState("metric");
  const [tileServer, setTileServer] = useState("osm");

  if (!open) return null;

  const handleSave = () => {
    onPushLog("SUCCESS", `Settings updated: CRS=${crs}, Units=${unit}, Theme=${theme}`);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 font-mono">
      <div className="glass-panel w-full max-w-md rounded-2xl border border-border bg-[var(--surface-0)] shadow-2xl overflow-hidden animate-ticker">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <div className="flex items-center gap-2.5">
            <div className="grid h-8 w-8 place-items-center rounded-lg bg-primary/20 text-primary">
              <Settings2 className="h-4 w-4" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-foreground">Console Settings</h3>
              <p className="text-[11px] text-muted-foreground">
                Configure map projections, themes & boundary layers
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
        <div className="p-5 space-y-4 text-xs max-h-[75vh] overflow-y-auto">
          {/* Administrative Boundary Layers */}
          {layers && setLayers && (
            <div>
              <label className="mb-1.5 flex items-center gap-1.5 text-[10px] uppercase font-bold text-muted-foreground">
                <Map className="h-3 w-3 text-primary" />
                Administrative Boundary Layers
              </label>
              <div className="space-y-2 rounded-xl border border-border bg-[var(--surface-1)] p-3">
                {[
                  {
                    key: "india" as const,
                    label: "India Boundary",
                    hint: "Admin 0 · Country Outline",
                    swatch: "#0284c7",
                    status: "Installed",
                  },
                  {
                    key: "states" as const,
                    label: "State Boundaries",
                    hint: "Admin 1 · States & UTs",
                    swatch: "#475569",
                    status: "Installed",
                  },
                  {
                    key: "districts" as const,
                    label: "District Boundaries",
                    hint: "Admin 2 · Districts",
                    swatch: "#94a3b8",
                    status: "Dataset not installed",
                  },
                ].map((b) => {
                  const layer = layers[b.key];
                  return (
                    <div
                      key={b.key}
                      className="flex flex-col gap-1.5 rounded-lg border border-border bg-[var(--surface-0)] p-2 transition hover:border-primary/50"
                    >
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() =>
                            setLayers((s) => ({
                              ...s,
                              [b.key]: { ...s[b.key], visible: !s[b.key].visible },
                            }))
                          }
                          className={`grid h-6 w-6 place-items-center rounded transition cursor-pointer ${
                            layer.visible ? "text-primary" : "text-muted-foreground opacity-50"
                          }`}
                          title={layer.visible ? "Hide boundary layer" : "Show boundary layer"}
                        >
                          {layer.visible ? (
                            <Eye className="h-3.5 w-3.5" />
                          ) : (
                            <EyeOff className="h-3.5 w-3.5" />
                          )}
                        </button>
                        <div
                          className="h-3.5 w-3.5 shrink-0 rounded border border-border"
                          style={{ background: b.swatch }}
                        />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between">
                            <span className="truncate text-xs font-semibold text-foreground">
                              {b.label}
                            </span>
                            <span
                              className={`shrink-0 rounded px-1.5 py-0.5 font-mono text-[9px] font-bold ${
                                b.status === "Installed"
                                  ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30"
                                  : "bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30"
                              }`}
                            >
                              {b.status}
                            </span>
                          </div>
                          <div className="font-mono text-[9px] text-muted-foreground">{b.hint}</div>
                        </div>
                      </div>

                      {layer.visible && (
                        <div className="flex items-center gap-2 pt-1 border-t border-border/40">
                          <span className="font-mono text-[9px] uppercase text-muted-foreground">
                            Opacity
                          </span>
                          <input
                            type="range"
                            min={0}
                            max={1}
                            step={0.05}
                            value={layer.opacity}
                            onChange={(e) =>
                              setLayers((s) => ({
                                ...s,
                                [b.key]: { ...s[b.key], opacity: parseFloat(e.target.value) },
                              }))
                            }
                            className="h-1 flex-1 accent-primary cursor-pointer"
                          />
                          <span className="w-7 font-mono text-right text-[9px] text-muted-foreground font-semibold">
                            {Math.round(layer.opacity * 100)}%
                          </span>
                        </div>
                      )}
                    </div>
                  );
                })}

                <div className="mt-2 rounded-lg bg-[var(--surface-0)] p-2.5 border border-border/60 text-[10px] text-muted-foreground">
                  <div className="font-bold text-foreground mb-0.5">
                    Data Attribution & Boundary Notice
                  </div>
                  Administrative boundary geometry is loaded lazily from local GeoJSON assets under
                  Open Data Commons (ODbL) standards for offline GIS operation.
                </div>
              </div>
            </div>
          )}

          {/* Theme Option */}
          <div>
            <label className="mb-1.5 block text-[10px] uppercase font-bold text-muted-foreground">
              Application Theme Mode
            </label>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => onSetTheme && onSetTheme("dark")}
                className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-left transition cursor-pointer ${
                  theme === "dark"
                    ? "border-primary bg-primary/10 text-primary font-bold"
                    : "border-border bg-[var(--surface-1)] text-muted-foreground hover:text-foreground"
                }`}
              >
                <Moon className="h-4 w-4" />
                <span className="text-[11px]">Dark GIS Theme</span>
                {theme === "dark" && <Check className="h-3.5 w-3.5 ml-auto" />}
              </button>
              <button
                onClick={() => onSetTheme && onSetTheme("light")}
                className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-left transition cursor-pointer ${
                  theme === "light"
                    ? "border-primary bg-primary/10 text-primary font-bold"
                    : "border-border bg-[var(--surface-1)] text-muted-foreground hover:text-foreground"
                }`}
              >
                <Sun className="h-4 w-4" />
                <span className="text-[11px]">Light Theme</span>
                {theme === "light" && <Check className="h-3.5 w-3.5 ml-auto" />}
              </button>
            </div>
          </div>

          {/* CRS Setting */}
          <div>
            <label className="mb-1.5 block text-[10px] uppercase font-bold text-muted-foreground">
              Coordinate Reference System
            </label>
            <div className="grid grid-cols-2 gap-2">
              {[
                { id: "EPSG:4326", label: "WGS 84 (EPSG:4326)" },
                { id: "EPSG:32644", label: "UTM Zone 44N (EPSG:32644)" },
              ].map((item) => (
                <button
                  key={item.id}
                  onClick={() => setCrs(item.id)}
                  className={`flex items-center justify-between rounded-lg border px-3 py-2 text-left transition cursor-pointer ${
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
            <label className="mb-1.5 block text-[10px] uppercase font-bold text-muted-foreground">
              Measurement Units
            </label>
            <div className="grid grid-cols-2 gap-2">
              {[
                { id: "metric", label: "Metric (km, ha, m²)" },
                { id: "imperial", label: "Imperial (mi, acres)" },
              ].map((item) => (
                <button
                  key={item.id}
                  onClick={() => setUnit(item.id)}
                  className={`flex items-center justify-between rounded-lg border px-3 py-2 text-left transition cursor-pointer ${
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

          {/* Base Map Tile Server */}
          <div>
            <label className="mb-1.5 block text-[10px] uppercase font-bold text-muted-foreground">
              Basemap Provider
            </label>
            <select
              value={tileServer}
              onChange={(e) => setTileServer(e.target.value)}
              className="w-full rounded-md border border-border bg-[var(--surface-1)] px-3 py-2 text-foreground focus:border-primary focus:outline-none cursor-pointer"
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
            className="rounded-md border border-border px-4 py-2 text-xs font-medium text-muted-foreground hover:bg-[var(--surface-2)] hover:text-foreground transition cursor-pointer"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="rounded-md bg-primary px-4 py-2 text-xs font-medium text-primary-foreground shadow-md hover:bg-primary/90 transition cursor-pointer"
          >
            Save Changes
          </button>
        </div>
      </div>
    </div>
  );
}
