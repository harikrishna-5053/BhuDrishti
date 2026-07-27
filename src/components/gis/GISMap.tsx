import { useEffect, useMemo, useRef, useState } from "react";
import { MapContainer, TileLayer, ImageOverlay, useMap, useMapEvents } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import proj4 from "proj4";
import { toast } from "sonner";
import { ndviAt, ndviColor, classify } from "@/lib/ndvi";
import NDVIGeoTIFFLayer from "./NDVIGeoTIFFLayer";
import { useGeoTIFFStore } from "@/stores/geotiff-store";

export type LayerState = {
  ndvi: { visible: boolean; opacity: number };
  rgb: { visible: boolean; opacity: number };
  india: { visible: boolean; opacity: number };
  states: { visible: boolean; opacity: number };
  districts: { visible: boolean; opacity: number };
  custom: { visible: boolean; opacity: number };
};

const INDIA_BOUNDS: L.LatLngBoundsLiteral = [
  [6.5, 68],
  [37.5, 97.5],
];

function generateNdviDataURL(year: number) {
  const w = 320;
  const h = 320;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;
  const img = ctx.createImageData(w, h);
  const south = INDIA_BOUNDS[0][0];
  const west = INDIA_BOUNDS[0][1];
  const north = INDIA_BOUNDS[1][0];
  const east = INDIA_BOUNDS[1][1];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const lng = west + ((east - west) * x) / w;
      const lat = north - ((north - south) * y) / h;
      const v = ndviAt(lat, lng, year);
      const c = ndviColor(v).match(/\d+/g)!.map(Number);
      const i = (y * w + x) * 4;
      img.data[i] = c[0]!;
      img.data[i + 1] = c[1]!;
      img.data[i + 2] = c[2]!;
      img.data[i + 3] = 220;
    }
  }
  ctx.putImageData(img, 0, 0);
  return canvas.toDataURL("image/png");
}

function CoordDisplay({ onMove }: { onMove: (lat: number, lng: number, zoom: number) => void }) {
  useMapEvents({
    mousemove: (e) => onMove(e.latlng.lat, e.latlng.lng, e.target.getZoom()),
    zoomend: (e) => {
      const c = e.target.getCenter();
      onMove(c.lat, c.lng, e.target.getZoom());
    },
  });
  return null;
}

