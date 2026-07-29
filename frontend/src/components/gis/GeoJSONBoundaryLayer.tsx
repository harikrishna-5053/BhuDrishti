import { useEffect, useState, useRef } from "react";
import { useMap } from "react-leaflet";
import L from "leaflet";
import { toast } from "sonner";

interface GeoJSONBoundaryLayerProps {
  url: string;
  layerName: string;
  visible: boolean;
  opacity: number;
  style: L.PathOptions;
  onStatusChange?: (status: "idle" | "loading" | "loaded" | "error", message?: string) => void;
}

// Module-level in-memory cache to prevent refetching
const geoJsonCache = new Map<string, GeoJSON.GeoJsonObject>();

export default function GeoJSONBoundaryLayer({
  url,
  layerName,
  visible,
  opacity,
  style,
  onStatusChange,
}: GeoJSONBoundaryLayerProps) {
  const map = useMap();
  const [data, setData] = useState<GeoJSON.GeoJsonObject | null>(
    () => geoJsonCache.get(url) ?? null,
  );
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const toastIdRef = useRef<string | number | null>(null);

  // Lazy fetch on first activation
  useEffect(() => {
    if (!visible) return;
    if (geoJsonCache.has(url)) {
      setData(geoJsonCache.get(url)!);
      if (onStatusChange) onStatusChange("loaded");
      return;
    }

    let isMounted = true;
    setLoading(true);
    if (onStatusChange) onStatusChange("loading");

    fetch(url)
      .then((res) => {
        if (!res.ok) {
          throw new Error(`HTTP ${res.status}: Dataset file not found`);
        }
        return res.json();
      })
      .then((geoJson: GeoJSON.FeatureCollection) => {
        if (!isMounted) return;
        if (!geoJson || geoJson.type !== "FeatureCollection" || !Array.isArray(geoJson.features)) {
          throw new Error("Invalid GeoJSON structure");
        }
        geoJsonCache.set(url, geoJson);
        setData(geoJson);
        setLoading(false);
        setError(null);
        if (onStatusChange) onStatusChange("loaded");
      })
      .catch(() => {
        if (!isMounted) return;
        setLoading(false);
        const errMsg = `${layerName} dataset is not installed.`;
        setError(errMsg);
        if (onStatusChange) onStatusChange("error", errMsg);

        // Show single subtle toast notification for missing dataset
        if (!toastIdRef.current) {
          toastIdRef.current = toast.info(errMsg, {
            description: `Offline file missing: ${url}. Add GeoJSON boundary asset to enable.`,
            id: `boundary-err-${url}`,
          });
        }
      });

    return () => {
      isMounted = false;
    };
  }, [url, visible, layerName, onStatusChange]);

  const styleKey = JSON.stringify(style);

  // Leaflet Layer Management
  useEffect(() => {
    if (!visible || !data || !map) return;

    const layer = L.geoJSON(data, {
      renderer: L.canvas(),
      style: () => ({
        ...style,
        opacity,
        fill: false,
        interactive: false,
      }),
      interactive: false,
    } as L.GeoJSONOptions & { renderer?: L.Renderer }).addTo(map);

    // Enforce non-interactive vector paths so clicks pass through to map/raster
    layer.eachLayer((l: L.Layer) => {
      const pathLayer = l as unknown as { getElement?: () => HTMLElement | null };
      if (typeof pathLayer.getElement === "function") {
        const el = pathLayer.getElement();
        if (el) {
          el.style.pointerEvents = "none";
        }
      }
    });

    return () => {
      map.removeLayer(layer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, data, visible, opacity, styleKey]);

  return null;
}
