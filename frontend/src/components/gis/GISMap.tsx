import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { MapContainer, TileLayer, ImageOverlay, useMap, useMapEvents } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import proj4 from "proj4";
import { toast } from "sonner";
import {
  RotateCcw,
  RotateCw,
  CheckCircle2,
  Trash2,
  X,
  Ruler,
  Crop,
  Loader2,
  Layers,
} from "lucide-react";
import { ndviAt, ndviColor, classify } from "@/lib/ndvi";
import NDVIGeoTIFFLayer from "./NDVIGeoTIFFLayer";
import GeoJSONBoundaryLayer from "./GeoJSONBoundaryLayer";
import { useGeoTIFFStore } from "@/stores/geotiff-store";
import { API_BASE_URL } from "@/lib/api/config";
import {
  distanceMeters,
  calculatePathDistanceMeters,
  calculatePerimeterMeters,
  calculateGeodesicAreaM2,
  formatDistance,
  formatArea,
} from "@/lib/geo-measure";

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

const INDIA_STYLE: L.PathOptions = { color: "#38bdf8", weight: 2.5 };
const STATE_STYLE: L.PathOptions = { color: "#64748b", weight: 1.2, dashArray: "4 4" };
const DISTRICT_STYLE: L.PathOptions = { color: "#94a3b8", weight: 0.6 };