function MapResizer({ bottomPaneExpanded }: { bottomPaneExpanded?: boolean }) {
  const map = useMap();
  useEffect(() => {
    const t1 = setTimeout(() => map.invalidateSize(), 150);
    const t2 = setTimeout(() => map.invalidateSize(), 350);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [map, bottomPaneExpanded]);
  return null;
}

function ClickHandler({
  onClick,
  onOutsideClick,
  measureActive,
  onMeasureClick,
  aoiActive,
  onAOIClick,
}: {
  onClick: (lat: number, lng: number) => void;
  onOutsideClick?: () => void;
  measureActive?: boolean;
  onMeasureClick?: (lat: number, lng: number) => void;
  aoiActive?: boolean;
  onAOIClick?: (lat: number, lng: number) => void;
}) {
  const { raster, setSelectedPixel } = useGeoTIFFStore();

  useMapEvents({
    click: (e) => {
      const { lat, lng } = e.latlng;

      if (measureActive && onMeasureClick) {
        onMeasureClick(lat, lng);
        return;
      }

      if (aoiActive && onAOIClick) {
        onAOIClick(lat, lng);
        return;
      }

      if (!raster) {
        if (onOutsideClick) onOutsideClick();
        return;
      }

      const { geoBounds, affine, width, height, values, noDataValue } = raster;
      const inside =
        lng >= geoBounds.west &&
        lng <= geoBounds.east &&
        lat >= geoBounds.south &&
        lat <= geoBounds.north;

      if (!inside) {
        setSelectedPixel(null);
        if (onOutsideClick) onOutsideClick();
        toast.info("Click inside the uploaded NDVI raster to inspect pixel values.");
        return;
      }

      let projX = lng;
      let projY = lat;

      if (affine.crs !== "EPSG:4326") {
        try {
          const res = proj4("EPSG:4326", affine.crs, [lng, lat]);
          projX = res[0];
          projY = res[1];
        } catch (err) {
          console.error("Proj4 coordinate conversion failed:", err);
        }
      }

      const col = Math.floor((projX - affine.originX) / affine.pixelWidth);
      const row = Math.floor((affine.originY - projY) / affine.pixelHeight);

      if (col < 0 || col >= width || row < 0 || row >= height) {
        setSelectedPixel(null);
        if (onOutsideClick) onOutsideClick();
        toast.info("Click inside the uploaded NDVI raster to inspect pixel values.");
        return;
      }

      const idx = row * width + col;
      const val = values[idx];

      const isNoData =
        val === undefined ||
        isNaN(val) ||
        !isFinite(val) ||
        (noDataValue !== null && Math.abs(val - noDataValue) < 1e-4) ||
        Math.abs(val - -9999) < 1e-4 ||
        val < -1.0 ||
        val > 1.0;

      if (isNoData) {
        setSelectedPixel(null);
        if (onOutsideClick) onOutsideClick();
        toast.info("Selected location contains no-data in the uploaded raster.");
        return;
      }

      setSelectedPixel({
        lat,
        lng,
        row,
        col,
        value: Number(val.toFixed(3)),
        vegClass: classify(val),
        isNoData: false,
      });

      onClick(lat, lng);
    },
  });

  return null;
}

function ClickedMarker({ lat, lng }: { lat: number; lng: number }) {
  const map = useMap();
  useEffect(() => {
    const el = L.divIcon({
      className: "",
      html: `
        <div style="position:relative;width:22px;height:22px;">
          <div style="position:absolute;inset:0;border-radius:9999px;background:oklch(0.78 0.17 195 / 40%);" class="pulse-ring"></div>
          <div style="position:absolute;inset:6px;border-radius:9999px;background:oklch(0.78 0.17 195);box-shadow:0 0 12px oklch(0.78 0.17 195);"></div>
        </div>`,
      iconSize: [22, 22],
      iconAnchor: [11, 11],
    });
    const m = L.marker([lat, lng], { icon: el }).addTo(map);
    return () => {
      m.remove();
    };
  }, [lat, lng, map]);
  return null;
}

function MeasureOverlay({ points }: { points: L.LatLngTuple[] }) {
  const map = useMap();
  useEffect(() => {
    if (points.length < 1) return;
    const polyline = L.polyline(points, {
      color: "#38bdf8",
      weight: 3,
      dashArray: "6, 6",
    }).addTo(map);

    const markers: L.Marker[] = points.map((p) => {
      const icon = L.divIcon({
        className: "",
        html: `<div style="background:#38bdf8;width:10px;height:10px;border-radius:50%;border:2px solid white;"></div>`,
        iconSize: [10, 10],
        iconAnchor: [5, 5],
      });
      return L.marker(p, { icon }).addTo(map);
    });

    return () => {
      polyline.remove();
      markers.forEach((m) => m.remove());
    };
  }, [map, points]);

  return null;
}

function AOIPolygonOverlay({ points }: { points: L.LatLngTuple[] }) {
  const map = useMap();
  useEffect(() => {
    if (points.length < 1) return;
    const polygon = L.polygon(points, {
      color: "#10b981",
      fillColor: "#10b981",
      fillOpacity: 0.25,
      weight: 2.5,
      dashArray: "4, 4",
    }).addTo(map);

    const markers: L.Marker[] = points.map((p) => {
      const icon = L.divIcon({
        className: "",
        html: `<div style="background:#10b981;width:10px;height:10px;border-radius:50%;border:2px solid white;"></div>`,
        iconSize: [10, 10],
        iconAnchor: [5, 5],
      });
      return L.marker(p, { icon }).addTo(map);
    });

    return () => {
      polygon.remove();
      markers.forEach((m) => m.remove());
    };
  }, [map, points]);

  return null;
}

export default function GISMap({
  layers,
  year,
  clicked,
  onClick,
  onOutsideClick,
  onCursor,
  measureActive,
  swipeActive,
  aoiActive,
  onAOIFinished,
  bottomPaneExpanded,
}: {
  layers: LayerState;
  year: number;
  clicked: { lat: number; lng: number } | null;
  onClick: (lat: number, lng: number) => void;
  onOutsideClick?: () => void;
  onCursor: (lat: number, lng: number, zoom: number) => void;
  measureActive?: boolean;
  swipeActive?: boolean;
  aoiActive?: boolean;
  onAOIFinished?: (points: [number, number][]) => void;
  bottomPaneExpanded?: boolean;
}) {
  const [ndviUrl, setNdviUrl] = useState<string | null>(null);
  const rafRef = useRef<number | null>(null);
  const [measurePoints, setMeasurePoints] = useState<L.LatLngTuple[]>([]);
  const [aoiPoints, setAoiPoints] = useState<L.LatLngTuple[]>([]);
  const [swipePos, setSwipePos] = useState(50);
  const isDraggingSwipe = useRef(false);

  const { raster, opacity: geoOpacity, visible: geoVisible } = useGeoTIFFStore();

  useEffect(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(() => {
      setNdviUrl(generateNdviDataURL(year));
    });
  }, [year]);

  useEffect(() => {
    if (!measureActive) setMeasurePoints([]);
  }, [measureActive]);

  useEffect(() => {
    if (!aoiActive) setAoiPoints([]);
  }, [aoiActive]);

  const handleMeasureClick = (lat: number, lng: number) => {
    setMeasurePoints((prev) => [...prev, [lat, lng]]);
  };

  const handleAOIClick = (lat: number, lng: number) => {
    setAoiPoints((prev) => {
      const next = [...prev, [lat, lng] as L.LatLngTuple];
      if (next.length >= 3 && onAOIFinished) {
        onAOIFinished(next as [number, number][]);
      }
      return next;
    });
  };

  const measureDistanceKm = useMemo(() => {
    if (measurePoints.length < 2) return 0;
    let dist = 0;
    for (let i = 0; i < measurePoints.length - 1; i++) {
      const p1 = L.latLng(measurePoints[i]!);
      const p2 = L.latLng(measurePoints[i + 1]!);
      dist += p1.distanceTo(p2) / 1000;
    }
    return dist;
  }, [measurePoints]);

  const indiaOutline = useMemo<L.LatLngExpression[][]>(
    () => [[
      [37.5, 76.5], [35.5, 78], [34, 79.5], [33, 78.5], [32.5, 79.5],
      [30.5, 81], [28.5, 84], [27.5, 88], [27, 89], [27.5, 92], [28, 95],
      [27, 97], [24, 95], [23, 93.5], [22.5, 92.5], [22, 91], [21.5, 89],
      [22, 88.5], [20, 87], [17, 82.5], [13, 80.5], [8, 77.5], [8.5, 76.5],
      [11.5, 75], [15, 74], [19, 72.5], [22, 69], [23.5, 68.5], [24, 68],
      [26, 70], [28, 70.5], [30, 74], [32, 74.5], [34, 74], [35, 75.5], [37.5, 76.5],
    ] as L.LatLngExpression[]],
    [],
  );

  return (
    <div
      className="relative h-full w-full select-none"
      onMouseMove={(e) => {
        if (!isDraggingSwipe.current) return;
        const rect = e.currentTarget.getBoundingClientRect();
        const x = Math.max(0, Math.min(rect.width, e.clientX - rect.left));
        setSwipePos((x / rect.width) * 100);
      }}
      onMouseUp={() => (isDraggingSwipe.current = false)}
    >
      <MapContainer
        bounds={INDIA_BOUNDS}
        className="h-full w-full"
        zoomControl={false}
        minZoom={4}
        maxZoom={14}
        worldCopyJump={false}
      >
        <MapResizer bottomPaneExpanded={bottomPaneExpanded} />

        {layers.rgb.visible && (
          <TileLayer
            attribution='&copy; OpenStreetMap contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            opacity={layers.rgb.opacity}
          />
        )}

        {ndviUrl && layers.ndvi.visible && !raster && (
          <ImageOverlay
            url={ndviUrl}
            bounds={INDIA_BOUNDS}
            opacity={layers.ndvi.opacity}
            zIndex={400}
          />
        )}

        {raster && (
          <NDVIGeoTIFFLayer
            raster={raster}
            opacity={geoOpacity}
            visible={geoVisible}
          />
        )}

        {layers.india.visible && (
          <BoundaryLayer
            rings={indiaOutline}
            color="oklch(0.78 0.17 195)"
            weight={2}
            opacity={layers.india.opacity}
            dash={null}
          />
        )}

        {layers.states.visible && <StateGrid opacity={layers.states.opacity} />}
        {layers.districts.visible && <DistrictGrid opacity={layers.districts.opacity} />}

        <ZoomCtl />
        <CoordDisplay onMove={onCursor} />
        <ClickHandler
          onClick={onClick}
          onOutsideClick={onOutsideClick}
          measureActive={measureActive}
          onMeasureClick={handleMeasureClick}
          aoiActive={aoiActive}
          onAOIClick={handleAOIClick}
        />
        {clicked && raster && !measureActive && !aoiActive && <ClickedMarker lat={clicked.lat} lng={clicked.lng} />}
        {measureActive && <MeasureOverlay points={measurePoints} />}
        {aoiActive && <AOIPolygonOverlay points={aoiPoints} />}
      </MapContainer>

      {/* Interactive Swipe Curtain Handle Overlay */}
      {swipeActive && (
        <div
          className="absolute top-0 bottom-0 z-[500] w-1 bg-emerald-400 cursor-ew-resize flex items-center justify-center shadow-[0_0_15px_oklch(0.78_0.17_168)]"
          style={{ left: `${swipePos}%` }}
          onMouseDown={() => (isDraggingSwipe.current = true)}
        >
          <div className="h-9 w-9 rounded-full bg-emerald-500 text-black border-2 border-white shadow-2xl grid place-items-center font-bold text-xs font-mono select-none">
            ↔
          </div>
        </div>
      )}

      {/* Measure Tool Badge */}
      {measureActive && (
        <div className="absolute top-4 left-20 z-[600] rounded-xl border border-primary/40 bg-[var(--surface-0)]/90 px-4 py-2 font-mono text-xs shadow-xl backdrop-blur flex items-center gap-3">
          <div>
            <div className="text-[10px] uppercase text-muted-foreground">Measurement Tool Active</div>
            <div className="text-sm font-bold text-primary">
              {measurePoints.length < 2
                ? "Click points on map to measure"
                : `Distance: ${measureDistanceKm.toFixed(2)} km`}
            </div>
          </div>
          {measurePoints.length > 0 && (
            <button
              onClick={() => setMeasurePoints([])}
              className="rounded bg-primary/15 px-2 py-1 text-[11px] text-primary hover:bg-primary/25"
            >
              Reset
            </button>
          )}
        </div>
      )}

      {/* AOI Drawing Tool Badge */}
      {aoiActive && (
        <div className="absolute top-4 left-20 z-[600] rounded-xl border border-emerald-500/40 bg-[var(--surface-0)]/90 px-4 py-2 font-mono text-xs shadow-xl backdrop-blur flex items-center gap-3 text-emerald-400">
          <div>
            <div className="text-[10px] uppercase text-emerald-300">AOI Polygon Tool Active</div>
            <div className="text-xs font-bold">
              {aoiPoints.length < 3
                ? `Click ${3 - aoiPoints.length} more point(s) to enclose AOI field`
                : `${aoiPoints.length} polygon vertices added`}
            </div>
          </div>
          {aoiPoints.length > 0 && (
            <button
              onClick={() => setAoiPoints([])}
              className="rounded bg-emerald-500/20 px-2 py-1 text-[11px] text-emerald-300 hover:bg-emerald-500/30"
            >
              Reset Points
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function ZoomCtl() {
  const map = useMap();
  useEffect(() => {
    const c = L.control.zoom({ position: "topright" }).addTo(map);
    return () => {
      c.remove();
    };
  }, [map]);
  return null;
}

function BoundaryLayer({
  rings,
  color,
  weight,
  opacity,
  dash,
}: {
  rings: L.LatLngExpression[][];
  color: string;
  weight: number;
  opacity: number;
  dash: string | null;
}) {
  const map = useMap();
  useEffect(() => {
    const layer = L.polygon(rings, {
      color,
      weight,
      opacity,
      fill: false,
      dashArray: dash ?? undefined,
      interactive: false,
    }).addTo(map);
    return () => {
      layer.remove();
    };
  }, [map, rings, color, weight, opacity, dash]);
  return null;
}

function StateGrid({ opacity }: { opacity: number }) {
  const map = useMap();
  useEffect(() => {
    const lines: L.Polyline[] = [];
    for (let lat = 10; lat <= 34; lat += 4) {
      lines.push(
        L.polyline(
          [
            [lat, 69],
            [lat, 96],
          ],
          {
            color: "oklch(0.75 0.13 90 / 70%)",
            weight: 1,
            opacity,
            dashArray: "4 4",
            interactive: false,
          },
        ).addTo(map),
      );
    }
    for (let lng = 72; lng <= 94; lng += 4) {
      lines.push(
        L.polyline(
          [
            [7, lng],
            [36, lng],
          ],
          {
            color: "oklch(0.75 0.13 90 / 70%)",
            weight: 1,
            opacity,
            dashArray: "4 4",
            interactive: false,
          },
        ).addTo(map),
      );
    }
    return () => {
      lines.forEach((l) => l.remove());
    };
  }, [map, opacity]);
  return null;
}

function DistrictGrid({ opacity }: { opacity: number }) {
  const map = useMap();
  useEffect(() => {
    const lines: L.Polyline[] = [];
    for (let lat = 8; lat <= 36; lat += 1.5) {
      lines.push(
        L.polyline(
          [
            [lat, 69],
            [lat, 96],
          ],
          {
            color: "oklch(0.7 0.05 250 / 40%)",
            weight: 0.5,
            opacity,
            interactive: false,
          },
        ).addTo(map),
      );
    }
    for (let lng = 70; lng <= 96; lng += 1.5) {
      lines.push(
        L.polyline(
          [
            [7, lng],
            [36, lng],
          ],
          {
            color: "oklch(0.7 0.05 250 / 40%)",
            weight: 0.5,
            opacity,
            interactive: false,
          },
        ).addTo(map),
      );
    }
    return () => {
      lines.forEach((l) => l.remove());
    };
  }, [map, opacity]);
  return null;
}