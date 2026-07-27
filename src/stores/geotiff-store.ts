import { create } from "zustand";
import type { LoadedNDVIRaster, SelectedPixel } from "@/lib/geotiff/types";
import type { ColorRampPreset } from "@/lib/ndvi";

interface GeoTIFFState {
  raster: LoadedNDVIRaster | null;
  visible: boolean;
  opacity: number;
  loading: boolean;
  loadingStage: string;
  error: string | null;
  selectedPixel: SelectedPixel | null;
  zoomTrigger: number;
  colorRamp: ColorRampPreset;

  setRaster: (raster: LoadedNDVIRaster | null) => void;
  setVisible: (visible: boolean) => void;
  setOpacity: (opacity: number) => void;
  setLoading: (loading: boolean, stage?: string) => void;
  setError: (error: string | null) => void;
  setSelectedPixel: (pixel: SelectedPixel | null) => void;
  setColorRamp: (colorRamp: ColorRampPreset) => void;
  triggerZoomToRaster: () => void;
  clearRaster: () => void;
}

export const useGeoTIFFStore = create<GeoTIFFState>((set) => ({
  raster: null,
  visible: true,
  opacity: 0.85,
  loading: false,
  loadingStage: "",
  error: null,
  selectedPixel: null,
  zoomTrigger: 0,
  colorRamp: "ndvi",

  setRaster: (raster) =>
    set({
      raster,
      visible: true,
      error: null,
      loading: false,
      selectedPixel: null,
      zoomTrigger: Date.now(),
    }),

  setVisible: (visible) => set({ visible }),

  setOpacity: (opacity) => set({ opacity }),

  setLoading: (loading, stage = "") => set({ loading, loadingStage: stage }),

  setError: (error) => set({ error, loading: false }),

  setSelectedPixel: (pixel) => set({ selectedPixel: pixel }),

  setColorRamp: (colorRamp) => set({ colorRamp }),

  triggerZoomToRaster: () => set((s) => ({ zoomTrigger: s.zoomTrigger + 1 })),

  clearRaster: () =>
    set({
      raster: null,
      selectedPixel: null,
      error: null,
      loading: false,
    }),
}));
