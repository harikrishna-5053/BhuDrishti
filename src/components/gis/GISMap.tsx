import { useEffect, useMemo, useRef, useState } from "react";
import { MapContainer, TileLayer, ImageOverlay, useMap, useMapEvents } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { ndviAt, ndviColor } from "@/lib/ndvi";

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

function ClickHandler({ onClick }: { onClick: (lat: number, lng: number) => void }) {
  useMapEvents({
    click: (e) => onClick(e.latlng.lat, e.latlng.lng),
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

export default function GISMap({
  layers,
  year,
  clicked,
  onClick,
  onCursor,
}: {
  layers: LayerState;
  year: number;
  clicked: { lat: number; lng: number } | null;
  onClick: (lat: number, lng: number) => void;
  onCursor: (lat: number, lng: number, zoom: number) => void;
}) {
  const [ndviUrl, setNdviUrl] = useState<string | null>(null);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(() => {
      setNdviUrl(generateNdviDataURL(year));
    });
  }, [year]);

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
    <MapContainer
      bounds={INDIA_BOUNDS}
      className="h-full w-full"
      zoomControl={false}
      minZoom={4}
      maxZoom={12}
      worldCopyJump={false}
    >
      {layers.rgb.visible && (
        <TileLayer
          attribution='&copy; OpenStreetMap contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          opacity={layers.rgb.opacity}
        />
      )}

      {ndviUrl && layers.ndvi.visible && (
        <ImageOverlay
          url={ndviUrl}
          bounds={INDIA_BOUNDS}
          opacity={layers.ndvi.opacity}
          zIndex={400}
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

      {layers.states.visible && (
        <StateGrid opacity={layers.states.opacity} />
      )}

      {layers.districts.visible && (
        <DistrictGrid opacity={layers.districts.opacity} />
      )}

      <ZoomCtl />
      <CoordDisplay onMove={onCursor} />
      <ClickHandler onClick={onClick} />
      {clicked && <ClickedMarker lat={clicked.lat} lng={clicked.lng} />}
    </MapContainer>
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
    // Synthetic "state" mesh derived from India bbox
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