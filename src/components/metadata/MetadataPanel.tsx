import { Database, Calendar, Tag, ShieldCheck, MapPin } from "lucide-react";
import { formatCoord } from "@/lib/geo-format";

interface MetadataPanelProps {
  tileId: string;
  lat: number;
  lng: number;
  year: number;
}

export default function MetadataPanel({ tileId, lat, lng, year }: MetadataPanelProps) {
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
          <Calendar className="h-3.5 w-3.5" />
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
