import { Database, Tag, ShieldCheck, MapPin, Layers, FileCode } from "lucide-react";
import { formatCoord } from "@/lib/geo-format";
import { useGeoTIFFStore } from "@/stores/geotiff-store";

interface MetadataPanelProps {
  tileId?: string;
  lat?: number;
  lng?: number;
  year?: number;
}

export default function MetadataPanel({
  tileId = "T44QMG",
  lat = 22.9,
  lng = 79.1,
  year = 2026,
}: MetadataPanelProps) {
  const { raster } = useGeoTIFFStore();

  if (raster) {
    return (
      <div className="glass-panel rounded-xl p-3 font-mono text-xs space-y-2.5">
        <div className="flex items-center justify-between border-b border-border pb-2">
          <div className="flex items-center gap-2 text-emerald-400 font-semibold">
            <Layers className="h-4 w-4" />
            <span className="truncate max-w-[180px]">{raster.fileName}</span>
          </div>
          <span className="rounded bg-emerald-500/20 px-1.5 py-0.5 text-[10px] text-emerald-400">
            Local GeoTIFF
          </span>
        </div>

        <div className="grid grid-cols-2 gap-2 text-[11px]">
          <div className="rounded bg-[var(--surface-1)] p-1.5">
            <div className="text-[9px] uppercase text-muted-foreground">Dimensions</div>
            <div className="text-foreground">{raster.width} × {raster.height} px</div>
          </div>
          <div className="rounded bg-[var(--surface-1)] p-1.5">
            <div className="text-[9px] uppercase text-muted-foreground">File Size</div>
            <div className="text-foreground">{(raster.fileSize / (1024 * 1024)).toFixed(2)} MB</div>
          </div>
          <div className="rounded bg-[var(--surface-1)] p-1.5">
            <div className="text-[9px] uppercase text-muted-foreground">CRS</div>
            <div className="text-foreground">{raster.crs || "Not available"}</div>
          </div>
          <div className="rounded bg-[var(--surface-1)] p-1.5">
            <div className="text-[9px] uppercase text-muted-foreground">NoData Value</div>
            <div className="text-foreground">{raster.noDataValue ?? "-9999 (fallback)"}</div>
          </div>
          <div className="rounded bg-[var(--surface-1)] p-1.5 col-span-2">
            <div className="text-[9px] uppercase text-muted-foreground">Geographic Bounds (EPSG:4326)</div>
            <div className="text-foreground text-[10px]">
              W: {raster.geoBounds.west.toFixed(4)}°, E: {raster.geoBounds.east.toFixed(4)}°<br />
              S: {raster.geoBounds.south.toFixed(4)}°, N: {raster.geoBounds.north.toFixed(4)}°
            </div>
          </div>
          <div className="rounded bg-[var(--surface-1)] p-1.5">
            <div className="text-[9px] uppercase text-muted-foreground">Valid Pixels</div>
            <div className="text-foreground">{raster.statistics.validPixelCount.toLocaleString()}</div>
          </div>
          <div className="rounded bg-[var(--surface-1)] p-1.5">
            <div className="text-[9px] uppercase text-muted-foreground">Loaded At</div>
            <div className="text-foreground">{raster.loadedAt}</div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="glass-panel rounded-xl p-3 font-mono text-xs space-y-2">
      <div className="flex items-center justify-between border-b border-border pb-2">
        <div className="flex items-center gap-2">
          <Database className="h-4 w-4 text-primary" />
          <span className="font-semibold">{tileId} Metadata</span>
        </div>
        <span className="rounded bg-primary/15 px-1.5 py-0.5 text-[10px] text-primary">S2B_MSIL2A</span>
      </div>

      <div className="grid grid-cols-2 gap-2 text-[11px]">
        <div className="flex items-center gap-1.5 text-muted-foreground">
          <FileCode className="h-3.5 w-3.5" />
          <span>Year: {year}</span>
        </div>
        <div className="flex items-center gap-1.5 text-muted-foreground">
          <MapPin className="h-3.5 w-3.5" />
          <span>{formatCoord(lat, "lat")}, {formatCoord(lng, "lng")}</span>
        </div>
        <div className="flex items-center gap-1.5 text-muted-foreground">
          <Tag className="h-3.5 w-3.5" />
          <span>EPSG:4326</span>
        </div>
        <div className="flex items-center gap-1.5 text-[var(--success)]">
          <ShieldCheck className="h-3.5 w-3.5" />
          <span>QA Passed</span>
        </div>
      </div>
    </div>
  );
}
