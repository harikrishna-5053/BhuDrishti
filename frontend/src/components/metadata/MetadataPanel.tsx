import { useState } from "react";
import { FileText, Copy, Check, HardDrive, Compass, Layers, BarChart2, MapPin } from "lucide-react";
import { toast } from "sonner";
import { useGeoTIFFStore } from "@/stores/geotiff-store";
import { getCRSDisplayName } from "@/lib/geotiff/crs-registry";

export default function MetadataPanel() {
  const { raster } = useGeoTIFFStore();
  const [copied, setCopied] = useState(false);

  if (!raster) {
    return (
      <div className="glass-panel h-full rounded-xl p-6 bg-[var(--surface-0)] border border-border flex flex-col items-center justify-center text-center gap-2 font-mono text-xs">
        <FileText className="h-8 w-8 text-muted-foreground/60" />
        <div className="text-sm font-bold text-foreground">No GeoTIFF Metadata Available</div>
        <div className="text-muted-foreground max-w-md">
          Load a Local NDVI GeoTIFF to inspect its raster and projection information.
        </div>
      </div>
    );
  }

  const crsDescription = getCRSDisplayName(raster.crs);
  const medianVal =
    raster.statistics.median !== undefined ? raster.statistics.median.toFixed(4) : "Not available";
  const stdDevVal =
    (raster.statistics.stdDev ?? raster.statistics.standardDeviation) !== undefined
      ? (raster.statistics.stdDev ?? raster.statistics.standardDeviation)!.toFixed(4)
      : "Not available";
  const noDataVal = raster.noDataValue !== null ? raster.noDataValue : "Not available";
  const isDegreeUnit = raster.crs === "EPSG:4326";
  const pixelW = isDegreeUnit
    ? `${raster.affine.pixelWidth.toFixed(6)}°`
    : `${raster.affine.pixelWidth.toFixed(2)} m`;
  const pixelH = isDegreeUnit
    ? `${raster.affine.pixelHeight.toFixed(6)}°`
    : `${raster.affine.pixelHeight.toFixed(2)} m`;

  const handleCopyMetadata = () => {
    const text = [
      "BhuDrishti GeoTIFF Metadata Report",
      "========================================",
      `File Name: ${raster.fileName}`,
      `File Size: ${(raster.fileSize / (1024 * 1024)).toFixed(2)} MB`,
      `File Type: ${raster.fileType ?? "GeoTIFF (.tif)"}`,
      `Dimensions: ${raster.width.toLocaleString()} x ${raster.height.toLocaleString()} px`,
      `Band Count: ${raster.bandCount}`,
      `Data Type: ${raster.dataType ?? "Float32 (32-bit Float)"}`,
      `NoData Value: ${noDataVal}`,
      `Detected CRS: ${raster.crs} (${crsDescription})`,
      `Pixel Size: ${pixelW} x ${pixelH}`,
      `Raster Origin: X=${raster.affine.originX.toFixed(4)}, Y=${raster.affine.originY.toFixed(4)}`,
      `Native Bounds: W=${raster.nativeBounds.west.toFixed(4)}, S=${raster.nativeBounds.south.toFixed(4)}, E=${raster.nativeBounds.east.toFixed(4)}, N=${raster.nativeBounds.north.toFixed(4)}`,
      `EPSG:4326 Bounds: W=${raster.geoBounds.west.toFixed(5)}°, S=${raster.geoBounds.south.toFixed(5)}°, E=${raster.geoBounds.east.toFixed(5)}°, N=${raster.geoBounds.north.toFixed(5)}°`,
      `NDVI Stats: Min=${raster.statistics.minimum.toFixed(4)}, Max=${raster.statistics.maximum.toFixed(4)}, Mean=${raster.statistics.mean.toFixed(4)}, Median=${medianVal}, StdDev=${stdDevVal}`,
      `Pixel Counts: Valid=${raster.statistics.validPixelCount.toLocaleString()}, NoData=${raster.statistics.noDataPixelCount.toLocaleString()}`,
      `Loaded At: ${raster.loadedAt}`,
    ].join("\n");

    navigator.clipboard.writeText(text);
    setCopied(true);
    toast.success("GeoTIFF metadata copied to clipboard");
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="glass-panel h-full min-h-0 overflow-auto rounded-xl p-4 bg-[var(--surface-0)] border border-border font-mono text-xs space-y-4">
      {/* Header Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border pb-3">
        <div className="flex items-center gap-2">
          <div className="grid h-8 w-8 place-items-center rounded-lg bg-primary/20 text-primary">
            <FileText className="h-4 w-4" />
          </div>
          <div>
            <div className="text-xs font-bold text-foreground">GeoTIFF Metadata Inspection</div>
            <div className="text-[10px] text-muted-foreground truncate max-w-xs md:max-w-md">
              {raster.fileName}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className="rounded bg-emerald-500/20 px-2 py-0.5 text-[10px] font-bold text-emerald-600 dark:text-emerald-400 border border-emerald-500/40">
            {raster.crs}
          </span>
          <button
            onClick={handleCopyMetadata}
            className="flex items-center gap-1.5 rounded-md bg-[var(--surface-1)] border border-border px-2.5 py-1 text-xs font-bold text-foreground hover:bg-[var(--surface-2)] transition cursor-pointer"
            title="Copy clean metadata summary to clipboard"
          >
            {copied ? (
              <>
                <Check className="h-3.5 w-3.5 text-emerald-500" />
                <span>Copied</span>
              </>
            ) : (
              <>
                <Copy className="h-3.5 w-3.5 text-muted-foreground" />
                <span>Copy Metadata</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Grid Sections */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
        {/* Section 1: File & Storage */}
        <MetadataCard icon={HardDrive} title="File & Container">
          <MetaRow label="Filename" value={raster.fileName} truncate />
          <MetaRow label="File Size" value={`${(raster.fileSize / (1024 * 1024)).toFixed(2)} MB`} />
          <MetaRow label="Container Format" value={raster.fileType ?? "GeoTIFF (.tif)"} />
          <MetaRow label="Loaded Timestamp" value={raster.loadedAt} />
        </MetadataCard>

        {/* Section 2: Raster & Bands */}
        <MetadataCard icon={Layers} title="Raster Specifications">
          <MetaRow
            label="Dimensions"
            value={`${raster.width.toLocaleString()} × ${raster.height.toLocaleString()} px`}
          />
          <MetaRow label="Band Count" value={`${raster.bandCount} Band`} />
          <MetaRow label="Data Encoding" value={raster.dataType ?? "Float32 (32-bit Float)"} />
          <MetaRow label="NoData Value" value={String(noDataVal)} />
        </MetadataCard>

        {/* Section 3: Coordinate Reference System */}
        <MetadataCard icon={Compass} title="Coordinate Reference System">
          <MetaRow label="Detected CRS" value={raster.crs} highlight />
          <MetaRow label="EPSG Code" value={raster.crs} />
          <MetaRow label="Projection Spec" value={crsDescription} truncate />
          <MetaRow
            label="Coordinate Units"
            value={isDegreeUnit ? "Degrees (Geographic)" : "Meters (Projected)"}
          />
        </MetadataCard>

        {/* Section 4: Georeferencing & Transform */}
        <MetadataCard icon={MapPin} title="Georeferencing & Spatial Extent">
          <MetaRow label="Pixel Size (W × H)" value={`${pixelW} × ${pixelH}`} />
          <MetaRow
            label="Raster Origin"
            value={`X: ${raster.affine.originX.toFixed(4)}, Y: ${raster.affine.originY.toFixed(4)}`}
          />
          <MetaRow
            label="Native Extent"
            value={`W:${raster.nativeBounds.west.toFixed(2)}, S:${raster.nativeBounds.south.toFixed(2)}, E:${raster.nativeBounds.east.toFixed(2)}, N:${raster.nativeBounds.north.toFixed(2)}`}
          />
          <MetaRow
            label="EPSG:4326 Bounds"
            value={`W:${raster.geoBounds.west.toFixed(5)}°, S:${raster.geoBounds.south.toFixed(5)}°, E:${raster.geoBounds.east.toFixed(5)}°, N:${raster.geoBounds.north.toFixed(5)}°`}
          />
        </MetadataCard>

        {/* Section 5: NDVI Statistics */}
        <MetadataCard
          icon={BarChart2}
          title="NDVI Index Statistics"
          className="md:col-span-2 xl:col-span-2"
        >
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <MiniStat label="Minimum" value={raster.statistics.minimum.toFixed(4)} />
            <MiniStat label="Maximum" value={raster.statistics.maximum.toFixed(4)} />
            <MiniStat label="Mean Index" value={raster.statistics.mean.toFixed(4)} />
            <MiniStat label="Median Index" value={medianVal} />
            <MiniStat label="Std Deviation" value={stdDevVal} />
            <MiniStat
              label="Valid Pixels"
              value={raster.statistics.validPixelCount.toLocaleString()}
            />
            <MiniStat
              label="NoData Pixels"
              value={raster.statistics.noDataPixelCount.toLocaleString()}
            />
            <MiniStat
              label="Veg Coverage"
              value={`${raster.statistics.vegetationPercentage.toFixed(1)}%`}
              highlight
            />
          </div>
        </MetadataCard>
      </div>
    </div>
  );
}

function MetadataCard({
  icon: Icon,
  title,
  children,
  className = "",
}: {
  icon: React.ElementType;
  title: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`rounded-lg border border-border bg-[var(--surface-1)] p-3 space-y-2 ${className}`}
    >
      <div className="flex items-center gap-1.5 border-b border-border/60 pb-1.5 text-xs font-bold text-foreground">
        <Icon className="h-3.5 w-3.5 text-primary shrink-0" />
        <span>{title}</span>
      </div>
      <div className="space-y-1.5">{children}</div>
    </div>
  );
}

function MetaRow({
  label,
  value,
  truncate = false,
  highlight = false,
}: {
  label: string;
  value: string;
  truncate?: boolean;
  highlight?: boolean;
}) {
  return (
    <div className="flex items-center justify-between text-[11px] gap-2">
      <span className="text-muted-foreground shrink-0">{label}:</span>
      <span
        className={`font-semibold ${highlight ? "text-primary font-bold" : "text-foreground"} ${
          truncate ? "truncate max-w-[180px]" : ""
        }`}
        title={value}
      >
        {value}
      </span>
    </div>
  );
}

function MiniStat({
  label,
  value,
  highlight = false,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div className="rounded bg-[var(--surface-0)] border border-border p-2 space-y-0.5">
      <div className="text-[9px] uppercase font-bold text-muted-foreground">{label}</div>
      <div className={`text-xs font-bold ${highlight ? "text-emerald-500" : "text-foreground"}`}>
        {value}
      </div>
    </div>
  );
}
