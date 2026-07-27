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
  const layerRef = useRef<any>(null);
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

    try {
      const geoLayer = new GeoRasterLayer({
        georaster: raster.georasterObj,
        opacity: opacity,
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
      layerRef.current = geoLayer;
    } catch (err) {
      console.error("Failed to render GeoRasterLayer on Leaflet map:", err);
    }

    return () => {
      if (layerRef.current) {
        map.removeLayer(layerRef.current);
        layerRef.current = null;
      }
    };
  }, [map, raster, visible, colorRamp]);

  // Handle explicit Zoom-to-Raster triggers
  useEffect(() => {
    if (zoomTrigger > 0 && raster && visible) {
      const bounds: L.LatLngBoundsExpression = [
        [raster.geoBounds.south, raster.geoBounds.west],
        [raster.geoBounds.north, raster.geoBounds.east],
      ];
      map.fitBounds(bounds, { padding: [40, 40], maxZoom: 14 });
    }
  }, [map, zoomTrigger, raster, visible]);

  // Update opacity dynamically without re-creating layer
  useEffect(() => {
    if (layerRef.current && visible) {
      if (typeof layerRef.current.setOpacity === "function") {
        layerRef.current.setOpacity(opacity);
      }
    }
  }, [opacity, visible]);

  return null;
}