function CoordDisplay({ onMove }: { onMove: (lat: number, lng: number, zoom: number) => void }) {
  useMapEvents({
    mousemove: (e) => onMove(e.latlng.lat, e.latlng.lng, e.target.getZoom()),
    move: (e) => {
      const c = e.target.getCenter();
      onMove(c.lat, c.lng, e.target.getZoom());
    },
    drag: (e) => {
      const c = e.target.getCenter();
      onMove(c.lat, c.lng, e.target.getZoom());
    },
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
  const { raster, activeResultId, setSelectedPixel } = useGeoTIFFStore();

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

      // Handle server-side active result ID point inspection via backend GDAL query
      if (activeResultId && (!raster || !raster.values || raster.values.length === 0)) {
        fetch(`${API_BASE_URL}/api/analytics/point`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ result_ids: [activeResultId], lat, lon: lng }),
        })
          .then((res) => (res.ok ? res.json() : null))
          .then((data) => {
            if (data && data.series && data.series.length > 0) {
              const pt = data.series[0];
              const val = pt.ndvi;
              const isNoData = pt.nodata || !pt.valid;
              if (isNoData) {
                setSelectedPixel(null);
                if (onOutsideClick) onOutsideClick();
                toast.info("Selected location contains no-data in the active raster.");
              } else {
                setSelectedPixel({
                  lat,
                  lng,
                  row: 0,
                  col: 0,
                  value: Number(val.toFixed(3)),
                  vegClass: classify(val),
                  isNoData: false,
                });
                onClick(lat, lng);
              }
            } else {
              setSelectedPixel(null);
              if (onOutsideClick) onOutsideClick();
              toast.info("Click inside the active raster boundary to inspect pixel values.");
            }
          })
          .catch((err) => {
            console.error("Point analytics error:", err);
          });
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
        Math.abs(val - -9999) < 1e-4;

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

/**
 * Clean, non-cluttered Leaflet Overlay for Measurements.
 * Renders 2px polyline, 15% opacity polygon, and plain 8px vertex dots.
 * REMOVED segment-distance text bubbles to eliminate visual clutter.
 */
function MeasureOverlay({
  points,
  isFinished,
}: {
  points: [number, number][];
  isFinished: boolean;
}) {
  const map = useMap();

  useEffect(() => {
    if (points.length < 1) return;

    const layers: L.Layer[] = [];

    // Clean 2px Polyline
    const polyline = L.polyline(points, {
      color: "#38bdf8",
      weight: 2,
      dashArray: isFinished ? undefined : "5, 5",
    }).addTo(map);
    layers.push(polyline);

    // Clean enclosed Polygon (3+ points)
    if (points.length >= 3) {
      const polygon = L.polygon(points, {
        color: "#38bdf8",
        fillColor: "#38bdf8",
        fillOpacity: 0.15,
        weight: 2,
        dashArray: isFinished ? undefined : "4, 4",
      }).addTo(map);
      layers.push(polygon);
    }

    // Simplified plain 8px vertex dot markers (no text bubbles or large numbers!)
    points.forEach((p) => {
      const icon = L.divIcon({
        className: "",
        html: `<div style="background:#38bdf8;width:8px;height:8px;border-radius:50%;border:1.5px solid #ffffff;box-shadow:0 1px 4px rgba(0,0,0,0.5);"></div>`,
        iconSize: [8, 8],
        iconAnchor: [4, 4],
      });
      const marker = L.marker(p, { icon }).addTo(map);
      layers.push(marker);
    });

    return () => {
      layers.forEach((l) => l.remove());
    };
  }, [map, points, isFinished]);

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

function RasterSwipeClipping({
  swipeActive,
  swipePos,
}: {
  swipeActive?: boolean;
  swipePos: number;
}) {
  const map = useMap();

  useEffect(() => {
    let pane = map.getPane("ndviPane");
    if (!pane) {
      pane = map.createPane("ndviPane");
      pane.style.zIndex = "450";
    }

    if (swipeActive) {
      // Left side (0 to swipePos%) shows NDVI Raster overlay; Right side shows Base Map
      pane.style.clipPath = `polygon(0 0, ${swipePos}% 0, ${swipePos}% 100%, 0 100%)`;
    } else {
      pane.style.clipPath = "none";
    }

    return () => {
      if (pane) {
        pane.style.clipPath = "none";
      }
    };
  }, [map, swipeActive, swipePos]);

  return null;
}

function ResultBoundsFitter({ activeResultId }: { activeResultId: string | null }) {
  const map = useMap();
  const prevIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!activeResultId || activeResultId === prevIdRef.current) return;
    prevIdRef.current = activeResultId;

    let isMounted = true;
    fetch(`${API_BASE_URL}/api/results/${activeResultId}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!isMounted || !data) return;
        const b = data.bounds;
        if (b && typeof b.min_lat === "number" && typeof b.min_lon === "number") {
          const leafletBounds: L.LatLngBoundsLiteral = [
            [b.min_lat, b.min_lon],
            [b.max_lat, b.max_lon],
          ];
          map.fitBounds(leafletBounds, { padding: [40, 40], maxZoom: 13, animate: true });
        }
      })
      .catch((err) => console.error("Failed to fetch result bounds for map fit:", err));

    return () => {
      isMounted = false;
    };
  }, [activeResultId, map]);

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
  onToggleMeasure,
  swipeActive,
  onToggleSwipe,
  aoiActive,
  aoiDisabled,
  onToggleAOI,
  onAOIFinished,
  isAOIAnalyzing,
  aoiProgress,
  onCancelAOIAnalysis,
  bottomPaneExpanded,
}: {
  layers: LayerState;
  year: number;
  clicked: { lat: number; lng: number } | null;
  onClick: (lat: number, lng: number) => void;
  onOutsideClick?: () => void;
  onCursor: (lat: number, lng: number, zoom: number) => void;
  measureActive?: boolean;
  onToggleMeasure?: () => void;
  swipeActive?: boolean;
  onToggleSwipe?: () => void;
  aoiActive?: boolean;
  aoiDisabled?: boolean;
  onToggleAOI?: () => void;
  onAOIFinished?: (points: [number, number][]) => void;
  isAOIAnalyzing?: boolean;
  aoiProgress?: number;
  onCancelAOIAnalysis?: () => void;
  bottomPaneExpanded?: boolean;
}) {
  // Measurement Mode State (Distance vs Area)
  const [measureModeType, setMeasureModeType] = useState<"distance" | "area">("area");

  // Measurement State & Undo/Redo History
  const [measurePoints, setMeasurePoints] = useState<[number, number][]>([]);
  const [measureHistory, setMeasureHistory] = useState<[number, number][][]>([[]]);
  const [historyIndex, setHistoryIndex] = useState(0);
  const [isMeasureFinished, setIsMeasureFinished] = useState(false);

  // AOI State & Undo/Redo History
  const [aoiPoints, setAoiPoints] = useState<L.LatLngTuple[]>([]);
  const [aoiUndoHistory, setAoiUndoHistory] = useState<L.LatLngTuple[][]>([]);
  const [aoiRedoHistory, setAoiRedoHistory] = useState<L.LatLngTuple[][]>([]);
  const [isAoiFinished, setIsAoiFinished] = useState(false);

  const [swipePos, setSwipePos] = useState(50);
  const isDraggingSwipe = useRef(false);

  const { raster, opacity: geoOpacity, visible: geoVisible, activeResultId } = useGeoTIFFStore();

  // Reset measure state when tool is deactivated
  useEffect(() => {
    if (!measureActive) {
      setMeasurePoints([]);
      setMeasureHistory([[]]);
      setHistoryIndex(0);
      setIsMeasureFinished(false);
    }
  }, [measureActive]);

  // Clear all AOI state when raster is removed or AOI tool is deactivated
  useEffect(() => {
    if (!aoiActive || aoiDisabled) {
      setAoiPoints([]);
      setAoiUndoHistory([]);
      setAoiRedoHistory([]);
      setIsAoiFinished(false);
    }
  }, [aoiActive, aoiDisabled]);

  // Handle map click for measurement
  const handleMeasureClick = (lat: number, lng: number) => {
    const newPoint: [number, number] = [lat, lng];

    if (isMeasureFinished) {
      // Starting a new measurement automatically replaces previous finished measurement
      const newPoints = [newPoint];
      setMeasurePoints(newPoints);
      setMeasureHistory([[], newPoints]);
      setHistoryIndex(1);
      setIsMeasureFinished(false);
    } else {
      const newPoints = [...measurePoints, newPoint];
      const newHistory = measureHistory.slice(0, historyIndex + 1);
      newHistory.push(newPoints);
      setMeasurePoints(newPoints);
      setMeasureHistory(newHistory);
      setHistoryIndex(newHistory.length - 1);
    }
  };

  const handleUndo = useCallback(() => {
    if (historyIndex > 0) {
      const nextIdx = historyIndex - 1;
      setHistoryIndex(nextIdx);
      setMeasurePoints(measureHistory[nextIdx]!);
      setIsMeasureFinished(false);
    }
  }, [historyIndex, measureHistory]);

  const handleRedo = useCallback(() => {
    if (historyIndex < measureHistory.length - 1) {
      const nextIdx = historyIndex + 1;
      setHistoryIndex(nextIdx);
      setMeasurePoints(measureHistory[nextIdx]!);
    }
  }, [historyIndex, measureHistory]);

  const handleFinish = useCallback(() => {
    if (measurePoints.length >= 2) {
      setIsMeasureFinished(true);
    }
  }, [measurePoints]);

  const handleClear = useCallback(() => {
    setMeasurePoints([]);
    setMeasureHistory([[]]);
    setHistoryIndex(0);
    setIsMeasureFinished(false);
  }, []);

  const handleCloseMeasure = useCallback(() => {
    handleClear();
    if (onToggleMeasure) onToggleMeasure();
  }, [handleClear, onToggleMeasure]);

  // Keyboard Shortcuts: Ctrl+Z (Undo), Ctrl+Y / Ctrl+Shift+Z (Redo), Esc (Cancel), Enter (Finish)
  useEffect(() => {
    if (!measureActive) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        handleCloseMeasure();
      } else if (e.key === "Enter") {
        e.preventDefault();
        if (measurePoints.length >= 2) {
          handleFinish();
        }
      } else if ((e.ctrlKey || e.metaKey) && (e.key === "z" || e.key === "Z")) {
        if (e.shiftKey) {
          e.preventDefault();
          handleRedo();
        } else {
          e.preventDefault();
          handleUndo();
        }
      } else if ((e.ctrlKey || e.metaKey) && (e.key === "y" || e.key === "Y")) {
        e.preventDefault();
        handleRedo();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    measureActive,
    measurePoints.length,
    handleCloseMeasure,
    handleFinish,
    handleRedo,
    handleUndo,
  ]);

  const handleAOIClick = (lat: number, lng: number) => {
    if (isAOIAnalyzing || aoiDisabled) return;
    const newPoint: L.LatLngTuple = [lat, lng];
    setAoiPoints((prev) => {
      const next = [...prev, newPoint];
      setAoiUndoHistory((undo) => [...undo, prev]);
      setAoiRedoHistory([]); // Clear redo history when a new vertex is added after Undo
      return next;
    });
    setIsAoiFinished(false);
  };

  const handleAOIUndo = useCallback(() => {
    if (isAOIAnalyzing) return;
    setAoiPoints((prev) => {
      if (prev.length === 0) return prev;
      const next = prev.slice(0, -1);
      setAoiRedoHistory((redo) => [...redo, prev]);
      return next;
    });
    setIsAoiFinished(false);
  }, [isAOIAnalyzing]);

  const handleAOIRedo = useCallback(() => {
    if (isAOIAnalyzing) return;
    setAoiRedoHistory((redo) => {
      if (redo.length === 0) return redo;
      const restored = redo[redo.length - 1]!;
      setAoiPoints(restored);
      return redo.slice(0, -1);
    });
    setIsAoiFinished(false);
  }, [isAOIAnalyzing]);

  const handleAOIFinish = useCallback(() => {
    if (isAOIAnalyzing || aoiPoints.length < 3) return;
    setIsAoiFinished(true);
    if (onAOIFinished) {
      onAOIFinished(aoiPoints as [number, number][]);
    }
  }, [isAOIAnalyzing, aoiPoints, onAOIFinished]);

  const handleAOICancel = useCallback(() => {
    if (onCancelAOIAnalysis) onCancelAOIAnalysis();
    setAoiPoints([]);
    setAoiUndoHistory([]);
    setAoiRedoHistory([]);
    setIsAoiFinished(false);
    if (onToggleAOI) onToggleAOI();
  }, [onCancelAOIAnalysis, onToggleAOI]);

  const handleAOIClear = useCallback(() => {
    if (onCancelAOIAnalysis) onCancelAOIAnalysis();
    setAoiPoints([]);
    setAoiUndoHistory([]);
    setAoiRedoHistory([]);
    setIsAoiFinished(false);
  }, [onCancelAOIAnalysis]);

  // Keyboard Shortcuts for AOI (Ctrl+Z: Undo, Ctrl+Shift+Z: Redo, Enter: Finish, Esc: Cancel, Backspace/Delete: Remove vertex)
  useEffect(() => {
    if (!aoiActive) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      const activeEl = document.activeElement;
      if (
        activeEl &&
        (activeEl.tagName === "INPUT" ||
          activeEl.tagName === "TEXTAREA" ||
          activeEl.tagName === "SELECT" ||
          (activeEl as HTMLElement).isContentEditable)
      ) {
        return;
      }

      if (e.key === "Escape") {
        e.preventDefault();
        handleAOICancel();
      } else if (e.key === "Enter") {
        e.preventDefault();
        if (aoiPoints.length >= 3 && !isAOIAnalyzing) {
          handleAOIFinish();
        }
      } else if ((e.ctrlKey || e.metaKey) && (e.key === "z" || e.key === "Z")) {
        if (e.shiftKey) {
          e.preventDefault();
          handleAOIRedo();
        } else {
          e.preventDefault();
          handleAOIUndo();
        }
      } else if ((e.ctrlKey || e.metaKey) && (e.key === "y" || e.key === "Y")) {
        e.preventDefault();
        handleAOIRedo();
      } else if (e.key === "Delete" || e.key === "Backspace") {
        if (aoiPoints.length > 0 && !isAOIAnalyzing) {
          e.preventDefault();
          handleAOIUndo();
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    aoiActive,
    aoiPoints.length,
    isAOIAnalyzing,
    handleAOICancel,
    handleAOIFinish,
    handleAOIRedo,
    handleAOIUndo,
  ]);

  return (
    <div
      className="relative h-full w-full select-none"
      onMouseMove={(e) => {
        if (!isDraggingSwipe.current) return;
        const rect = e.currentTarget.getBoundingClientRect();
        if (rect.width <= 0) return;
        const x = Math.max(0, Math.min(rect.width, e.clientX - rect.left));
        setSwipePos((x / rect.width) * 100);
      }}
      onTouchMove={(e) => {
        if (!isDraggingSwipe.current || !e.touches[0]) return;
        const rect = e.currentTarget.getBoundingClientRect();
        if (rect.width <= 0) return;
        const x = Math.max(0, Math.min(rect.width, e.touches[0].clientX - rect.left));
        setSwipePos((x / rect.width) * 100);
      }}
      onMouseUp={() => (isDraggingSwipe.current = false)}
      onTouchEnd={() => (isDraggingSwipe.current = false)}
    >
      <MapContainer
        bounds={INDIA_BOUNDS}
        className="h-full w-full"
        zoomControl={false}
        minZoom={4}
        maxZoom={14}
        worldCopyJump={false}
        preferCanvas={true}
      >
        <MapResizer bottomPaneExpanded={bottomPaneExpanded} />
        <ResultBoundsFitter activeResultId={activeResultId} />
        <RasterSwipeClipping swipeActive={swipeActive} swipePos={swipePos} />

        {layers.rgb.visible && (
          <TileLayer
            attribution="&copy; OpenStreetMap contributors"
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            opacity={layers.rgb.opacity}
          />
        )}

        {activeResultId && geoVisible && (
          <TileLayer
            key={activeResultId}
            attribution="BhuDrishti XYZ Tile Engine"
            url={`${API_BASE_URL}/api/results/${activeResultId}/tiles/{z}/{x}/{y}.png`}
            opacity={geoOpacity}
            maxNativeZoom={14}
            maxZoom={18}
          />
        )}

        {raster && <NDVIGeoTIFFLayer raster={raster} opacity={geoOpacity} visible={geoVisible} />}

        <GeoJSONBoundaryLayer
          url="/data/boundaries/india-outline.geojson"
          layerName="India Boundary"
          visible={layers.india.visible}
          opacity={layers.india.opacity}
          style={INDIA_STYLE}
        />

        <GeoJSONBoundaryLayer
          url="/data/boundaries/india-states.geojson"
          layerName="State Boundaries"
          visible={layers.states.visible}
          opacity={layers.states.opacity}
          style={STATE_STYLE}
        />

        <GeoJSONBoundaryLayer
          url="/data/boundaries/india-districts.geojson"
          layerName="District Boundaries"
          visible={layers.districts.visible}
          opacity={layers.districts.opacity}
          style={DISTRICT_STYLE}
        />

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
        {clicked && (raster || activeResultId) && !measureActive && !aoiActive && (
          <ClickedMarker lat={clicked.lat} lng={clicked.lng} />
        )}
        {measureActive && <MeasureOverlay points={measurePoints} isFinished={isMeasureFinished} />}
        {aoiActive && <AOIPolygonOverlay points={aoiPoints} />}
      </MapContainer>

      {/* Real Interactive Swipe Curtain Handle & Clear Side Indicators */}
      {swipeActive && (
        <>
          {/* Top Label Badges indicating which side represents what */}
          <div className="absolute top-4 left-1/2 -translate-x-1/2 z-[600] pointer-events-none flex items-center gap-3 font-mono text-xs select-none">
            <div className="glass-panel px-3 py-1.5 rounded-xl border border-emerald-500/40 bg-[var(--surface-0)]/95 shadow-xl backdrop-blur flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
              <span className="font-bold text-emerald-400">NDVI Raster</span>
              <span className="text-[10px] text-muted-foreground">(Left Side)</span>
            </div>

            <div className="glass-panel px-3 py-1.5 rounded-xl border border-border bg-[var(--surface-0)]/95 shadow-xl backdrop-blur flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-primary" />
              <span className="font-bold text-foreground">Base Map</span>
              <span className="text-[10px] text-muted-foreground">(Right Side)</span>
            </div>

            {onToggleSwipe && (
              <button
                onClick={onToggleSwipe}
                className="pointer-events-auto grid h-7 w-7 place-items-center rounded-lg border border-border bg-[var(--surface-0)] text-muted-foreground hover:bg-red-500/20 hover:border-red-500 hover:text-red-500 transition cursor-pointer"
                title="Exit Swipe Comparison Mode (Esc)"
                aria-label="Exit Swipe Comparison"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>

          {/* Vertical Swipe Divider Handle Line */}
          <div
            className="absolute top-0 bottom-0 z-[500] w-1 bg-emerald-400 cursor-ew-resize flex items-center justify-center shadow-[0_0_15px_oklch(0.78_0.17_168)]"
            style={{ left: `${swipePos}%` }}
            onMouseDown={(e) => {
              e.stopPropagation();
              isDraggingSwipe.current = true;
            }}
            onTouchStart={(e) => {
              e.stopPropagation();
              isDraggingSwipe.current = true;
            }}
          >
            {/* Draggable & Keyboard-Accessible Handle */}
            <div
              tabIndex={0}
              role="slider"
              aria-label="NDVI Raster vs Base Map Swipe Comparison"
              aria-valuenow={Math.round(swipePos)}
              aria-valuemin={0}
              aria-valuemax={100}
              onKeyDown={(e) => {
                if (e.key === "ArrowLeft") {
                  e.preventDefault();
                  setSwipePos((p) => Math.max(0, p - 2));
                } else if (e.key === "ArrowRight") {
                  e.preventDefault();
                  setSwipePos((p) => Math.min(100, p + 2));
                } else if (e.key === "Home") {
                  e.preventDefault();
                  setSwipePos(0);
                } else if (e.key === "End") {
                  e.preventDefault();
                  setSwipePos(100);
                } else if (e.key === "Escape") {
                  e.preventDefault();
                  if (onToggleSwipe) onToggleSwipe();
                }
              }}
              className="h-10 w-10 rounded-full bg-emerald-500 text-black border-2 border-white shadow-2xl grid place-items-center font-bold text-xs font-mono select-none cursor-ew-resize focus:outline-none focus:ring-2 focus:ring-emerald-400 focus:ring-offset-2"
            >
              ↔
            </div>
          </div>
        </>
      )}

      {/* 
        NON-BLOCKING FLOATING MEASUREMENT INTERFACE
        Outer wrapper is pointer-events-none so clicking the raster outside the cards works directly!
      */}
      {measureActive && (
        <div className="pointer-events-none absolute top-4 left-20 z-[600] flex flex-col gap-2 font-mono text-xs max-w-[280px]">
          {/* BOX 1: COMPACT MEASUREMENT CONTROL BOX */}
          <div className="pointer-events-auto glass-panel flex items-center gap-1 rounded-xl border border-border bg-[var(--surface-0)]/95 p-1.5 shadow-xl backdrop-blur">
            {/* Mode Selector Toggle */}
            <div className="flex rounded-lg border border-border bg-[var(--surface-1)] p-0.5 font-bold text-[10px]">
              <button
                onClick={() => setMeasureModeType("distance")}
                className={`px-2 py-0.5 rounded transition cursor-pointer ${
                  measureModeType === "distance"
                    ? "bg-primary text-primary-foreground shadow-xs font-bold"
                    : "text-muted-foreground hover:text-foreground"
                }`}
                title="Distance Measurement Mode"
              >
                Distance
              </button>
              <button
                onClick={() => setMeasureModeType("area")}
                className={`px-2 py-0.5 rounded transition cursor-pointer ${
                  measureModeType === "area"
                    ? "bg-primary text-primary-foreground shadow-xs font-bold"
                    : "text-muted-foreground hover:text-foreground"
                }`}
                title="Area & Perimeter Mode"
              >
                Area
              </button>
            </div>

            <div className="h-4 w-px bg-border my-auto mx-0.5" />

            {/* Undo Icon Button */}
            {!isMeasureFinished && (
              <button
                onClick={handleUndo}
                disabled={historyIndex <= 0}
                title="Undo last point (Ctrl+Z)"
                aria-label="Undo last point"
                className="grid h-7 w-7 place-items-center rounded-lg border border-border bg-[var(--surface-1)] text-foreground hover:bg-primary/20 hover:border-primary/60 hover:text-primary transition disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
              >
                <RotateCcw className="h-3.5 w-3.5" />
              </button>
            )}

            {/* Redo Icon Button */}
            {!isMeasureFinished && (
              <button
                onClick={handleRedo}
                disabled={historyIndex >= measureHistory.length - 1}
                title="Redo point (Ctrl+Y / Ctrl+Shift+Z)"
                aria-label="Redo point"
                className="grid h-7 w-7 place-items-center rounded-lg border border-border bg-[var(--surface-1)] text-foreground hover:bg-primary/20 hover:border-primary/60 hover:text-primary transition disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
              >
                <RotateCw className="h-3.5 w-3.5" />
              </button>
            )}

            {/* Finish Icon Button */}
            {!isMeasureFinished && (
              <button
                onClick={handleFinish}
                disabled={measurePoints.length < 2}
                title="Finish measurement (Enter)"
                aria-label="Finish measurement"
                className="grid h-7 w-7 place-items-center rounded-lg bg-emerald-600 text-white hover:bg-emerald-500 shadow transition disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
              >
                <CheckCircle2 className="h-3.5 w-3.5" />
              </button>
            )}

            {/* Clear Icon Button */}
            <button
              onClick={handleClear}
              disabled={measurePoints.length === 0}
              title="Clear measurement"
              aria-label="Clear measurement"
              className="grid h-7 w-7 place-items-center rounded-lg border border-border bg-[var(--surface-1)] text-muted-foreground hover:bg-red-500/20 hover:border-red-500 hover:text-red-600 transition disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>

            {/* Close Tool Icon Button */}
            <button
              onClick={handleCloseMeasure}
              title="Close measurement tool (Esc)"
              aria-label="Close measurement tool"
              className="grid h-7 w-7 place-items-center rounded-lg text-muted-foreground hover:bg-[var(--surface-2)] hover:text-foreground transition cursor-pointer"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* BOX 2: COMPACT MEASUREMENT SUMMARY BOX */}
          {measurePoints.length > 0 && (
            <div className="pointer-events-auto glass-panel w-56 rounded-xl border border-border bg-[var(--surface-0)]/95 p-2.5 shadow-xl backdrop-blur font-mono text-xs space-y-1.5 animate-ticker">
              <div className="flex items-center justify-between border-b border-border pb-1 text-[9px] uppercase font-bold text-muted-foreground">
                <span>Measurement</span>
                <span
                  className={`px-1.5 py-0.5 rounded text-[8px] font-bold ${
                    isMeasureFinished
                      ? "bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border border-emerald-500/40"
                      : "bg-primary/20 text-primary border border-primary/40"
                  }`}
                >
                  {isMeasureFinished ? "Completed" : "Drawing"}
                </span>
              </div>

              {measureModeType === "area" && measurePoints.length >= 3 ? (
                <div className="space-y-1">
                  <div>
                    <div className="text-[9px] uppercase font-bold text-muted-foreground">Area</div>
                    <div className="text-sm font-extrabold text-primary">
                      {formatArea(calculateGeodesicAreaM2(measurePoints))}
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-1 pt-1 border-t border-border/50 text-[10px]">
                    <div>
                      <div className="text-[8px] uppercase font-bold text-muted-foreground">
                        Perimeter
                      </div>
                      <div className="font-bold text-foreground">
                        {formatDistance(calculatePerimeterMeters(measurePoints))}
                      </div>
                    </div>
                    <div>
                      <div className="text-[8px] uppercase font-bold text-muted-foreground">
                        Vertices
                      </div>
                      <div className="font-bold text-foreground">{measurePoints.length}</div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="space-y-1">
                  <div>
                    <div className="text-[9px] uppercase font-bold text-muted-foreground">
                      {measureModeType === "area" ? "Distance (Add 3+ for Area)" : "Total Distance"}
                    </div>
                    <div className="text-sm font-extrabold text-primary">
                      {formatDistance(calculatePathDistanceMeters(measurePoints))}
                    </div>
                  </div>
                  <div className="flex justify-between items-center pt-1 border-t border-border/50 text-[10px]">
                    <span className="text-[8px] uppercase font-bold text-muted-foreground">
                      Vertices
                    </span>
                    <span className="font-bold text-foreground">{measurePoints.length}</span>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Compact Floating AOI Control Box & Status Panel */}
      {aoiActive && (
        <div className="absolute top-4 left-20 z-[600] pointer-events-none flex flex-col gap-2 font-mono text-xs select-none">
          {/* Box 1: Compact AOI Action Toolbar */}
          <div className="pointer-events-auto glass-panel rounded-xl border border-emerald-500/40 bg-[var(--surface-0)]/95 p-1.5 shadow-xl backdrop-blur flex items-center gap-1.5 animate-ticker">
            {/* Header Badge */}
            <div className="flex items-center gap-1.5 px-2 py-1 border-r border-border text-emerald-400 font-bold text-xs">
              <Crop className="h-3.5 w-3.5 shrink-0 text-emerald-400" />
              <span className="hidden sm:inline">AOI Polygon</span>
            </div>

            {/* Undo Vertex Button */}
            <button
              onClick={handleAOIUndo}
              disabled={aoiPoints.length === 0 || isAOIAnalyzing}
              title="Undo Vertex (Ctrl+Z)"
              aria-label="Undo Vertex"
              className="grid h-7 w-7 place-items-center rounded-lg border border-border bg-[var(--surface-1)] text-foreground hover:bg-emerald-500/20 hover:border-emerald-500/60 hover:text-emerald-400 transition disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
            >
              <RotateCcw className="h-3.5 w-3.5" />
            </button>

            {/* Redo Vertex Button */}
            <button
              onClick={handleAOIRedo}
              disabled={aoiRedoHistory.length === 0 || isAOIAnalyzing}
              title="Redo Vertex (Ctrl+Shift+Z)"
              aria-label="Redo Vertex"
              className="grid h-7 w-7 place-items-center rounded-lg border border-border bg-[var(--surface-1)] text-foreground hover:bg-emerald-500/20 hover:border-emerald-500/60 hover:text-emerald-400 transition disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
            >
              <RotateCw className="h-3.5 w-3.5" />
            </button>

            {/* Finish AOI Primary Action Button */}
            <button
              onClick={handleAOIFinish}
              disabled={aoiPoints.length < 3 || isAOIAnalyzing}
              title="Finish AOI (Enter)"
              aria-label="Finish AOI"
              className="grid h-7 w-7 place-items-center rounded-lg bg-emerald-600 text-white hover:bg-emerald-500 shadow transition disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
            >
              {isAOIAnalyzing ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <CheckCircle2 className="h-3.5 w-3.5" />
              )}
            </button>

            {/* Clear AOI Destructive Action Button */}
            <button
              onClick={handleAOIClear}
              disabled={aoiPoints.length === 0 || isAOIAnalyzing}
              title="Clear AOI"
              aria-label="Clear AOI"
              className="grid h-7 w-7 place-items-center rounded-lg border border-border bg-[var(--surface-1)] text-muted-foreground hover:bg-red-500/20 hover:border-red-500 hover:text-red-600 transition disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>

            {/* Cancel / Close AOI Button */}
            <button
              onClick={handleAOICancel}
              title="Cancel AOI (Esc)"
              aria-label="Cancel AOI"
              className="grid h-7 w-7 place-items-center rounded-lg text-muted-foreground hover:bg-[var(--surface-2)] hover:text-foreground transition cursor-pointer"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Box 2: Compact AOI Status Card */}
          <div className="pointer-events-auto glass-panel w-56 rounded-xl border border-border bg-[var(--surface-0)]/95 p-2.5 shadow-xl backdrop-blur font-mono text-xs space-y-1.5 animate-ticker">
            <div className="flex items-center justify-between border-b border-border pb-1 text-[9px] uppercase font-bold text-muted-foreground">
              <span>AOI Field Polygon</span>
              <span
                className={`px-1.5 py-0.5 rounded text-[8px] font-bold ${
                  isAOIAnalyzing
                    ? "bg-primary/20 text-primary border border-primary/40 animate-pulse"
                    : isAoiFinished
                      ? "bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border border-emerald-500/40"
                      : "bg-emerald-500/20 text-emerald-400 border border-emerald-500/40"
                }`}
              >
                {isAOIAnalyzing ? "Analyzing..." : isAoiFinished ? "Completed" : "Drawing"}
              </span>
            </div>

            {isAOIAnalyzing ? (
              <div className="space-y-1.5 py-0.5">
                <div className="flex justify-between items-center text-[10px] font-bold text-primary">
                  <span>Analyzing AOI…</span>
                  <span>{aoiProgress || 0}%</span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-[var(--surface-3)] border border-border/40">
                  <div
                    className="h-full rounded-full bg-primary transition-[width] duration-200"
                    style={{ width: `${aoiProgress || 0}%` }}
                  />
                </div>
                {onCancelAOIAnalysis && (
                  <button
                    onClick={onCancelAOIAnalysis}
                    className="w-full mt-1 rounded border border-red-500/40 bg-red-500/10 py-1 text-[10px] font-bold text-red-500 hover:bg-red-500/20 transition cursor-pointer"
                  >
                    Cancel Analysis
                  </button>
                )}
              </div>
            ) : (
              <div className="space-y-1">
                <div className="text-[10px] font-bold text-foreground">
                  {aoiPoints.length < 3
                    ? `Click ${3 - aoiPoints.length} more point(s) to enclose AOI field`
                    : `${aoiPoints.length} polygon vertices added`}
                </div>
                <div className="text-[9px] text-muted-foreground">
                  {aoiPoints.length < 3
                    ? "Minimum 3 vertices required to calculate clipped statistics."
                    : "Click Finish AOI or press Enter to calculate clipped raster statistics."}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Empty State Instruction Overlay when no raster is loaded */}
      {!raster && !measureActive && !aoiActive && !swipeActive && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-[500] pointer-events-auto font-mono select-none">
          <div className="glass-panel max-w-xs rounded-lg border border-border bg-[var(--surface-0)]/90 px-2.5 py-1.5 shadow-md backdrop-blur flex items-center gap-2">
            <div className="grid h-6 w-6 shrink-0 place-items-center rounded bg-primary/20 text-primary">
              <Layers className="h-3.5 w-3.5" />
            </div>
            <div className="space-y-0">
              <div className="font-bold text-foreground text-[11px]">No NDVI Raster Loaded</div>
              <div className="text-[10px] text-muted-foreground leading-tight">
                Open <span className="font-semibold text-primary">Load NDVI GeoTIFF</span> from the
                sidebar to visualize an existing NDVI product.
                <span className="block mt-0.5">AOI analysis becomes available after an NDVI raster is loaded.</span>
              </div>
            </div>
          </div>
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
