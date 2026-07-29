import { useEffect, useRef } from "react";
import { useMap } from "react-leaflet";
import L from "leaflet";
import GeoRasterLayer from "georaster-layer-for-leaflet";
import { ndviColor } from "@/lib/ndvi";
import type { LoadedNDVIRaster } from "@/lib/geotiff/types";
import { useGeoTIFFStore } from "@/stores/geotiff-store";

interface NDVIGeoTIFFLayerProps {
  raster: LoadedNDVIRaster | null;
  opacity: number;
  visible: boolean;
}

export default function NDVIGeoTIFFLayer({ raster, opacity, visible }: NDVIGeoTIFFLayerProps) {
  const map = useMap();
  const layerRef = useRef<L.Layer | null>(null);
  const { zoomTrigger, colorRamp } = useGeoTIFFStore();

  useEffect(() => {
    if (typeof window === "undefined" || !raster || !raster.georasterObj) {
      if (layerRef.current) {
        map.removeLayer(layerRef.current);
        layerRef.current = null;
      }
      return;
    }

    if (!visible) {
      if (layerRef.current) {
        map.removeLayer(layerRef.current);
        layerRef.current = null;
      }
      return;
    }

    // Clean up previous layer instance
    if (layerRef.current) {
      map.removeLayer(layerRef.current);
      layerRef.current = null;
    }

    let ndviPane = map.getPane("ndviPane");
    if (!ndviPane) {
      ndviPane = map.createPane("ndviPane");
      ndviPane.style.zIndex = "450";
    }

    try {
      const geoLayer = new GeoRasterLayer({
        georaster: raster.georasterObj,
        opacity: opacity,
        pane: "ndviPane",
        pixelValuesToColorFn: (pixelValues: number[]) => {
          const v = pixelValues[0];
          if (v === undefined || isNaN(v) || !isFinite(v)) return null;
          if (raster.noDataValue !== null && Math.abs(v - raster.noDataValue) < 1e-4) return null;
          if (Math.abs(v - -9999) < 1e-4) return null;
          if (v < -1.0 || v > 1.0) return null; // Transparent no-data
          return ndviColor(v, colorRamp);
        },
        resolution: 256,
      });

      geoLayer.addTo(map);
      layerRef.current = geoLayer as unknown as L.Layer;
    } catch (err) {
      console.error("Failed to render GeoRasterLayer on Leaflet map:", err);
    }

    return () => {
      if (layerRef.current && map) {
        try {
          map.removeLayer(layerRef.current);
        } catch {
          // Safe unmount
        }
        layerRef.current = null;
      }
    };
  }, [map, raster, opacity, visible, colorRamp]);

  // Handle explicit Zoom-to-Raster triggers
  useEffect(() => {
    if (zoomTrigger > 0 && raster && visible) {
      const bounds: L.LatLngBoundsExpression = [
        [raster.geoBounds.south, raster.geoBounds.west],
        [raster.geoBounds.north, raster.geoBounds.east],
      ];
      map.fitBounds(bounds, { padding: [30, 30], maxZoom: 13, animate: true });
    }
  }, [zoomTrigger, raster, visible, map]);

  return null;
}
